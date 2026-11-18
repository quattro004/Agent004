/**
 * A complete, valid `RuntimeConfig` for tests.
 *
 * The handler requires configuration at every turn, so tests that exercise it
 * must supply one; there is deliberately no default inside the runtime
 * (`runtime-config.md` § Rules, "Fail loud").
 */
import type { RuntimeConfig } from '../../src/config/runtimeConfig.js';
import { TURN_LIMIT_DEFAULTS } from '../../src/limits/turnLimits.js';

export function testRuntimeConfig(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return {
    awsRegion: 'us-west-2',
    modelId: 'global.anthropic.claude-haiku-4-5-20251001-v1:0',
    maxOutputTokens: 250,
    controlTableName: 'MaxHeightControl',
    memoryId: 'mem-test',
    memoryTopK: 10,
    pollyVoiceId: 'Matthew',
    pollyEngine: 'standard',
    pollySampleRate: 24000,
    sessionMaxTurns: 50,
    sessionMaxTokens: 20000,
    sessionMaxMinutes: 30,
    sessionMaxWebSearches: 10,
    rateLimitPerHour: 60,
    rateLimitPerDay: 500,
    messageMaxChars: 2000,
    historyWindow: 40,
    breakerDegradeMicroUsd: 11_000_000,
    breakerTripMicroUsd: 15_000_000,
    maxActiveRequests: 2,
    limits: { ...TURN_LIMIT_DEFAULTS },
    prices: {
      modelInputPerMTokMicroUsd: 1_000_000,
      modelOutputPerMTokMicroUsd: 5_000_000,
      modelCacheReadPerMTokMicroUsd: 0,
      pollyPerMCharMicroUsd: 4_000_000,
      memoryEventMicroUsd: 12,
      memoryRetrievalMicroUsd: 500,
      runtimePerTurnMicroUsd: 300,
      webSearchMicroUsd: 7000,
    },
    secrets: {
      weatherApiKey: 'weather-key',
      newsApiKey: 'news-key',
    },
    ...overrides,
  };
}
