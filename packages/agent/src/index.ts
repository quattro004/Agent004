import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Agent } from '@strands-agents/sdk';
import { BedrockModel } from '@strands-agents/sdk/models/bedrock';
import { tool } from '@strands-agents/sdk';
import type { JSONValue } from '@strands-agents/sdk';
import { buildSystemPrompt } from './personality/systemPrompt.js';
import { probeBedrockRuntime } from './bedrock/warmup.js';
import { newsToolSchema, fetchNews } from './tools/newsTool.js';
import { weatherToolSchema, fetchWeather } from './tools/weatherTool.js';
import { webSearchToolSchema, fetchWebSearch } from './tools/webSearchTool.js';
import { startSpan, endSpan } from './handlers/observability.js';
import { readModelUsage } from './spend/usage.js';
import { loadRuntimeConfig, type RuntimeConfig } from './config/runtimeConfig.js';
import {
  readBoundedBody,
  BodyTooLargeError,
  invokeLimitsFor,
  registerTurnLimits,
} from './limits/turnLimits.js';
import {
  createSession,
  checkSessionCaps,
  endSession,
  type Session,
} from './handlers/sessionManager.js';

const PORT = 8080;

/**
 * AgentCore Runtime V2 snapshots the process on the first healthy `/ping` and
 * inherits that snapshot on every later instance. `/ping` must therefore stay
 * unhealthy until `initialize()` has constructed and exercised the Bedrock
 * client, so endpoint and credential resolution land inside the snapshot.
 */
let isReady = false;

/** Set by `initialize()`; nothing may serve traffic before it exists. */
let runtimeConfig: RuntimeConfig | undefined;

export function getRuntimeConfig(): RuntimeConfig {
  if (!runtimeConfig) throw new Error('Runtime configuration read before initialize() resolved');
  return runtimeConfig;
}

/** Initialization must fail loudly rather than retry past this deadline. */
const INIT_DEADLINE_MS = 120_000;

// In-memory session store. Lives for the lifetime of this container instance.
// Sessions are short-lived (≤30 min per FR-010), so losing them on restart is
// acceptable.
const sessions = new Map<string, Session>();

/** The friend's message is estimated at characters / 4 (spec 003 P-09). */
function estimateMessageTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * SDK stop reasons that mean we hit an approved ceiling rather than finished.
 * Limits are evaluated between turns, so the stopping call can overshoot —
 * these are refusals to continue, not proof the ceiling held exactly.
 */
const LIMIT_STOP_REASONS: Record<string, string> = {
  limitTurns: 'the per-turn model call ceiling was reached',
  limitOutputTokens: 'the per-turn generated token ceiling was reached',
  limitTotalTokens: 'the per-turn billed token ceiling was reached',
  limitStructuredOutputAttempts: 'the structured output retry ceiling was reached',
};

// --- Tool Definitions ---

const newsTool = tool({
  name: 'get_news',
  description:
    'Fetch current news headlines. Use when the user asks about news, current events, or what is happening in the world. Returns real headlines — never fabricate news.',
  inputSchema: newsToolSchema,
  callback: async (input, context) => {
    const result = await fetchNews(input, undefined, context?.cancelSignal);
    return result as unknown as JSONValue;
  },
});

const weatherTool = tool({
  name: 'get_weather',
  description:
    'Fetch current weather for a location. Use when the user asks about weather, temperature, or conditions in a specific city or region. Returns real weather data — never fabricate weather.',
  inputSchema: weatherToolSchema,
  callback: async (input, context) => {
    const result = await fetchWeather(input, undefined, context?.cancelSignal);
    return result as unknown as JSONValue;
  },
});

const webSearchTool = tool({
  name: 'web_search',
  description:
    'Search the web for current information. Use when the user asks about recent events, facts you are unsure about, or anything requiring up-to-date information beyond your training data. Returns real search results — never fabricate URLs or content.',
  inputSchema: webSearchToolSchema,
  callback: async (input, context) => {
    const result = await fetchWebSearch(input, undefined, context?.cancelSignal);
    return result as unknown as JSONValue;
  },
});

