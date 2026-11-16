/**
 * Session-identifier generation tests for the agent invocation handler.
 *
 * A counted session id is the key to a friend's token/turn budget
 * (constitution P2 / FR-010), so it must not be guessable. These tests pin
 * that property by making every *predictable* source of entropy constant —
 * `Date.now()` and `Math.random()` — and asserting the handler still mints
 * distinct identifiers. A generator built on `Math.random()` collides under
 * those conditions; a cryptographic one does not.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { testRuntimeConfig } from './fixtures/runtimeConfig.js';
import { makeReq, bearerHeaders, TEST_RUNTIME_SESSION_ID } from './fixtures/http.js';
import { makeRes } from './fixtures/sse.js';
import { streamOf } from './fixtures/strands.js';

const streamMock = vi.hoisted(() => vi.fn());

vi.mock('@strands-agents/sdk', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const Agent = vi.fn(function () {
    return { stream: streamMock, addHook: vi.fn(), messages: [] };
  });
  const tool = vi.fn().mockImplementation((cfg) => ({ ...cfg, __tool: true }));
  return { ...actual, Agent, tool };
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
vi.mock('../src/voice/pollyStream.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    synthesizeToAudioEvents: vi.fn().mockResolvedValue({ pollyCharacters: 0, segments: 0 }),
  };
});

const { __test } = await import('../src/index.js');

/** Drive one turn for a fresh friend and return the counted session id. */
async function mintSessionId(sub: string, runtimeSessionId: string): Promise<string> {
  const double = makeRes();
  await __test.handleInvocations(
    makeReq(
      { message: 'hello' },
      {
        ...bearerHeaders({ sub }),
        'x-amzn-bedrock-agentcore-runtime-session-id': runtimeSessionId,
      },
    ),
    double.res,
  );
  await double.end;

  const session = double.event('session');
  expect(session, 'handler did not emit a session event').toBeDefined();
  return (session as { countedSessionId: string }).countedSessionId;
}

describe('handleInvocations — minted session identifiers', () => {
  beforeEach(() => {
    __test.reset();
    __test.setRuntimeConfig(testRuntimeConfig());
    vi.clearAllMocks();
    streamMock.mockImplementation(streamOf(['Hi there from Max!']));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mints unpredictable ids that do not derive from Date.now() or Math.random()', async () => {
    // Freeze both predictable entropy sources. Anything still varying after
    // this must have come from a cryptographic generator.
    vi.spyOn(Date, 'now').mockReturnValue(1_759_000_000_000);
    vi.spyOn(Math, 'random').mockReturnValue(0.123456789);

    const first = await mintSessionId('friend-a', 'runtime-session-aaaaaaaaaaaaaaaaaaa');
    const second = await mintSessionId('friend-b', 'runtime-session-bbbbbbbbbbbbbbbbbbb');

    expect(
      second,
      'session ids collided with Date.now() and Math.random() held constant, so they are ' +
        'derived from predictable entropy and are guessable — mint them with node:crypto',
    ).not.toBe(first);
  });

  it('ignores a sessionId supplied in the body', async () => {
    // The browser cannot choose which budget it spends: the counted session is
    // keyed to the verified subject (transport-sse.md § Request).
    const double = makeRes();
    await __test.handleInvocations(
      makeReq(
        { message: 'hello', sessionId: 'sess-supplied' },
        {
          ...bearerHeaders({ sub: 'friend-a' }),
          'x-amzn-bedrock-agentcore-runtime-session-id': TEST_RUNTIME_SESSION_ID,
        },
      ),
      double.res,
    );
    await double.end;

    expect(__test.sessions.has('sess-supplied')).toBe(false);
    expect(double.event('session')).toMatchObject({
      countedSessionId: expect.not.stringContaining('sess-supplied'),
    });
  });
});
