import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { endSpan, startSpan, withRequestTrace } from '../../src/handlers/observability.js';
import { captureSpans, parentSpanIdOf, type SpanCapture } from '../fixtures/spans.js';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('request spans', () => {
  let capture: SpanCapture;

  beforeEach(() => {
    capture = captureSpans();
  });

  afterEach(async () => {
    await capture.stop();
  });

  it('exports a span with its name, attributes and a non-negative duration', async () => {
    await withRequestTrace(async () => {
      startSpan('invocation');
      startSpan('memory.retrieve');
      endSpan('memory.retrieve', { count: 3, failed: false });
      endSpan('invocation', { outcome: 'done', cancelled: false });
    });

    const retrieve = capture.one('memory.retrieve');
    expect(retrieve.attributes).toMatchObject({ count: 3, failed: false });
    const [seconds, nanos] = retrieve.duration;
    expect(seconds * 1e9 + nanos).toBeGreaterThanOrEqual(0);
    expect(capture.one('invocation').attributes).toMatchObject({
      outcome: 'done',
      cancelled: false,
    });
  });

  it('parents every span of a request to that request’s invocation span', async () => {
    await withRequestTrace(async () => {
      startSpan('invocation');
      startSpan('breaker.check');
      endSpan('breaker.check', { tripped: false });
      startSpan('first_token');
      startSpan('reply.complete');
      endSpan('first_token');
      endSpan('reply.complete');
      endSpan('invocation');
    });

    const root = capture.one('invocation');
    expect(parentSpanIdOf(root)).toBeUndefined();
    for (const name of ['breaker.check', 'first_token', 'reply.complete']) {
      const child = capture.one(name);
      expect(parentSpanIdOf(child)).toBe(root.spanContext().spanId);
      expect(child.spanContext().traceId).toBe(root.spanContext().traceId);
    }
  });

  it('keeps concurrent requests in separate traces, each ending its own spans', async () => {
    const request = (label: string) =>
      withRequestTrace(async () => {
        startSpan('invocation', { label });
        startSpan('first_token');
        await tick();
        endSpan('first_token', { label });
        await tick();
        endSpan('invocation', { label });
      });

    await Promise.all([request('a'), request('b')]);

    const finished = capture.finished();
    expect(finished).toHaveLength(4);
    const roots = finished.filter((span) => span.name === 'invocation');
    expect(new Set(roots.map((span) => span.spanContext().traceId)).size).toBe(2);
    for (const root of roots) {
      const first = finished.find(
        (span) =>
          span.name === 'first_token' && span.spanContext().traceId === root.spanContext().traceId,
      );
      expect(first).toBeDefined();
      expect(parentSpanIdOf(first!)).toBe(root.spanContext().spanId);
      expect(first!.attributes.label).toBe(root.attributes.label);
    }
  });

  it('ignores ending a span that never started', async () => {
    await withRequestTrace(async () => {
      startSpan('invocation');
      endSpan('audio.first_chunk');
      endSpan('invocation');
    });

    expect(capture.finished().map((span) => span.name)).toEqual(['invocation']);
  });

  it('ends a span left open when the request settles, even when it throws', async () => {
    await expect(
      withRequestTrace(async () => {
        startSpan('invocation');
        startSpan('session.open');
        throw new Error('refused');
      }),
    ).rejects.toThrow('refused');

    expect(capture.one('session.open').attributes).toMatchObject({ abandoned: true });
    expect(capture.one('invocation').attributes).toMatchObject({ abandoned: true });
  });

  it('still exports a span started outside any request, as its own trace root', () => {
    startSpan('breaker.check');
    endSpan('breaker.check', { tripped: false });

    const span = capture.one('breaker.check');
    expect(parentSpanIdOf(span)).toBeUndefined();
  });

  it('is a no-op, not a failure, when no tracer provider is installed', async () => {
    await capture.stop();

    await expect(
      withRequestTrace(async () => {
        startSpan('invocation');
        endSpan('invocation', { outcome: 'done' });
      }),
    ).resolves.toBeUndefined();
  });
});
