/**
 * Request spans (constitution P9; contracts/transport-sse.md § Spans).
 *
 * Spans go through the OpenTelemetry API, so where they end up is the
 * runtime's decision: on AgentCore the ADOT launcher installs the provider and
 * exporter, and in tests a provider with an in-memory exporter does. With no
 * provider installed the API hands back non-recording spans, so tracing is a
 * no-op rather than a failure. Writing JSON to stdout is not trace export.
 *
 * Spans are looked up by name within the current request, so two requests in
 * flight at once never end each other's spans. Every span of a request is
 * parented to the request's first span, `invocation`, and shares its trace.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { ROOT_CONTEXT, trace, type Attributes, type Context, type Span } from '@opentelemetry/api';

const TRACER_NAME = 'max-height-agent';

interface RequestScope {
  active: Map<string, Span>;
  /** The context that parents the request's spans; set by its first span. */
  root?: Context;
}

const requests = new AsyncLocalStorage<RequestScope>();

// Spans started outside a request (the breaker is unit-tested on its own) are
// their own trace roots.
const detached: RequestScope = { active: new Map() };

/**
 * Runs `fn` as one request: spans started inside it belong to its trace. A
 * span still open when the request settles is ended and marked `abandoned`, so
 * an early return never leaves one dangling.
 */
export async function withRequestTrace<T>(fn: () => Promise<T> | T): Promise<T> {
  const scope: RequestScope = { active: new Map() };
  try {
    return await requests.run(scope, fn);
  } finally {
    for (const name of [...scope.active.keys()]) finish(scope, name, { abandoned: true });
  }
}

export function startSpan(name: string, attributes: Attributes = {}): void {
  const store = requests.getStore();
  const scope = store ?? detached;
  const span = trace
    .getTracer(TRACER_NAME)
    .startSpan(name, { attributes }, store?.root ?? ROOT_CONTEXT);
  scope.active.set(name, span);
  if (store && !store.root) store.root = trace.setSpan(ROOT_CONTEXT, span);
}

/** Ends the named span of the current request; a span that never started is ignored. */
export function endSpan(name: string, attributes: Attributes = {}): void {
  finish(requests.getStore() ?? detached, name, attributes);
}

function finish(scope: RequestScope, name: string, attributes: Attributes): void {
  const span = scope.active.get(name);
  if (!span) return;
  scope.active.delete(name);
  span.setAttributes(attributes);
  span.end();
}
