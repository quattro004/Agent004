/**
 * Observability trace spans for AgentCore per constitution P9.
 * Records custom spans for all 5 performance targets:
 * - reply.first_token: 1.5s P95 first reply token
 * - voice.audio_start: 2.5s P95 voice audio start
 * - greeting.delivery: 2s P95 greeting after TV-on
 * - session.cold_start: 5s P95 cold start
 * - crt.frame_rate: 60fps CRT effects on desktop
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
 * End a trace span by name, recording its duration.
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
  return span;
}

/**
 * Get all currently active (unfinished) spans.
 */
export function getActiveSpans(): TraceSpan[] {
  return Array.from(activeSpans.values());
}
