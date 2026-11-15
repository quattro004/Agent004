/**
 * Readiness-gate tests for the agent HTTP surface (infra-plan Phase 1, T148/T149).
 *
 * AgentCore Runtime V2 snapshots the process on the first healthy `/ping` and
 * inherits that snapshot on every later instance. If `/ping` answers healthy
 * before the Bedrock/Strands client has been constructed and exercised, the
 * snapshot captures an uninitialized process and every instance pays the
 * cold-start cost the snapshot was meant to remove.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';

vi.mock('@strands-agents/sdk', () => {
  const invokeMock = vi.fn().mockResolvedValue({
    lastMessage: { content: [{ type: 'textBlock', text: 'ok' }] },
  });
  const Agent = vi.fn(function () {
    return { invoke: invokeMock };
  });
  const tool = vi.fn().mockImplementation((cfg) => ({ ...cfg, __tool: true }));
  return { Agent, tool, __invokeMock: invokeMock };
});

vi.mock('@strands-agents/sdk/models/bedrock', () => ({
  BedrockModel: vi.fn(function (cfg) {
    return { ...cfg };
  }),
}));

// The warm-up probe must be exercised, not stubbed away: mock the AWS SDK
// transport so the real warmup module still runs, and the round-trip it issues
// is observable from here.
vi.mock('@aws-sdk/client-bedrock-runtime', () => {
  const sendMock = vi.fn().mockResolvedValue({});
  const BedrockRuntimeClient = vi.fn(function () {
    return { send: sendMock };
  });
  const ListAsyncInvokesCommand = vi.fn(function (input: unknown) {
    return { input };
  });
  return { BedrockRuntimeClient, ListAsyncInvokesCommand, __sendMock: sendMock };
});

// SSM SecureStrings by name. Each test reads the mock belonging to the module
// registry `freshModule()` created and can delete a parameter to simulate it
// being missing.
vi.mock('@aws-sdk/client-ssm', () => {
  const parameters = new Map<string, string>([
    ['/max-height/weather-api-key', 'weather-secret'],
    ['/max-height/news-api-key', 'news-secret'],
    ['/max-height/search-api-key', 'search-secret'],
    ['/max-height/search-engine-id', 'engine-secret'],
  ]);
  const sendMock = vi.fn(async (command: { input: { Name: string } }) => {
    const value = parameters.get(command.input.Name);
    if (value === undefined) {
      throw Object.assign(new Error('ParameterNotFound'), { name: 'ParameterNotFound' });
    }
    return { Parameter: { Name: command.input.Name, Value: value } };
  });
  const SSMClient = vi.fn(function () {
    return { send: sendMock };
  });
  const GetParameterCommand = vi.fn(function (input: unknown) {
    return { input };
  });
  return { SSMClient, GetParameterCommand, __sendMock: sendMock, __parameters: parameters };
});

vi.mock('../src/tools/newsTool.js', () => ({ newsToolSchema: {}, fetchNews: vi.fn() }));
vi.mock('../src/tools/weatherTool.js', () => ({ weatherToolSchema: {}, fetchWeather: vi.fn() }));
vi.mock('../src/tools/webSearchTool.js', () => ({
  webSearchToolSchema: {},
  fetchWebSearch: vi.fn(),
}));
vi.mock('../src/personality/systemPrompt.js', () => ({
  buildSystemPrompt: vi.fn().mockReturnValue('You are Max Height...'),
}));

type AgentModule = typeof import('../src/index.js');

interface BedrockSdkMock {
  __sendMock: Mock;
  ListAsyncInvokesCommand: Mock;
}

interface SsmSdkMock {
  __sendMock: Mock;
  __parameters: Map<string, string>;
  GetParameterCommand: Mock;
}

/**
 * The 29 agent runtime variables of spec 003 contracts/runtime-config.md
 * § Agent runtime. Values are test fixtures, not deployment values.
 */
