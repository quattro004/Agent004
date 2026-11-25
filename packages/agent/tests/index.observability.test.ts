import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testRuntimeConfig } from './fixtures/runtimeConfig.js';
import { bearerHeaders, makeReq, TEST_RUNTIME_SESSION_ID, TEST_SUB } from './fixtures/http.js';
import { makeRes } from './fixtures/sse.js';
import { fakeControlTable } from './fixtures/controlTable.js';
import { fakeResult, streamOf, textDelta } from './fixtures/strands.js';
import { captureSpans, parentSpanIdOf, type SpanCapture } from './fixtures/spans.js';

const streamMock = vi.hoisted(() => vi.fn());
const synthesize = vi.hoisted(() => vi.fn());
const createMemoryClient = vi.hoisted(() => vi.fn());
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
  createAgentCoreMemoryClient: createMemoryClient,
}));

const { __test } = await import('../src/index.js');

const MESSAGE = 'tell me about the secret garden';
const OTHER_RUNTIME_SESSION_ID = 'runtime-session-1111111111111111111';

async function invoke(sub = TEST_SUB, runtimeSessionId = TEST_RUNTIME_SESSION_ID) {
  const response = makeRes();
  await __test.handleInvocations(
    makeReq(
      { message: MESSAGE },
      {
        ...bearerHeaders({ sub }),
        'x-amzn-bedrock-agentcore-runtime-session-id': runtimeSessionId,
      },
    ),
    response.res,
  );
  await response.end;
  return response;
}

describe('handleInvocations — request spans', () => {
  let capture: SpanCapture;

  beforeEach(() => {
    capture = captureSpans();
    __test.reset();
    __test.setRuntimeConfig(testRuntimeConfig());
    __test.setControlTable(fakeControlTable());
    vi.clearAllMocks();
    streamMock.mockImplementation(
      streamOf(['Max ', 'is here.'], {
        usage: { inputTokens: 3000, outputTokens: 7, totalTokens: 3007 },
      }),
    );
    synthesize.mockImplementation(
      async (_reply: string, options: { onAudio: (event: unknown) => void }) => {
        options.onAudio({ data: 'AAAA', index: 0 });
        return { pollyCharacters: 42, segments: 1 };
      },
    );
    createMemoryClient.mockReturnValue(memorySdk);
    memorySdk.createEvent.mockResolvedValue(undefined);
    memorySdk.retrieveRecords.mockResolvedValue([]);
    memorySdk.listRecords.mockResolvedValue([]);
  });

  afterEach(async () => {
    await capture.stop();
  });

  it('exports the spans of a delivered turn as one trace under the invocation span', async () => {
    await invoke();

    const root = capture.one('invocation');
    expect(root.attributes).toMatchObject({ outcome: 'done', cancelled: false });
    expect(root.attributes.countedSessionId).toEqual(expect.any(String));

    for (const name of [
      'breaker.check',
      'session.open',
      'memory.retrieve',
      'first_token',
      'audio.first_chunk',
      'reply.complete',
      'memory.create_event',
    ]) {
      const span = capture.one(name);
      expect(parentSpanIdOf(span), name).toBe(root.spanContext().spanId);
      expect(span.spanContext().traceId, name).toBe(root.spanContext().traceId);
    }

    expect(capture.one('session.open').attributes).toMatchObject({ opened: true });
    expect(capture.one('memory.retrieve').attributes).toMatchObject({ count: 0, failed: false });
    expect(capture.one('reply.complete').attributes).toMatchObject({
      inputTokens: 3000,
      outputTokens: 7,
      pollyCharacters: 42,
    });
    expect(capture.finished()).toHaveLength(8);
  });

  it('ends first_token when the first text delta is written, before the model finishes', async () => {
    let seenBeforeSecondDelta: string[] = [];
    streamMock.mockImplementation(async function* () {
      yield textDelta('Max ');
      seenBeforeSecondDelta = capture.finished().map((span) => span.name);
      yield textDelta('is here.');
      return fakeResult('Max is here.');
    });

    await invoke();

    expect(seenBeforeSecondDelta).toContain('first_token');
    expect(seenBeforeSecondDelta).not.toContain('reply.complete');
  });

  it('ends reply.complete when the turn is done, before the memory event is written', async () => {
    let finishedWhenEventWritten: string[] = [];
    memorySdk.createEvent.mockImplementation(async () => {
      finishedWhenEventWritten = capture.finished().map((span) => span.name);
    });

    await invoke();

    expect(finishedWhenEventWritten).toEqual(
      expect.arrayContaining(['first_token', 'reply.complete']),
    );
    expect(finishedWhenEventWritten).not.toContain('invocation');
  });

  it('never puts the friend’s message in a span', async () => {
    await invoke();

    for (const span of capture.finished()) {
      expect(JSON.stringify([span.name, span.attributes]), span.name).not.toContain('garden');
    }
  });

  it('keeps two requests in flight at once in their own traces', async () => {
    const release: Array<() => void> = [];
    streamMock.mockImplementation(async function* () {
      yield textDelta('Hi');
      await new Promise<void>((resolve) => release.push(resolve));
      return fakeResult('Hi');
    });

    const first = invoke('friend-a', TEST_RUNTIME_SESSION_ID);
    const second = invoke('friend-b', OTHER_RUNTIME_SESSION_ID);
    await vi.waitFor(() => expect(release).toHaveLength(2));
    release.forEach((resolve) => resolve());
    await Promise.all([first, second]);

    const roots = capture.finished().filter((span) => span.name === 'invocation');
    expect(roots).toHaveLength(2);
    expect(new Set(roots.map((span) => span.spanContext().traceId)).size).toBe(2);
    for (const root of roots) {
      const inTrace = capture
        .finished()
        .filter((span) => span.spanContext().traceId === root.spanContext().traceId);
      expect(inTrace.map((span) => span.name).sort()).toEqual(
        [
          'audio.first_chunk',
          'breaker.check',
          'first_token',
          'invocation',
          'memory.create_event',
          'memory.retrieve',
          'reply.complete',
          'session.open',
        ].sort(),
      );
    }
  });

  it('ends every span when the turn is refused part-way through', async () => {
    __test.setControlTable(
      fakeControlTable({ allow: null }), // admits no one to a new session
    );

    await invoke();

    expect(capture.one('invocation').attributes.outcome).not.toBe('done');
    const names = capture.finished().map((span) => span.name);
    expect(names).toContain('session.open');
    expect(names).not.toContain('reply.complete');
  });
});

describe('handleInvocations — retained serving resources', () => {
  it('builds the Polly and memory clients once and reuses them across turns', async () => {
    __test.reset();
    __test.setRuntimeConfig(testRuntimeConfig());
    __test.setControlTable(fakeControlTable());
    vi.clearAllMocks();
    streamMock.mockImplementation(streamOf(['Hi.']));
    synthesize.mockResolvedValue({ pollyCharacters: 3, segments: 1 });
    createMemoryClient.mockReturnValue(memorySdk);
    memorySdk.createEvent.mockResolvedValue(undefined);
    memorySdk.retrieveRecords.mockResolvedValue([]);
    memorySdk.listRecords.mockResolvedValue([]);

    await invoke();
    await invoke();

    const clients = synthesize.mock.calls.map(([, options]) => options.client);
    expect(clients).toHaveLength(2);
    expect(clients[1]).toBe(clients[0]);
    expect(createMemoryClient).toHaveBeenCalledTimes(1);
  });
});
