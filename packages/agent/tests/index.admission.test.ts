/**
 * Admission, settlement and the counted session in the invocation path
 * (spec 003 T167, T090, T084; contracts/spend-control.md § Admission).
 *
 * A request commits a conservative reservation and takes a lease before any
 * model call, then settles to the measured spend. The counted session lives in
 * the control table, so these tests share one fake table across simulated
 * runtime instances.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testRuntimeConfig } from './fixtures/runtimeConfig.js';
import { makeReq, bearerHeaders, TEST_SUB, TEST_RUNTIME_SESSION_ID } from './fixtures/http.js';
import { makeRes } from './fixtures/sse.js';
import { streamOf, textDelta } from './fixtures/strands.js';
import { fakeControlTable, type FakeControlTable } from './fixtures/controlTable.js';
import { computeTurnUsage } from '../src/spend/usage.js';

const streamMock = vi.hoisted(() => vi.fn());
const synthesize = vi.hoisted(() => vi.fn());
const memorySdk = vi.hoisted(() => ({
  createEvent: vi.fn(),
  retrieveRecords: vi.fn(),
}));

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
  return { ...actual, synthesizeToAudioEvents: synthesize };
});
vi.mock('../src/memory/agentCoreMemoryClient.js', () => ({
  createAgentCoreMemoryClient: () => memorySdk,
}));

const { __test } = await import('../src/index.js');

const USAGE = { inputTokens: 3000, outputTokens: 7, totalTokens: 3007 };

function boot(config = testRuntimeConfig(), table: FakeControlTable = fakeControlTable()) {
  __test.reset();
  __test.setRuntimeConfig(config);
  __test.setControlTable(table);
  return table;
}

async function turn(message = 'hello') {
  const double = makeRes();
  await __test.handleInvocations(
    makeReq(
      { message },
      {
        ...bearerHeaders({ sub: TEST_SUB }),
        'x-amzn-bedrock-agentcore-runtime-session-id': TEST_RUNTIME_SESSION_ID,
      },
    ),
    double.res,
  );
  await double.end;
  return double;
}

async function action(actionName: string) {
  const double = makeRes();
  await __test.handleInvocations(
    makeReq(
      { action: actionName },
      {
        ...bearerHeaders({ sub: TEST_SUB }),
        'x-amzn-bedrock-agentcore-runtime-session-id': TEST_RUNTIME_SESSION_ID,
      },
    ),
    double.res,
  );
  await double.end;
  return double;
}

const errorCodeOf = (events: () => Array<Record<string, unknown>>) =>
  events().find((e) => e.type === 'error')?.code;

/** The embedded-metric lines the handler logged. */
function metricsLogged(log: ReturnType<typeof vi.spyOn>): string[] {
  return log.mock.calls
    .map(([line]) => String(line))
    .filter((line) => line.includes('CloudWatchMetrics'));
}