const RUNTIME_ENV: Record<string, string> = {
  AWS_REGION: 'us-west-2',
  MODEL_ID: 'test-model-id',
  MAX_OUTPUT_TOKENS: '250',
  CONTROL_TABLE_NAME: 'test-control-table',
  MEMORY_ID: 'test-memory-id',
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
  BREAKER_DEGRADE_MICRO_USD: '15000000',
  BREAKER_TRIP_MICRO_USD: '19000000',
  PRICE_MODEL_INPUT_PER_MTOK_MICRO_USD: '1000000',
  PRICE_MODEL_OUTPUT_PER_MTOK_MICRO_USD: '5000000',
  PRICE_MODEL_CACHE_READ_PER_MTOK_MICRO_USD: '0',
  PRICE_POLLY_PER_MCHAR_MICRO_USD: '4000000',
  PRICE_MEMORY_EVENT_MICRO_USD: '12',
  PRICE_MEMORY_RETRIEVAL_MICRO_USD: '500',
  PRICE_RUNTIME_PER_TURN_MICRO_USD: '300',
  SSM_PARAM_WEATHER_KEY: '/max-height/weather-api-key',
  SSM_PARAM_NEWS_KEY: '/max-height/news-api-key',
  SSM_PARAM_SEARCH_KEY: '/max-height/search-api-key',
  SSM_PARAM_SEARCH_ENGINE_ID: '/max-height/search-engine-id',
};

