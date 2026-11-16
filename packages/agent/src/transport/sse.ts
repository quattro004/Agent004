/**
 * The browser-facing event stream (contract: transport-sse.md).
 *
 * Once the request reaches this container it always answers `200` with
 * `text/event-stream`. **Every refusal is an SSE `error` event, never an HTTP
 * status**, because how AgentCore relays a container's non-2xx status is not
 * verified — a refusal sent as a 500 could reach the friend as a blank page.
 * Non-200 statuses therefore come only from the platform.
 */
import type { ServerResponse } from 'node:http';
import type { AudioEvent } from '../voice/pollyStream.js';

export type SessionLifecycleState = 'ACTIVE' | 'SIGNED_OFF';

export type SseEvent =
  | { type: 'session'; countedSessionId: string; opened: boolean; voice: 'on' | 'off' }
  | { type: 'text'; delta: string }
  | ({ type: 'audio' } & AudioEvent)
  | { type: 'done'; turnsUsed: number; state: SessionLifecycleState }
  | { type: 'result'; action: string; data: unknown }
  | { type: 'error'; code: SseErrorCode; retryable: boolean; inCharacterMessage: string | null };

export type SseErrorCode =
  | 'invalid_request'
  | 'not_found'
  | 'message_too_long'
  | 'not_allowlisted'
  | 'halted'
  | 'breaker_tripped'
  | 'rate_limited'
  | 'busy'
  | 'session_cap_exceeded'
  | 'session_mismatch'
  | 'moderation_blocked'
  | 'internal';

interface ErrorDefinition {
  retryable: boolean;
  /**
   * What the friend sees. The breaker and cap figures are never sent to the
   * browser, so a friend learns about a limit only through Max's own voice.
   */
  inCharacterMessage: string;
}

export const SSE_ERRORS: Record<SseErrorCode, ErrorDefinition> = {
  invalid_request: {
    retryable: false,
    inCharacterMessage: "Th-that didn't come through straight. Try me again?",
  },
  not_found: {
    retryable: false,
    inCharacterMessage: "Can't find that one — it may already be g-gone.",
  },
  message_too_long: {
    retryable: false,
    inCharacterMessage: "Whoa, th-that's a monologue! Trim it down and I'm all ears.",
  },
  not_allowlisted: {
    retryable: false,
    // Reveals nothing about who is listed (FR-043).
    inCharacterMessage: "Sorry, friend — this channel's invitation only.",
  },
  halted: {
    retryable: false,
    inCharacterMessage: 'Max is t-taking a break. Catch you on the next broadcast!',
  },
  breaker_tripped: {
    retryable: false,
    inCharacterMessage: 'Max is t-taking a break. Catch you on the next broadcast!',
  },
  rate_limited: {
    retryable: true,
    inCharacterMessage: 'Easy, easy — even I have to c-c-catch my breath. Give it a minute.',
  },
  busy: {
    retryable: true,
    inCharacterMessage:
      "One c-conversation at a time, friend — I'm still on the last one. Try again in a moment.",
  },
  session_cap_exceeded: {
    retryable: false,
    inCharacterMessage: "That's a w-wrap on this one! Say the word and we'll start fresh.",
  },
  session_mismatch: {
    retryable: false,
    inCharacterMessage: "Crossed wires somewhere. Let's reset and go again.",
  },
  moderation_blocked: {
    retryable: false,
    inCharacterMessage: "Let's n-not go there. Ask me something else!",
  },
  internal: {
    retryable: true,
    inCharacterMessage: 'S-s-signal trouble on my end. Give me a moment.',
  },
};

/**
 * Writes the event stream. It refuses to write after a terminal event, so a
 * late failure cannot append a second `done` or `error` and leave the browser
 * reading a stream that ended twice.
 */
export class SseStream {
  private opened = false;
  private terminated = false;

  constructor(private readonly res: ServerResponse) {}

  /** True once a `done`, `result` or `error` has been written. */
  get isTerminated(): boolean {
    return this.terminated;
  }

  private open(): void {
    if (this.opened) return;
    this.opened = true;
    this.res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
  }

  send(event: SseEvent): void {
    if (this.terminated) return;
    this.open();
    if (event.type === 'done' || event.type === 'error' || event.type === 'result') {
      this.terminated = true;
    }
    this.res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  /** Terminates the stream with a refusal. Returns the code, for span use. */
  fail(code: SseErrorCode): SseErrorCode {
    const { retryable, inCharacterMessage } = SSE_ERRORS[code];
    this.send({ type: 'error', code, retryable, inCharacterMessage });
    return code;
  }

  end(): void {
    // A stream that ends with neither `done` nor `error` is the browser's
    // signal-lost case. Opening the response first means the friend gets that
    // rather than a connection that never produced headers.
    this.open();
    this.res.end();
  }
}
