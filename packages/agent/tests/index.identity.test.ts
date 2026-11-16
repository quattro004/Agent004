/**
 * Identity tests for the agent invocation handler (#55, FR-010).
 *
 * Who is spending is decided by the verified token and nothing else. The
 * browser supplies a runtime session ID, but that only routes to a microVM —
 * it never selects whose budget is spent, and it never carries one friend's
 * conversation into another's reply.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testRuntimeConfig } from './fixtures/runtimeConfig.js';
import { fakeControlTable, type FakeControlTable } from './fixtures/controlTable.js';
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

/** Headers for a friend, optionally on a particular runtime session. */
function headersFor(sub: string, runtimeSessionId = TEST_RUNTIME_SESSION_ID) {
  return {
    ...bearerHeaders({ sub }),
    'x-amzn-bedrock-agentcore-runtime-session-id': runtimeSessionId,
  };
}

async function turn(body: unknown, headers: Record<string, string>) {
  const double = makeRes();
  await __test.handleInvocations(makeReq(body, headers), double.res);
  await double.end;
  return double;
}

let table: FakeControlTable;

describe('handleInvocations — identity from the verified token', () => {
  beforeEach(() => {
    __test.reset();
    vi.clearAllMocks();
    __test.setRuntimeConfig(testRuntimeConfig());
    table = fakeControlTable();
    __test.setControlTable(table);
    streamMock.mockImplementation(streamOf(['Hi there from Max!']));
  });

  it("keys the counted session to the token's sub", async () => {
    await turn({ message: 'hi' }, headersFor('friend-1'));

    expect(table.sessions.has('friend-1')).toBe(true);
  });

  it('ignores an actorId supplied in the body', async () => {
    await turn({ message: 'hi', actorId: 'someone-else' }, headersFor('me'));

    expect(table.sessions.has('me')).toBe(true);
    expect(table.sessions.has('someone-else')).toBe(false);
  });

  it('refuses a request with no bearer token and never invokes the model', async () => {
    const { head, events } = await turn(
      { message: 'hi' },
      { 'x-amzn-bedrock-agentcore-runtime-session-id': TEST_RUNTIME_SESSION_ID },
    );

    // The platform's JWT authorizer should already have refused this, so a
    // tokenless request reaching the container is a misconfiguration.
    expect(head()?.status).toBe(200);
    expect(events()).toEqual([
      expect.objectContaining({ type: 'error', code: 'internal', retryable: true }),
    ]);
    expect(streamMock).not.toHaveBeenCalled();
  });

  it('refuses a bearer token with no sub claim', async () => {
    const { events } = await turn({ message: 'hi' }, {
      ...bearerHeaders({ email: 'a@b.c' }),
      'x-amzn-bedrock-agentcore-runtime-session-id': TEST_RUNTIME_SESSION_ID,
    } as Record<string, string>);

    expect(events()[0]).toMatchObject({ type: 'error', code: 'internal' });
    expect(streamMock).not.toHaveBeenCalled();
  });

  it('gives two subjects separate counted sessions, never a shared budget', async () => {
    await turn({ message: 'hi' }, headersFor('friend-1'));
    await turn({ message: 'hi' }, headersFor('friend-2', 'runtime-session-1111111111111111111'));

    expect(table.sessions.get('friend-1')?.turns).toBe(1);
    expect(table.sessions.get('friend-2')?.turns).toBe(1);
    expect(table.sessions.get('friend-1')?.sessionId).not.toBe(
      table.sessions.get('friend-2')?.sessionId,
    );
  });

  it('refuses a runtime session ID already owned by another sub', async () => {
    await turn({ message: 'hi' }, headersFor('friend-1'));

    // Presenting someone else's runtime session ID would otherwise evict their
    // in-flight conversation from this instance's registry.
    const { events } = await turn({ message: 'hi' }, headersFor('intruder'));

    expect(events()).toEqual([
      expect.objectContaining({ type: 'error', code: 'session_mismatch', retryable: false }),
    ]);
    expect(streamMock).toHaveBeenCalledTimes(1);
    expect(table.sessions.has('intruder')).toBe(false);
    expect(table.sessions.get('friend-1')?.turns).toBe(1);
  });

  it('lets the same subject continue its own session', async () => {
    await turn({ message: 'hi' }, headersFor('friend-1'));
    await turn({ message: 'hi again' }, headersFor('friend-1'));

    expect(table.sessions.get('friend-1')?.turns).toBe(2);
    expect(streamMock).toHaveBeenCalledTimes(2);
  });

  it('continues the same counted session under a new runtime session ID (P-05)', async () => {
    await turn({ message: 'hi' }, headersFor('friend-1'));
    const opened = table.sessions.get('friend-1')?.sessionId;

    // A new browser tab mints a new runtime session ID. Strict continuity
    // means that must not hand the friend a fresh cap.
    const { events } = await turn(
      { message: 'still me' },
      headersFor('friend-1', 'runtime-session-2222222222222222222'),
    );

    expect(events()[0]).toMatchObject({ type: 'session', countedSessionId: opened, opened: false });
    expect(table.sessions.get('friend-1')?.turns).toBe(2);
  });
});
