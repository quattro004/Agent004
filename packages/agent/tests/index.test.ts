import { describe, it, expect, vi } from 'vitest';

// Mock the SDK to avoid real AWS calls
vi.mock('@strands-agents/sdk', () => {
  const Agent = vi.fn().mockImplementation((config) => ({
    config,
    invoke: vi.fn().mockResolvedValue({
      lastMessage: {
        content: [{ type: 'textBlock', text: 'Hello from Max Height!' }],
      },
    }),
  }));
  const tool = vi.fn().mockImplementation((config) => ({ ...config, __tool: true }));
  return { Agent, tool };
});

vi.mock('@strands-agents/sdk/models/bedrock', () => {
  const BedrockModel = vi.fn().mockImplementation((config) => ({ ...config, __model: true }));
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

describe('createMaxHeightAgent', () => {
  it('creates an agent with BedrockModel using correct model ID and max tokens', async () => {
    const { BedrockModel } = await import('@strands-agents/sdk/models/bedrock');
    createMaxHeightAgent();
    expect(BedrockModel).toHaveBeenCalledWith({
      modelId: 'global.anthropic.claude-haiku-4-5-20251001-v1:0',
      maxTokens: 250,
    });
  });

  it('creates agent with system prompt from buildSystemPrompt', async () => {
    const { Agent } = await import('@strands-agents/sdk');
    createMaxHeightAgent();
    expect(Agent).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: 'You are Max Height...',
        printer: false,
      }),
    );
  });

  it('registers news and weather tools', async () => {
    const { Agent } = await import('@strands-agents/sdk');
    createMaxHeightAgent();
    const call = (Agent as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0];
    expect(call.tools).toHaveLength(2);
  });

  it('passes displayAlias to buildSystemPrompt', async () => {
    const { buildSystemPrompt } = await import('../src/personality/systemPrompt.js');
    createMaxHeightAgent({ displayAlias: 'TestUser' });
    expect(buildSystemPrompt).toHaveBeenCalledWith({ displayAlias: 'TestUser' });
  });
});
