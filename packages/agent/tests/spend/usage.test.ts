/**
 * T018 (spec 003, data-model.md § Turn Usage; research.md N1): usage is read
 * from `result.metrics.accumulatedUsage` (Strands 1.24.0 `AgentResult.metrics`,
 * `types/agent.d.ts:422`; `AgentMetrics.accumulatedUsage`,
 * `telemetry/meter.d.ts:149`; `Usage`, `models/streaming.d.ts:379-401`).
 */
import { describe, it, expect } from 'vitest';
import {
  readModelUsage,
  computeTurnUsage,
  MissingUsageError,
  type UsageRates,
} from '../../src/spend/usage.js';

const RATES: UsageRates = {
  modelInputPerMTokMicroUsd: 1_000_000,
  modelOutputPerMTokMicroUsd: 5_000_000,
  modelCacheReadPerMTokMicroUsd: 100_000,
  pollyPerMCharMicroUsd: 4_000_000,
  memoryEventMicroUsd: 12,
  memoryRetrievalMicroUsd: 500,
  runtimePerTurnMicroUsd: 300,
};

describe('readModelUsage', () => {
  it('reads every count from result.metrics.accumulatedUsage', () => {
    const result = {
      metrics: {
        accumulatedUsage: {
          inputTokens: 3000,
          outputTokens: 120,
          totalTokens: 3120,
          cacheReadInputTokens: 2000,
          cacheWriteInputTokens: 0,
        },
      },
    };

    expect(readModelUsage(result)).toEqual({
      inputTokens: 3000,
      outputTokens: 120,
      totalTokens: 3120,
      cacheReadInputTokens: 2000,
      cacheWriteInputTokens: 0,
    });
  });

  it('leaves the optional cache counts undefined when the model reports none', () => {
    const usage = readModelUsage({
      metrics: { accumulatedUsage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 } },
    });

    expect(usage).toEqual({ inputTokens: 1, outputTokens: 2, totalTokens: 3 });
  });

  it.each([
    ['no metrics object', {}],
    ['metrics without accumulatedUsage', { metrics: {} }],
    ['the pre-N1 result.usage shape', { usage: { totalTokens: 10 } }],
    [
      'a non-numeric count',
      { metrics: { accumulatedUsage: { inputTokens: 1, outputTokens: 'x', totalTokens: 1 } } },
    ],
  ])('fails loud on %s rather than reading zero', (_label, result) => {
    expect(() => readModelUsage(result)).toThrow(MissingUsageError);
  });
});

describe('computeTurnUsage', () => {
  it('sums each count times its configured rate as integer microUsd', () => {
    const turn = computeTurnUsage(
      {
        model: {
          inputTokens: 3000,
          outputTokens: 120,
          totalTokens: 3120,
          cacheReadInputTokens: 2000,
        },
        pollyCharacters: 250,
        memoryEvents: 1,
        memoryRetrievals: 2,
      },
      RATES,
    );

    // 3000×1 + 120×5 + 2000×0.1 + 250×4 + 1×12 + 2×500 + 300
    expect(turn.estimatedMicroUsd).toBe(3000 + 600 + 200 + 1000 + 12 + 1000 + 300);
    expect(Number.isInteger(turn.estimatedMicroUsd)).toBe(true);
    expect(turn).toMatchObject({
      inputTokens: 3000,
      outputTokens: 120,
      totalTokens: 3120,
      cacheReadInputTokens: 2000,
      pollyCharacters: 250,
      memoryEvents: 1,
      memoryRetrievals: 2,
    });
  });

  it('rounds a fractional total up, so the integer tally never undercounts', () => {
    const turn = computeTurnUsage(
      {
        model: { inputTokens: 1, outputTokens: 0, totalTokens: 1 },
        pollyCharacters: 0,
        memoryEvents: 0,
        memoryRetrievals: 0,
      },
      { ...RATES, runtimePerTurnMicroUsd: 0 },
    );

    expect(turn.estimatedMicroUsd).toBe(1);
  });

  it('refuses cache-write tokens, which have no configured rate', () => {
    expect(() =>
      computeTurnUsage(
        {
          model: { inputTokens: 1, outputTokens: 1, totalTokens: 2, cacheWriteInputTokens: 5 },
          pollyCharacters: 0,
          memoryEvents: 0,
          memoryRetrievals: 0,
        },
        RATES,
      ),
    ).toThrow('cacheWriteInputTokens');
  });
});
