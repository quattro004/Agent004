/**
 * Captures what the handler exports through the OpenTelemetry API.
 *
 * The production provider and exporter are installed by the runtime launcher
 * (ADOT on AgentCore), so tests register their own provider with a span
 * processor that records each span as it ends: the same boundary, observed
 * locally. Spans are read back from here, never from the handler's own
 * bookkeeping.
 */
import { trace } from '@opentelemetry/api';
import { TracerProvider, type ReadableSpan, type SpanProcessor } from '@opentelemetry/sdk-trace';

export interface SpanCapture {
  /** Finished spans, oldest first. */
  finished: () => ReadableSpan[];
  /** The finished span with this name; fails loudly when absent or ambiguous. */
  one: (name: string) => ReadableSpan;
  /** Safe to call more than once. */
  stop: () => Promise<void>;
}

export function captureSpans(): SpanCapture {
  trace.disable();
  const spans: ReadableSpan[] = [];
  const processor: SpanProcessor = {
    onStart: () => {},
    onEnd: (span) => {
      spans.push(span);
    },
    forceFlush: async () => {},
    shutdown: async () => {},
  };
  const provider = new TracerProvider({ spanProcessors: [processor] });
  trace.setGlobalTracerProvider(provider);

  return {
    finished: () => [...spans],
    one: (name) => {
      const matches = spans.filter((span) => span.name === name);
      if (matches.length !== 1) {
        throw new Error(
          `expected one "${name}" span, found ${matches.length} in [${spans.map((s) => s.name)}]`,
        );
      }
      return matches[0];
    },
    stop: async () => {
      trace.disable();
    },
  };
}

export const parentSpanIdOf = (span: ReadableSpan): string | undefined =>
  span.parentSpanContext?.spanId;
