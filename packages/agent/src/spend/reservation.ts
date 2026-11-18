/**
 * The conservative maximum one turn can cost, committed at admission
 * (spec 003 Session 2026-11-15; `spend-control.md` § Admission).
 *
 * The SDK checks its token limits between model calls, so the last call can
 * pass the billed-token cutoff by a whole model input. The reservation is
 * therefore priced from the approved limits rather than from them alone. It
 * is replaced by the measured spend at settlement, so over-reserving only
 * holds headroom for the length of the request.
 */
import type { TurnLimits } from '../limits/turnLimits.js';
import { computeTurnUsage, type UsageRates } from './usage.js';

/**
 * Upper bound on Polly characters per generated token. Replies run near four
 * characters a token; this is doubled so an unusual reply cannot outrun it.
 */
const POLLY_CHARS_PER_TOKEN_CEILING = 8;

export interface ReservationInputs {
  limits: TurnLimits;
  /** `MAX_OUTPUT_TOKENS`: what one model call may generate. */
  maxOutputTokensPerCall: number;
  rates: UsageRates;
}

export function estimateReservationMicroUsd({
  limits,
  maxOutputTokensPerCall,
  rates,
}: ReservationInputs): number {
  const { maxModelCalls, modelInputMaxBytes, maxBilledTokens, maxGeneratedTokens } = limits;

  // Serialized bytes bound tokens from above, so a model input of N bytes is
  // at most N tokens.
  const inputTokens = Math.min(
    maxBilledTokens + modelInputMaxBytes,
    maxModelCalls * modelInputMaxBytes,
  );
  const outputTokens = Math.min(
    maxGeneratedTokens + maxOutputTokensPerCall,
    maxModelCalls * maxOutputTokensPerCall,
  );

  return computeTurnUsage(
    {
      model: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
      pollyCharacters: outputTokens * POLLY_CHARS_PER_TOKEN_CEILING,
      memoryEvents: 1,
      memoryRetrievals: 1,
      // Only the model calls tools, so a turn with no model call sends no search.
      webSearches: maxModelCalls === 0 ? 0 : limits.maxToolExecutions,
    },
    rates,
  ).estimatedMicroUsd;
}
