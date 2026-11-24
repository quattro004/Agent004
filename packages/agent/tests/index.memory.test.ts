import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testRuntimeConfig } from './fixtures/runtimeConfig.js';
import { bearerHeaders, makeReq, TEST_RUNTIME_SESSION_ID, TEST_SUB } from './fixtures/http.js';
import { makeRes } from './fixtures/sse.js';
import { fakeControlTable, type FakeControlTable } from './fixtures/controlTable.js';
import { streamOf } from './fixtures/strands.js';
import { captureSpans, type SpanCapture } from './fixtures/spans.js';

const streamMock = vi.hoisted(() => vi.fn());
const synthesize = vi.hoisted(() => vi.fn());
const memorySdk = vi.hoisted(() => ({
  createEvent: vi.fn(),
  listRecords: vi.fn(),
  retrieveRecords: vi.fn(),
  getRecord: vi.fn(),
  deleteRecord: vi.fn(),
  batchDeleteRecords: vi.fn(),
  listSessions: vi.fn(),
  listEvents: vi.fn(),
  deleteEvent: vi.fn(),
}));

vi.mock('@strands-agents/sdk', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const Agent = vi.fn(function () {
    return { stream: streamMock, addHook: vi.fn(), messages: [] };
  });
  const tool = vi.fn().mockImplementation((config) => ({ ...config, __tool: true }));
  return { ...actual, Agent, tool };
});

vi.mock('@strands-agents/sdk/models/bedrock', () => ({
  BedrockModel: vi.fn(function (config) {
    return { ...config };
  }),
}));

vi.mock('../src/tools/newsTool.js', () => ({ newsToolSchema: {}, fetchNews: vi.fn() }));
vi.mock('../src/tools/weatherTool.js', () => ({ weatherToolSchema: {}, fetchWeather: vi.fn() }));
vi.mock('../src/tools/webSearchTool.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  searchForTurn: vi.fn(),
}));
vi.mock('../src/personality/systemPrompt.js', () => ({
  buildSystemPrompt: vi.fn(() => 'You are Max Height...'),
}));
vi.mock('../src/voice/pollyStream.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, synthesizeToAudioEvents: synthesize };
});
vi.mock('../src/memory/agentCoreMemoryClient.js', () => ({
  createAgentCoreMemoryClient: () => memorySdk,
}));

const { __test } = await import('../src/index.js');

async function invoke(body: Record<string, unknown> = { message: 'hello' }) {
  const response = makeRes();
  await __test.handleInvocations(
    makeReq(body, {
      ...bearerHeaders({ sub: TEST_SUB }),
      'x-amzn-bedrock-agentcore-runtime-session-id': TEST_RUNTIME_SESSION_ID,
    }),
    response.res,
  );
  await response.end;
  return response;
}

function install(table: FakeControlTable): FakeControlTable {
  __test.setControlTable(table);
  return table;
}

const rememberedFact = {
  memoryRecordId: 'fact-1',
  memoryStrategyId: 'semantic',
  content: { text: 'The viewer likes synthesizers.' },
  namespaces: [`/max-height/${TEST_SUB}/facts/`],
  createdAt: new Date('2026-11-15T00:00:00.000Z'),
};

