/**
 * Per-turn usage and its spend estimate (spec 003 data-model.md § Turn Usage).
 *
 * Request usage comes from `AgentResult.invocationContext.usage`. The Agent's
 * `metrics.accumulatedUsage` includes earlier invocations when it is reused.
 */

/** The model reported no usable usage; reading zero would blind the caps and breaker. */
export class MissingUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingUsageError';
  }
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadInputTokens?: number;
  cacheWriteInputTokens?: number;
}

/** The `PRICE_*` runtime variables (contracts/runtime-config.md). */
export interface UsageRates {
  modelInputPerMTokMicroUsd: number;
  modelOutputPerMTokMicroUsd: number;
  modelCacheReadPerMTokMicroUsd: number;
  pollyPerMCharMicroUsd: number;
  memoryEventMicroUsd: number;
  memoryRetrievalMicroUsd: number;
  runtimePerTurnMicroUsd: number;
  /** One `InvokeWebSearch` query at list price; the free monthly allowance is not credited. */
  webSearchMicroUsd: number;
}

export interface TurnCounts {
  model: ModelUsage;
  pollyCharacters: number;
  memoryEvents: number;
  memoryRetrievals: number;
  /** Searches sent, whether or not they succeeded. */
  webSearches: number;
}

export interface TurnUsage extends ModelUsage {
  pollyCharacters: number;
  memoryEvents: number;
  memoryRetrievals: number;
  webSearches: number;
  estimatedMicroUsd: number;
}

const PER_MILLION = 1_000_000;

export interface InvocationUsageResult {
  invocationContext?: {
    usage?: unknown;
  };
}

export function readModelUsage(result: InvocationUsageResult | null | undefined): ModelUsage {
  const usage = result?.invocationContext?.usage;
  if (typeof usage !== 'object' || usage === null) {
    throw new MissingUsageError('Agent result has no invocationContext.usage');
  }
  const raw = usage as Record<string, unknown>;
  const read: ModelUsage = {
    inputTokens: count(raw, 'inputTokens'),
    outputTokens: count(raw, 'outputTokens'),
    totalTokens: count(raw, 'totalTokens'),
  };
  if (raw.cacheReadInputTokens !== undefined) {
    read.cacheReadInputTokens = count(raw, 'cacheReadInputTokens');
  }
  if (raw.cacheWriteInputTokens !== undefined) {
    read.cacheWriteInputTokens = count(raw, 'cacheWriteInputTokens');
  }
  return read;
}

/**
 * `estimatedMicroUsd` is the sum of each count times its configured rate,
 * rounded up to a whole micro-dollar so the integer `SPEND#` tally never
 * undercounts a turn.
 */
export function computeTurnUsage(counts: TurnCounts, rates: UsageRates): TurnUsage {
  const { model } = counts;
  if ((model.cacheWriteInputTokens ?? 0) > 0) {
    // No PRICE_* variable exists for cache writes; caching is off until S2 (#49).
    throw new MissingUsageError(
      `cacheWriteInputTokens=${model.cacheWriteInputTokens} has no configured rate`,
    );
  }

  const perMillionTotal =
    model.inputTokens * rates.modelInputPerMTokMicroUsd +
    model.outputTokens * rates.modelOutputPerMTokMicroUsd +
    (model.cacheReadInputTokens ?? 0) * rates.modelCacheReadPerMTokMicroUsd +
    counts.pollyCharacters * rates.pollyPerMCharMicroUsd;
  const flat =
    counts.memoryEvents * rates.memoryEventMicroUsd +
    counts.memoryRetrievals * rates.memoryRetrievalMicroUsd +
    counts.webSearches * rates.webSearchMicroUsd +
    rates.runtimePerTurnMicroUsd;

  return {
    ...model,
    pollyCharacters: counts.pollyCharacters,
    memoryEvents: counts.memoryEvents,
    memoryRetrievals: counts.memoryRetrievals,
    webSearches: counts.webSearches,
    estimatedMicroUsd: Math.ceil((perMillionTotal + flat * PER_MILLION) / PER_MILLION),
  };
}

function count(raw: Record<string, unknown>, name: string): number {
  const value = raw[name];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new MissingUsageError(`invocationContext.usage.${name} is not a count: ${String(value)}`);
  }
  return value;
}
