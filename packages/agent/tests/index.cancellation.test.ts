/**
 * Cancellation tests for the agent invocation handler (issue #43, T030).
 *
 * A friend who closes the tab mid-turn must not keep billing tokens, and the
 * work already billed before they left must still be counted. These bypass
 * the HTTP layer and call `handleInvocations` directly with doubles.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BedrockAgentCoreClient } from '@aws-sdk/client-bedrock-agentcore';
import { testRuntimeConfig } from './fixtures/runtimeConfig.js';
import { fakeControlTable, type FakeControlTable } from './fixtures/controlTable.js';
import { makeReq, TEST_SUB } from './fixtures/http.js';
import { makeRes } from './fixtures/sse.js';
import { streamOf, fakeResult, textDelta } from './fixtures/strands.js';
import { computeTurnUsage } from '../src/spend/usage.js';

const streamMock = vi.hoisted(() => vi.fn());
const synthesize = vi.hoisted(() => vi.fn());
const PollySynthesisError = vi.hoisted(
  () =>
    class PollySynthesisError extends Error {
      constructor(
        message: string,
        readonly pollyCharacters: number,
        readonly emitted: number,
        readonly cause?: unknown,
      ) {
        super(message);
        this.name = 'PollySynthesisError';
      }
    },
);
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
  return {
    ...actual,
    synthesizeToAudioEvents: synthesize,
    PollySynthesisError,
  };
});
vi.mock('../src/memory/agentCoreMemoryClient.js', () => ({
  createAgentCoreMemoryClient: () => memorySdk,
}));

const sdk = (await import('@strands-agents/sdk')) as unknown as {
  tool: ReturnType<typeof vi.fn>;
};
const toolMock = sdk.tool;
const { fetchNews } = (await import('../src/tools/newsTool.js')) as unknown as {
  fetchNews: ReturnType<typeof vi.fn>;
};
const { fetchWeather } = (await import('../src/tools/weatherTool.js')) as unknown as {
  fetchWeather: ReturnType<typeof vi.fn>;
};
const webSearchModule = (await import('../src/tools/webSearchTool.js')) as unknown as {
  searchForTurn: ReturnType<typeof vi.fn>;
  WebSearchTurn: typeof import('../src/tools/webSearchTool.js').WebSearchTurn;
  WEB_SEARCH_TURN: string;
};
const { searchForTurn: fetchWebSearch, WebSearchTurn, WEB_SEARCH_TURN } = webSearchModule;
const invocationState = () => ({ [WEB_SEARCH_TURN]: new WebSearchTurn(1, () => {}) });
const { __test } = await import('../src/index.js');

let table: FakeControlTable;

/**
 * Snapshot the tool registrations now, at import time: the tools are built once
 * when `index.ts` loads, and Vitest clears `mock.calls` before test bodies run.
 */
interface ToolRegistration {
  name: string;
  callback: (input: unknown, context?: { cancelSignal: AbortSignal }) => Promise<unknown>;
}
const toolRegistrations = toolMock.mock.calls.map((call) => call[0] as ToolRegistration);

/** A `stream()` that stalls after `chunks`, so a test can disconnect mid-turn. */
function stallingStream(chunks: string[], options: { usage?: { outputTokens: number } } = {}) {
  return (_message: string, invokeOptions: { cancelSignal?: AbortSignal }) => {
    const queue = [...chunks];
    return {
      async next() {
        const chunk = queue.shift();
        if (chunk !== undefined) return { done: false, value: textDelta(chunk) };
        return new Promise((_resolve, reject) => {
          invokeOptions.cancelSignal?.addEventListener('abort', () =>
            reject(new Error('invocation aborted')),
          );
        });
      },
      /** The handler never calls this, but a real generator has it. */
      async return() {
        return { done: true, value: fakeResult(chunks.join(''), options) };
      },
    };
  };
}

