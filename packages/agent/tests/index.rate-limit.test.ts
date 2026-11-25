/**
 * Rate limiting and the `lastSeenAt` stamp (T085, T091; FR-012;
 * contracts/transport-sse.md § Refusal order).
 *
 * The caps bound one conversation; these bound a friend. 60 messages an hour
 * and 500 a day, keyed to the verified `sub`, are what stop a single friend
 * from spending the month's budget in an afternoon — the counted session
 * resets the moment it ends, the windows do not.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testRuntimeConfig } from './fixtures/runtimeConfig.js';
import { makeReq, bearerHeaders, TEST_SUB, TEST_RUNTIME_SESSION_ID } from './fixtures/http.js';
import { makeRes } from './fixtures/sse.js';
import { streamOf } from './fixtures/strands.js';
import { fakeControlTable, type FakeControlTable } from './fixtures/controlTable.js';

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

describe('handleInvocations — rate limiting', () => {
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

  it('consumes one message from the windows, keyed to the verified sub', async () => {
    const table = install();

    const { events } = await turn();

    expect(errorCodeOf(events)).toBeUndefined();
    expect(table.consumeRate).toHaveBeenCalledTimes(1);
    expect(table.consumeRate).toHaveBeenCalledWith(TEST_SUB, expect.any(Date));
  });

  it.each(['hour', 'day'] as const)('refuses with rate_limited past the %s window', async (w) => {
    const table = install();
    table.consumeRate.mockResolvedValue({ allowed: false, exceeded: w });

    const { events } = await turn();

    expect(errorCodeOf(events)).toBe('rate_limited');
    expect(streamMock).not.toHaveBeenCalled();
    expect(table.admitRequest).toHaveBeenCalledTimes(1);
    expect(table.settleRequest).toHaveBeenCalledTimes(1);
    expect(table.settleRequest.mock.calls[0][1]).toBe(0);
    expect(table.leases.size).toBe(0);
    expect(table.counters.active).toBe(0);
  });

  it('tells the browser a rate-limited message is worth retrying', async () => {
    const table = install();
    table.consumeRate.mockResolvedValue({ allowed: false, exceeded: 'hour' });

    const { events } = await turn();

    expect(events().find((e) => e.type === 'error')?.retryable).toBe(true);
  });

  it('spends nothing on a refused message', async () => {
    const table = install();
    table.consumeRate.mockResolvedValue({ allowed: false, exceeded: 'day' });

    await turn();

    expect(table.addSpend).not.toHaveBeenCalled();
    expect(table.settleRequest).toHaveBeenCalledTimes(1);
    expect(table.settleRequest.mock.calls[0][1]).toBe(0);
    expect(table.counters.committedMicroUsd).toBe(0);
    expect(synthesize).not.toHaveBeenCalled();
  });

  it('admits work before consuming the fixed window and settles a rate refusal at zero', async () => {
    const table = install();
    table.consumeRate.mockResolvedValue({ allowed: false, exceeded: 'hour' });

    await turn();

    expect(table.admitRequest).toHaveBeenCalledTimes(1);
    expect(table.consumeRate).toHaveBeenCalledTimes(1);
    expect(table.settleRequest.mock.calls[0][1]).toBe(0);
    expect(table.getSpend).toHaveBeenCalled();
  });

  it('fails closed when the windows cannot be read', async () => {
    const table = install();
    table.consumeRate.mockRejectedValue(new Error('ProvisionedThroughputExceededException'));

    const { events } = await turn();

    expect(errorCodeOf(events)).toBe('internal');
    expect(streamMock).not.toHaveBeenCalled();
  });
});

describe('handleInvocations — lastSeenAt', () => {
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

  it('stamps the friend record when a counted session opens', async () => {
    const table = install();

    await turn();

    expect(table.recordFriendSeen).toHaveBeenCalledTimes(1);
    expect(table.recordFriendSeen).toHaveBeenCalledWith(TEST_SUB, expect.any(Date));
  });

  it('does not stamp it again on every turn of the same session', async () => {
    const table = install();
    await turn();

    await turn({ message: 'still here' });

    expect(table.recordFriendSeen).toHaveBeenCalledTimes(1);
  });

  it('does not stamp a friend who was refused', async () => {
    const table = install({ allow: null });

    await turn();

    expect(table.recordFriendSeen).not.toHaveBeenCalled();
  });

  it('answers anyway when the stamp cannot be written, and says so in the log', async () => {
    // The stamp only delays the pruner. Refusing a conversation over it would
    // trade a day of retention for an outage.
    const table = install();
    table.recordFriendSeen.mockRejectedValue(new Error('ConditionalCheckFailedException'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { events } = await turn();

    expect(errorCodeOf(events)).toBeUndefined();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
