/**
 * The halt and the breaker on the invocation path (T070;
 * contracts/spend-control.md § Hard stop, § Breaker).
 *
 * These bypass HTTP and call `handleInvocations` directly, like the other
 * invocation suites, so the refusal order can be exercised deterministically.
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

const REPLY_OUTPUT_TOKENS = 7;

function install(table: FakeControlTable): FakeControlTable {
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

describe('handleInvocations — the halt', () => {
  beforeEach(() => {
    __test.reset();
    __test.setRuntimeConfig(testRuntimeConfig());
    vi.clearAllMocks();
    synthesize.mockResolvedValue({ pollyCharacters: 0, segments: 0 });
    streamMock.mockImplementation(
      streamOf(['Hi there from Max!'], {
        usage: { inputTokens: 3000, outputTokens: REPLY_OUTPUT_TOKENS, totalTokens: 3007 },
      }),
    );
  });

  it('refuses a chat turn with halted, before any model call', async () => {
    install(
      fakeControlTable({ halt: { haltedAt: '2026-11-17T00:00:00.000Z', reason: 'budget-100' } }),
    );

    const { events } = await turn();

    expect(errorCodeOf(events)).toBe('halted');
    expect(streamMock).not.toHaveBeenCalled();
    expect(events().some((e) => e.type === 'session')).toBe(false);
  });

  it('refuses a memory action with halted too', async () => {
    install(
      fakeControlTable({ halt: { haltedAt: '2026-11-17T00:00:00.000Z', reason: 'budget-100' } }),
    );

    const { events } = await turn({ action: 'memory.list' });

    expect(errorCodeOf(events)).toBe('halted');
  });

  // The halt is read before anything about the message is judged: a stopped
  // system should not be arguing about the request.
  it('refuses an over-long message with halted rather than message_too_long', async () => {
    install(
      fakeControlTable({ halt: { haltedAt: '2026-11-17T00:00:00.000Z', reason: 'budget-100' } }),
    );

    const { events } = await turn({ message: 'x'.repeat(5000) });

    expect(errorCodeOf(events)).toBe('halted');
  });

  it('fails closed when the halt cannot be read', async () => {
    const table = fakeControlTable();
    table.getHalt.mockRejectedValue(new Error('DynamoDB is unreachable'));
    install(table);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { events } = await turn();

    expect(errorCodeOf(events)).toBe('internal');
    expect(streamMock).not.toHaveBeenCalled();
  });

  it('runs the turn normally when nothing is halted', async () => {
    install(fakeControlTable());

    const { events } = await turn();

    expect(errorCodeOf(events)).toBeUndefined();
    expect(streamMock).toHaveBeenCalled();
  });
});

describe('handleInvocations — the breaker', () => {
  beforeEach(() => {
    __test.reset();
    __test.setRuntimeConfig(testRuntimeConfig());
    vi.clearAllMocks();
    synthesize.mockResolvedValue({ pollyCharacters: 0, segments: 0 });
    streamMock.mockImplementation(
      streamOf(['Hi there from Max!'], {
        usage: { inputTokens: 3000, outputTokens: REPLY_OUTPUT_TOKENS, totalTokens: 3007 },
      }),
    );
  });

  it('refuses the turn with breaker_tripped at the trip threshold, before any model call', async () => {
    const { breakerTripMicroUsd } = testRuntimeConfig();
    install(fakeControlTable({ spendMicroUsd: breakerTripMicroUsd }));

    const { events } = await turn();

    expect(errorCodeOf(events)).toBe('breaker_tripped');
    expect(streamMock).not.toHaveBeenCalled();
  });

  it('answers with voice off at the degrade threshold', async () => {
    const { breakerDegradeMicroUsd } = testRuntimeConfig();
    install(fakeControlTable({ spendMicroUsd: breakerDegradeMicroUsd }));

    const { events } = await turn();

    expect(events()[0]).toMatchObject({ type: 'session', voice: 'off' });
    expect(streamMock).toHaveBeenCalled();
    expect(synthesize).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ voiceEnabled: false }),
    );
  });

  it('leaves voice on below the degrade threshold', async () => {
    install(fakeControlTable({ spendMicroUsd: 0 }));

    const { events } = await turn();

    expect(events()[0]).toMatchObject({ type: 'session', voice: 'on' });
  });

  // The tally is read before the lease is taken and the session is read
  // under it, so a tripped breaker refuses without touching the session.
  it('refuses with breaker_tripped before the counted session is read', async () => {
    const config = testRuntimeConfig();
    const table = install(fakeControlTable({ spendMicroUsd: config.breakerTripMicroUsd }));

    const { events } = await turn();

    expect(errorCodeOf(events)).toBe('breaker_tripped');
    expect(table.admitRequest).not.toHaveBeenCalled();
    expect(table.getSession).not.toHaveBeenCalled();
  });

  it('fails closed when the tally cannot be read', async () => {
    const table = fakeControlTable();
    table.getSpend.mockRejectedValue(new Error('DynamoDB is unreachable'));
    install(table);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { events } = await turn();

    expect(errorCodeOf(events)).toBe('internal');
    expect(streamMock).not.toHaveBeenCalled();
  });

  it('settles the month to the turn estimate once the turn finishes', async () => {
    const table = install(fakeControlTable({ spendMicroUsd: 0 }));
    synthesize.mockResolvedValue({ pollyCharacters: 120, segments: 1 });

    await turn();

    expect(table.settleRequest).toHaveBeenCalledTimes(1);
    const [, microUsd] = table.settleRequest.mock.calls[0];
    expect(Number.isSafeInteger(microUsd)).toBe(true);
    expect(microUsd).toBeGreaterThan(0);
    expect(table.counters.committedMicroUsd).toBe(microUsd);
  });

  // The spend happened whether or not the friend got a usable reply.
  it('still settles the estimate when the turn fails after the model ran', async () => {
    const table = install(fakeControlTable({ spendMicroUsd: 0 }));
    synthesize.mockRejectedValue(new Error('Polly exploded'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await turn();

    expect(table.settleRequest).toHaveBeenCalledTimes(1);
    expect(table.counters.committedMicroUsd).toBeGreaterThan(0);
  });

  it('takes no reservation when the turn never reached admission', async () => {
    const table = install(
      fakeControlTable({ halt: { haltedAt: '2026-11-17T00:00:00.000Z', reason: 'budget-100' } }),
    );

    await turn();

    expect(table.admitRequest).not.toHaveBeenCalled();
    expect(table.counters.committedMicroUsd).toBe(0);
  });
});
