/**
 * Readiness-gate tests for the agent HTTP surface (infra-plan Phase 1, T148/T149).
 *
 * AgentCore Runtime V2 snapshots the process on the first healthy `/ping` and
 * inherits that snapshot on every later instance. If `/ping` answers healthy
 * before the Bedrock/Strands client has been constructed and exercised, the
 * snapshot captures an uninitialized process and every instance pays the
 * cold-start cost the snapshot was meant to remove.
 */
import { describe, it, expect, vi, type Mock } from 'vitest';
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

/** Re-import the module so each test observes a process that has just booted. */
async function freshModule(): Promise<AgentModule> {
  vi.resetModules();
  return (await import('../src/index.js')) as AgentModule;
}

/** The mock transport belonging to the module registry `freshModule()` created. */
async function bedrockSdk(): Promise<BedrockSdkMock> {
  return (await import('@aws-sdk/client-bedrock-runtime')) as unknown as BedrockSdkMock;
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
    await Promise.resolve();

    expect(sdk.__sendMock).toHaveBeenCalledTimes(1);
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
