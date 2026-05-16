/**
 * Observability trace spans for AgentCore per constitution P9.
 * Records custom spans for all 5 performance targets:
 * - reply.first_token: 1.5s P95 first reply token
 * - voice.audio_start: 2.5s P95 voice audio start
 * - greeting.delivery: 2s P95 greeting after TV-on
 * - session.cold_start: 5s P95 cold start
 * - crt.frame_rate: 60fps CRT effects on desktop
 *
 * Completed spans are emitted as a single line of structured JSON on stdout
 * via `console.log`. AgentCore + CloudWatch Logs pick this up automatically;
 * Logs Insights can filter on `type = "trace"` for personality / latency
 * regression debugging.
 */

// --- Constants ---

export const TRACE_SPANS = {
  REPLY_FIRST_TOKEN: 'reply.first_token',
  VOICE_AUDIO_START: 'voice.audio_start',
  GREETING_DELIVERY: 'greeting.delivery',
  SESSION_COLD_START: 'session.cold_start',
  CRT_FRAME_RATE: 'crt.frame_rate',
} as const;

// --- Types ---

export interface TraceSpan {
  name: string;
  startTime: number;
  endTime: number | null;
  durationMs: number | null;
  attributes: Record<string, string | number | boolean>;
}

// --- State ---

const activeSpans: Map<string, TraceSpan> = new Map();

// Sink used to emit completed spans. Defaults to stdout via console.log so
// AgentCore + CloudWatch pick them up. Swappable for tests.
let emitFn: (span: TraceSpan) => void = (span) => {
  // Single-line JSON keeps CloudWatch Logs parsing trivial.
  console.log(
    JSON.stringify({
      type: 'trace',
      name: span.name,
      durationMs: span.durationMs,
      startTime: span.startTime,
      endTime: span.endTime,
      attributes: span.attributes,
    }),
  );
};

/**
 * Override the emit sink. Intended for tests; in production the default
 * console.log sink is used.
 */
export function setSpanEmitter(fn: (span: TraceSpan) => void): void {
  emitFn = fn;
}

// --- Functions ---

/**
 * Start a new trace span with the given name and optional attributes.
 */
export function startSpan(
  name: string,
  attributes: Record<string, string | number | boolean> = {},
): TraceSpan {
  const span: TraceSpan = {
    name,
    startTime: performance.now(),
    endTime: null,
    durationMs: null,
    attributes,
  };

  activeSpans.set(name, span);
  return span;
}

/**
 * End a trace span by name, recording its duration and emitting the
 * completed span via the configured sink.
 * Returns the completed span, or null if not found.
 */
export function endSpan(
  name: string,
  additionalAttributes: Record<string, string | number | boolean> = {},
): TraceSpan | null {
  const span = activeSpans.get(name);
  if (!span) {
    return null;
  }

  span.endTime = performance.now();
  span.durationMs = span.endTime - span.startTime;
  span.attributes = { ...span.attributes, ...additionalAttributes };

  activeSpans.delete(name);
  try {
    emitFn(span);
  } catch {
    // Never let a misbehaving emitter break the request path.
  }
  return span;
}

/**
 * Get all currently active (unfinished) spans.
 */
export function getActiveSpans(): TraceSpan[] {
  return Array.from(activeSpans.values());
}
