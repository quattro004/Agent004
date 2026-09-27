/**
 * Readiness-gate tests for the agent HTTP surface (infra-plan Phase 1, T148/T149).
 *
 * AgentCore Runtime V2 snapshots the process on the first healthy `/ping` and
 * inherits that snapshot on every later instance. If `/ping` answers healthy
 * before the Bedrock/Strands client has been constructed and exercised, the
 * snapshot captures an uninitialized process and every instance pays the
 * cold-start cost the snapshot was meant to remove.
 */
import { describe, it, expect, vi } from 'vitest';
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

/** Re-import the module so each test observes a process that has just booted. */
async function freshModule(): Promise<AgentModule> {
  vi.resetModules();
  return (await import('../src/index.js')) as AgentModule;
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
