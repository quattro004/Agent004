/**
 * T163 (RED): the invocation handler enforces the approved per-turn bounds.
 *
 * Spec 003 § Clarifications, Session 2026-11-15. The body limit has to be
 * applied while reading, before the payload is parsed, so an oversized request
 * cannot make us buffer or deserialize it. The SDK limits have to reach
 * `invoke`, and a limit stop has to end the turn as an error rather than be
 * presented to the friend as a complete reply.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { testRuntimeConfig } from './fixtures/runtimeConfig.js';

vi.mock('@strands-agents/sdk', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const invokeMock = vi.fn().mockResolvedValue({
    lastMessage: { content: [{ type: 'textBlock', text: 'Hi there from Max!' }] },
    invocationContext: { usage: { inputTokens: 30, outputTokens: 7, totalTokens: 37 } },
  });
  const Agent = vi.fn(function () {
    return { invoke: invokeMock, addHook: vi.fn(), messages: [] };
  });
  const tool = vi.fn().mockImplementation((cfg) => ({ ...cfg, __tool: true }));
  return { ...actual, Agent, tool, __invokeMock: invokeMock };
});

vi.mock('@strands-agents/sdk/models/bedrock', () => ({
  BedrockModel: vi.fn(function (cfg) {
    return { ...cfg };
  }),
}));

vi.mock('../src/tools/newsTool.js', () => ({ newsToolSchema: {}, fetchNews: vi.fn() }));
vi.mock('../src/tools/weatherTool.js', () => ({ weatherToolSchema: {}, fetchWeather: vi.fn() }));
vi.mock('../src/tools/webSearchTool.js', () => ({
  webSearchToolSchema: {},
  fetchWebSearch: vi.fn(),
}));
vi.mock('../src/personality/systemPrompt.js', () => ({
  buildSystemPrompt: vi.fn().mockReturnValue('You are Max Height...'),
}));

const { __test } = await import('../src/index.js');
const { __invokeMock: invokeMock } = (await import('@strands-agents/sdk')) as unknown as {
  __invokeMock: ReturnType<typeof vi.fn>;
};

function makeReq(body: unknown): IncomingMessage {
  const stream = new PassThrough();
  stream.end(typeof body === 'string' ? body : JSON.stringify(body));
  return stream as unknown as IncomingMessage;
}

function makeRes(): {
  res: ServerResponse;
  statusCode: () => number | undefined;
  body: () => string;
  end: Promise<void>;
} {
  const chunks: string[] = [];
  let status: number | undefined;
  let resolveEnd!: () => void;
  const ended = new Promise<void>((r) => (resolveEnd = r));

  const emitter = new EventEmitter();
  const res = Object.assign(emitter, {
    writableFinished: false,
    writeHead(code: number) {
      status = code;
      return res;
    },
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    },
    end(chunk?: string) {
      if (chunk) chunks.push(chunk);
      (res as unknown as { writableFinished: boolean }).writableFinished = true;
      resolveEnd();
      return res;
    },
  }) as unknown as ServerResponse;

  return { res, statusCode: () => status, body: () => chunks.join(''), end: ended };
}

describe('handleInvocations — approved per-turn bounds', () => {
  beforeEach(() => {
    __test.sessions.clear();
    vi.clearAllMocks();
    __test.setRuntimeConfig(testRuntimeConfig());
    invokeMock.mockResolvedValue({
      lastMessage: { content: [{ type: 'textBlock', text: 'Hi there from Max!' }] },
      invocationContext: { usage: { inputTokens: 30, outputTokens: 7, totalTokens: 37 } },
    });
  });

  it('refuses a body over 16 KiB with 413 and never invokes the model', async () => {
    const oversized = JSON.stringify({ message: 'x'.repeat(20 * 1024), sessionId: 'big' });
    const { res, end, statusCode, body } = makeRes();

    await __test.handleInvocations(makeReq(oversized), res);
    await end;

    expect(statusCode()).toBe(413);
    expect(JSON.parse(body())).toMatchObject({ error: 'request_too_large' });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('refuses the oversized body without parsing it', async () => {
    // Invalid JSON over the limit must still be a 413, which proves the size
    // gate runs before `JSON.parse` rather than after it.
    const { res, end, statusCode } = makeRes();
    await __test.handleInvocations(makeReq('{' + 'x'.repeat(20 * 1024)), res);
    await end;

    expect(statusCode()).toBe(413);
  });

  it('passes the approved SDK limits to invoke', async () => {
    const { res, end } = makeRes();
    await __test.handleInvocations(makeReq({ message: 'hi', sessionId: 's1' }), res);
    await end;

    expect(invokeMock).toHaveBeenCalledWith(
      'hi',
      expect.objectContaining({
        limits: { turns: 4, outputTokens: 1000, totalTokens: 64_000 },
      }),
    );
  });

  it('rejects a message over the configured character limit', async () => {
    const { res, end, statusCode, body } = makeRes();
    await __test.handleInvocations(makeReq({ message: 'y'.repeat(2001), sessionId: 's2' }), res);
    await end;

    expect(statusCode()).toBe(400);
    expect(JSON.parse(body())).toMatchObject({ error: 'message_too_long' });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it.each([
    ['limitTurns', 'model call'],
    ['limitOutputTokens', 'generated token'],
    ['limitTotalTokens', 'billed token'],
  ])('ends the turn as an error when the SDK stops on %s', async (stopReason) => {
    invokeMock.mockResolvedValueOnce({
      stopReason,
      lastMessage: { content: [{ type: 'textBlock', text: 'partial' }] },
      invocationContext: { usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
    });

    const { res, end, body } = makeRes();
    await __test.handleInvocations(makeReq({ message: 'hi', sessionId: 's3' }), res);
    await end;

    expect(body()).toContain('"type":"error"');
    expect(body()).toContain(stopReason);
    expect(body()).not.toContain('"type":"done"');
  });

  it('still counts the billed work of a limit-stopped turn', async () => {
    invokeMock.mockResolvedValueOnce({
      stopReason: 'limitTotalTokens',
      lastMessage: { content: [{ type: 'textBlock', text: 'partial' }] },
      invocationContext: { usage: { inputTokens: 10, outputTokens: 40, totalTokens: 50 } },
    });

    const { res, end } = makeRes();
    await __test.handleInvocations(makeReq({ message: 'hi', sessionId: 's4' }), res);
    await end;

    // Spending money and not counting it is the failure mode that matters.
    expect(__test.sessions.get('s4')!.tokenCount).toBeGreaterThanOrEqual(40);
  });

  it('abandons the turn at the configured deadline', async () => {
    __test.setRuntimeConfig(
      testRuntimeConfig({ limits: { ...testRuntimeConfig().limits, deadlineMs: 20 } }),
    );
    invokeMock.mockImplementationOnce(
      (_m: string, options: { cancelSignal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.cancelSignal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

    const { res, end, body } = makeRes();
    await __test.handleInvocations(makeReq({ message: 'hi', sessionId: 's5' }), res);
    await end;

    expect(body()).toContain('"type":"error"');
    expect(body()).toMatch(/deadline|timed out/i);
  });

  it('cancels the in-flight model call when the deadline passes', async () => {
    __test.setRuntimeConfig(
      testRuntimeConfig({ limits: { ...testRuntimeConfig().limits, deadlineMs: 20 } }),
    );
    let signal: AbortSignal | undefined;
    invokeMock.mockImplementationOnce(
      (_m: string, options: { cancelSignal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal = options.cancelSignal;
          options.cancelSignal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

    const { res, end } = makeRes();
    await __test.handleInvocations(makeReq({ message: 'hi', sessionId: 's6' }), res);
    await end;

    expect(signal?.aborted).toBe(true);
  });
});
