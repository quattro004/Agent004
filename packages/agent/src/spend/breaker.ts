import { startSpan, endSpan } from '../handlers/observability.js';
import type { Spend } from '../session/controlTable.js';

/**
 * The in-path breaker (contracts/spend-control.md § Breaker).
 *
 * It reads the month's tally before a turn and adds the turn's estimate after
 * it. Two thresholds sit below the budget's 100%: the first turns voice off,
 * the second refuses the turn. Both come from configuration, never a literal.
 *
 * It is a floor, not a meter. Fixed costs sit outside it and concurrent turns
 * can each pass the check before any of them adds, so the hard stop remains
 * the backstop.
 */

/** The part of `ControlTable` the breaker needs, so tests need no DynamoDB. */
export interface SpendTally {
  getSpend(now: Date): Promise<Spend | undefined>;
  addSpend(microUsd: number, now: Date): Promise<void>;
}

export interface BreakerLimits {
  degradeMicroUsd: number;
  tripMicroUsd: number;
}

export type BreakerState = 'ok' | 'degraded' | 'tripped';

export interface BreakerDecision {
  state: BreakerState;
  tallyMicroUsd: number;
}

/** The tally could not be read, so the turn must not run (fail closed). */
export class BreakerReadError extends Error {
  constructor(cause: unknown) {
    super(`Could not read the spend tally: ${cause instanceof Error ? cause.message : cause}`);
    this.name = 'BreakerReadError';
    this.cause = cause;
  }
}

const METRIC_NAMESPACE = 'MaxHeight';
const WRITE_FAILURE_METRIC = 'BreakerWriteFailures';

export async function checkBreaker({
  table,
  limits,
  now,
}: {
  table: SpendTally;
  limits: BreakerLimits;
  now: Date;
}): Promise<BreakerDecision> {
  startSpan('breaker.check');

  let spend: Spend | undefined;
  try {
    spend = await table.getSpend(now);
  } catch (err) {
    endSpan('breaker.check', { state: 'read_failed' });
    throw new BreakerReadError(err);
  }

  const tallyMicroUsd = spend?.microUsd ?? 0;
  const state: BreakerState =
    tallyMicroUsd >= limits.tripMicroUsd
      ? 'tripped'
      : tallyMicroUsd >= limits.degradeMicroUsd
        ? 'degraded'
        : 'ok';

  endSpan('breaker.check', { state, tallyMicroUsd: String(tallyMicroUsd) });
  return { state, tallyMicroUsd };
}

/**
 * Adds a finished turn's estimate to the month. The reply has already been
 * delivered and already billed, so a failure here does not fail the turn — but
 * it is never silent: it is logged and counted, and the operations stack
 * alarms on the metric.
 *
 * Returns whether the tally was written.
 */
export async function recordTurnSpend(
  { table, now }: { table: SpendTally; now: Date },
  microUsd: number,
): Promise<boolean> {
  if (!Number.isSafeInteger(microUsd) || microUsd < 0) {
    throw new Error(`Turn estimate must be a non-negative integer, got ${microUsd}`);
  }

  try {
    await table.addSpend(microUsd, now);
    return true;
  } catch (err) {
    console.error(`Breaker could not record ${microUsd} microUSD for this turn:`, err);
    emitWriteFailure(now);
    return false;
  }
}

/**
 * CloudWatch embedded metric format: the runtime has no metrics client, and a
 * log line a human has to notice is not an alarm.
 */
function emitWriteFailure(now: Date): void {
  try {
    console.log(
      JSON.stringify({
        _aws: {
          Timestamp: now.getTime(),
          CloudWatchMetrics: [
            {
              Namespace: METRIC_NAMESPACE,
              Dimensions: [[]],
              Metrics: [{ Name: WRITE_FAILURE_METRIC, Unit: 'Count' }],
            },
          ],
        },
        [WRITE_FAILURE_METRIC]: 1,
      }),
    );
  } catch {
    // Never let the failure report become a second failure.
  }
}
