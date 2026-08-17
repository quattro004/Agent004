/**
 * Cap-enforcement integration tests for the agent invocation handler.
 *
 * These tests bypass the HTTP layer and call `handleInvocations` directly
 * with mocked IncomingMessage / ServerResponse so we can deterministically
 * exercise the per-session token-cap gate (constitution P2 / FR-010).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

const { __test } = await import('../src/index.js');

function makeReq(body: unknown): IncomingMessage {
  const stream = new PassThrough();
  stream.end(JSON.stringify(body));
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

  const res = {
    writeHead(code: number) {
      status = code;
      return this;
    },
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    },
    end(chunk?: string) {
      if (chunk) chunks.push(chunk);
      resolveEnd();
      return this;
    },
  } as unknown as ServerResponse;

  return {
    res,
    statusCode: () => status,
    body: () => chunks.join(''),
    end: ended,
  };
}

describe('handleInvocations — per-session cap enforcement', () => {
  beforeEach(() => {
    __test.sessions.clear();
    vi.clearAllMocks();
  });

  it('creates a session record on first invocation when none exists', async () => {
    const { res, end } = makeRes();
    await __test.handleInvocations(makeReq({ message: 'hello', sessionId: 'sess-1' }), res);
    await end;

    const session = __test.sessions.get('sess-1');
    expect(session).toBeDefined();
    expect(session!.turnCount).toBe(1);
    expect(session!.tokenCount).toBeGreaterThan(0);
  });

  it('accumulates token and turn counts across invocations on the same sessionId', async () => {
    const r1 = makeRes();
    await __test.handleInvocations(makeReq({ message: 'first', sessionId: 'sess-2' }), r1.res);
    await r1.end;

    const r2 = makeRes();
    await __test.handleInvocations(makeReq({ message: 'second', sessionId: 'sess-2' }), r2.res);
    await r2.end;

    const session = __test.sessions.get('sess-2');
    expect(session!.turnCount).toBe(2);
  });

  it('rejects with 429 + session_cap_exceeded when the token cap is exceeded', async () => {
    // Pre-seed a session that has already exhausted its 20k-token budget.
    __test.sessions.set('sess-3', {
      sessionId: 'sess-3',
      actorId: 'guest',
      greetingId: 'g',
      state: 'ACTIVE',
      turnCount: 5,
      tokenCount: 25_000,
      idleNudgeDelivered: false,
      reEngagementCount: 0,
      startedAt: new Date(),
      endedAt: null,
    });

    const { res, end, statusCode, body } = makeRes();
    await __test.handleInvocations(
      makeReq({ message: 'still talking?', sessionId: 'sess-3' }),
      res,
    );
    await end;

    expect(statusCode()).toBe(429);
    const payload = JSON.parse(body());
    expect(payload).toMatchObject({
      error: 'session_cap_exceeded',
      reason: 'token_limit',
      sessionId: 'sess-3',
    });

    // The over-budget session must be marked ENDED so subsequent attempts
    // continue to be rejected and never re-enter the invoke path.
    const ended = __test.sessions.get('sess-3');
    expect(ended!.state).toBe('ENDED');
    expect(ended!.endedAt).not.toBeNull();
  });

  it('rejects when the turn cap is exceeded', async () => {
    __test.sessions.set('sess-4', {
      sessionId: 'sess-4',
      actorId: 'guest',
      greetingId: 'g',
      state: 'ACTIVE',
      turnCount: 60,
      tokenCount: 100,
      idleNudgeDelivered: false,
      reEngagementCount: 0,
      startedAt: new Date(),
      endedAt: null,
    });

    const { res, end, statusCode, body } = makeRes();
    await __test.handleInvocations(makeReq({ message: 'hi', sessionId: 'sess-4' }), res);
    await end;

    expect(statusCode()).toBe(429);
    expect(JSON.parse(body()).reason).toBe('turn_limit');
  });
});
