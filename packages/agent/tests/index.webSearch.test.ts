/**
 * Web search in the invocation path (spec 003 Session 2026-11-18, T181).
 *
 * Each turn gets its share of the session's search allowance through
 * `invocationState`. Every search sent is priced at settlement and added to
 * the counted session, and each result's source link reaches the browser
 * beside the reply, as AWS's acceptable-use terms require.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testRuntimeConfig } from './fixtures/runtimeConfig.js';
import { makeReq, bearerHeaders, TEST_SUB, TEST_RUNTIME_SESSION_ID } from './fixtures/http.js';
import { makeRes } from './fixtures/sse.js';
import { textDelta } from './fixtures/strands.js';
import { fakeControlTable, type FakeControlTable } from './fixtures/controlTable.js';
import { computeTurnUsage } from '../src/spend/usage.js';
import {
  WEB_SEARCH_TURN,
  type WebSearchTurn,
  type SearchResult,
} from '../src/tools/webSearchTool.js';

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
const RESULT: SearchResult = { title: 'Example', snippet: 'Snippet', url: 'https://example.com/a' };

function boot(config = testRuntimeConfig(), table: FakeControlTable = fakeControlTable()) {
  __test.reset();
  __test.setRuntimeConfig(config);
  __test.setControlTable(table);
  return table;
}

async function turn() {
  const double = makeRes();
  await __test.handleInvocations(
    makeReq(
      { message: 'what is in the news?' },
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

/** A model that runs the search tool `searches` times, as Strands would, then replies. */
function modelSearching(searches: number, claimed: boolean[] = []) {
  return async function* (_message: string, options: { invocationState: Record<string, unknown> }) {
    const searchTurn = options.invocationState[WEB_SEARCH_TURN] as WebSearchTurn;
    for (let i = 0; i < searches; i++) {
      const allowed = await searchTurn.claimPersisted();
      claimed.push(allowed);
      if (allowed) searchTurn.report([RESULT]);
    }
    yield textDelta('Here is the news.');
    return { invocationContext: { usage: USAGE } };
  };
}

describe('handleInvocations — web search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    synthesize.mockResolvedValue({ pollyCharacters: 0, segments: 0 });
    memorySdk.createEvent.mockResolvedValue(undefined);
    memorySdk.retrieveRecords.mockResolvedValue([]);
  });

  it("sends each search's sources to the browser before the turn is done", async () => {
    boot();
    streamMock.mockImplementation(modelSearching(1));

    const { events } = await turn();

    const types = events().map((e) => e.type);
    expect(events()).toContainEqual({
      type: 'sources',
      sources: [{ title: 'Example', url: 'https://example.com/a' }],
    });
    expect(types.indexOf('sources')).toBeLessThan(types.indexOf('done'));
  });

  it('prices every search the turn sent at settlement', async () => {
    const config = testRuntimeConfig();
    const table = boot(config);
    streamMock.mockImplementation(modelSearching(2));
    const expected = computeTurnUsage(
      { model: USAGE, pollyCharacters: 0, memoryEvents: 1, memoryRetrievals: 1, webSearches: 2 },
      config.prices,
    ).estimatedMicroUsd;

    await turn();

    expect(table.settleRequest.mock.calls[0]![1]).toBe(expected);
  });

  it("adds the turn's searches to the counted session", async () => {
    const table = boot();
    streamMock.mockImplementation(modelSearching(3));

    await turn();

    expect(table.sessions.get(TEST_SUB)?.webSearches).toBe(3);
  });

  it("gives a turn only what is left of the session's allowance", async () => {
    const table = boot(testRuntimeConfig({ sessionMaxWebSearches: 10 }));
    table.sessions.set(TEST_SUB, {
      sessionId: 'counted-1',
      state: 'Active',
      openedAt: new Date().toISOString(),
      turns: 1,
      conversationalTokens: 10,
      webSearches: 9,
      ttl: 0,
    });
    const claimed: boolean[] = [];
    streamMock.mockImplementation(modelSearching(2, claimed));

    await turn();

    expect(claimed).toEqual([true, false]);
    expect(table.sessions.get(TEST_SUB)?.webSearches).toBe(10);
  });

  it('persists a search claim when the model turn fails', async () => {
    const table = boot();
    streamMock.mockImplementation(async function* (
      _message: string,
      options: { invocationState: Record<string, unknown> },
    ) {
      const searchTurn = options.invocationState[WEB_SEARCH_TURN] as WebSearchTurn;
      await searchTurn.claimPersisted();
      yield textDelta('The turn failed after the search.');
      throw new Error('model failed');
    });

    await turn();

    expect(table.sessions.get(TEST_SUB)?.webSearches).toBe(1);
  });
});