describe('handleInvocations — admission and settlement', () => {
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    synthesize.mockResolvedValue({ pollyCharacters: 0, segments: 0 });
    memorySdk.createEvent.mockResolvedValue(undefined);
    memorySdk.retrieveRecords.mockResolvedValue([]);
    streamMock.mockImplementation(streamOf(['Hi there from Max!'], { usage: USAGE }));
  });

  it('holds a lease and a reservation while the model runs', async () => {
    const table = boot();
    let during: { leases: number; active: number; committed: number } | undefined;
    streamMock.mockImplementation(async function* () {
      during = {
        leases: table.leases.size,
        active: table.counters.active,
        committed: table.counters.committedMicroUsd,
      };
      yield textDelta('Hi');
      return { invocationContext: { usage: USAGE } };
    });

    await turn();

    expect(during).toEqual({
      leases: 1,
      active: 1,
      committed: table.admitRequest.mock.calls[0][0].reserveMicroUsd,
    });
  });

  it('prices the reservation from the approved limits, against the trip threshold', async () => {
    const config = testRuntimeConfig();
    const table = boot(config);

    await turn();

    expect(table.admitRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: TEST_SUB,
        spendCeilingMicroUsd: config.breakerTripMicroUsd,
        maxActiveRequests: config.maxActiveRequests,
      }),
    );
    expect(table.admitRequest.mock.calls[0][0].reserveMicroUsd).toBeGreaterThan(0);
  });

  it('settles to the measured spend and releases the lease', async () => {
    const config = testRuntimeConfig();
    const table = boot(config);
    const expected = computeTurnUsage(
      { model: USAGE, pollyCharacters: 0, memoryEvents: 1, memoryRetrievals: 1, webSearches: 0 },
      config.prices,
    ).estimatedMicroUsd;

    await turn();

    expect(table.settleRequest).toHaveBeenCalledTimes(1);
    expect(table.settleRequest.mock.calls[0][1]).toBe(expected);
    expect(table.leases.size).toBe(0);
    expect(table.counters.active).toBe(0);
    expect(table.counters.committedMicroUsd).toBe(expected);
  });

  it('refuses with busy when the friend already has a request in flight, without running it', async () => {
    const table = boot();
    table.leases.set(TEST_SUB, {
      sub: TEST_SUB,
      requestId: 'other-request',
      reservedMicroUsd: 1,
      month: '2026-11',
    });
    table.counters.active = 1;

    const { events } = await turn();

    expect(events().at(-1)).toMatchObject({ type: 'error', code: 'busy', retryable: true });
    expect(streamMock).not.toHaveBeenCalled();
    expect(table.settleRequest).not.toHaveBeenCalled();
    expect(table.leases.get(TEST_SUB)?.requestId).toBe('other-request');
  });

  it('refuses with busy when the house is full', async () => {
    const config = testRuntimeConfig();
    const table = boot(config);
    table.counters.active = config.maxActiveRequests;

    const { events } = await turn();

    expect(errorCodeOf(events)).toBe('busy');
    expect(streamMock).not.toHaveBeenCalled();
    expect(table.leases.size).toBe(0);
  });

  it('refuses with breaker_tripped when the reservation would pass the trip threshold', async () => {
    const config = testRuntimeConfig();
    const table = boot(config, fakeControlTable({ spendMicroUsd: config.breakerTripMicroUsd - 1 }));

    const { events } = await turn();

    expect(errorCodeOf(events)).toBe('breaker_tripped');
    expect(streamMock).not.toHaveBeenCalled();
    expect(table.leases.size).toBe(0);
  });

  it('fails closed when admission cannot be written', async () => {
    const table = boot();
    table.admitRequest.mockRejectedValue(new Error('ThrottlingException'));

    const { events } = await turn();

    expect(errorCodeOf(events)).toBe('internal');
    expect(streamMock).not.toHaveBeenCalled();
  });

  it('settles at the full reservation when the model fails before reporting usage', async () => {
    const table = boot();
    streamMock.mockImplementation(async function* () {
      yield textDelta('Hi');
      throw new Error('Bedrock fell over');
    });

    const { events } = await turn();

    expect(errorCodeOf(events)).toBe('internal');
    const [lease, actual] = table.settleRequest.mock.calls[0];
    expect(actual).toBe(lease.reservedMicroUsd);
    expect(table.leases.size).toBe(0);
    expect(table.counters.active).toBe(0);
  });

  it('settles at the full reservation, flags it, and still frees the slot when usage is missing', async () => {
    const table = boot();
    streamMock.mockImplementation(async function* () {
      yield textDelta('Hi');
      return { lastMessage: { content: [] } };
    });

    await turn();

    const [lease, actual] = table.settleRequest.mock.calls[0];
    expect(actual).toBe(lease.reservedMicroUsd);
    expect(table.leases.size).toBe(0);
    expect(metricsLogged(log).some((line) => line.includes('UnmeteredRequests'))).toBe(true);
  });

  it('does not fail the turn the friend received when settlement fails, and says so loudly', async () => {
    const table = boot();
    table.settleRequest.mockRejectedValue(new Error('ThrottlingException'));

    const { events } = await turn();

    expect(events().some((e) => e.type === 'done')).toBe(true);
    expect(errorCodeOf(events)).toBeUndefined();
    expect(table.settleRequest).toHaveBeenCalledTimes(1);
    expect(metricsLogged(log).some((line) => line.includes('SettlementFailures'))).toBe(true);
  });

  it('releases the lease at no cost when the allowlist refuses a new conversation', async () => {
    const table = boot(testRuntimeConfig(), fakeControlTable({ allow: null }));

    const { events } = await turn();

    expect(errorCodeOf(events)).toBe('not_allowlisted');
    expect(table.settleRequest.mock.calls[0][1]).toBe(0);
    expect(table.leases.size).toBe(0);
    expect(table.counters.committedMicroUsd).toBe(0);
  });
});

