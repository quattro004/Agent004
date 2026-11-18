/**
 * Transport tests for `POST /invocations` (T027, transport-sse.md).
 *
 * The container always answers 200 `text/event-stream`. Every refusal is an
 * SSE `error` event, never an HTTP status, because how AgentCore relays a
 * container's non-2xx status is unverified.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testRuntimeConfig } from './fixtures/runtimeConfig.js';
import { fakeControlTable } from './fixtures/controlTable.js';
import { makeReq } from './fixtures/http.js';
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
vi.mock('../src/tools/webSearchTool.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  searchForTurn: vi.fn(),
}));
vi.mock('../src/personality/systemPrompt.js', () => ({
  buildSystemPrompt: vi.fn().mockReturnValue('You are Max Height...'),
}));

const synthesizeMock = vi.hoisted(() => vi.fn());
vi.mock('../src/voice/pollyStream.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, synthesizeToAudioEvents: synthesizeMock };
});

const { __test } = await import('../src/index.js');

async function invoke(body: unknown, headers?: Record<string, string>) {
  const double = makeRes();
  await __test.handleInvocations(makeReq(body, headers), double.res);
  await double.end;
  return double;
}

describe('POST /invocations — SSE transport', () => {
  beforeEach(() => {
    __test.setRuntimeConfig(testRuntimeConfig());
    __test.setControlTable(fakeControlTable());
    streamMock.mockReset();
    streamMock.mockImplementation(streamOf(['Hi ', 'there.']));
    synthesizeMock.mockReset();
    synthesizeMock.mockResolvedValue({ pollyCharacters: 0, segments: 0 });
  });

  it('answers 200 text/event-stream with caching off', async () => {
    const { head } = await invoke({ message: 'hello' });

    expect(head()?.status).toBe(200);
    expect(head()?.headers['Content-Type']).toBe('text/event-stream');
    expect(head()?.headers['Cache-Control']).toBe('no-cache');
  });

  it('frames each event as one data line followed by a blank line', async () => {
    const { raw } = await invoke({ message: 'hello' });

    for (const frame of raw().split('\n\n').slice(0, -1)) {
      expect(frame).toMatch(/^data: \{.*\}$/s);
      expect(frame.split('\n')).toHaveLength(1);
    }
  });

  it('opens every successful stream with a session event', async () => {
    const { events } = await invoke({ message: 'hello' });

    expect(events()[0]).toMatchObject({
      type: 'session',
      countedSessionId: expect.any(String),
      opened: true,
      voice: expect.stringMatching(/^(on|off)$/),
    });
  });

  it('streams reply text as ordered text deltas', async () => {
    const { events } = await invoke({ message: 'hello' });

    const deltas = events().filter((e) => e.type === 'text');
    expect(deltas.map((e) => e.delta)).toEqual(['Hi ', 'there.']);
  });

  it('terminates a chat turn with done, carrying turnsUsed and state', async () => {
    const { events } = await invoke({ message: 'hello' });

    expect(events().at(-1)).toMatchObject({
      type: 'done',
      turnsUsed: 1,
      state: 'ACTIVE',
    });
  });

  it('emits audio events for each synthesized segment', async () => {
    synthesizeMock.mockImplementation(
      async (_text: string, options: { onAudio: (e: unknown) => void }) => {
        options.onAudio({ seq: 0, format: 'mp3', data: 'AQID' });
        options.onAudio({ seq: 1, format: 'mp3', data: 'BAUG' });
        return { pollyCharacters: 9, segments: 2 };
      },
    );

    const { events } = await invoke({ message: 'hello' });

    expect(events().filter((e) => e.type === 'audio')).toEqual([
      { type: 'audio', seq: 0, format: 'mp3', data: 'AQID' },
      { type: 'audio', seq: 1, format: 'mp3', data: 'BAUG' },
    ]);
  });

  it('spends nothing on voice and says so when the friend has it off', async () => {
    const { events } = await invoke({ message: 'hello', voice: 'off' });

    expect(events()[0]).toMatchObject({ type: 'session', voice: 'off' });
    expect(events().some((e) => e.type === 'audio')).toBe(false);
    expect(synthesizeMock.mock.calls[0]?.[1]).toMatchObject({ voiceEnabled: false });
  });

  describe('refusals', () => {
    it.each([
      ['a body that is not JSON', 'not json at all', 'invalid_request'],
      ['a chat turn with no message', JSON.stringify({}), 'invalid_request'],
      ['an empty message', JSON.stringify({ message: '   ' }), 'invalid_request'],
      ['an unknown action', JSON.stringify({ action: 'memory.obliterate' }), 'invalid_request'],
      [
        'a message over the character limit',
        JSON.stringify({ message: 'x'.repeat(2001) }),
        'message_too_long',
      ],
    ])('refuses %s with an SSE %s error, not an HTTP status', async (_label, body, code) => {
      const { head, events } = await invoke(body);

      expect(head()?.status).toBe(200);
      expect(events()).toHaveLength(1);
      expect(events()[0]).toMatchObject({ type: 'error', code, retryable: false });
      expect(events()[0].inCharacterMessage).toEqual(expect.any(String));
    });

    it('sends no session event before a pre-turn refusal', async () => {
      const { events } = await invoke({ message: '' });

      expect(events().some((e) => e.type === 'session')).toBe(false);
    });

    it('never spends on the model when it refuses', async () => {
      await invoke({ message: 'x'.repeat(2001) });

      expect(streamMock).not.toHaveBeenCalled();
    });
  });
});
