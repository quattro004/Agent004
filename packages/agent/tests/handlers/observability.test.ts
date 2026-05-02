import { describe, it, expect, beforeEach } from 'vitest';
import {
  startSpan,
  endSpan,
  getActiveSpans,
  TRACE_SPANS,
} from '../../src/handlers/observability.js';

describe('Observability', () => {
  beforeEach(() => {
    // Clear any active spans between tests
    for (const span of getActiveSpans()) {
      endSpan(span.name);
    }
  });

  describe('TRACE_SPANS constants', () => {
    it('should define reply.first_token span name', () => {
      expect(TRACE_SPANS.REPLY_FIRST_TOKEN).toBe('reply.first_token');
    });

    it('should define voice.audio_start span name', () => {
      expect(TRACE_SPANS.VOICE_AUDIO_START).toBe('voice.audio_start');
    });

    it('should define greeting.delivery span name', () => {
      expect(TRACE_SPANS.GREETING_DELIVERY).toBe('greeting.delivery');
    });

    it('should define session.cold_start span name', () => {
      expect(TRACE_SPANS.SESSION_COLD_START).toBe('session.cold_start');
    });

    it('should define crt.frame_rate span name', () => {
      expect(TRACE_SPANS.CRT_FRAME_RATE).toBe('crt.frame_rate');
    });
  });

  describe('startSpan', () => {
    it('should create a span with the given name', () => {
      const span = startSpan('reply.first_token');

      expect(span.name).toBe('reply.first_token');
      expect(span.startTime).toBeGreaterThan(0);
      expect(span.endTime).toBeNull();
    });

    it('should accept optional attributes', () => {
      const span = startSpan('session.cold_start', {
        actorId: 'test-actor',
        sessionId: 'test-session',
      });

      expect(span.attributes).toEqual({
        actorId: 'test-actor',
        sessionId: 'test-session',
      });
    });

    it('should add span to active spans list', () => {
      startSpan('greeting.delivery');

      const active = getActiveSpans();
      expect(active.some((s) => s.name === 'greeting.delivery')).toBe(true);
    });
  });

  describe('endSpan', () => {
    it('should set endTime on the span', () => {
      startSpan('reply.first_token');
      const result = endSpan('reply.first_token');

      expect(result).not.toBeNull();
      expect(result!.endTime).toBeGreaterThan(0);
    });

    it('should calculate duration in milliseconds', () => {
      startSpan('voice.audio_start');
      // Small delay to ensure non-zero duration
      const result = endSpan('voice.audio_start');

      expect(result).not.toBeNull();
      expect(result!.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should remove span from active spans list', () => {
      startSpan('greeting.delivery');
      endSpan('greeting.delivery');

      const active = getActiveSpans();
      expect(active.some((s) => s.name === 'greeting.delivery')).toBe(false);
    });

    it('should return null if span name not found', () => {
      const result = endSpan('nonexistent.span');
      expect(result).toBeNull();
    });

    it('should allow adding attributes on end', () => {
      startSpan('reply.first_token');
      const result = endSpan('reply.first_token', { latencyMs: 1200 });

      expect(result!.attributes).toHaveProperty('latencyMs', 1200);
    });
  });

  describe('getActiveSpans', () => {
    it('should return empty array when no spans active', () => {
      expect(getActiveSpans()).toHaveLength(0);
    });

    it('should return all currently active spans', () => {
      startSpan('reply.first_token');
      startSpan('session.cold_start');

      expect(getActiveSpans()).toHaveLength(2);
    });
  });
});