describe('handleInvocations — cancellation on client disconnect', () => {
  beforeEach(() => {
    __test.reset();
    __test.setRuntimeConfig(testRuntimeConfig());
    table = fakeControlTable();
    __test.setControlTable(table);
    vi.clearAllMocks();
    streamMock.mockImplementation(streamOf(['Hi there from Max!']));
    synthesize.mockResolvedValue({ pollyCharacters: 0, segments: 0 });
    memorySdk.createEvent.mockResolvedValue(undefined);
    memorySdk.retrieveRecords.mockResolvedValue([]);
  });

  it('passes a cancelSignal to agent.stream', async () => {
    const double = makeRes();
    await __test.handleInvocations(makeReq({ message: 'hello' }), double.res);
    await double.end;

    expect(streamMock).toHaveBeenCalledTimes(1);
    const options = streamMock.mock.calls[0]?.[1] as { cancelSignal?: AbortSignal } | undefined;
    expect(options?.cancelSignal).toBeInstanceOf(AbortSignal);
  });

  it('aborts the invocation when the client disconnects mid-turn', async () => {
    let captured: AbortSignal | undefined;
    streamMock.mockImplementation((message: string, options: { cancelSignal?: AbortSignal }) => {
      captured = options.cancelSignal;
      return stallingStream([])(message, options);
    });

    const double = makeRes();
    const pending = __test.handleInvocations(makeReq({ message: 'hi' }), double.res);

    await vi.waitFor(() => expect(captured).toBeDefined());
    expect(captured!.aborted).toBe(false);

    double.disconnect();

    await pending;
    await double.end;
    expect(captured!.aborted).toBe(true);
  });

  it('writes nothing further to a stream whose client has gone', async () => {
    streamMock.mockImplementation(stallingStream(['Half a rep']));

    const double = makeRes();
    const pending = __test.handleInvocations(makeReq({ message: 'hi' }), double.res);

    await vi.waitFor(() => expect(double.event('text')).toBeDefined());
    double.disconnect();
    await pending;

    // No error and no done: there is no one left to tell, and an SSE frame
    // written after the socket closed is just an exception we would have to
    // swallow.
    expect(double.events().map((e) => e.type)).toEqual(['session', 'text']);
  });

  it('does not abort a turn that completes normally', async () => {
    let captured: AbortSignal | undefined;
    streamMock.mockImplementation((message: string, options: { cancelSignal?: AbortSignal }) => {
      captured = options.cancelSignal;
      return streamOf(['done'])();
    });

    const double = makeRes();
    await __test.handleInvocations(makeReq({ message: 'hi' }), double.res);
    await double.end;

    expect(captured!.aborted).toBe(false);
    expect(double.event('done')).toBeDefined();
  });

  it('does not start the model when the client disconnects during memory retrieval', async () => {
    let resolveRetrieve!: (records: []) => void;
    memorySdk.retrieveRecords.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRetrieve = resolve;
        }),
    );

    const double = makeRes();
    const pending = __test.handleInvocations(makeReq({ message: 'hi' }), double.res);

    await vi.waitFor(() => expect(memorySdk.retrieveRecords).toHaveBeenCalled());
    double.disconnect();
    resolveRetrieve([]);
    await pending;
    await double.end;

    expect(streamMock).not.toHaveBeenCalled();
    expect(double.event('done')).toBeUndefined();
  });

  it('does not send done when Polly throws after the turn was cancelled', async () => {
    synthesize.mockImplementation(async (_reply: string, options: { signal?: AbortSignal }) => {
      await new Promise<void>((resolve) => {
        if (options.signal?.aborted) {
          resolve();
          return;
        }
        options.signal?.addEventListener('abort', () => resolve(), { once: true });
      });
      throw new PollySynthesisError('Polly synthesis was cancelled', 0, 0, new Error('aborted'));
    });

    const double = makeRes();
    const pending = __test.handleInvocations(makeReq({ message: 'hello' }), double.res);
    await vi.waitFor(() => expect(synthesize).toHaveBeenCalled());
    double.disconnect();
    await pending;
    await double.end;

    expect(synthesize).toHaveBeenCalled();
    expect(double.event('done')).toBeUndefined();
  });

  it('counts billed Polly characters when synthesis throws after the client disconnects', async () => {
    const config = testRuntimeConfig();
    __test.setRuntimeConfig(config);
    streamMock.mockImplementation(
      streamOf(['Partial billed reply'], {
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      }),
    );
    synthesize.mockImplementation(async (_reply: string, options: { signal?: AbortSignal }) => {
      await new Promise<void>((resolve) => {
        options.signal?.addEventListener('abort', () => resolve(), { once: true });
      });
      throw new PollySynthesisError('Polly synthesis was cancelled', 17, 12, new Error('aborted'));
    });

    const double = makeRes();
    const pending = __test.handleInvocations(makeReq({ message: 'hello' }), double.res);
    await vi.waitFor(() => expect(synthesize).toHaveBeenCalled());
    double.disconnect();
    await pending;
    await double.end;

    const settlement = table.settleRequest.mock.calls[0];
    expect(settlement).toBeDefined();
    expect(settlement![1]).toBe(
      computeTurnUsage(
        {
          model: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          pollyCharacters: 17,
          memoryEvents: 0,
          memoryRetrievals: 1,
          webSearches: 0,
        },
        config.prices,
      ).estimatedMicroUsd,
    );
  });

  it('leaves the counted session intact when the friend leaves mid-turn', async () => {
    streamMock.mockImplementation(stallingStream(['Half a rep']));

    const double = makeRes();
    const pending = __test.handleInvocations(makeReq({ message: 'hi' }), double.res);
    await vi.waitFor(() => expect(double.event('text')).toBeDefined());
    double.disconnect();
    await pending;

    // The session was opened and must survive, so the friend who comes back
    // resumes the same budget rather than getting a fresh one (P-05).
    expect(table.sessions.get(TEST_SUB)).toBeDefined();
  });
});

