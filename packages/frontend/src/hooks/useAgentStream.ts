/**
 * useAgentStream — the browser half of contracts/transport-sse.md.
 *
 * Posts a turn to the AgentCore runtime through CloudFront and reads the
 * `text/event-stream` reply. Once the request reaches the container the
 * container always answers 200, so every refusal arrives as an SSE `error`
 * event. Non-200 statuses come only from the platform (the JWT authorizer,
 * throttling, or a transport failure) and are mapped here.
 */

import { useMemo, useRef } from 'react';
import { useConnectionStore } from '../stores/connectionStore';
import { useConversationStore, type SearchSource } from '../stores/conversationStore';
import { useVoiceStore } from '../stores/voiceStore';
import { createBudgetDegradation } from '../services/budgetDegradation';
import type { SessionState } from '../types/domain';

export const SSE_ERROR_CODES = [
  'invalid_request',
  'not_found',
  'message_too_long',
  'not_allowlisted',
  'halted',
  'breaker_tripped',
  'rate_limited',
  'busy',
  'session_cap_exceeded',
  'session_mismatch',
  'moderation_blocked',
  'internal',
] as const;

export type SseErrorCode = (typeof SSE_ERROR_CODES)[number];

export type MemoryKind = 'fact' | 'preference' | 'summary';

export interface MemoryRecordData {
  id: string;
  text: string;
  kind: MemoryKind;
  createdAt: string;
}

export type ActionData =
  | { ready: true }
  | { records: MemoryRecordData[] }
  | { exportedAt: string; records: MemoryRecordData[] }
  | { deleted: 1 }
  | { recordsDeleted: number; eventsDeleted: number };

export type AgentEvent =
  | { type: 'session'; countedSessionId: string; opened: boolean; voice: 'on' | 'off' }
  | { type: 'text'; delta: string }
  | { type: 'sources'; sources: SearchSource[] }
  | { type: 'audio'; seq: number; format: 'mp3'; data: string }
  | { type: 'done'; turnsUsed: number; state: 'ACTIVE' | 'SIGNED_OFF' }
  | { type: 'result'; action: 'runtime.ready'; data: { ready: true } }
  | { type: 'result'; action: 'memory.list'; data: { records: MemoryRecordData[] } }
  | {
      type: 'result';
      action: 'memory.export';
      data: { exportedAt: string; records: MemoryRecordData[] };
    }
  | { type: 'result'; action: 'memory.delete'; data: { deleted: 1 } }
  | {
      type: 'result';
      action: 'memory.forget';
      data: { recordsDeleted: number; eventsDeleted: number };
    }
  | { type: 'error'; code: SseErrorCode; retryable: boolean; inCharacterMessage: string | null }
  | { type: 'malformed' };

export interface SendInput {
  message?: string;
  displayAlias?: string;
  greetingId?: string;
  clientTimestamp?: string;
  voice?: 'on' | 'off';
  action?: string;
  memoryRecordId?: string;
}

/** A memory action (memory.list, memory.export, memory.delete, memory.forget). */
export type ActionInput =
  | { action: 'runtime.ready' }
  | { action: 'memory.list' }
  | { action: 'memory.export' }
  | { action: 'memory.delete'; memoryRecordId: string }
  | { action: 'memory.forget' };

/**
 * How an action ended. 	ransport covers a platform status, a dropped stream
 * and a stream that closed without a result; signed_out means there was no
 * usable token. Neither is ever reported as success.
 */
export type ActionOutcome =
  | { ok: true; data: ActionData }
  | { ok: false; code: SseErrorCode | 'transport' | 'signed_out' | 'malformed' };

interface ActionCapture {
  outcome: ActionOutcome | null;
}

export interface AgentStreamDeps {
  runtimeArn: string;
  getAccessToken: () => Promise<string | null>;
  refreshAccessToken?: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
  onEvent?: (event: AgentEvent) => void;
  onSignedOut?: () => void;
}

export interface AgentStream {
  send: (input: SendInput) => Promise<void>;
  /** Runs a memory action on its own request: it never cancels a streaming turn or edits the conversation. */
  runAction: (input: ActionInput, signal?: AbortSignal) => Promise<ActionOutcome>;
  cancel: () => void;
}

export const RUNTIME_SESSION_STORAGE_KEY = 'maxHeight.runtimeSessionId';
/** AgentCore requires at least 33 characters, so the prefix pads a bare UUID. */
const RUNTIME_SESSION_PREFIX = 'max-height-runtime-';
const SESSION_HEADER = 'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id';

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

