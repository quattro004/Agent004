import { describe, it, expect, afterAll } from 'vitest';
import { Agent } from '@strands-agents/sdk';
import { BedrockModel } from '@strands-agents/sdk/models/bedrock';
import { BedrockRuntimeClient, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import { mockClient } from 'aws-sdk-client-mock';
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
  webSearchMicroUsd: 7000,
};

describe('readModelUsage', () => {
  it('reads request usage instead of lifetime metrics', () => {
    const result = {
      invocationContext: {
        usage: { inputTokens: 3000, outputTokens: 120, totalTokens: 3120 },
      },
      metrics: {
        accumulatedUsage: { inputTokens: 9000, outputTokens: 500, totalTokens: 9500 },
      },
    };

    expect(readModelUsage(result)).toEqual({
      inputTokens: 3000,
      outputTokens: 120,
      totalTokens: 3120,
    });
  });

  it('refuses lifetime metrics when request usage is missing', () => {
    expect(() =>
      readModelUsage({
        metrics: { accumulatedUsage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 } },
      }),
    ).toThrow(MissingUsageError);
  });

  it('reads every count from result.invocationContext.usage', () => {
    const result = {
      invocationContext: {
        usage: {
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

  describe('usage across actual SDK Agent reuse', () => {
    const bedrock = mockClient(BedrockRuntimeClient);
    afterAll(() => bedrock.restore());

    it('counts two reused-Agent replies once each without calling AWS', async () => {
      bedrock.on(ConverseStreamCommand).callsFake(() => ({
        stream: (async function* () {
          yield { messageStart: { role: 'assistant' as const } };
          yield { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'done' } } };
          yield { contentBlockStop: { contentBlockIndex: 0 } };
          yield { messageStop: { stopReason: 'end_turn' as const } };
          yield {
            metadata: {
              usage: { inputTokens: 10, outputTokens: 250, totalTokens: 260 },
              metrics: { latencyMs: 1 },
            },
          };
        })(),
      }));
      const agent = new Agent({
        model: new BedrockModel({ modelId: 'test-model', region: 'us-west-2' }),
        printer: false,
      });

      const first = readModelUsage(await agent.invoke('first'));
      const second = readModelUsage(await agent.invoke('second'));

      expect(first.outputTokens).toBe(250);
      expect(second.outputTokens).toBe(250);
      expect(first.outputTokens + second.outputTokens).toBe(500);
      expect(bedrock.commandCalls(ConverseStreamCommand)).toHaveLength(2);
    });
  });

  it('leaves the optional cache counts undefined when the model reports none', () => {
    const usage = readModelUsage({
      invocationContext: { usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 } },
    });

    expect(usage).toEqual({ inputTokens: 1, outputTokens: 2, totalTokens: 3 });
  });

  it.each([
    ['no invocation context', {}],
    ['context without usage', { invocationContext: {} }],
    ['the pre-N1 result.usage shape', { usage: { totalTokens: 10 } }],
    [
      'a non-numeric count',
      { invocationContext: { usage: { inputTokens: 1, outputTokens: 'x', totalTokens: 1 } } },
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
        webSearches: 0,
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
        webSearches: 0,
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
          webSearches: 0,
        },
        RATES,
      ),
    ).toThrow('cacheWriteInputTokens');
  });

  // Spec 003 Session 2026-11-18 (T181): every search sent is billed, at list price.
  it('prices each web search sent this turn', () => {
    const counts = {
      model: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      pollyCharacters: 0,
      memoryEvents: 0,
      memoryRetrievals: 0,
    };
    const without = computeTurnUsage({ ...counts, webSearches: 0 }, RATES);
    const withThree = computeTurnUsage({ ...counts, webSearches: 3 }, RATES);

    expect(withThree.estimatedMicroUsd - without.estimatedMicroUsd).toBe(3 * 7000);
    expect(withThree.webSearches).toBe(3);
  });
});
