import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  createAgentStream,
  useAgentStream,
  buildInvocationPath,
  outcomeForErrorCode,
  runtimeSessionId,
  resetRuntimeSessionId,
  RUNTIME_SESSION_STORAGE_KEY,
  type AgentEvent,
  type SseErrorCode,
} from '../../src/hooks/useAgentStream';
import { useConnectionStore } from '../../src/stores/connectionStore';
import { useConversationStore } from '../../src/stores/conversationStore';
import { useVoiceStore } from '../../src/stores/voiceStore';
import type { SessionState } from '../../src/types/domain';

const RUNTIME_ARN =
  'arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/max_height_agent-AbCdEf';

function sseBody(events: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    },
  });
}

function sseResponse(events: unknown[], status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
    body: sseBody(events),
  } as unknown as Response;
}

const SESSION_EVENT = { type: 'session', countedSessionId: 'counted-1', opened: true, voice: 'on' };

function happyStream(): Response {
  return sseResponse([
    SESSION_EVENT,
    { type: 'text', delta: 'Hello ' },
    { type: 'text', delta: 'friend.' },
    { type: 'done', turnsUsed: 1, state: 'ACTIVE' },
  ]);
}

function makeStream(overrides: Partial<Parameters<typeof createAgentStream>[0]> = {}) {
  const fetchImpl = vi.fn(async () => happyStream());
  const stream = createAgentStream({
    runtimeArn: RUNTIME_ARN,
    getAccessToken: async () => 'token-1',
    refreshAccessToken: async () => 'token-2',
    fetchImpl: fetchImpl as unknown as typeof fetch,
    ...overrides,
  });
  return { stream, fetchImpl };
}