// Strands does not throw when its cancelSignal fires. The stream resolves with
// stopReason 'cancelled' and whatever usage had arrived, which for an aborted
// model call is none.
describe('handleInvocations — a turn Strands reports as cancelled', () => {
  const CANCELLED_RESULT = {
    stopReason: 'cancelled',
    lastMessage: { content: [{ type: 'textBlock', text: 'Cancelled by user' }] },
    invocationContext: { usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    synthesize.mockResolvedValue({ pollyCharacters: 0, segments: 0 });
    memorySdk.createEvent.mockResolvedValue(undefined);
    memorySdk.retrieveRecords.mockResolvedValue([]);
    streamMock.mockImplementation((_message: string, options: { cancelSignal: AbortSignal }) => {
      let streamed = false;
      return {
        async next() {
          if (!streamed) {
            streamed = true;
            return { done: false, value: textDelta('Half a rep') };
          }
          if (!options.cancelSignal.aborted) {
            await new Promise<void>((resolve) =>
              options.cancelSignal.addEventListener('abort', () => resolve(), { once: true }),
            );
          }
          return { done: true, value: CANCELLED_RESULT };
        },
      };
    });
  });

  it('settles at the full reservation and keeps the partial reply out of memory when the friend leaves', async () => {
    const table = boot();
    const double = makeRes();
    const pending = __test.handleInvocations(
      makeReq(
        { message: 'hello' },
        {
          ...bearerHeaders({ sub: TEST_SUB }),
          'x-amzn-bedrock-agentcore-runtime-session-id': TEST_RUNTIME_SESSION_ID,
        },
      ),
      double.res,
    );
    await vi.waitFor(() => expect(double.event('text')).toBeDefined());

    double.disconnect();
    await pending;

    // The model call was aborted before it reported usage, so what it billed is
    // unknown and the reservation is the only safe price.
    const [lease, actual] = table.settleRequest.mock.calls[0];
    expect(actual).toBe(lease.reservedMicroUsd);
    expect(memorySdk.createEvent).not.toHaveBeenCalled();
    expect(double.event('done')).toBeUndefined();
  });

  it('reports the deadline, settles at the full reservation and keeps the partial reply out of memory', async () => {
    const table = boot(
      testRuntimeConfig({ limits: { ...testRuntimeConfig().limits, deadlineMs: 20 } }),
    );

    const { events } = await turn();

    expect(errorCodeOf(events)).toBe('session_cap_exceeded');
    expect(events().some((e) => e.type === 'done')).toBe(false);
    const [lease, actual] = table.settleRequest.mock.calls[0];
    expect(actual).toBe(lease.reservedMicroUsd);
    expect(memorySdk.createEvent).not.toHaveBeenCalled();
  });
});

