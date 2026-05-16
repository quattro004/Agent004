import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { Agent } from '@strands-agents/sdk';
import { BedrockModel } from '@strands-agents/sdk/models/bedrock';
import { tool } from '@strands-agents/sdk';
import type { JSONValue } from '@strands-agents/sdk';
import { buildSystemPrompt } from './personality/systemPrompt.js';
import { newsToolSchema, fetchNews } from './tools/newsTool.js';
import { weatherToolSchema, fetchWeather } from './tools/weatherTool.js';
import { webSearchToolSchema, fetchWebSearch } from './tools/webSearchTool.js';
import { startSpan, endSpan } from './handlers/observability.js';
import {
  createSession,
  checkSessionCaps,
  endSession,
  type Session,
} from './handlers/sessionManager.js';

const PORT = 8080;

// In-memory session store. Lives for the lifetime of the Lambda execution
// environment (i.e., across warm invocations). Cold starts wipe it, which
// is acceptable — sessions are short-lived (≤30 min per FR-010).
const sessions = new Map<string, Session>();

/** Rough char→token estimate when the SDK does not report usage directly. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Extract token usage from a Strands result if the SDK reported it. */
function extractUsage(result: unknown): number | null {
  if (typeof result !== 'object' || result === null) return null;
  const usage = (result as { usage?: { totalTokens?: number } }).usage;
  if (usage && typeof usage.totalTokens === 'number') {
    return usage.totalTokens;
  }
  return null;
}

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

const webSearchTool = tool({
  name: 'web_search',
  description:
    'Search the web for current information. Use when the user asks about recent events, facts you are unsure about, or anything requiring up-to-date information beyond your training data. Returns real search results — never fabricate URLs or content.',
  inputSchema: webSearchToolSchema,
  callback: async (input) => {
    const result = await fetchWebSearch(input);
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
    tools: [newsTool, weatherTool, webSearchTool],
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

  let parsed: {
    message?: string;
    displayAlias?: string;
    sessionId?: string;
    actorId?: string;
    greetingId?: string;
  };
  try {
    parsed = JSON.parse(body);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON' }));
    endSpan('session.cold_start');
    return;
  }

  // Get-or-create the per-session record. We key off sessionId from the
  // request; if missing, we mint one and surface it back to the client so
  // subsequent turns share the same token/turn budget.
  const sessionId =
    parsed.sessionId ?? `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  let session = sessions.get(sessionId);
  if (!session) {
    session = createSession({
      actorId: parsed.actorId ?? 'anonymous',
      greetingId: parsed.greetingId ?? 'default',
    });
    session = { ...session, sessionId };
    sessions.set(sessionId, session);
  }

  // Constitution P2 / FR-010: enforce per-session hard caps before invoking
  // the model. Without this gate a single guest could blow past the 20k
  // token / 50 turn / 30 minute limits.
  const capCheck = checkSessionCaps(session);
  if (capCheck.exceeded) {
    const ended = endSession(session, 'cap_reached');
    sessions.set(sessionId, ended);
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'session_cap_exceeded',
        reason: capCheck.reason,
        sessionId,
      }),
    );
    endSpan('session.cold_start', { capExceeded: capCheck.reason ?? 'unknown' });
    return;
  }

  const agent = createMaxHeightAgent({ displayAlias: parsed.displayAlias });

  // Stream the response
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  startSpan('reply.first_token', { sessionId });
  let firstTokenEmitted = false;

  try {
    const result = await agent.invoke(parsed.message ?? 'Hello');

    // Extract text from the result
    const text =
      result?.lastMessage?.content
        ?.filter((block) => block.type === 'textBlock')
        ?.map((block) => ('text' in block ? (block as { text: string }).text : ''))
        ?.join('') ?? '';

    if (!firstTokenEmitted) {
      endSpan('reply.first_token');
      firstTokenEmitted = true;
    }

    // Account for this turn against the session caps. Prefer SDK-reported
    // usage; fall back to a char-based estimate of input + output text.
    const reportedTokens = extractUsage(result);
    const tokensThisTurn = reportedTokens ?? estimateTokens((parsed.message ?? '') + text);
    sessions.set(sessionId, {
      ...session,
      turnCount: session.turnCount + 1,
      tokenCount: session.tokenCount + tokensThisTurn,
      state: 'ACTIVE',
    });

    res.write(`data: ${JSON.stringify({ type: 'text', content: text, sessionId })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'done', sessionId })}\n\n`);
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

// Exposed for tests so they can assert/reset cap-enforcement state without
// having to issue HTTP requests against a live server.
export const __test = {
  sessions,
  requestHandler,
  handleInvocations,
};

const server = createServer(requestHandler);

// Only start the HTTP listener when not running under a test runner. Test
// files import this module to access createMaxHeightAgent and the __test
// helpers; if we listened unconditionally, parallel test files would race
// for port 8080 and fail with EADDRINUSE.
const isTestEnvironment = process.env.VITEST !== undefined || process.env.NODE_ENV === 'test';

if (!isTestEnvironment) {
  server.listen(PORT, () => {
    console.log(`Max Height agent listening on port ${PORT}`);
  });
}