describe('useAgentStream', () => {
  beforeEach(() => {
    sessionStorage.clear();
    useConnectionStore.getState().reset();
    useConversationStore.getState().reset();
    useVoiceStore.getState().reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('the request', () => {
    it('posts to the runtime invocations path with the ARN url-encoded', () => {
      expect(buildInvocationPath(RUNTIME_ARN)).toBe(
        `/runtimes/${encodeURIComponent(RUNTIME_ARN)}/invocations?qualifier=DEFAULT`,
      );
    });

    it('sends the bearer token, the SSE accept header and the runtime session ID', async () => {
      const { stream, fetchImpl } = makeStream();

      await stream.send({ message: 'hi' });

      const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe(buildInvocationPath(RUNTIME_ARN));
      expect(init.method).toBe('POST');
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer token-1');
      expect(headers.Accept).toBe('text/event-stream');
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['X-Amzn-Bedrock-AgentCore-Runtime-Session-Id']).toBe(runtimeSessionId());
    });

    it('sends only the fields the contract defines, never an actorId or sessionId', async () => {
      const { stream, fetchImpl } = makeStream();

      await stream.send({ message: 'hi', displayAlias: 'Reese', voice: 'off' });

      const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body).toEqual({ message: 'hi', displayAlias: 'Reese', voice: 'off' });
      expect(body).not.toHaveProperty('actorId');
      expect(body).not.toHaveProperty('sessionId');
    });

    it('keeps one runtime session ID per tab, at least 33 characters long', () => {
      const first = runtimeSessionId();

      expect(first.length).toBeGreaterThanOrEqual(33);
      expect(runtimeSessionId()).toBe(first);
      expect(sessionStorage.getItem(RUNTIME_SESSION_STORAGE_KEY)).toBe(first);

      const replacement = resetRuntimeSessionId();
      expect(replacement).not.toBe(first);
      expect(runtimeSessionId()).toBe(replacement);
    });
  });

  describe('a successful turn', () => {
    it('reports every event in order', async () => {
      const seen: AgentEvent[] = [];
      const { stream } = makeStream({ onEvent: (event) => seen.push(event) });

      await stream.send({ message: 'hi' });

      expect(seen.map((event) => event.type)).toEqual(['session', 'text', 'text', 'done']);
    });

    it('streams the reply text into the conversation store', async () => {
      const { stream } = makeStream();

      await stream.send({ message: 'hi' });

      expect(useConversationStore.getState().currentResponseText).toBe('Hello friend.');
      expect(useConversationStore.getState().isStreaming).toBe(false);
    });

    it('records the counted session the server chose', async () => {
      const { stream } = makeStream();

      await stream.send({ message: 'hi' });

      expect(useConnectionStore.getState().sessionId).toBe('counted-1');
      expect(useConnectionStore.getState().agentCoreSessionId).toBe(runtimeSessionId());
      expect(useConnectionStore.getState().sessionState).toBe('ACTIVE');
    });

    it('queues audio events in seq order for playback', async () => {
      const { stream } = makeStream({
        fetchImpl: (async () =>
          sseResponse([
            SESSION_EVENT,
            { type: 'text', delta: 'Hi' },
            { type: 'audio', seq: 0, format: 'mp3', data: 'AAAA' },
            { type: 'audio', seq: 1, format: 'mp3', data: 'BBBB' },
            { type: 'done', turnsUsed: 1, state: 'ACTIVE' },
          ])) as unknown as typeof fetch,
      });

      await stream.send({ message: 'hi' });

      expect(useVoiceStore.getState().audioQueue.map((clip) => clip.seq)).toEqual([0, 1]);
      expect(useVoiceStore.getState().audioQueue[0].data).toBe('AAAA');
    });

    it('ends the session when Max signs off', async () => {
      const { stream } = makeStream({
        fetchImpl: (async () =>
          sseResponse([
            SESSION_EVENT,
            { type: 'text', delta: 'Goodnight.' },
            { type: 'done', turnsUsed: 4, state: 'SIGNED_OFF' },
          ])) as unknown as typeof fetch,
      });

      await stream.send({ message: 'bye' });

      expect(useConnectionStore.getState().sessionState).toBe('ENDED');
    });
  });

  describe('platform statuses', () => {
    it('refreshes the token once and retries a 401', async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(sseResponse([], 401))
        .mockResolvedValueOnce(happyStream());
      const onSignedOut = vi.fn();
      const { stream } = makeStream({
        fetchImpl: fetchImpl as unknown as typeof fetch,
        onSignedOut,
      });

      await stream.send({ message: 'hi' });

      expect(fetchImpl).toHaveBeenCalledTimes(2);
      const [, retry] = fetchImpl.mock.calls[1] as [string, RequestInit];
      expect((retry.headers as Record<string, string>).Authorization).toBe('Bearer token-2');
      expect(onSignedOut).not.toHaveBeenCalled();
      expect(useConversationStore.getState().currentResponseText).toBe('Hello friend.');
    });

    it('signs the friend out when the retried request is refused again', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(sseResponse([], 403));
      const onSignedOut = vi.fn();
      const { stream } = makeStream({
        fetchImpl: fetchImpl as unknown as typeof fetch,
        onSignedOut,
      });

      await stream.send({ message: 'hi' });

      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(onSignedOut).toHaveBeenCalledTimes(1);
    });

    it('shows the busy state for a 429 and does not retry', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(sseResponse([], 429));
      const { stream } = makeStream({ fetchImpl: fetchImpl as unknown as typeof fetch });

      await stream.send({ message: 'hi' });

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(useConnectionStore.getState().sessionState).toBe('RATE_LIMITED');
    });

    it.each([500, 502, 503])('treats a %d as lost signal', async (status) => {
      const fetchImpl = vi.fn().mockResolvedValue(sseResponse([], status));
      const { stream } = makeStream({ fetchImpl: fetchImpl as unknown as typeof fetch });

      await stream.send({ message: 'hi' });

      expect(useConnectionStore.getState().sessionState).toBe('SIGNAL_LOST');
    });

    it('treats a network failure as lost signal', async () => {
      const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
      const { stream } = makeStream({ fetchImpl: fetchImpl as unknown as typeof fetch });

      await stream.send({ message: 'hi' });

      expect(useConnectionStore.getState().sessionState).toBe('SIGNAL_LOST');
    });

    it('treats a stream that ends without done as lost signal', async () => {
      const { stream } = makeStream({
        fetchImpl: (async () =>
          sseResponse([
            SESSION_EVENT,
            { type: 'text', delta: 'half a rep' },
          ])) as unknown as typeof fetch,
      });

      await stream.send({ message: 'hi' });

      expect(useConnectionStore.getState().sessionState).toBe('SIGNAL_LOST');
    });
  });

  describe('error events', () => {
    const cases: Array<[SseErrorCode, SessionState | null]> = [
      ['invalid_request', null],
      ['not_found', null],
      ['message_too_long', null],
      ['not_allowlisted', 'DENIED'],
      ['halted', 'BUDGET_CAPPED'],
      ['breaker_tripped', 'BUDGET_CAPPED'],
      ['rate_limited', 'RATE_LIMITED'],
      ['session_cap_exceeded', 'ENDED'],
      ['session_mismatch', null],
      ['moderation_blocked', null],
      ['internal', 'SIGNAL_LOST'],
    ];

    it.each(cases)('maps %s to the %s state', (code, expected) => {
      expect(outcomeForErrorCode(code).sessionState).toBe(expected);
    });

    it('moves to the mapped state when the server refuses the turn', async () => {
      const { stream } = makeStream({
        fetchImpl: (async () =>
          sseResponse([
            {
              type: 'error',
              code: 'breaker_tripped',
              retryable: false,
              inCharacterMessage: 'Off air.',
            },
          ])) as unknown as typeof fetch,
      });

      await stream.send({ message: 'hi' });

      expect(useConnectionStore.getState().sessionState).toBe('BUDGET_CAPPED');
    });

    it("renders Max's deflection as the reply when the session stays active", async () => {
      const { stream } = makeStream({
        fetchImpl: (async () =>
          sseResponse([
            {
              type: 'error',
              code: 'moderation_blocked',
              retryable: false,
              inCharacterMessage: "Let's talk about something else.",
            },
          ])) as unknown as typeof fetch,
      });

      await stream.send({ message: 'hi' });

      expect(useConversationStore.getState().currentResponseText).toBe(
        "Let's talk about something else.",
      );
      expect(useConnectionStore.getState().sessionState).not.toBe('SIGNAL_LOST');
    });

    it('takes a fresh runtime session ID and retries once on session_mismatch', async () => {
      const first = runtimeSessionId();
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(
          sseResponse([
            {
              type: 'error',
              code: 'session_mismatch',
              retryable: false,
              inCharacterMessage: null,
            },
          ]),
        )
        .mockResolvedValueOnce(happyStream());
      const { stream } = makeStream({ fetchImpl: fetchImpl as unknown as typeof fetch });

      await stream.send({ message: 'hi' });

      expect(fetchImpl).toHaveBeenCalledTimes(2);
      const [, retry] = fetchImpl.mock.calls[1] as [string, RequestInit];
      const header = (retry.headers as Record<string, string>)[
        'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id'
      ];
      expect(header).not.toBe(first);
      expect(header).toBe(runtimeSessionId());
    });

    it('does not retry session_mismatch twice', async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(
          sseResponse([
            { type: 'error', code: 'session_mismatch', retryable: false, inCharacterMessage: null },
          ]),
        );
      const { stream } = makeStream({ fetchImpl: fetchImpl as unknown as typeof fetch });

      await stream.send({ message: 'hi' });

      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('never leaks a spend figure from an error event to the UI', async () => {
      const { stream } = makeStream({
        fetchImpl: (async () =>
          sseResponse([
            {
              type: 'error',
              code: 'session_cap_exceeded',
              retryable: false,
              inCharacterMessage: "That's all for now.",
            },
          ])) as unknown as typeof fetch,
      });

      await stream.send({ message: 'hi' });

      expect(useConversationStore.getState().tokenCount).toBe(0);
    });
  });

  describe('cancellation', () => {
    it('aborts the in-flight request', async () => {
      let observed: AbortSignal | undefined;
      const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
        observed = init.signal ?? undefined;
        return happyStream();
      });
      const { stream } = makeStream({ fetchImpl: fetchImpl as unknown as typeof fetch });

      const inFlight = stream.send({ message: 'hi' });
      stream.cancel();
      await inFlight;

      expect(observed?.aborted).toBe(true);
    });

    it('does not treat a caller-initiated abort as lost signal', async () => {
      const fetchImpl = vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      const { stream } = makeStream({ fetchImpl: fetchImpl as unknown as typeof fetch });

      stream.cancel();
      await stream.send({ message: 'hi' });

      expect(useConnectionStore.getState().sessionState).not.toBe('SIGNAL_LOST');
    });
  });

  describe('the hook', () => {
    it('exposes a stable send across renders', () => {
      const { result, rerender } = renderHook(() =>
        useAgentStream({
          runtimeArn: RUNTIME_ARN,
          getAccessToken: async () => 'token-1',
          refreshAccessToken: async () => 'token-2',
          fetchImpl: (async () => happyStream()) as unknown as typeof fetch,
        }),
      );
      const first = result.current.send;

      rerender();

      expect(result.current.send).toBe(first);
    });
  });
});
