import { describe, expect, it } from 'vitest';
import {
  completeModelRequestBytes,
  TURN_LIMIT_DEFAULTS,
  type TurnLimits,
} from '../../src/limits/turnLimits.js';
import { estimateReservationMicroUsd } from '../../src/spend/reservation.js';
import { computeTurnUsage, type UsageRates } from '../../src/spend/usage.js';

const RATES: UsageRates = {
  modelInputPerMTokMicroUsd: 1_000_000,
  modelOutputPerMTokMicroUsd: 5_000_000,
  modelCacheReadPerMTokMicroUsd: 0,
  pollyPerMCharMicroUsd: 4_000_000,
  memoryEventMicroUsd: 12,
  memoryRetrievalMicroUsd: 500,
  runtimePerTurnMicroUsd: 300,
  webSearchMicroUsd: 7000,
};

const MAX_OUTPUT_PER_CALL = 250;

function estimate(limits: Partial<TurnLimits> = {}, rates: UsageRates = RATES): number {
  return estimateReservationMicroUsd({
    limits: { ...TURN_LIMIT_DEFAULTS, ...limits },
    maxOutputTokensPerCall: MAX_OUTPUT_PER_CALL,
    rates,
  });
}

describe('estimateReservationMicroUsd', () => {
  it('is an integer number of micro-dollars', () => {
    expect(Number.isSafeInteger(estimate())).toBe(true);
  });

  it('covers the most the approved limits let one turn bill', () => {
    // The billed-token cutoff is checked between calls, so the last call can
    // carry a full model input past it: 64,000 + 32,768 input tokens at most.
    const worstCase = computeTurnUsage(
      {
        model: {
          inputTokens: 64_000 + 32_768,
          outputTokens: 1_000,
          totalTokens: 64_000 + 32_768 + 1_000,
        },
        pollyCharacters: 1_000 * 8,
        memoryEvents: 1,
        memoryRetrievals: 1,
        webSearches: TURN_LIMIT_DEFAULTS.maxToolExecutions,
      },
      RATES,
    ).estimatedMicroUsd;

    expect(estimate()).toBeGreaterThanOrEqual(worstCase);
  });

  it('prices the complete request at no more than the enforced byte ceiling', () => {
    const completeBytes = completeModelRequestBytes({
      systemPrompt: 'Static system prompt.',
      toolSpecs: [{ name: 'get_news', description: 'Get news.', inputSchema: { query: 'query' } }],
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    });

    expect(completeBytes).toBeLessThanOrEqual(TURN_LIMIT_DEFAULTS.modelInputMaxBytes);
    expect(estimate({ maxModelCalls: 1, modelInputMaxBytes: completeBytes })).toBeGreaterThan(0);
  });

  // Spec 003 Session 2026-11-18 (T181): any tool execution may be a search.
  it('reserves a search for every tool execution the turn allows', () => {
    const free = estimate({}, { ...RATES, webSearchMicroUsd: 0 });
    expect(estimate() - free).toBe(TURN_LIMIT_DEFAULTS.maxToolExecutions * 7000);
  });

  it('never assumes more input than the model-call count allows', () => {
    // One call can carry at most one full model input, so a one-call turn
    // cannot be charged the billed-token cutoff plus an overshoot.
    expect(estimate({ maxModelCalls: 1 })).toBeLessThan(estimate({ maxModelCalls: 4 }));
  });

  it('never assumes more output than a call is allowed to generate', () => {
    expect(estimate({ maxGeneratedTokens: 100_000 })).toBe(estimate({ maxGeneratedTokens: 1_000 }));
  });

  it('rises with the configured prices, not with constants of its own', () => {
    const doubled = estimate(
      {},
      { ...RATES, modelInputPerMTokMicroUsd: RATES.modelInputPerMTokMicroUsd * 2 },
    );
    expect(doubled).toBeGreaterThan(estimate());
  });

  it('charges the flat per-turn costs even when no model call is allowed', () => {
    expect(estimate({ maxModelCalls: 0 })).toBe(
      RATES.memoryEventMicroUsd + RATES.memoryRetrievalMicroUsd + RATES.runtimePerTurnMicroUsd,
    );
  });
});
