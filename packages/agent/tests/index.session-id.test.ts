/**
 * Session-identifier generation tests for the agent invocation handler.
 *
 * A minted sessionId is the key to a session's token/turn budget
 * (constitution P2 / FR-010), so it must not be guessable. These tests pin
 * that property by making every *predictable* source of entropy constant —
 * `Date.now()` and `Math.random()` — and asserting the handler still mints
 * distinct identifiers. A generator built on `Math.random()` collides under
 * those conditions; a cryptographic one does not.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
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

const { __test } = await import('../src/index.js');

function makeReq(body: unknown): IncomingMessage {
  const stream = new PassThrough();
  stream.end(JSON.stringify(body));
  return stream as unknown as IncomingMessage;
}

function makeRes(): { res: ServerResponse; body: () => string; end: Promise<void> } {
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
      return res;
    },
  }) as unknown as ServerResponse;

  return { res, body: () => chunks.join(''), end: ended };
}

/** Drive one turn with no client-supplied sessionId and return the minted one. */
async function mintSessionId(): Promise<string> {
  const { res, body, end } = makeRes();
  await __test.handleInvocations(makeReq({ message: 'hello' }), res);
  await end;

  const frame = body()
    .split('\n')
    .find((line) => line.startsWith('data: ') && line.includes('"sessionId"'));
  expect(frame, 'handler did not emit an SSE frame carrying a sessionId').toBeDefined();

  return JSON.parse(frame!.slice('data: '.length)).sessionId as string;
}

describe('handleInvocations — minted session identifiers', () => {
  beforeEach(() => {
    __test.sessions.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mints unpredictable ids that do not derive from Date.now() or Math.random()', async () => {
    // Freeze both predictable entropy sources. Anything still varying after
    // this must have come from a cryptographic generator.
    vi.spyOn(Date, 'now').mockReturnValue(1_759_000_000_000);
    vi.spyOn(Math, 'random').mockReturnValue(0.123456789);

    const first = await mintSessionId();
    const second = await mintSessionId();

    expect(
      second,
      'session ids collided with Date.now() and Math.random() held constant, so they are ' +
        'derived from predictable entropy and are guessable — mint them with node:crypto',
    ).not.toBe(first);
  });

  it('still honours a client-supplied sessionId', async () => {
    const { res, end } = makeRes();
    await __test.handleInvocations(makeReq({ message: 'hello', sessionId: 'sess-supplied' }), res);
    await end;

    expect(__test.sessions.get('sess-supplied')).toBeDefined();
  });
});