describe('tool callbacks — cancel signal forwarding', () => {
  // Cancelling the model turn is only half the saving: a tool already in flight
  // holds an outbound HTTP request open unless the signal reaches it too.
  beforeEach(() => {
    __test.setRuntimeConfig(testRuntimeConfig());
    table = fakeControlTable();
    __test.setControlTable(table);
  });

  function callbackFor(name: string) {
    const cfg = toolRegistrations.find((c) => c.name === name);
    if (!cfg) throw new Error(`no tool registered named ${name}`);
    return cfg.callback;
  }

  it.each([
    ['get_news', () => fetchNews],
    ['get_weather', () => fetchWeather],
    ['web_search', () => fetchWebSearch],
  ])('%s forwards context.cancelSignal to its fetcher', async (toolName, getFetcher) => {
    const fetcher = getFetcher();
    fetcher.mockReset();
    fetcher.mockResolvedValue({ success: true });
    const controller = new AbortController();

    await callbackFor(toolName as string)(
      { query: 'q', topic: 'q', location: 'q' },
      {
        cancelSignal: controller.signal,
        invocationState: invocationState(),
      },
    );

    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ signal: controller.signal });
  });

  it.each([
    ['get_news', () => fetchNews, 'news-key'],
    ['get_weather', () => fetchWeather, 'weather-key'],
  ])(
    '%s takes its API key from the runtime config, not the environment',
    async (toolName, getFetcher, apiKey) => {
      // T038: the container reads its secrets from SSM at startup, so a tool
      // reading `process.env` would use whatever the process inherited.
      const fetcher = getFetcher();
      fetcher.mockReset();
      fetcher.mockResolvedValue({ success: true });

      await callbackFor(toolName as string)({ query: 'q', topic: 'q', location: 'q' }, undefined);

      expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ apiKey });
    },
  );

  it('web_search refuses to search without a turn allowance to count against', async () => {
    fetchWebSearch.mockReset();

    await expect(
      callbackFor('web_search')({ query: 'q' }, { invocationState: {} }),
    ).rejects.toThrow(/WebSearchTurn/);
    expect(fetchWebSearch).not.toHaveBeenCalled();
  });

  it('web_search gives its fetcher an AgentCore client for the runtime Region, not a key', async () => {
    fetchWebSearch.mockReset();
    fetchWebSearch.mockResolvedValue({ success: true });

    await callbackFor('web_search')({ query: 'q' }, { invocationState: invocationState() });

    const options = fetchWebSearch.mock.calls[0]?.[1] as { client: unknown; apiKey?: unknown };
    expect(options.client).toBeInstanceOf(BedrockAgentCoreClient);
    expect(options.apiKey).toBeUndefined();
    await expect((options.client as BedrockAgentCoreClient).config.region()).resolves.toBe(
      testRuntimeConfig().awsRegion,
    );
  });
});
