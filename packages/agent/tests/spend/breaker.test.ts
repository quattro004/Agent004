import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { captureSpans, type SpanCapture } from '../fixtures/spans.js';
import {
  checkBreaker,
  recordTurnSpend,
  BreakerReadError,
  type BreakerLimits,
  type SpendTally,
} from '../../src/spend/breaker.js';

/**
 * The in-path breaker (T069; contracts/spend-control.md § Breaker).
 *
 * It is a floor, not a meter: fixed costs sit outside it and concurrent turns
 * can each pass the check before any of them adds. The hard stop is the
 * backstop. What the breaker owes us is that it never lets a turn run on a
 * tally it failed to read, and never loses a turn it did run.
 */

const LIMITS: BreakerLimits = { degradeMicroUsd: 11_000_000, tripMicroUsd: 15_000_000 };
const NOW = new Date('2026-11-17T08:30:00.000Z');

function tally(microUsd: number | undefined): SpendTally {
  return {
    getSpend: vi.fn(async () =>
      microUsd === undefined ? undefined : { microUsd, updatedAt: NOW.toISOString() },
    ),
    addSpend: vi.fn(async () => {}),
  };
}

let capture: SpanCapture;

beforeEach(() => {
  capture = captureSpans();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await capture.stop();
});

describe('checkBreaker', () => {
  it('allows the turn when the month is below the degrade threshold', async () => {
    const decision = await checkBreaker({ table: tally(10_999_999), limits: LIMITS, now: NOW });

    expect(decision).toEqual({ state: 'ok', tallyMicroUsd: 10_999_999 });
  });

  it('treats a month with no tally yet as zero spent', async () => {
    const table = tally(undefined);

    const decision = await checkBreaker({ table, limits: LIMITS, now: NOW });

    expect(decision).toEqual({ state: 'ok', tallyMicroUsd: 0 });
    expect(table.getSpend).toHaveBeenCalledWith(NOW);
  });

  it('turns voice off at the degrade threshold, but still answers', async () => {
    const decision = await checkBreaker({ table: tally(11_000_000), limits: LIMITS, now: NOW });

    expect(decision).toEqual({ state: 'degraded', tallyMicroUsd: 11_000_000 });
  });

  it('refuses the turn at the trip threshold', async () => {
    const decision = await checkBreaker({ table: tally(15_000_000), limits: LIMITS, now: NOW });

    expect(decision).toEqual({ state: 'tripped', tallyMicroUsd: 15_000_000 });
  });

  // Fails closed: a turn we cannot price is a turn we do not run.
  it('throws when the tally cannot be read, so nothing is spent unmeasured', async () => {
    const table: SpendTally = {
      getSpend: vi.fn(async () => {
        throw new Error('ProvisionedThroughputExceededException');
      }),
      addSpend: vi.fn(async () => {}),
    };

    await expect(checkBreaker({ table, limits: LIMITS, now: NOW })).rejects.toBeInstanceOf(
      BreakerReadError,
    );
  });

  it('records a breaker.check span carrying the tally and what it decided', async () => {
    await checkBreaker({ table: tally(15_000_000), limits: LIMITS, now: NOW });

    expect(capture.one('breaker.check').attributes).toMatchObject({
      tally: 15_000_000,
      degraded: false,
      tripped: true,
    });
  });

  it('ends the breaker.check span even when the read fails', async () => {
    const table: SpendTally = {
      getSpend: vi.fn(async () => {
        throw new Error('nope');
      }),
      addSpend: vi.fn(async () => {}),
    };

    await expect(checkBreaker({ table, limits: LIMITS, now: NOW })).rejects.toThrow();

    expect(capture.one('breaker.check').attributes).toMatchObject({ failed: true });
  });
});

describe('recordTurnSpend', () => {
  it('adds the turn estimate to this month tally', async () => {
    const table = tally(0);

    const written = await recordTurnSpend({ table, now: NOW }, 4_321);

    expect(written).toBe(true);
    expect(table.addSpend).toHaveBeenCalledWith(4_321, NOW);
  });

  // The reply was already delivered and already billed, so the turn stands.
  // What must not happen is the failure passing unnoticed.
  it('fails loud but does not throw when the tally cannot be written', async () => {
    const table: SpendTally = {
      getSpend: vi.fn(async () => undefined),
      addSpend: vi.fn(async () => {
        throw new Error('ConditionalCheckFailed');
      }),
    };
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const written = await recordTurnSpend({ table, now: NOW }, 4_321);

    expect(written).toBe(false);
    expect(error).toHaveBeenCalled();

    // The ops stack alarms on this metric (contracts/spend-control.md
    // § Operations alarms), so it must reach CloudWatch as embedded metric
    // format, not just as a log line a human has to notice.
    const emitted = log.mock.calls
      .map(([line]) => (typeof line === 'string' ? safeParse(line) : undefined))
      .find((parsed) => parsed?._aws !== undefined) as
      | {
          _aws: {
            CloudWatchMetrics: Array<{ Namespace: string; Metrics: Array<{ Name: string }> }>;
          };
        }
      | undefined;
    expect(emitted).toBeDefined();
    expect(emitted?._aws.CloudWatchMetrics[0].Namespace).toBe('MaxHeight');
    expect(emitted?._aws.CloudWatchMetrics[0].Metrics[0].Name).toBe('BreakerWriteFailures');
  });

  it('refuses a negative or fractional estimate rather than corrupting the tally', async () => {
    const table = tally(0);

    await expect(recordTurnSpend({ table, now: NOW }, -1)).rejects.toThrow();
    await expect(recordTurnSpend({ table, now: NOW }, 1.5)).rejects.toThrow();
    expect(table.addSpend).not.toHaveBeenCalled();
  });
});

function safeParse(line: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
