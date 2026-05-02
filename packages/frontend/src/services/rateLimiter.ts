import type { RateLimitState } from '../types/domain';

const HOURLY_LIMIT = 60;
const DAILY_LIMIT = 500;

export interface RateLimitResult {
  allowed: boolean;
  reason: 'hourly' | 'daily' | null;
}

export function checkRateLimit(counters: RateLimitState): RateLimitResult {
  const now = new Date();

  // Check hourly window
  const hourlyStart = counters.hourlyWindowStart ? new Date(counters.hourlyWindowStart) : null;
  const hourlyExpired = !hourlyStart || now.getTime() - hourlyStart.getTime() >= 3_600_000;
  const hourlyCount = hourlyExpired ? 0 : counters.hourlyCount;

  if (hourlyCount >= HOURLY_LIMIT) {
    return { allowed: false, reason: 'hourly' };
  }

  // Check daily window (UTC midnight)
  const dailyStart = counters.dailyWindowStart ? new Date(counters.dailyWindowStart) : null;
  const dailyExpired =
    !dailyStart || now.toISOString().slice(0, 10) !== dailyStart.toISOString().slice(0, 10);
  const dailyCount = dailyExpired ? 0 : counters.dailyCount;

  if (dailyCount >= DAILY_LIMIT) {
    return { allowed: false, reason: 'daily' };
  }

  return { allowed: true, reason: null };
}

export function incrementCounters(counters: RateLimitState): RateLimitState {
  const now = new Date();
  const nowIso = now.toISOString();

  const hourlyStart = counters.hourlyWindowStart ? new Date(counters.hourlyWindowStart) : null;
  const hourlyExpired = !hourlyStart || now.getTime() - hourlyStart.getTime() >= 3_600_000;

  const dailyStart = counters.dailyWindowStart ? new Date(counters.dailyWindowStart) : null;
  const dailyExpired = !dailyStart || nowIso.slice(0, 10) !== dailyStart.toISOString().slice(0, 10);

  return {
    hourlyCount: hourlyExpired ? 1 : counters.hourlyCount + 1,
    hourlyWindowStart: hourlyExpired ? nowIso : counters.hourlyWindowStart,
    dailyCount: dailyExpired ? 1 : counters.dailyCount + 1,
    dailyWindowStart: dailyExpired ? nowIso : counters.dailyWindowStart,
  };
}
