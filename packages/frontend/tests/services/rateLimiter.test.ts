import { describe, it, expect } from 'vitest';
import { checkRateLimit, incrementCounters } from '../../src/services/rateLimiter';
import type { RateLimitState } from '../../src/types/domain';

describe('rateLimiter', () => {
  const now = new Date().toISOString();
  const emptyCounters: RateLimitState = {
    hourlyCount: 0,
    hourlyWindowStart: now,
    dailyCount: 0,
    dailyWindowStart: now,
  };

  describe('checkRateLimit', () => {
    it('allows when under limits', () => {
      expect(checkRateLimit(emptyCounters)).toEqual({ allowed: true, reason: null });
    });

    it('blocks when hourly limit reached', () => {
      const counters: RateLimitState = { ...emptyCounters, hourlyCount: 60 };
      expect(checkRateLimit(counters)).toEqual({ allowed: false, reason: 'hourly' });
    });

    it('blocks when daily limit reached', () => {
      const counters: RateLimitState = { ...emptyCounters, dailyCount: 500 };
      expect(checkRateLimit(counters)).toEqual({ allowed: false, reason: 'daily' });
    });

    it('resets hourly window when expired', () => {
      const expired = new Date(Date.now() - 4_000_000).toISOString();
      const counters: RateLimitState = {
        hourlyCount: 60,
        hourlyWindowStart: expired,
        dailyCount: 0,
        dailyWindowStart: now,
      };
      expect(checkRateLimit(counters)).toEqual({ allowed: true, reason: null });
    });
  });

  describe('incrementCounters', () => {
    it('increments both counters', () => {
      const result = incrementCounters(emptyCounters);
      expect(result.hourlyCount).toBe(1);
      expect(result.dailyCount).toBe(1);
    });

    it('resets hourly if window expired', () => {
      const expired = new Date(Date.now() - 4_000_000).toISOString();
      const counters: RateLimitState = {
        hourlyCount: 50,
        hourlyWindowStart: expired,
        dailyCount: 5,
        dailyWindowStart: now,
      };
      const result = incrementCounters(counters);
      expect(result.hourlyCount).toBe(1);
      expect(result.dailyCount).toBe(6);
    });
  });
});