/** The runtime session ID routes to a microVM. It never identifies the friend. */
export function runtimeSessionId(): string {
  const stored = sessionStorage.getItem(RUNTIME_SESSION_STORAGE_KEY);
  if (stored) return stored;
  return resetRuntimeSessionId();
}

export function resetRuntimeSessionId(): string {
  const next = `${RUNTIME_SESSION_PREFIX}${randomId()}`;
  sessionStorage.setItem(RUNTIME_SESSION_STORAGE_KEY, next);
  return next;
}

export function buildInvocationPath(runtimeArn: string): string {
  return `/runtimes/${encodeURIComponent(runtimeArn)}/invocations?qualifier=DEFAULT`;
}

export interface ErrorOutcome {
  /** The state to move to, or null to stay where we are. */
  sessionState: SessionState | null;
  /** Whether Max's in-character line is rendered as the reply. */
  showAsReply: boolean;
  /** Whether the browser retries once with a fresh runtime session ID. */
  retryWithNewSessionId: boolean;
}

const ERROR_OUTCOMES: Record<SseErrorCode, ErrorOutcome> = {
  invalid_request: { sessionState: null, showAsReply: true, retryWithNewSessionId: false },
  not_found: { sessionState: null, showAsReply: true, retryWithNewSessionId: false },
  message_too_long: { sessionState: null, showAsReply: true, retryWithNewSessionId: false },
  not_allowlisted: { sessionState: 'DENIED', showAsReply: false, retryWithNewSessionId: false },
  halted: { sessionState: 'BUDGET_CAPPED', showAsReply: false, retryWithNewSessionId: false },
  breaker_tripped: {
    sessionState: 'BUDGET_CAPPED',
    showAsReply: false,
    retryWithNewSessionId: false,
  },
  rate_limited: { sessionState: 'RATE_LIMITED', showAsReply: false, retryWithNewSessionId: false },
  busy: { sessionState: null, showAsReply: true, retryWithNewSessionId: false },
  session_cap_exceeded: { sessionState: 'ENDED', showAsReply: false, retryWithNewSessionId: false },
  session_mismatch: { sessionState: null, showAsReply: false, retryWithNewSessionId: true },
  moderation_blocked: { sessionState: null, showAsReply: true, retryWithNewSessionId: false },
  internal: { sessionState: 'SIGNAL_LOST', showAsReply: false, retryWithNewSessionId: false },
};

/** An unknown code is treated as a transport failure rather than silently ignored. */
export function outcomeForErrorCode(code: string): ErrorOutcome {
  if (!isSseErrorCode(code)) {
    return {
      sessionState: 'SIGNAL_LOST',
      showAsReply: false,
      retryWithNewSessionId: false,
    };
  }
  return ERROR_OUTCOMES[code];
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isSseErrorCode(code: string): code is SseErrorCode {
  return (SSE_ERROR_CODES as readonly string[]).includes(code);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMemoryRecordData(value: unknown): value is MemoryRecordData {
  if (!isObject(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.text === 'string' &&
    (value.kind === 'fact' || value.kind === 'preference' || value.kind === 'summary') &&
    typeof value.createdAt === 'string'
  );
}

function isActionData(action: string, data: unknown): data is ActionData {
  if (!isObject(data)) return false;
  if (action === 'runtime.ready') return data.ready === true;
  if (action === 'memory.delete') return data.deleted === 1;
  if (action === 'memory.list') {
    return Array.isArray(data.records) && data.records.every(isMemoryRecordData);
  }
  if (action === 'memory.export') {
    return (
      typeof data.exportedAt === 'string' &&
      Array.isArray(data.records) &&
      data.records.every(isMemoryRecordData)
    );
  }
  if (action === 'memory.forget') {
    return (
      typeof data.recordsDeleted === 'number' &&
      Number.isSafeInteger(data.recordsDeleted) &&
      data.recordsDeleted >= 0 &&
      typeof data.eventsDeleted === 'number' &&
      Number.isSafeInteger(data.eventsDeleted) &&
      data.eventsDeleted >= 0
    );
  }
  return false;
}

function isAgentEvent(value: unknown): value is AgentEvent {
  if (!isObject(value) || typeof value.type !== 'string') return false;
  switch (value.type) {
    case 'session':
      return (
        typeof value.countedSessionId === 'string' &&
        typeof value.opened === 'boolean' &&
        (value.voice === 'on' || value.voice === 'off')
      );
    case 'text':
      return typeof value.delta === 'string';
    case 'sources':
      return (
        Array.isArray(value.sources) &&
        value.sources.every(
          (source) =>
            isObject(source) && typeof source.title === 'string' && typeof source.url === 'string',
        )
      );
    case 'audio':
      return (
        typeof value.seq === 'number' &&
        Number.isSafeInteger(value.seq) &&
        value.format === 'mp3' &&
        typeof value.data === 'string'
      );
    case 'done':
      return (
        typeof value.turnsUsed === 'number' &&
        Number.isSafeInteger(value.turnsUsed) &&
        (value.state === 'ACTIVE' || value.state === 'SIGNED_OFF')
      );
    case 'result':
      return typeof value.action === 'string' && isActionData(value.action, value.data);
    case 'error':
      return (
        typeof value.code === 'string' &&
        isSseErrorCode(value.code) &&
        typeof value.retryable === 'boolean' &&
        (typeof value.inCharacterMessage === 'string' || value.inCharacterMessage === null)
      );
    default:
      return false;
  }
}

/** Yields one parsed event per `data:` block of the SSE stream. */
export async function* readSseEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<AgentEvent, void, undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const parsed = parseBlock(block);
        if (parsed) yield parsed;
        boundary = buffer.indexOf('\n\n');
      }
    }
    const trailing = parseBlock(buffer);
    if (trailing) yield trailing;
  } finally {
    reader.releaseLock();
  }
}