// --- Agent Factory ---

export function createMaxHeightAgent(options?: { displayAlias?: string; config?: RuntimeConfig }) {
  const config = options?.config ?? getRuntimeConfig();
  const systemPrompt = buildSystemPrompt({
    displayAlias: options?.displayAlias,
  });

  const model = new BedrockModel({
    modelId: config.modelId,
    maxTokens: config.maxOutputTokens,
  });

  const agent = new Agent({
    model,
    tools: [newsTool, weatherTool, webSearchTool],
    systemPrompt,
    printer: false,
  });

  // `limits` bounds model calls and tokens, but the SDK has no tool-execution
  // ceiling and no result size bound, so both are enforced with hooks.
  registerTurnLimits(agent, config.limits);

  return agent;
}

// --- HTTP Server ---

function handlePing(_req: IncomingMessage, res: ServerResponse): void {
  if (!isReady) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'initializing' }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'healthy' }));
}

async function handleInvocations(req: IncomingMessage, res: ServerResponse): Promise<void> {
  startSpan('session.cold_start');

  const config = getRuntimeConfig();
  const { limits } = config;

  // The size gate runs while reading, before anything is parsed, so an
  // oversized payload cannot make us buffer or deserialize it.
  let body: string;
  try {
    body = await readBoundedBody(req, limits.requestBodyMaxBytes);
  } catch (err) {
    if (err instanceof BodyTooLargeError) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'request_too_large', limitBytes: err.limitBytes }));
      endSpan('session.cold_start', { refused: 'request_too_large' });
      return;
    }
    throw err;
  }

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

  const message = parsed.message ?? 'Hello';
  if (message.length > config.messageMaxChars) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'message_too_long', limitChars: config.messageMaxChars }));
    endSpan('session.cold_start', { refused: 'message_too_long' });
    return;
  }

  // Get-or-create the per-session record. We key off sessionId from the
  // request; if missing, we mint one and surface it back to the client so
  // subsequent turns share the same token/turn budget. The identifier gates
  // that budget, so it comes from a cryptographic source — a Math.random()
  // id is guessable, which would let a caller ride someone else's session.
  const sessionId = parsed.sessionId ?? `s-${randomUUID()}`;
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
        reason: capCheck.reason ?? 'unknown',
        sessionId,
      }),
    );
    endSpan('session.cold_start', { capExceeded: capCheck.reason ?? 'unknown' });
    return;
  }

  const agent = createMaxHeightAgent({ displayAlias: parsed.displayAlias, config });

  // A guest who closes the tab mid-turn must stop costing us tokens. The
  // response emitting 'close' before it has finished writing is Node's signal
  // that the client went away, not that we completed. Constitution P2.
  const cancellation = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) cancellation.abort();
  });

  // The turn deadline covers model, tool and voice work together. Reaching it
  // is not successful completion, and the work already billed is still counted.
  let deadlineExceeded = false;
  const deadline = setTimeout(() => {
    deadlineExceeded = true;
    cancellation.abort();
  }, limits.deadlineMs);

  // Stream the response
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  startSpan('reply.first_token', { sessionId });
  let firstTokenEmitted = false;

  try {
    const remainingGeneratedTokens = Math.max(0, config.sessionMaxTokens - session.tokenCount);
    const result = await agent.invoke(message, {
      cancelSignal: cancellation.signal,
      limits: invokeLimitsFor(limits, { remainingGeneratedTokens }),
    });

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

    // Conversational tokens: this invocation's outputTokens plus the estimated
    // message, not the reused Agent's lifetime usage. This runs before the
    // limit-stop check, because work that was billed is counted whether or not
    // the turn produced a usable reply.
    const usage = readModelUsage(result);
    const tokensThisTurn = usage.outputTokens + estimateMessageTokens(parsed.message ?? '');
    sessions.set(sessionId, {
      ...session,
      turnCount: session.turnCount + 1,
      tokenCount: session.tokenCount + tokensThisTurn,
      state: 'ACTIVE',
    });

    const limitStop = LIMIT_STOP_REASONS[(result as { stopReason?: string })?.stopReason ?? ''];
    if (limitStop) {
      // A truncated answer presented as a finished one is a lie to the friend
      // and hides that we hit a spend ceiling.
      res.write(
        `data: ${JSON.stringify({
          type: 'error',
          error: `Turn stopped on ${(result as { stopReason?: string }).stopReason}: ${limitStop}`,
          sessionId,
        })}\n\n`,
      );
      return;
    }

    res.write(`data: ${JSON.stringify({ type: 'text', content: text, sessionId })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'done', sessionId })}\n\n`);
  } catch (err) {
    if (deadlineExceeded) {
      res.write(
        `data: ${JSON.stringify({
          type: 'error',
          error: `Turn exceeded the ${limits.deadlineMs}ms deadline and was cancelled`,
          sessionId,
        })}\n\n`,
      );
    } else if (!cancellation.signal.aborted) {
      // An aborted turn is a guest who left, not a failure: there is no one to
      // report it to and the socket is already gone.
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      res.write(`data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`);
    }
  } finally {
    clearTimeout(deadline);
    endSpan(
      'session.cold_start',
      deadlineExceeded
        ? { deadlineExceeded: 'true' }
        : cancellation.signal.aborted
          ? { cancelled: 'true' }
          : undefined,
    );
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
  /** Seeds the config the handler would otherwise get from `initialize()`. */
  setRuntimeConfig(config: RuntimeConfig | undefined) {
    runtimeConfig = config;
  },
};

