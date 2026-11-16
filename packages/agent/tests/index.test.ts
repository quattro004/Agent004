import { describe, it, expect, vi } from 'vitest';
import { testRuntimeConfig } from './fixtures/runtimeConfig.js';

// Mock the SDK to avoid real AWS calls
vi.mock('@strands-agents/sdk', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const Agent = vi.fn(function (config) {
    return {
      config,
      addHook: vi.fn(),
      messages: [],
      invoke: vi.fn().mockResolvedValue({
        lastMessage: {
          content: [{ type: 'textBlock', text: 'Hello from Max Height!' }],
        },
      }),
    };
  });
  const tool = vi.fn().mockImplementation((config) => ({ ...config, __tool: true }));
  return { ...actual, Agent, tool };
});

vi.mock('@strands-agents/sdk/models/bedrock', () => {
  const BedrockModel = vi.fn(function (config) {
    return { ...config, __model: true };
  });
  return { BedrockModel };
});

vi.mock('../src/tools/newsTool.js', () => ({
  newsToolSchema: {},
  fetchNews: vi.fn(),
}));

vi.mock('../src/tools/weatherTool.js', () => ({
  weatherToolSchema: {},
  fetchWeather: vi.fn(),
}));

vi.mock('../src/personality/systemPrompt.js', () => ({
  buildSystemPrompt: vi.fn().mockReturnValue('You are Max Height...'),
}));

vi.mock('../src/handlers/observability.js', () => ({
  startSpan: vi.fn().mockReturnValue({
    name: 'test',
    startTime: 0,
    endTime: null,
    durationMs: null,
    attributes: {},
  }),
  endSpan: vi.fn().mockReturnValue(null),
}));

// Dynamic import after mocks
const { createMaxHeightAgent } = await import('../src/index.js');

const config = testRuntimeConfig();

describe('createMaxHeightAgent', () => {
  it('builds the BedrockModel from runtime configuration, not hardcoded values', async () => {
    const { BedrockModel } = await import('@strands-agents/sdk/models/bedrock');
    createMaxHeightAgent({
      config: testRuntimeConfig({ modelId: 'test-model-id', maxOutputTokens: 123 }),
    });
    expect(BedrockModel).toHaveBeenCalledWith({
      modelId: 'test-model-id',
      maxTokens: 123,
    });
  });

  it('creates agent with system prompt from buildSystemPrompt', async () => {
    const { Agent } = await import('@strands-agents/sdk');
    createMaxHeightAgent({ config });
    expect(Agent).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: 'You are Max Height...',
        printer: false,
      }),
    );
  });

  it('registers news, weather, and web search tools', async () => {
    const { Agent } = await import('@strands-agents/sdk');
    createMaxHeightAgent({ config });
    const call = (Agent as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0];
    expect(call.tools).toHaveLength(3);
  });

  it('passes displayAlias to buildSystemPrompt', async () => {
    const { buildSystemPrompt } = await import('../src/personality/systemPrompt.js');
    createMaxHeightAgent({ displayAlias: 'TestUser', config });
    expect(buildSystemPrompt).toHaveBeenCalledWith({ displayAlias: 'TestUser' });
  });
});
