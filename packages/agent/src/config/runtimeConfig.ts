import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import type { UsageRates } from '../spend/usage.js';
import type { TurnLimits } from '../limits/turnLimits.js';

/**
 * Agent runtime configuration (spec 003 contracts/runtime-config.md § Agent
 * runtime). Read once at startup; a missing or unparseable value throws, so
 * `/ping` never reports healthy on a half-configured process. No value has a
 * default.
 */
export interface RuntimeConfig {
  awsRegion: string;
  modelId: string;
  maxOutputTokens: number;
  controlTableName: string;
  memoryId: string;
  memoryTopK: number;
  pollyVoiceId: string;
  pollyEngine: string;
  pollySampleRate: number;
  sessionMaxTurns: number;
  sessionMaxTokens: number;
  sessionMaxMinutes: number;
  rateLimitPerHour: number;
  rateLimitPerDay: number;
  messageMaxChars: number;
  historyWindow: number;
  breakerDegradeMicroUsd: number;
  breakerTripMicroUsd: number;
  /** Spend-bearing requests allowed in flight across all runtime instances. */
  maxActiveRequests: number;
  /** Per-turn safety bounds approved 2026-11-15; every one is CDK-set. */
  limits: TurnLimits;
  prices: UsageRates;
  secrets: ToolSecrets;
}

/** Loaded from SSM SecureStrings; never written back into `process.env`. */
export interface ToolSecrets {
  weatherApiKey: string;
  newsApiKey: string;
}

export class RuntimeConfigError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RuntimeConfigError';
  }
}

/** FR-031: the deployment is pinned to this Region (runtime-config.md, `AWS_REGION`). */
const REQUIRED_REGION = 'us-west-2';

type Env = Record<string, string | undefined>;

export async function loadRuntimeConfig(env: Env = process.env): Promise<RuntimeConfig> {
  const missing: string[] = [];
  const invalid: string[] = [];

  const text = (name: string): string => {
    const value = env[name];
    if (value === undefined || value === '') missing.push(name);
    return value ?? '';
  };
  const integer = (name: string): number => {
    const raw = text(name);
    if (raw === '') return Number.NaN;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value)) {
      invalid.push(`${name}="${raw}" is not a non-negative integer`);
    }
    return value;
  };

  const awsRegion = text('AWS_REGION');
  if (awsRegion !== '' && awsRegion !== REQUIRED_REGION) {
    invalid.push(`AWS_REGION="${awsRegion}" must be ${REQUIRED_REGION}`);
  }

  const config: Omit<RuntimeConfig, 'secrets'> = {
    awsRegion,
    modelId: text('MODEL_ID'),
    maxOutputTokens: integer('MAX_OUTPUT_TOKENS'),
    controlTableName: text('CONTROL_TABLE_NAME'),
    memoryId: text('MEMORY_ID'),
    memoryTopK: integer('MEMORY_TOP_K'),
    pollyVoiceId: text('POLLY_VOICE_ID'),
    pollyEngine: text('POLLY_ENGINE'),
    pollySampleRate: integer('POLLY_SAMPLE_RATE'),
    sessionMaxTurns: integer('SESSION_MAX_TURNS'),
    sessionMaxTokens: integer('SESSION_MAX_TOKENS'),
    sessionMaxMinutes: integer('SESSION_MAX_MINUTES'),
    rateLimitPerHour: integer('RATE_LIMIT_PER_HOUR'),
    rateLimitPerDay: integer('RATE_LIMIT_PER_DAY'),
    messageMaxChars: integer('MESSAGE_MAX_CHARS'),
    historyWindow: integer('HISTORY_WINDOW'),
    breakerDegradeMicroUsd: integer('BREAKER_DEGRADE_MICRO_USD'),
    breakerTripMicroUsd: integer('BREAKER_TRIP_MICRO_USD'),
    maxActiveRequests: integer('GLOBAL_MAX_ACTIVE_REQUESTS'),
    limits: {
      requestBodyMaxBytes: integer('REQUEST_BODY_MAX_BYTES'),
      modelInputMaxBytes: integer('MODEL_INPUT_MAX_BYTES'),
      toolResultMaxBytes: integer('TOOL_RESULT_MAX_BYTES'),
      maxModelCalls: integer('TURN_MAX_MODEL_CALLS'),
      maxToolExecutions: integer('TURN_MAX_TOOL_EXECUTIONS'),
      maxGeneratedTokens: integer('TURN_MAX_GENERATED_TOKENS'),
      maxBilledTokens: integer('TURN_MAX_BILLED_TOKENS'),
      deadlineMs: integer('TURN_DEADLINE_MS'),
    },
    prices: {
      modelInputPerMTokMicroUsd: integer('PRICE_MODEL_INPUT_PER_MTOK_MICRO_USD'),
      modelOutputPerMTokMicroUsd: integer('PRICE_MODEL_OUTPUT_PER_MTOK_MICRO_USD'),
      modelCacheReadPerMTokMicroUsd: integer('PRICE_MODEL_CACHE_READ_PER_MTOK_MICRO_USD'),
      pollyPerMCharMicroUsd: integer('PRICE_POLLY_PER_MCHAR_MICRO_USD'),
      memoryEventMicroUsd: integer('PRICE_MEMORY_EVENT_MICRO_USD'),
      memoryRetrievalMicroUsd: integer('PRICE_MEMORY_RETRIEVAL_MICRO_USD'),
      runtimePerTurnMicroUsd: integer('PRICE_RUNTIME_PER_TURN_MICRO_USD'),
    },
  };
  const parameterNames = {
    weatherApiKey: text('SSM_PARAM_WEATHER_KEY'),
    newsApiKey: text('SSM_PARAM_NEWS_KEY'),
  };

  const problems = [
    ...(missing.length > 0 ? [`missing required variables: ${missing.join(', ')}`] : []),
    ...invalid,
    ...(config.maxActiveRequests === 0
      ? ['GLOBAL_MAX_ACTIVE_REQUESTS="0" must be at least 1, or every request is refused']
      : []),
  ];
  if (problems.length > 0) {
    throw new RuntimeConfigError(`Agent runtime configuration is invalid: ${problems.join('; ')}`);
  }

  const ssm = new SSMClient({ region: awsRegion });
  const read = async (name: string): Promise<string> => {
    let value: string | undefined;
    try {
      const { Parameter } = await ssm.send(
        new GetParameterCommand({ Name: name, WithDecryption: true }),
      );
      value = Parameter?.Value;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new RuntimeConfigError(`SSM parameter ${name} could not be read: ${reason}`, {
        cause: err,
      });
    }
    if (value === undefined || value === '') {
      throw new RuntimeConfigError(`SSM parameter ${name} has no value`);
    }
    return value;
  };

  const [weatherApiKey, newsApiKey] = await Promise.all([
    read(parameterNames.weatherApiKey),
    read(parameterNames.newsApiKey),
  ]);

  return { ...config, secrets: { weatherApiKey, newsApiKey } };
}
