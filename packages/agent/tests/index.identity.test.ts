/**
 * Identity comes from the verified token, never from the body (#55, FR-010;
 * contracts/transport-sse.md § Body, "The server ignores `sessionId`,
 * `actorId` and any other field").
 *
 * The handler used to take `actorId` straight from the request, so a caller
 * could claim to be anyone. Worse, a session's turn and token budget is keyed
 * by `sessionId` alone, so one caller could spend another's budget by
 * presenting their identifier. Both holes close here: the subject comes from
 * the bearer token, and a session is bound to the subject that opened it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import { testRuntimeConfig } from './fixtures/runtimeConfig.js';
import { bearerHeaders as bearer, makeReq } from './fixtures/http.js';

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

describe('handleInvocations — identity from the verified token', () => {
  beforeEach(() => {
    __test.sessions.clear();
    vi.clearAllMocks();
    __test.setRuntimeConfig(testRuntimeConfig());
    invokeMock.mockResolvedValue({
      lastMessage: { content: [{ type: 'textBlock', text: 'Hi there from Max!' }] },
      invocationContext: { usage: { inputTokens: 30, outputTokens: 7, totalTokens: 37 } },
    });
  });

  it("keys the session's actor to the token's sub", async () => {
    const { res, end } = makeRes();
    await __test.handleInvocations(
      makeReq({ message: 'hi', sessionId: 's1' }, bearer({ sub: 'friend-1' })),
      res,
    );
    await end;

    expect(__test.sessions.get('s1')?.actorId).toBe('friend-1');
  });

  it('ignores an actorId supplied in the body', async () => {
    const { res, end } = makeRes();
    await __test.handleInvocations(
      makeReq({ message: 'hi', sessionId: 's1', actorId: 'someone-else' }, bearer({ sub: 'me' })),
      res,
    );
    await end;

    expect(__test.sessions.get('s1')?.actorId).toBe('me');
  });

  it('refuses a request with no bearer token and never invokes the model', async () => {
    const { res, end, statusCode, body } = makeRes();
    await __test.handleInvocations(makeReq({ message: 'hi' }, {}), res);
    await end;

    expect(statusCode()).toBe(401);
    expect(JSON.parse(body())).toMatchObject({ error: 'unauthenticated' });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('refuses a bearer token with no sub claim', async () => {
    const { res, end, statusCode } = makeRes();
    await __test.handleInvocations(makeReq({ message: 'hi' }, bearer({ email: 'a@b.c' })), res);
    await end;

    expect(statusCode()).toBe(401);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("refuses to spend another subject's session budget", async () => {
    const first = makeRes();
    await __test.handleInvocations(
      makeReq({ message: 'hi', sessionId: 'shared' }, bearer({ sub: 'friend-1' })),
      first.res,
    );
    await first.end;
    const turnsAfterOwner = __test.sessions.get('shared')?.turnCount;

    const second = makeRes();
    await __test.handleInvocations(
      makeReq({ message: 'hi', sessionId: 'shared' }, bearer({ sub: 'intruder' })),
      second.res,
    );
    await second.end;

    expect(second.statusCode()).toBe(403);
    expect(JSON.parse(second.body())).toMatchObject({ error: 'session_mismatch' });
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(__test.sessions.get('shared')?.turnCount).toBe(turnsAfterOwner);
    expect(__test.sessions.get('shared')?.actorId).toBe('friend-1');
  });

  it('lets the same subject continue its own session', async () => {
    for (const _ of [1, 2]) {
      const { res, end } = makeRes();
      await __test.handleInvocations(
        makeReq({ message: 'hi', sessionId: 'mine' }, bearer({ sub: 'friend-1' })),
        res,
      );
      await end;
    }

    expect(__test.sessions.get('mine')?.turnCount).toBe(2);
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });
});