beforeEach(() => {
  for (const [name, value] of Object.entries(RUNTIME_ENV)) vi.stubEnv(name, value);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Re-import the module so each test observes a process that has just booted. */
async function freshModule(): Promise<AgentModule> {
  vi.resetModules();
  return (await import('../src/index.js')) as AgentModule;
}

/** The mock transport belonging to the module registry `freshModule()` created. */
async function bedrockSdk(): Promise<BedrockSdkMock> {
  return (await import('@aws-sdk/client-bedrock-runtime')) as unknown as BedrockSdkMock;
}

async function ssmSdk(): Promise<SsmSdkMock> {
  return (await import('@aws-sdk/client-ssm')) as unknown as SsmSdkMock;
}

function makePingReq(): IncomingMessage {
  return { method: 'GET', url: '/ping' } as IncomingMessage;
}

function makeRes(): {
  res: ServerResponse;
  statusCode: () => number | undefined;
  body: () => string;
} {
  const chunks: string[] = [];
  let status: number | undefined;

  const res = {
    writeHead(code: number) {
      status = code;
      return this;
    },
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    },
    end(chunk?: string) {
      if (chunk) chunks.push(chunk);
      return this;
    },
  } as unknown as ServerResponse;

  return { res, statusCode: () => status, body: () => chunks.join('') };
}

function ping(mod: Pick<AgentModule, '__test'>): {
  status: number | undefined;
  payload: { status?: string };
} {
  const { res, statusCode, body } = makeRes();
  mod.__test.requestHandler(makePingReq(), res);
  return { status: statusCode(), payload: JSON.parse(body()) as { status?: string } };
}

describe('/ping readiness gate', () => {
  it('should report unhealthy before initialization has resolved', async () => {
    const mod = await freshModule();

    const { status, payload } = ping(mod);

    expect(status).toBe(503);
    expect(payload.status).toBe('initializing');
  });

  it('should report healthy once initialization has resolved', async () => {
    const mod = await freshModule();

    await mod.initialize();

    const { status, payload } = ping(mod);

    expect(status).toBe(200);
    expect(payload.status).toBe('healthy');
  });
});

describe('initialization warm-up', () => {
  it('should exercise the Bedrock client with a real round-trip, not just construct it', async () => {
    const mod = await freshModule();
    const sdk = await bedrockSdk();

    await mod.initialize();

    expect(sdk.__sendMock).toHaveBeenCalledTimes(1);
    expect(sdk.ListAsyncInvokesCommand).toHaveBeenCalledWith({ maxResults: 1 });
  });

  it('should keep /ping unhealthy until the round-trip has completed', async () => {
    const mod = await freshModule();
    const sdk = await bedrockSdk();

    let release!: () => void;
    sdk.__sendMock.mockReturnValueOnce(
      new Promise<object>((resolve) => {
        release = () => resolve({});
      }),
    );

    const initPromise = mod.initialize();
    await vi.waitFor(() => expect(sdk.__sendMock).toHaveBeenCalledTimes(1));

    expect(ping(mod).status).toBe(503);

    release();
    await initPromise;

    expect(ping(mod).status).toBe(200);
  });

  it('should fail loudly and stay unhealthy when the round-trip fails', async () => {
    const mod = await freshModule();
    const sdk = await bedrockSdk();

    sdk.__sendMock.mockRejectedValueOnce(
      new Error('AccessDeniedException: bedrock:ListAsyncInvokes'),
    );

    await expect(mod.initialize()).rejects.toThrow('AccessDeniedException');

    expect(ping(mod).status).toBe(503);
  });
});

describe('runtime configuration at startup (spec 003 T015)', () => {
  it('lists all 29 runtime variables from contracts/runtime-config.md', () => {
    expect(Object.keys(RUNTIME_ENV)).toHaveLength(29);
  });

  it.each(Object.keys(RUNTIME_ENV))(
    'fails initialize() naming %s when it is missing, and /ping stays 503',
    async (name) => {
      vi.stubEnv(name, undefined);
      const mod = await freshModule();

      await expect(mod.initialize()).rejects.toThrow(name);
      expect(ping(mod).status).toBe(503);
    },
  );

  it.each(Object.keys(RUNTIME_ENV))(
    'treats an empty %s as missing rather than substituting a default',
    async (name) => {
      vi.stubEnv(name, '');
      const mod = await freshModule();

      await expect(mod.initialize()).rejects.toThrow(name);
      expect(ping(mod).status).toBe(503);
    },
  );

  it('fails initialize() when AWS_REGION is set to anything but us-west-2', async () => {
    vi.stubEnv('AWS_REGION', 'us-east-1');
    const mod = await freshModule();

    await expect(mod.initialize()).rejects.toThrow(/AWS_REGION.*us-west-2/);
    expect(ping(mod).status).toBe(503);
  });

  it('fails initialize() naming a numeric variable that does not parse', async () => {
    vi.stubEnv('SESSION_MAX_TURNS', 'fifty');
    const mod = await freshModule();

    await expect(mod.initialize()).rejects.toThrow('SESSION_MAX_TURNS');
    expect(ping(mod).status).toBe(503);
  });

  it.each([
    '/max-height/weather-api-key',
    '/max-height/news-api-key',
    '/max-height/search-api-key',
    '/max-height/search-engine-id',
  ])('fails initialize() naming SSM parameter %s when it is missing', async (parameter) => {
    const mod = await freshModule();
    const { __parameters: parameters } = await ssmSdk();
    const value = parameters.get(parameter)!;
    parameters.delete(parameter);

    try {
      await expect(mod.initialize()).rejects.toThrow(parameter);
      expect(ping(mod).status).toBe(503);
    } finally {
      parameters.set(parameter, value);
    }
  });

  it('reads every SSM parameter as a decrypted SecureString before warming Bedrock', async () => {
    const mod = await freshModule();
    const ssm = await ssmSdk();

    await mod.initialize();

    expect(ssm.GetParameterCommand.mock.calls.map(([input]) => input)).toEqual(
      expect.arrayContaining(
        [
          '/max-height/weather-api-key',
          '/max-height/news-api-key',
          '/max-height/search-api-key',
          '/max-height/search-engine-id',
        ].map((Name) => ({ Name, WithDecryption: true })),
      ),
    );
  });

  it('does not write the loaded secrets back into process.env', async () => {
    const mod = await freshModule();

    await mod.initialize();

    const values = Object.values(process.env);
    for (const secret of ['weather-secret', 'news-secret', 'search-secret', 'engine-secret']) {
      expect(values).not.toContain(secret);
    }
  });

  it('does not exercise Bedrock when configuration is invalid', async () => {
    vi.stubEnv('MODEL_ID', undefined);
    const mod = await freshModule();
    const sdk = await bedrockSdk();

    await expect(mod.initialize()).rejects.toThrow('MODEL_ID');
    expect(sdk.__sendMock).not.toHaveBeenCalled();
  });
});
