/**
 * Cancellation tests for the agent invocation handler (issue #43).
 *
 * A guest who closes the tab mid-turn must not keep billing tokens. These
 * tests bypass the HTTP layer and call `handleInvocations` directly with
 * mocked IncomingMessage / ServerResponse, following the same pattern as
 * `index.cap-enforcement.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';

vi.mock('@strands-agents/sdk', () => {
  const invokeMock = vi.fn().mockResolvedValue({
    lastMessage: {
      content: [{ type: 'textBlock', text: 'Hi there from Max!' }],
    },
  });
  const Agent = vi.fn(function () {
    return { invoke: invokeMock };
  });
  const tool = vi.fn().mockImplementation((cfg) => ({ ...cfg, __tool: true }));
  return { Agent, tool, __invokeMock: invokeMock };
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

const sdk = (await import('@strands-agents/sdk')) as unknown as {
  __invokeMock: ReturnType<typeof vi.fn>;
  tool: ReturnType<typeof vi.fn>;
};
const invokeMock = sdk.__invokeMock;
const toolMock = sdk.tool;
const { fetchNews } = (await import('../src/tools/newsTool.js')) as unknown as {
  fetchNews: ReturnType<typeof vi.fn>;
};
const { fetchWeather } = (await import('../src/tools/weatherTool.js')) as unknown as {
  fetchWeather: ReturnType<typeof vi.fn>;
};
const { fetchWebSearch } = (await import('../src/tools/webSearchTool.js')) as unknown as {
  fetchWebSearch: ReturnType<typeof vi.fn>;
};
const { __test } = await import('../src/index.js');

/**
 * Snapshot the tool registrations now, at import time: the tools are built once
 * when `index.ts` loads, and Vitest clears `mock.calls` before test bodies run.
 */
interface ToolRegistration {
  name: string;
  callback: (input: unknown, context?: { cancelSignal: AbortSignal }) => Promise<unknown>;
}
const toolRegistrations = toolMock.mock.calls.map((call) => call[0] as ToolRegistration);

function makeReq(body: unknown): IncomingMessage {
  const stream = new PassThrough();
  stream.end(JSON.stringify(body));
  return stream as unknown as IncomingMessage;
}

/**
 * A response double that is an EventEmitter, because the disconnect signal we
 * rely on is `res.on('close')` firing while `writableFinished` is still false.
 */
function makeRes(): {
  res: ServerResponse;
  disconnect: () => void;
  body: () => string;
  end: Promise<void>;
} {
  const chunks: string[] = [];
  let resolveEnd!: () => void;
  const ended = new Promise<void>((r) => (resolveEnd = r));

  const emitter = new EventEmitter();
  const res = Object.assign(emitter, {
    writableFinished: false,
    writeHead() {
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
      emitter.emit('close');
      return res;
    },
  }) as unknown as ServerResponse;

  return {
    res,
    // The client vanishing: 'close' arrives before the response finished.
    disconnect: () => emitter.emit('close'),
    body: () => chunks.join(''),
    end: ended,
  };
}

describe('handleInvocations — cancellation on client disconnect', () => {
  beforeEach(() => {
    __test.sessions.clear();
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({
      lastMessage: { content: [{ type: 'textBlock', text: 'Hi there from Max!' }] },
    });
  });

  it('passes a cancelSignal to agent.invoke', async () => {
    const { res, end } = makeRes();
    await __test.handleInvocations(makeReq({ message: 'hello', sessionId: 's1' }), res);
    await end;

    expect(invokeMock).toHaveBeenCalledTimes(1);
    const options = invokeMock.mock.calls[0]?.[1] as { cancelSignal?: AbortSignal } | undefined;
    expect(options?.cancelSignal).toBeInstanceOf(AbortSignal);
  });

  it('aborts the invocation when the client disconnects mid-turn', async () => {
    let captured: AbortSignal | undefined;
    invokeMock.mockImplementation((_prompt: unknown, options?: { cancelSignal?: AbortSignal }) => {
      captured = options?.cancelSignal;
      return new Promise((_resolve, reject) => {
        options?.cancelSignal?.addEventListener('abort', () =>
          reject(new Error('invocation aborted')),
        );
      });
    });

    const { res, disconnect, end } = makeRes();
    const pending = __test.handleInvocations(makeReq({ message: 'hi', sessionId: 's2' }), res);

    await vi.waitFor(() => expect(captured).toBeDefined());
    expect(captured!.aborted).toBe(false);

    disconnect();

    await pending;
    await end;
    expect(captured!.aborted).toBe(true);
  });

  it('does not abort a turn that completes normally', async () => {
    let captured: AbortSignal | undefined;
    invokeMock.mockImplementation((_prompt: unknown, options?: { cancelSignal?: AbortSignal }) => {
      captured = options?.cancelSignal;
      return Promise.resolve({
        lastMessage: { content: [{ type: 'textBlock', text: 'done' }] },
      });
    });

    const { res, end } = makeRes();
    await __test.handleInvocations(makeReq({ message: 'hi', sessionId: 's3' }), res);
    await end;

    expect(captured!.aborted).toBe(false);
  });
});

describe('tool callbacks — cancel signal forwarding', () => {
  // Cancelling the model turn is only half the saving: a tool already in flight
  // holds an outbound HTTP request open unless the signal reaches it too.
  function callbackFor(name: string) {
    const cfg = toolRegistrations.find((c) => c.name === name);
    if (!cfg) throw new Error(`no tool registered named ${name}`);
    return cfg.callback;
  }

  it.each([
    ['get_news', () => fetchNews],
    ['get_weather', () => fetchWeather],
    ['web_search', () => fetchWebSearch],
  ])('%s forwards context.cancelSignal to its fetcher', async (toolName, getFetcher) => {
    const fetcher = getFetcher();
    fetcher.mockReset();
    fetcher.mockResolvedValue({ success: true });
    const controller = new AbortController();

    await callbackFor(toolName as string)(
      { query: 'q', topic: 'q', location: 'q' },
      {
        cancelSignal: controller.signal,
      },
    );

    expect(fetcher.mock.calls[0]?.[2]).toBe(controller.signal);
  });
});
