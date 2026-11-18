/**
 * T163 (RED): the runtime configuration carries the approved per-turn bounds.
 *
 * `runtime-config.md` § Rules requires every value to be read once at startup
 * and to fail loudly when missing or unparseable, so a half-configured
 * container never reports healthy. The 2026-11-15 limits are CDK-set
 * variables like every other, not silent defaults baked into the image.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMock = vi.fn();

vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: vi.fn(function () {
    return { send: sendMock };
  }),
  GetParameterCommand: vi.fn(function (input: unknown) {
    return { input };
  }),
}));

const { loadRuntimeConfig, RuntimeConfigError } = await import('../../src/config/runtimeConfig.js');

/** Every variable `runtime-config.md` lists, with the approved values. */
function validEnv(): Record<string, string> {
  return {
    AWS_REGION: 'us-west-2',
    MODEL_ID: 'global.anthropic.claude-haiku-4-5-20251001-v1:0',
    MAX_OUTPUT_TOKENS: '250',
    CONTROL_TABLE_NAME: 'MaxHeightControl',
    MEMORY_ID: 'mem-123',
    MEMORY_TOP_K: '10',
    POLLY_VOICE_ID: 'Matthew',
    POLLY_ENGINE: 'standard',
    POLLY_SAMPLE_RATE: '24000',
    SESSION_MAX_TURNS: '50',
    SESSION_MAX_TOKENS: '20000',
    SESSION_MAX_MINUTES: '30',
    RATE_LIMIT_PER_HOUR: '60',
    RATE_LIMIT_PER_DAY: '500',
    MESSAGE_MAX_CHARS: '2000',
    HISTORY_WINDOW: '40',
    BREAKER_DEGRADE_MICRO_USD: '11000000',
    BREAKER_TRIP_MICRO_USD: '15000000',
    PRICE_MODEL_INPUT_PER_MTOK_MICRO_USD: '1000000',
    PRICE_MODEL_OUTPUT_PER_MTOK_MICRO_USD: '5000000',
    PRICE_MODEL_CACHE_READ_PER_MTOK_MICRO_USD: '0',
    PRICE_POLLY_PER_MCHAR_MICRO_USD: '4000000',
    PRICE_MEMORY_EVENT_MICRO_USD: '12',
    PRICE_MEMORY_RETRIEVAL_MICRO_USD: '500',
    PRICE_RUNTIME_PER_TURN_MICRO_USD: '300',
    REQUEST_BODY_MAX_BYTES: '16384',
    MODEL_INPUT_MAX_BYTES: '32768',
    TOOL_RESULT_MAX_BYTES: '8192',
    TURN_MAX_MODEL_CALLS: '4',
    TURN_MAX_TOOL_EXECUTIONS: '4',
    TURN_MAX_GENERATED_TOKENS: '1000',
    TURN_MAX_BILLED_TOKENS: '64000',
    TURN_DEADLINE_MS: '60000',
    GLOBAL_MAX_ACTIVE_REQUESTS: '2',
    SSM_PARAM_WEATHER_KEY: '/max-height/weather-api-key',
    SSM_PARAM_NEWS_KEY: '/max-height/news-api-key',
  };
}

