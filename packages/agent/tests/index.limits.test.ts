/**
 * T163: the invocation handler enforces the approved per-turn bounds.
 *
 * Spec 003 § Clarifications, Session 2026-11-15. The body limit has to be
 * applied while reading, before the payload is parsed, so an oversized request
 * cannot make us buffer or deserialize it. The SDK limits have to reach
 * `stream`, and a limit stop has to end the turn as an error rather than be
 * presented to the friend as a complete reply.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testRuntimeConfig } from './fixtures/runtimeConfig.js';
import { fakeControlTable, type FakeControlTable } from './fixtures/controlTable.js';
import { makeReq, TEST_SUB } from './fixtures/http.js';
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

async function turn(body: unknown) {
  const double = makeRes();
  await __test.handleInvocations(makeReq(body), double.res);
  await double.end;
  return double;
}

let table: FakeControlTable;

describe('handleInvocations — approved per-turn bounds', () => {
  beforeEach(() => {
    __test.reset();
    vi.clearAllMocks();
    __test.setRuntimeConfig(testRuntimeConfig());
    table = fakeControlTable();
    __test.setControlTable(table);
    streamMock.mockImplementation(
      streamOf(['Hi there from Max!'], {
        usage: { inputTokens: 30, outputTokens: 7, totalTokens: 37 },
      }),
    );
  });

  it('refuses a body over 16 KiB and never invokes the model', async () => {
    const { head, events } = await turn(JSON.stringify({ message: 'x'.repeat(20 * 1024) }));

    // Refusals are SSE events, never HTTP statuses: how AgentCore relays a
    // container's non-2xx status to the browser is unverified.
    expect(head()?.status).toBe(200);
    expect(events()).toEqual([
      expect.objectContaining({ type: 'error', code: 'message_too_long', retryable: false }),
    ]);
    expect(streamMock).not.toHaveBeenCalled();
  });

  it('refuses the oversized body without parsing it', async () => {
    // Invalid JSON over the limit must still be message_too_long, which proves
    // the size gate runs before `JSON.parse` rather than after it.
    const { events } = await turn('{' + 'x'.repeat(20 * 1024));

    expect(events()[0]).toMatchObject({ code: 'message_too_long' });
  });

  it('passes the approved SDK limits to stream', async () => {
    await turn({ message: 'hi' });

    expect(streamMock).toHaveBeenCalledWith(
      'hi',
      expect.objectContaining({
        limits: { turns: 4, outputTokens: 1000, totalTokens: 64_000 },
      }),
    );
  });

  it('shrinks the generated-token ceiling to the capacity the session has left', async () => {
    const config = testRuntimeConfig();
    __test.setRuntimeConfig(config);
    table.sessions.set(TEST_SUB, {
      sessionId: 'sess-nearly-spent',
      state: 'Active',
      openedAt: new Date().toISOString(),
      turns: 1,
      conversationalTokens: config.sessionMaxTokens - 120,
      ttl: 0,
    });

    await turn({ message: 'hi' });

    expect(streamMock.mock.calls[0]![1].limits.outputTokens).toBe(120);
  });

  it('rejects a message over the configured character limit', async () => {
    const { events } = await turn({ message: 'y'.repeat(2001) });

    expect(events()).toEqual([
      expect.objectContaining({ type: 'error', code: 'message_too_long' }),
    ]);
    expect(streamMock).not.toHaveBeenCalled();
  });

  it.each(['limitTurns', 'limitOutputTokens', 'limitTotalTokens'])(
    'ends the turn as an error when the SDK stops on %s',
    async (stopReason) => {
      streamMock.mockImplementation(
        streamOf(['partial'], {
          stopReason,
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        }),
      );

      const { events, raw } = await turn({ message: 'hi' });

      expect(events().at(-1)).toMatchObject({ type: 'error', code: 'session_cap_exceeded' });
      expect(raw()).not.toContain('"type":"done"');
      // The ceiling that stopped us is an internal figure; the friend gets
      // Max's voice, not our accounting.
      expect(raw()).not.toContain(stopReason);
    },
  );

  it('still counts the billed work of a limit-stopped turn', async () => {
    streamMock.mockImplementation(
      streamOf(['partial'], {
        stopReason: 'limitTotalTokens',
        usage: { inputTokens: 10, outputTokens: 40, totalTokens: 50 },
      }),
    );

    await turn({ message: 'hi' });

    // Spending money and not counting it is the failure mode that matters.
    expect(table.sessions.get(TEST_SUB)!.conversationalTokens).toBeGreaterThanOrEqual(40);
  });

  it('abandons the turn at the configured deadline', async () => {
    __test.setRuntimeConfig(
      testRuntimeConfig({ limits: { ...testRuntimeConfig().limits, deadlineMs: 20 } }),
    );
    streamMock.mockImplementation((_m: string, options: { cancelSignal?: AbortSignal }) => ({
      next: () =>
        new Promise((_resolve, reject) => {
          options.cancelSignal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    }));

    const { events } = await turn({ message: 'hi' });

    expect(events().at(-1)).toMatchObject({ type: 'error', code: 'session_cap_exceeded' });
  });

  it('cancels the in-flight model call when the deadline passes', async () => {
    __test.setRuntimeConfig(
      testRuntimeConfig({ limits: { ...testRuntimeConfig().limits, deadlineMs: 20 } }),
    );
    let signal: AbortSignal | undefined;
    streamMock.mockImplementation((_m: string, options: { cancelSignal?: AbortSignal }) => {
      signal = options.cancelSignal;
      return {
        next: () =>
          new Promise((_resolve, reject) => {
            options.cancelSignal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      };
    });

    await turn({ message: 'hi' });

    expect(signal?.aborted).toBe(true);
  });
});