const server = createServer(requestHandler);

/**
 * Warm the Bedrock/Strands client so endpoint resolution, credential
 * resolution and the connection pool are captured by the V2 snapshot instead
 * of being paid for on every restored instance.
 *
 * Constructing the client is not enough — the SDK does that work lazily, so it
 * only lands in the snapshot if something drives it. `probeBedrockRuntime()`
 * issues one real, zero-token request for that purpose; see the rationale in
 * `src/bedrock/warmup.ts`.
 */
async function warmBedrockClient(): Promise<void> {
  createMaxHeightAgent();
  await probeBedrockRuntime();
}

/**
 * Explicit async initialization. Until this resolves, `/ping` answers 503,
 * so AgentCore cannot snapshot a half-built process.
 *
 * Failure is surfaced, never retried silently — a snapshot taken from a
 * degraded process would be inherited by every later instance.
 */
export async function initialize(): Promise<void> {
  if (isReady) return;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Agent initialization exceeded ${INIT_DEADLINE_MS}ms deadline`)),
      INIT_DEADLINE_MS,
    );
  });

  try {
    await Promise.race([
      (async () => {
        runtimeConfig = await loadRuntimeConfig();
        await warmBedrockClient();
      })(),
      deadline,
    ]);
    isReady = true;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Only start the HTTP listener when not running under a test runner. Test
// files import this module to access createMaxHeightAgent and the __test
// helpers; if we listened unconditionally, parallel test files would race
// for port 8080 and fail with EADDRINUSE.
const isTestEnvironment = process.env.VITEST !== undefined || process.env.NODE_ENV === 'test';

export function start(options: { port?: number; exit?: (code: number) => void } = {}): {
  server: Server;
  ready: Promise<void>;
} {
  const { port = PORT, exit = (code: number) => process.exit(code) } = options;
  // Listen first so AgentCore's health checks get 503, not a refused
  // connection, while initialization runs (T015).
  server.listen(port, () => {
    console.log(`Max Height agent listening on port ${port}`);
  });
  const ready = initialize().catch((err: unknown) => {
    console.error('Agent initialization failed; refusing to serve traffic:', err);
    server.close();
    exit(1);
  });
  return { server, ready };
}

if (!isTestEnvironment) start();
