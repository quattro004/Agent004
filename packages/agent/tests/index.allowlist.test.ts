/**
 * The allowlist check at counted-session open (T049, FR-042, SC-016;
 * contracts/auth-and-allowlist.md § Runtime check, § Revocation timeline).
 *
 * Cognito's triggers already refuse a stranger at sign-in and at every
 * refresh, so this is the second gate, not the first — it exists because an
 * access token stays valid for an hour after `ALLOW#<email>` is deleted, and
 * a removed friend must not be able to open a *new* conversation with it.
 *
 * It runs only when a counted session opens. A conversation already underway
 * when the removal happens is left alone, and ends on its own 30-minute cap.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testRuntimeConfig } from './fixtures/runtimeConfig.js';
import { makeReq, bearerHeaders, TEST_SUB, TEST_RUNTIME_SESSION_ID } from './fixtures/http.js';
import { makeRes } from './fixtures/sse.js';
import { streamOf } from './fixtures/strands.js';
import { fakeControlTable, FAKE_FRIEND, type FakeControlTable } from './fixtures/controlTable.js';

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

const synthesize = vi.hoisted(() => vi.fn());
vi.mock('../src/voice/pollyStream.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, synthesizeToAudioEvents: synthesize };
});

const { __test } = await import('../src/index.js');

function install(overrides: Parameters<typeof fakeControlTable>[0] = {}): FakeControlTable {
  const table = fakeControlTable(overrides);
  __test.setControlTable(table);
  return table;
}

async function turn(body: Record<string, unknown> = { message: 'hello' }) {
  const double = makeRes();
  await __test.handleInvocations(
    makeReq(body, {
      ...bearerHeaders({ sub: TEST_SUB }),
      'x-amzn-bedrock-agentcore-runtime-session-id': TEST_RUNTIME_SESSION_ID,
    }),
    double.res,
  );
  await double.end;
  return double;
}

function errorCodeOf(events: () => Array<Record<string, unknown>>): unknown {
  return events().find((e) => e.type === 'error')?.code;
}

describe('handleInvocations — the allowlist at session open', () => {
  beforeEach(() => {
    __test.reset();
    __test.setRuntimeConfig(testRuntimeConfig());
    vi.clearAllMocks();
    synthesize.mockResolvedValue({ pollyCharacters: 0, segments: 0 });
    streamMock.mockImplementation(
      streamOf(['Hi there from Max!'], {
        usage: { inputTokens: 10, outputTokens: 7, totalTokens: 17 },
      }),
    );
  });

  it('opens a counted session for a friend who is still on the list', async () => {
    const table = install();

    const { events } = await turn();

    expect(errorCodeOf(events)).toBeUndefined();
    expect(table.getFriend).toHaveBeenCalledWith(TEST_SUB);
    expect(table.getAllow).toHaveBeenCalledWith(FAKE_FRIEND.email);
  });

  it('refuses with not_allowlisted when the allow item is gone', async () => {
    install({ allow: null });

    const { events } = await turn();

    expect(errorCodeOf(events)).toBe('not_allowlisted');
    expect(streamMock).not.toHaveBeenCalled();
  });

  it('refuses with not_allowlisted when there is no friend record', async () => {
    const table = install({ friend: null });

    const { events } = await turn();

    expect(errorCodeOf(events)).toBe('not_allowlisted');
    // Without the friend record there is no email to look the allow item up by.
    expect(table.getAllow).not.toHaveBeenCalled();
  });

  it('spends nothing on a refused open', async () => {
    const table = install({ friend: null, allow: null });

    await turn();

    expect(table.addSpend).not.toHaveBeenCalled();
    expect(synthesize).not.toHaveBeenCalled();
  });

  it('checks the list before the month tally, which costs a second read', async () => {
    const table = install({ allow: null });

    await turn();

    expect(table.getSpend).not.toHaveBeenCalled();
  });

  it('lets an already-open counted session continue without re-checking', async () => {
    const table = install();
    await turn();
    // The builder removes the friend mid-conversation.
    table.getAllow.mockResolvedValue(undefined);

    const { events } = await turn({ message: 'still there?' });

    expect(errorCodeOf(events)).toBeUndefined();
    expect(table.getFriend).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the list cannot be read', async () => {
    const table = install({ allow: null });
    table.getAllow.mockRejectedValue(new Error('ProvisionedThroughputExceededException'));

    const { events } = await turn();

    expect(errorCodeOf(events)).toBe('internal');
    expect(streamMock).not.toHaveBeenCalled();
  });

  it('refuses a halted system before it reads the list', async () => {
    const table = install({
      halt: { haltedAt: '2026-11-17T00:00:00.000Z', reason: 'budget-100' },
    });

    const { events } = await turn();

    expect(errorCodeOf(events)).toBe('halted');
    expect(table.getFriend).not.toHaveBeenCalled();
  });
});