function parseBlock(block: string): AgentEvent | null {
  const data = block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('');
  if (!data) return null;
  try {
    const value: unknown = JSON.parse(data);
    if (isAgentEvent(value)) return value;
    if (isObject(value) && value.type === 'result') return { type: 'malformed' };
    return null;
  } catch {
    return null;
  }
}

type Attempt = 'ok' | 'retry-auth' | 'retry-session' | 'signed-out' | 'failed';

export function createAgentStream(deps: AgentStreamDeps): AgentStream {
  const doFetch = deps.fetchImpl ?? globalThis.fetch.bind(globalThis);
  let controller: AbortController | null = null;
  const degradation = createBudgetDegradation();

  const connection = () => useConnectionStore.getState();
  const conversation = () => useConversationStore.getState();
  const voice = () => useVoiceStore.getState();

  function bodyOf(input: SendInput): string {
    return JSON.stringify({
      message: input.message,
      displayAlias: input.displayAlias,
      greetingId: input.greetingId,
      clientTimestamp: input.clientTimestamp,
      voice: input.voice,
      action: input.action,
      memoryRecordId: input.memoryRecordId,
    });
  }

  async function attempt(
    input: SendInput,
    token: string,
    signal: AbortSignal,
    capture?: ActionCapture,
  ): Promise<Attempt> {
    // An action is its own request: a failure of it says nothing about the chat
    // connection, so it must not move the session state.
    const setState = (state: SessionState) => {
      if (!capture) connection().setSessionState(state);
    };
    let response: Response;
    try {
      response = await doFetch(buildInvocationPath(deps.runtimeArn), {
        method: 'POST',
        signal,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
          [SESSION_HEADER]: runtimeSessionId(),
        },
        body: bodyOf(input),
      });
    } catch (error) {
      if (isAbort(error) || signal.aborted) return 'ok';
      setState('SIGNAL_LOST');
      return 'failed';
    }

    if (response.status === 401 || response.status === 403) return 'retry-auth';
    if (response.status === 429) {
      if (capture) capture.outcome = { ok: false, code: 'rate_limited' };
      setState('RATE_LIMITED');
      return 'failed';
    }
    if (!response.ok || !response.body) {
      setState('SIGNAL_LOST');
      return 'failed';
    }

    return consume(input, response.body, signal, capture);
  }

  async function consume(
    input: SendInput,
    body: ReadableStream<Uint8Array>,
    signal: AbortSignal,
    capture?: ActionCapture,
  ): Promise<Attempt> {
    let terminal = false;
    let streamed = false;
    let outcome: Attempt = 'ok';

    try {
      for await (const event of readSseEvents(body)) {
        if (signal.aborted) return 'ok';
        deps.onEvent?.(event);

        switch (event.type) {
          case 'session':
            connection().setConnected(event.countedSessionId, runtimeSessionId());
            connection().setSessionState('ACTIVE');
            degradation.onSessionVoice(event.voice);
            {
              const announcement = degradation.takeAnnouncement();
              if (announcement) conversation().appendToken(`${announcement}\n\n`);
            }
            break;
          case 'text':
            conversation().appendToken(event.delta);
            streamed = true;
            break;
          case 'sources':
            conversation().addSources(event.sources);
            break;
          case 'audio':
            voice().enqueueAudio({ seq: event.seq, format: event.format, data: event.data });
            break;
          case 'done':
            terminal = true;
            conversation().setFullText(conversation().currentResponseText);
            conversation().advanceTurn();
            connection().setSessionState(event.state === 'SIGNED_OFF' ? 'ENDED' : 'ACTIVE');
            break;
          case 'result':
            terminal = true;
            if (capture) {
              capture.outcome =
                input.action === event.action
                  ? { ok: true, data: event.data }
                  : { ok: false, code: 'malformed' };
            }
            break;
          case 'error':
            terminal = true;
            if (capture) {
              capture.outcome = { ok: false, code: event.code };
              outcome = outcomeForErrorCode(event.code).retryWithNewSessionId
                ? (resetRuntimeSessionId(), 'retry-session')
                : 'failed';
            } else {
              outcome = applyError(event);
            }
            break;
          case 'malformed':
            terminal = true;
            if (capture) capture.outcome = { ok: false, code: 'malformed' };
            break;
        }
      }
    } catch (error) {
      if (isAbort(error) || signal.aborted) return 'ok';
      if (!capture) connection().setSessionState('SIGNAL_LOST');
      return 'failed';
    }

    if (!terminal && !signal.aborted) {
      // A stream that stops mid-reply is indistinguishable from a dropped
      // connection, so it degrades the same way (quickstart V-09).
      if (!capture) {
        if (streamed) conversation().setFullText(conversation().currentResponseText);
        connection().setSessionState('SIGNAL_LOST');
      }
      return 'failed';
    }

    return outcome;
  }

  function applyError(event: Extract<AgentEvent, { type: 'error' }>): Attempt {
    const outcome = outcomeForErrorCode(event.code);
    if (event.code === 'halted' || event.code === 'breaker_tripped') {
      degradation.onHardStop();
    }
    if (outcome.retryWithNewSessionId) {
      resetRuntimeSessionId();
      return 'retry-session';
    }
    if (outcome.showAsReply && event.inCharacterMessage) {
      conversation().setFullText(event.inCharacterMessage);
    }
    if (outcome.sessionState) {
      connection().setSessionState(outcome.sessionState);
    }
    return 'failed';
  }

  async function exchange(
    input: SendInput,
    signal: AbortSignal,
    capture?: ActionCapture,
  ): Promise<void> {
    const signedOut = () => {
      if (capture) capture.outcome = { ok: false, code: 'signed_out' };
      deps.onSignedOut?.();
    };

    let token = await deps.getAccessToken();
    if (!token) {
      signedOut();
      return;
    }

    if (!capture) {
      conversation().setFullText('');
      conversation().clearSources();
      voice().beginAudioTurn();
    }

    let refreshed = false;
    let resentWithNewSessionId = false;

    for (;;) {
      const result = await attempt(input, token, signal, capture);

      if (result === 'retry-auth') {
        if (refreshed) {
          signedOut();
          return;
        }
        refreshed = true;
        const next = await deps.refreshAccessToken?.();
        if (!next) {
          signedOut();
          return;
        }
        token = next;
        continue;
      }

      if (result === 'retry-session') {
        if (resentWithNewSessionId) {
          if (!capture) connection().setSessionState('SIGNAL_LOST');
          return;
        }
        resentWithNewSessionId = true;
        continue;
      }

      return;
    }
  }

  async function send(input: SendInput): Promise<void> {
    controller?.abort();
    const current = new AbortController();
    controller = current;
    await exchange(input, current.signal);
  }

  async function runAction(input: ActionInput, signal?: AbortSignal): Promise<ActionOutcome> {
    const capture: ActionCapture = { outcome: null };
    await exchange(input, signal ?? new AbortController().signal, capture);
    return capture.outcome ?? { ok: false, code: 'transport' };
  }

  return {
    send,
    runAction,
    cancel() {
      controller?.abort();
    },
  };
}

export function useAgentStream(deps: AgentStreamDeps): AgentStream {
  const depsRef = useRef(deps);
  depsRef.current = deps;

  return useMemo<AgentStream>(() => {
    const stream = createAgentStream({
      get runtimeArn() {
        return depsRef.current.runtimeArn;
      },
      getAccessToken: () => depsRef.current.getAccessToken(),
      refreshAccessToken: () => depsRef.current.refreshAccessToken?.() ?? Promise.resolve(null),
      fetchImpl: depsRef.current.fetchImpl,
      onEvent: (event) => depsRef.current.onEvent?.(event),
      onSignedOut: () => depsRef.current.onSignedOut?.(),
    });
    return stream;
  }, []);
}