describe('loadRuntimeConfig — approved per-turn bounds', () => {
  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ Parameter: { Value: 'secret' } });
  });

  it('reads every approved limit from the environment', async () => {
    const config = await loadRuntimeConfig(validEnv());

    expect(config.limits).toEqual({
      requestBodyMaxBytes: 16384,
      modelInputMaxBytes: 32768,
      toolResultMaxBytes: 8192,
      maxModelCalls: 4,
      maxToolExecutions: 4,
      maxGeneratedTokens: 1000,
      maxBilledTokens: 64000,
      deadlineMs: 60000,
    });
  });

  it('loads only the weather and news keys: web search is IAM-signed and needs no secret', async () => {
    const config = await loadRuntimeConfig(validEnv());

    expect(config.secrets).toEqual({ weatherApiKey: 'secret', newsApiKey: 'secret' });
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  // Spec 003 Session 2026-11-18: a key left out disables one tool, not the runtime.
  it('boots without a weather key whose parameter does not exist', async () => {
    const notFound = Object.assign(new Error('Parameter not found'), {
      name: 'ParameterNotFound',
    });
    sendMock.mockImplementation(async (command: { input: { Name: string } }) => {
      if (command.input.Name === '/max-height/weather-api-key') throw notFound;
      return { Parameter: { Value: 'news-secret' } };
    });

    const config = await loadRuntimeConfig(validEnv());

    expect(config.secrets).toEqual({ weatherApiKey: undefined, newsApiKey: 'news-secret' });
  });

  it('boots without a news key whose parameter has no value', async () => {
    sendMock.mockImplementation(async (command: { input: { Name: string } }) =>
      command.input.Name === '/max-height/news-api-key'
        ? { Parameter: { Value: '' } }
        : { Parameter: { Value: 'weather-secret' } },
    );

    const config = await loadRuntimeConfig(validEnv());

    expect(config.secrets).toEqual({ weatherApiKey: 'weather-secret', newsApiKey: undefined });
  });

  it('still fails startup when a key cannot be read for any other reason', async () => {
    sendMock.mockRejectedValue(
      Object.assign(new Error('not authorized'), { name: 'AccessDeniedException' }),
    );

    await expect(loadRuntimeConfig(validEnv())).rejects.toThrow(RuntimeConfigError);
  });

  it('reads the global active-request limit from the environment', async () => {
    const config = await loadRuntimeConfig(validEnv());
    expect(config.maxActiveRequests).toBe(2);
  });

  it('rejects a global active-request limit below one, which would refuse every request', async () => {
    const env = { ...validEnv(), GLOBAL_MAX_ACTIVE_REQUESTS: '0' };
    await expect(loadRuntimeConfig(env)).rejects.toThrow(/GLOBAL_MAX_ACTIVE_REQUESTS/);
  });

  it.each([
    'GLOBAL_MAX_ACTIVE_REQUESTS',
    'REQUEST_BODY_MAX_BYTES',
    'MODEL_INPUT_MAX_BYTES',
    'TOOL_RESULT_MAX_BYTES',
    'TURN_MAX_MODEL_CALLS',
    'TURN_MAX_TOOL_EXECUTIONS',
    'TURN_MAX_GENERATED_TOKENS',
    'TURN_MAX_BILLED_TOKENS',
    'TURN_DEADLINE_MS',
  ])('fails loudly when %s is missing rather than defaulting', async (name) => {
    const env = validEnv();
    delete env[name];

    await expect(loadRuntimeConfig(env)).rejects.toThrow(RuntimeConfigError);
    await expect(loadRuntimeConfig(env)).rejects.toThrow(name);
  });

  it('rejects a limit that is not a non-negative integer', async () => {
    const env = { ...validEnv(), TURN_MAX_MODEL_CALLS: '4.5' };
    await expect(loadRuntimeConfig(env)).rejects.toThrow(/TURN_MAX_MODEL_CALLS/);
  });

  it('still pins the Region, so a limit change cannot mask a misconfigured deployment', async () => {
    const env = { ...validEnv(), AWS_REGION: 'us-east-1' };
    await expect(loadRuntimeConfig(env)).rejects.toThrow(/us-west-2/);
  });

  it('reports every missing variable at once, not just the first', async () => {
    const env = validEnv();
    delete env.TURN_DEADLINE_MS;
    delete env.TOOL_RESULT_MAX_BYTES;

    const error = await loadRuntimeConfig(env).catch((e: Error) => e);
    expect(error.message).toContain('TURN_DEADLINE_MS');
    expect(error.message).toContain('TOOL_RESULT_MAX_BYTES');
  });
});
