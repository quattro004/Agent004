import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { Agent } from '@strands-agents/sdk';
import { BedrockModel } from '@strands-agents/sdk/models/bedrock';
import { tool } from '@strands-agents/sdk';
import type { JSONValue } from '@strands-agents/sdk';
import { buildSystemPrompt } from './personality/systemPrompt.js';
import { newsToolSchema, fetchNews } from './tools/newsTool.js';
import { weatherToolSchema, fetchWeather } from './tools/weatherTool.js';
import { startSpan, endSpan } from './handlers/observability.js';

const PORT = 8080;

// --- Tool Definitions ---

const newsTool = tool({
  name: 'get_news',
  description:
    'Fetch current news headlines. Use when the user asks about news, current events, or what is happening in the world. Returns real headlines — never fabricate news.',
  inputSchema: newsToolSchema,
  callback: async (input) => {
    const result = await fetchNews(input);
    return result as unknown as JSONValue;
  },
});

const weatherTool = tool({
  name: 'get_weather',
  description:
    'Fetch current weather for a location. Use when the user asks about weather, temperature, or conditions in a specific city or region. Returns real weather data — never fabricate weather.',
  inputSchema: weatherToolSchema,
  callback: async (input) => {
    const result = await fetchWeather(input);
    return result as unknown as JSONValue;
  },
});

// --- Agent Factory ---

export function createMaxHeightAgent(options?: { displayAlias?: string }) {
  const systemPrompt = buildSystemPrompt({
    displayAlias: options?.displayAlias,
  });

  const model = new BedrockModel({
    modelId: 'global.anthropic.claude-haiku-4-5-20251001-v1:0',
    maxTokens: 250,
  });

  const agent = new Agent({
    model,
    tools: [newsTool, weatherTool],
    systemPrompt,
    printer: false,
  });

  return agent;
}

// --- HTTP Server ---

function handlePing(_req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'healthy' }));
}

async function handleInvocations(req: IncomingMessage, res: ServerResponse): Promise<void> {
  startSpan('session.cold_start');

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const body = Buffer.concat(chunks).toString('utf-8');

  let parsed: { message?: string; displayAlias?: string };
  try {
    parsed = JSON.parse(body);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON' }));
    endSpan('session.cold_start');
    return;
  }

  const agent = createMaxHeightAgent({ displayAlias: parsed.displayAlias });

  // Stream the response
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  startSpan('reply.first_token');
  let firstTokenEmitted = false;

  try {
    const result = await agent.invoke(parsed.message ?? 'Hello');

    // Extract text from the result
    const text = result?.lastMessage?.content
      ?.filter((block) => block.type === 'textBlock')
      ?.map((block) => ('text' in block ? (block as { text: string }).text : ''))
      ?.join('') ?? '';

    if (!firstTokenEmitted) {
      endSpan('reply.first_token');
      firstTokenEmitted = true;
    }

    res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    res.write(`data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`);
  } finally {
    endSpan('session.cold_start');
    res.end();
  }
}

function requestHandler(req: IncomingMessage, res: ServerResponse): void {
  const { method, url } = req;

  if (method === 'GET' && url === '/ping') {
    handlePing(req, res);
  } else if (method === 'POST' && url === '/invocations') {
    handleInvocations(req, res).catch((err) => {
      console.error('Invocation error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
}

const server = createServer(requestHandler);

server.listen(PORT, () => {
  console.log(`Max Height agent listening on port ${PORT}`);
});
