/**
 * Cap-enforcement integration tests for the agent invocation handler.
 *
 * These bypass the HTTP layer and call `handleInvocations` directly with
 * doubles, so the per-session token, turn and duration gates (constitution
 * P2 / FR-010) can be exercised deterministically. Caps are keyed to the
 * verified `sub` and held in the control table, never taken from the browser.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testRuntimeConfig } from './fixtures/runtimeConfig.js';
import { fakeControlTable, type FakeControlTable } from './fixtures/controlTable.js';
import { makeReq, bearerHeaders, TEST_SUB, TEST_RUNTIME_SESSION_ID } from './fixtures/http.js';
import { makeRes } from './fixtures/sse.js';
import { streamOf, textDelta } from './fixtures/strands.js';
import type { CountedSession } from '../src/session/controlTable.js';

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
vi.mock('../src/tools/webSearchTool.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  searchForTurn: vi.fn(),
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

/** The reply usage every test shares: 7 generated tokens. */
const REPLY_OUTPUT_TOKENS = 7;

let table: FakeControlTable;

async function turn(message: string, runtimeSessionId = TEST_RUNTIME_SESSION_ID) {
  const double = makeRes();
  await __test.handleInvocations(
    makeReq(
      { message },
      {
        ...bearerHeaders({ sub: TEST_SUB }),
        'x-amzn-bedrock-agentcore-runtime-session-id': runtimeSessionId,
      },
    ),
    double.res,
  );
  await double.end;
  return double;
}

/** Seeds a counted session for `TEST_SUB` that is already at some usage. */
function seedSession(overrides: Partial<CountedSession>): void {
  table.sessions.set(TEST_SUB, {
    sessionId: 'sess-seeded',
    state: 'Active',
    openedAt: new Date().toISOString(),
    turns: 0,
    conversationalTokens: 0,
    ttl: 0,
    ...overrides,
  });
}

describe('handleInvocations — per-session cap enforcement', () => {
  beforeEach(() => {
    __test.reset();
    __test.setRuntimeConfig(testRuntimeConfig());
    table = fakeControlTable();
    __test.setControlTable(table);
    vi.clearAllMocks();
    streamMock.mockImplementation(
      streamOf(['Hi there from Max!'], {
        usage: { inputTokens: 3000, outputTokens: REPLY_OUTPUT_TOKENS, totalTokens: 3007 },
      }),
    );
  });

  it('opens a counted session on the first turn when none exists', async () => {
    const { events } = await turn('hello');

    const session = table.sessions.get(TEST_SUB);
    expect(session).toBeDefined();
    expect(session!.turns).toBe(1);
    expect(session!.conversationalTokens).toBeGreaterThan(0);
    expect(events()[0]).toMatchObject({ type: 'session', opened: true });
  });

  it('fails the turn loudly, without counting it, when the result carries no usage', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    streamMock.mockImplementation(async function* () {
      yield textDelta('Hi');
      return { lastMessage: { content: [{ type: 'textBlock', text: 'Hi' }] } };
    });

    const { events } = await turn('hello');

    // The friend is told the stream failed, never why: the detail names an
    // internal field and belongs in the log, not in the browser.
    expect(events().at(-1)).toMatchObject({ type: 'error', code: 'internal' });
    expect(table.sessions.get(TEST_SUB)!.turns).toBe(0);
  });

  it('accumulates token and turn counts across turns for the same subject', async () => {
    await turn('first');
    await turn('second');

    expect(table.sessions.get(TEST_SUB)!.turns).toBe(2);
  });

  it('refuses with session_cap_exceeded when the token cap is exceeded', async () => {
    seedSession({ turns: 5, conversationalTokens: 25_000 });

    const { head, events } = await turn('still talking?');

    // The refusal is an SSE event, not an HTTP status, and it carries no
    // figures — a friend learns about a cap only in Max's voice.
    expect(head()?.status).toBe(200);
    expect(events()).toEqual([
      expect.objectContaining({ type: 'error', code: 'session_cap_exceeded', retryable: false }),
    ]);
    expect(events()[0]).not.toHaveProperty('conversationalTokens');
    expect(table.consumeRate).not.toHaveBeenCalled();
    expect(streamMock).not.toHaveBeenCalled();

    // The over-budget session is signed off in the table, so every instance
    // sees it and the next message opens a fresh one.
    expect(table.sessions.get(TEST_SUB)!.state).toBe('SignedOff');
  });

  it('refuses when the turn cap is exceeded', async () => {
    seedSession({ turns: 60, conversationalTokens: 100 });

    const { events } = await turn('hi');

    expect(events()[0]).toMatchObject({ type: 'error', code: 'session_cap_exceeded' });
    expect(streamMock).not.toHaveBeenCalled();
  });

  it('counts a turn stopped at an approved ceiling rather than presenting it as finished', async () => {
    streamMock.mockImplementation(
      streamOf(['Half an ans'], {
        usage: { inputTokens: 10, outputTokens: REPLY_OUTPUT_TOKENS, totalTokens: 17 },
        stopReason: 'limitOutputTokens',
      }),
    );

    const { events } = await turn('tell me everything');

    expect(events().at(-1)).toMatchObject({ type: 'error', code: 'session_cap_exceeded' });
    // Billed work is counted whether or not the turn produced a usable reply.
    expect(table.sessions.get(TEST_SUB)!.turns).toBe(1);
    expect(table.sessions.get(TEST_SUB)!.conversationalTokens).toBeGreaterThan(0);
  });

  it('never sends spend figures to the browser', async () => {
    const { raw } = await turn('hello');

    expect(raw()).not.toMatch(/conversationalTokens|tokenCount|microUsd|outputTokens/);
  });
});