describe('handleInvocations — AgentCore memory', () => {
  let capture: SpanCapture;

  afterEach(async () => {
    await capture.stop();
  });

  beforeEach(() => {
    capture = captureSpans();
    __test.reset();
    __test.setRuntimeConfig(testRuntimeConfig());
    vi.clearAllMocks();
    streamMock.mockImplementation(
      streamOf(['Max remembers the synthesizers!'], {
        usage: { inputTokens: 3000, outputTokens: 7, totalTokens: 3007 },
      }),
    );
    synthesize.mockResolvedValue({ pollyCharacters: 0, segments: 0 });
    memorySdk.createEvent.mockResolvedValue(undefined);
    memorySdk.listRecords.mockResolvedValue([]);
    memorySdk.retrieveRecords.mockResolvedValue([rememberedFact]);
    memorySdk.getRecord.mockResolvedValue(undefined);
    memorySdk.deleteRecord.mockResolvedValue(undefined);
    memorySdk.batchDeleteRecords.mockResolvedValue({ successfulRecords: [], failedRecords: [] });
    memorySdk.listSessions.mockResolvedValue([]);
    memorySdk.listEvents.mockResolvedValue([]);
    memorySdk.deleteEvent.mockResolvedValue(undefined);
  });

  it('retrieves once when a counted session opens and writes one event per delivered turn', async () => {
    const table = install(fakeControlTable());

    await invoke({ message: 'Remember this from last time?' });
    await invoke({ message: 'And now another turn.' });

    expect(memorySdk.retrieveRecords).toHaveBeenCalledTimes(1);
    expect(memorySdk.retrieveRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        memoryId: 'mem-test',
        namespace: `/max-height/${TEST_SUB}/`,
        searchQuery: 'Remember this from last time?',
        topK: 10,
      }),
    );

    const { buildSystemPrompt } = await import('../src/personality/systemPrompt.js');
    expect(buildSystemPrompt).toHaveBeenCalledWith({ displayAlias: undefined });
    expect(streamMock.mock.calls[0]?.[0]).toEqual([
      {
        text: expect.stringContaining('The viewer likes synthesizers.'),
      },
      { text: 'Remember this from last time?' },
    ]);
    expect(JSON.stringify(streamMock.mock.calls[0]?.[0])).toContain('<prior-session-context>');

    expect(memorySdk.createEvent).toHaveBeenCalledTimes(2);
    expect(memorySdk.createEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        memoryId: 'mem-test',
        actorId: TEST_SUB,
        sessionId: expect.any(String),
        eventTimestamp: expect.any(Date),
        messages: [
          { role: 'USER', text: 'Remember this from last time?' },
          { role: 'ASSISTANT', text: 'Max remembers the synthesizers!' },
        ],
      }),
    );
    expect(table.settleRequest).toHaveBeenCalled();
  });

  it('continues without recalled context and reports a retrieval failure', async () => {
    const table = install(fakeControlTable());
    memorySdk.retrieveRecords.mockRejectedValue(new Error('AgentCore unavailable'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      const response = await invoke({ message: 'Hello despite memory being offline.' });
      const entries = log.mock.calls.flatMap(([value]) => {
        if (typeof value !== 'string') return [];
        try {
          return [JSON.parse(value) as Record<string, unknown>];
        } catch {
          return [];
        }
      });

      expect(response.event('done')).toBeDefined();
      expect(warn).toHaveBeenCalledWith(
        JSON.stringify({ event: 'memory.retrieve.failed', errorName: 'Error' }),
      );
      expect(capture.one('memory.retrieve').attributes).toMatchObject({ failed: true });
      expect(entries).toContainEqual(expect.objectContaining({ MemoryRetrieveFailures: 1 }));
      expect(table.settleRequest).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      log.mockRestore();
    }
  });

  it('does not store an event when the client disconnects before the turn is delivered', async () => {
    install(fakeControlTable());
    streamMock.mockImplementation((_message, { cancelSignal }: { cancelSignal: AbortSignal }) => ({
      next: () =>
        new Promise((_resolve, reject) => {
          cancelSignal.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        }),
    }));

    const response = makeRes();
    const pending = __test.handleInvocations(
      makeReq(
        { message: 'This turn will be cancelled.' },
        {
          ...bearerHeaders({ sub: TEST_SUB }),
          'x-amzn-bedrock-agentcore-runtime-session-id': TEST_RUNTIME_SESSION_ID,
        },
      ),
      response.res,
    );
    await vi.waitFor(() => expect(response.event('session')).toBeDefined());
    response.disconnect();
    await pending;
    await response.end;

    expect(response.event('done')).toBeUndefined();
    expect(memorySdk.createEvent).not.toHaveBeenCalled();
  });

  it('keeps a delivered reply when writing its event fails and reports the failure', async () => {
    install(fakeControlTable());
    memorySdk.createEvent.mockRejectedValue(new Error('AgentCore unavailable'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      const response = await invoke({ message: 'The event store is offline.' });
      const entries = log.mock.calls.flatMap(([value]) => {
        if (typeof value !== 'string') return [];
        try {
          return [JSON.parse(value) as Record<string, unknown>];
        } catch {
          return [];
        }
      });

      expect(response.event('done')).toBeDefined();
      expect(warn).toHaveBeenCalledWith(
        JSON.stringify({ event: 'memory.create_event.failed', errorName: 'Error' }),
      );
      expect(capture.one('memory.create_event').attributes).toMatchObject({ failed: true });
      expect(entries).toContainEqual(expect.objectContaining({ MemoryEventFailures: 1 }));
    } finally {
      warn.mockRestore();
      log.mockRestore();
    }
  });

  it('serves a memory list only after allowlist and per-friend rate checks', async () => {
    const table = install(fakeControlTable());
    memorySdk.listRecords.mockResolvedValue([rememberedFact]);

    const response = await invoke({ action: 'memory.list' });

    expect(table.getFriend).toHaveBeenCalledWith(TEST_SUB);
    expect(table.getAllow).toHaveBeenCalledWith('friend@example.com');
    expect(table.consumeRate).toHaveBeenCalledWith(TEST_SUB, expect.any(Date));
    expect(memorySdk.listRecords).toHaveBeenCalledWith({
      memoryId: 'mem-test',
      namespace: `/max-height/${TEST_SUB}/`,
    });
    expect(response.event('result')).toEqual({
      type: 'result',
      action: 'memory.list',
      data: {
        records: [
          {
            id: 'fact-1',
            text: 'The viewer likes synthesizers.',
            kind: 'fact',
            createdAt: '2026-11-15T00:00:00.000Z',
          },
        ],
      },
    });
  });

  it('hides an out-of-namespace record ID as not_found', async () => {
    install(fakeControlTable());
    memorySdk.getRecord.mockResolvedValue({
      ...rememberedFact,
      namespaces: ['/max-height/another-friend/facts/'],
    });

    const response = await invoke({ action: 'memory.delete', memoryRecordId: 'foreign-id' });

    expect(response.event('error')?.code).toBe('not_found');
    expect(memorySdk.deleteRecord).not.toHaveBeenCalled();
  });

  it('rejects a delete without a record ID before consuming the action rate limit', async () => {
    const table = install(fakeControlTable());

    const response = await invoke({ action: 'memory.delete' });

    expect(response.event('error')?.code).toBe('invalid_request');
    expect(table.consumeRate).not.toHaveBeenCalled();
    expect(memorySdk.getRecord).not.toHaveBeenCalled();
  });

  it('forgets records and short-term events without consuming the action rate limit', async () => {
    const table = install(fakeControlTable());
    memorySdk.listRecords.mockResolvedValue([rememberedFact]);
    memorySdk.batchDeleteRecords.mockResolvedValue({
      successfulRecords: [{ memoryRecordId: 'fact-1' }],
      failedRecords: [],
    });
    memorySdk.listSessions.mockResolvedValue([{ sessionId: 'counted-session' }]);
    memorySdk.listEvents.mockResolvedValue([{ eventId: 'event-1' }]);

    await invoke({ message: 'Hello.' });
    const response = await invoke({ action: 'memory.forget' });

    expect(table.consumeRate).toHaveBeenCalledTimes(1);
    expect(response.event('result')).toEqual({
      type: 'result',
      action: 'memory.forget',
      data: { recordsDeleted: 1, eventsDeleted: 1 },
    });
    expect(table.sessions.get(TEST_SUB)?.state).toBe('SignedOff');
  });

  it('does not let forget-me wipe while a chat turn holds the friend lease', async () => {
    const table = install(fakeControlTable());
    memorySdk.listRecords.mockResolvedValue([rememberedFact]);
    memorySdk.batchDeleteRecords.mockResolvedValue({
      successfulRecords: [{ memoryRecordId: 'fact-1' }],
      failedRecords: [],
    });

    streamMock.mockImplementation((_message, { cancelSignal }: { cancelSignal: AbortSignal }) => ({
      next: () =>
        new Promise((_resolve, reject) => {
          cancelSignal.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        }),
    }));

    const chat = makeRes();
    const chatPending = __test.handleInvocations(
      makeReq(
        { message: 'Keep the turn alive.' },
        {
          ...bearerHeaders({ sub: TEST_SUB }),
          'x-amzn-bedrock-agentcore-runtime-session-id': TEST_RUNTIME_SESSION_ID,
        },
      ),
      chat.res,
    );

    await vi.waitFor(() => expect(table.leases.size).toBe(1));

    const forget = await invoke({ action: 'memory.forget' });

    expect(forget.event('error')?.code).toBe('busy');
    expect(memorySdk.batchDeleteRecords).not.toHaveBeenCalled();

    chat.disconnect();
    await chatPending;
    await chat.end;
  });

  it('passes a provided display alias into the system prompt', async () => {
    install(fakeControlTable());

    await invoke({ message: 'Hello.', displayAlias: 'ReturningVisitor' });

    const { buildSystemPrompt } = await import('../src/personality/systemPrompt.js');
    expect(buildSystemPrompt).toHaveBeenCalledWith({ displayAlias: 'ReturningVisitor' });
  });
});