describe('handleInvocations — the counted session in the control table', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    synthesize.mockResolvedValue({ pollyCharacters: 0, segments: 0 });
    memorySdk.createEvent.mockResolvedValue(undefined);
    memorySdk.retrieveRecords.mockResolvedValue([]);
    streamMock.mockImplementation(streamOf(['Hi there from Max!'], { usage: USAGE }));
  });

  it('persists the counted session so a different instance continues it', async () => {
    const config = testRuntimeConfig();
    const table = boot(config);

    const first = await turn('first');
    boot(config, table); // a fresh instance: no process state, the same table
    const second = await turn('second');

    expect(first.events()[0]).toMatchObject({ type: 'session', opened: true });
    expect(second.events()[0]).toMatchObject({ type: 'session', opened: false });
    expect(first.events()[0]).toHaveProperty('countedSessionId');
    expect(second.events()[0]).toMatchObject({
      countedSessionId: (first.events()[0] as { countedSessionId: string }).countedSessionId,
    });
    expect(table.sessions.get(TEST_SUB)).toMatchObject({ turns: 2, state: 'Active' });
  });

  it('counts the reply tokens plus the message at chars/4', async () => {
    const table = boot();

    await turn('hello there');

    expect(table.sessions.get(TEST_SUB)?.conversationalTokens).toBe(
      USAGE.outputTokens + Math.ceil('hello there'.length / 4),
    );
  });

  it('signs Max off on the turn that reaches the cap, and opens a fresh session after it', async () => {
    const config = testRuntimeConfig({ sessionMaxTurns: 1 });
    const table = boot(config);

    const last = await turn('one');
    const next = await turn('two');

    expect(last.events().at(-1)).toMatchObject({
      type: 'done',
      turnsUsed: 1,
      state: 'SIGNED_OFF',
    });
    expect(next.events()[0]).toMatchObject({ type: 'session', opened: true });
    expect(table.sessions.get(TEST_SUB)?.turns).toBe(1);
  });

  it('refuses a session already at the cap, marks it signed off, and frees the lease', async () => {
    const config = testRuntimeConfig();
    const table = boot(config);
    table.sessions.set(TEST_SUB, {
      sessionId: 'sess-capped',
      state: 'Active',
      openedAt: new Date().toISOString(),
      turns: config.sessionMaxTurns,
      conversationalTokens: 0,
      ttl: 0,
    });

    const { events } = await turn();

    expect(errorCodeOf(events)).toBe('session_cap_exceeded');
    expect(streamMock).not.toHaveBeenCalled();
    expect(table.sessions.get(TEST_SUB)?.state).toBe('SignedOff');
    expect(table.settleRequest.mock.calls[0][1]).toBe(0);
    expect(table.leases.size).toBe(0);
  });

  it('opens a fresh session over one whose time cap has elapsed', async () => {
    const config = testRuntimeConfig();
    const table = boot(config);
    table.sessions.set(TEST_SUB, {
      sessionId: 'sess-old',
      state: 'Active',
      openedAt: new Date(Date.now() - (config.sessionMaxMinutes + 1) * 60_000).toISOString(),
      turns: 3,
      conversationalTokens: 100,
      ttl: 0,
    });

    const { events } = await turn();

    expect(events()[0]).toMatchObject({ type: 'session', opened: true });
    expect(table.sessions.get(TEST_SUB)).toMatchObject({ turns: 1 });
    expect(table.sessions.get(TEST_SUB)?.sessionId).not.toBe('sess-old');
  });

  it('keeps the friend\u2019s reply when the session write after the turn fails', async () => {
    const table = boot();
    const realPut = table.putSession.getMockImplementation()!;
    table.putSession.mockImplementation(async (sub, session, expected) => {
      if (expected !== undefined) throw new Error('ConditionalCheckFailed');
      return realPut(sub, session, expected);
    });

    const { events } = await turn();

    expect(events().some((e) => e.type === 'done')).toBe(true);
    expect(errorCodeOf(events)).toBeUndefined();
  });
});

describe('handleInvocations — runtime readiness action', () => {
  it('returns ready without a model call, counted session, or spend reservation', async () => {
    const table = boot();

    const response = await action('runtime.ready');

    expect(response.events()).toContainEqual({
      type: 'result',
      action: 'runtime.ready',
      data: { ready: true },
    });
    expect(streamMock).not.toHaveBeenCalled();
    expect(memorySdk.createEvent).not.toHaveBeenCalled();
    expect(table.getFriend).not.toHaveBeenCalled();
    expect(table.getAllow).not.toHaveBeenCalled();
    expect(table.getSession).not.toHaveBeenCalled();
    expect(table.putSession).not.toHaveBeenCalled();
    expect(table.admitRequest).not.toHaveBeenCalled();
    expect(table.settleRequest).not.toHaveBeenCalled();
    expect(table.addSpend).not.toHaveBeenCalled();
  });
});
