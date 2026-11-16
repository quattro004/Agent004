import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { Agent, SlidingWindowConversationManager } from '@strands-agents/sdk';
import { BedrockModel } from '@strands-agents/sdk/models/bedrock';
import { tool } from '@strands-agents/sdk';
import type { JSONValue } from '@strands-agents/sdk';
import { PollyClient } from '@aws-sdk/client-polly';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { buildSystemPrompt } from './personality/systemPrompt.js';
import { probeBedrockRuntime } from './bedrock/warmup.js';
import { newsToolSchema, fetchNews } from './tools/newsTool.js';
import { weatherToolSchema, fetchWeather } from './tools/weatherTool.js';
import { webSearchToolSchema, fetchWebSearch } from './tools/webSearchTool.js';
import { startSpan, endSpan } from './handlers/observability.js';
import { readModelUsage, computeTurnUsage } from './spend/usage.js';
import { checkBreaker, recordTurnSpend, BreakerReadError } from './spend/breaker.js';
import { ControlTable } from './session/controlTable.js';
import { readVerifiedClaims, InvalidTokenError } from './identity/jwtClaims.js';
import { loadRuntimeConfig, type RuntimeConfig } from './config/runtimeConfig.js';
import { SseStream, type SessionLifecycleState, type SseErrorCode } from './transport/sse.js';
import { AgentRegistry } from './session/agentRegistry.js';
import { synthesizeToAudioEvents, PollySynthesisError } from './voice/pollyStream.js';
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

// In-memory session store, keyed by the verified `sub`: a friend has at most
// one active counted session (P-05). It lives for the lifetime of this
// container instance, which is acceptable while sessions are short-lived
// (≤30 min per FR-010). T090 moves it to the control table, where it survives
// an instance and holds across the several instances serving one friend.
const sessions = new Map<string, Session>();

/**
 * Which `sub` owns each runtime session ID. The browser mints that ID itself,
 * so without this a friend who learned another's could evict their in-flight
 * conversation from this instance's registry. It routes to a microVM and must
 * never select whose budget is spent (transport-sse.md § Request).
 */
const runtimeSessionOwners = new Map<string, string>();

/**
 * One `Agent` per runtime session, so a friend's conversation history is not
 * rebuilt on every turn and never leaks into another friend's reply.
 */
let registry: AgentRegistry<Agent> | undefined;

function agentRegistry(config: RuntimeConfig): AgentRegistry<Agent> {
  registry ??= new AgentRegistry<Agent>({
    create: () => createMaxHeightAgent({ config }),
  });
  return registry;
}

/** One Polly client per process, so its connection pool is reused. */
let polly: PollyClient | undefined;

function pollyClient(config: RuntimeConfig): PollyClient {
  polly ??= new PollyClient({ region: config.awsRegion });
  return polly;
}

/**
 * The part of the control table the invocation path uses: the halt the hard
 * stop writes, and the month's spend tally the breaker reads and adds to.
 */
export interface InvocationControlTable {
  getHalt: ControlTable['getHalt'];
  getSpend: ControlTable['getSpend'];
  addSpend: ControlTable['addSpend'];
  getFriend: ControlTable['getFriend'];
  getAllow: ControlTable['getAllow'];
  consumeRate: ControlTable['consumeRate'];
  recordFriendSeen: ControlTable['recordFriendSeen'];
}

let control: InvocationControlTable | undefined;

/**
 * Added to the session cap when setting `SESSION#<sub>.ttl` — cleanup only,
 * never expiry (spec.md § Session 2026-11-15, approved 15-minute grace).
 */
const SESSION_TTL_GRACE_MINUTES = 15;

function controlTable(config: RuntimeConfig): InvocationControlTable {
  control ??= new ControlTable({
    client: new DynamoDBClient({ region: config.awsRegion }),
    tableName: config.controlTableName,
    sessionMaxMinutes: config.sessionMaxMinutes,
    sessionTtlGraceMinutes: SESSION_TTL_GRACE_MINUTES,
    rateLimitPerHour: config.rateLimitPerHour,
    rateLimitPerDay: config.rateLimitPerDay,
  });
  return control;
}

/** The friend's message is estimated at characters / 4 (spec 003 P-09). */
function estimateMessageTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Whether a counted session may open for this subject (FR-042;
 * contracts/auth-and-allowlist.md § Runtime check).
 *
 * `FRIEND#<sub>` is read first because the bearer is a Cognito *access* token
 * and carries no email claim (deviation C16), so the friend record is the only
 * way to learn which allow item to look for. Either one missing is the same
 * answer, and so is a read that fails: an allowlist we cannot read is one we
 * must assume excludes the caller.
 */
async function admitToNewSession(
  table: InvocationControlTable,
  sub: string,
): Promise<SseErrorCode | undefined> {
  try {
    const friend = await table.getFriend(sub);
    if (!friend) return 'not_allowlisted';
    const allow = await table.getAllow(friend.email);
    if (!allow) return 'not_allowlisted';
    return undefined;
  } catch (err) {
    console.error('Could not read the allowlist:', err);
    return 'internal';
  }
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
    const result = await fetchNews(input, {
      apiKey: getRuntimeConfig().secrets.newsApiKey,
      signal: context?.cancelSignal,
    });
    return result as unknown as JSONValue;
  },
});

const weatherTool = tool({
  name: 'get_weather',
  description:
    'Fetch current weather for a location. Use when the user asks about weather, temperature, or conditions in a specific city or region. Returns real weather data — never fabricate weather.',
  inputSchema: weatherToolSchema,
  callback: async (input, context) => {
    const result = await fetchWeather(input, {
      apiKey: getRuntimeConfig().secrets.weatherApiKey,
      signal: context?.cancelSignal,
    });
    return result as unknown as JSONValue;
  },
});

const webSearchTool = tool({
  name: 'web_search',
  description:
    'Search the web for current information. Use when the user asks about recent events, facts you are unsure about, or anything requiring up-to-date information beyond your training data. Returns real search results — never fabricate URLs or content.',
  inputSchema: webSearchToolSchema,
  callback: async (input, context) => {
    const config = getRuntimeConfig();
    const result = await fetchWebSearch(input, {
      apiKey: config.secrets.searchApiKey,
      engineId: config.secrets.searchEngineId,
      signal: context?.cancelSignal,
    });
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
    // The SDK's current default is also a 40-message sliding window, so an
    // omitted option looks identical today — and would change silently if the
    // SDK's default ever moved. N2 chose 40; passing it makes it ours.
    conversationManager: new SlidingWindowConversationManager({ windowSize: 40 }),
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
  startSpan('invocation');

  const config = getRuntimeConfig();
  const { limits } = config;
  const sse = new SseStream(res);

  // Filled in as we learn them, and reported on the `invocation` span whatever
  // path the turn takes.
  let outcome = 'internal';
  let countedSessionId = '';
  let cancelled = false;

  try {
    // Identity first: it is free to check, and an unauthenticated caller
    // should not get us to buffer a body at all. The inbound JWT authorizer
    // has already validated the signature, so a request arriving without a
    // usable subject is a misconfiguration, not a friend to be served
    // anonymously (#55, FR-010).
    let sub: string;
    try {
      sub = readVerifiedClaims(req.headers).sub;
    } catch (err) {
      if (!(err instanceof InvalidTokenError)) throw err;
      outcome = sse.fail('internal');
      return;
    }

    // The size gate runs while reading, before anything is parsed, so an
    // oversized payload cannot make us buffer or deserialize it. The only
    // friend-controlled part of the body is the message, so that is the
    // remedy worth showing.
    let body: string;
    try {
      body = await readBoundedBody(req, limits.requestBodyMaxBytes);
    } catch (err) {
      if (!(err instanceof BodyTooLargeError)) throw err;
      outcome = sse.fail('message_too_long');
      return;
    }

    // `sessionId` and `actorId` are deliberately absent: identity comes from
    // the token and the counted session is the server's to choose, so a field
    // we never read should not look like one we might.
    let parsed: {
      message?: string;
      action?: string;
      displayAlias?: string;
      greetingId?: string;
      voice?: 'on' | 'off';
    };
    try {
      parsed = JSON.parse(body);
    } catch {
      outcome = sse.fail('invalid_request');
      return;
    }

    // The halt comes before anything else the body says, including the
    // action dispatch: a stopped system should not be arguing about the
    // request (FR-018). The runtime reads it on every request, so it takes
    // effect without waiting for the deny policy to propagate.
    const table = controlTable(config);
    try {
      const halt = await table.getHalt();
      if (halt) {
        console.warn(`Refusing: halted at ${halt.haltedAt} (${halt.reason})`);
        outcome = sse.fail('halted');
        return;
      }
    } catch (err) {
      // Fail closed: a halt we cannot read is a halt we must assume.
      console.error('Could not read the halt:', err);
      outcome = sse.fail('internal');
      return;
    }

    if (parsed.action !== undefined) {
      outcome = await handleAction(parsed.action, sse);
      return;
    }

    const message = parsed.message?.trim() ?? '';
    if (!message) {
      outcome = sse.fail('invalid_request');
      return;
    }
    if (message.length > config.messageMaxChars) {
      outcome = sse.fail('message_too_long');
      return;
    }

    // Get-or-create the counted session. A friend has at most one, keyed to
    // the verified subject, so no client-supplied value can reach another
    // friend's turn and token allowance (P-05, FR-011).
    const runtimeSessionId = runtimeSessionIdFrom(req);
    const owner = runtimeSessionOwners.get(runtimeSessionId);
    if (owner !== undefined && owner !== sub) {
      outcome = sse.fail('session_mismatch');
      return;
    }

    const existing = sessions.get(sub);
    const session0 =
      existing ?? createSession({ actorId: sub, greetingId: parsed.greetingId ?? 'default' });
    let session = session0;
    const opened = existing === undefined;

    if (opened) {
      // FR-042: the second gate. Cognito's triggers refuse a stranger at
      // sign-in and at every refresh, but an access token stays valid for an
      // hour after the builder removes someone, so a *new* conversation is
      // checked against the list here. A conversation already underway is not
      // re-checked; spec 001's 30-minute cap ends it
      // (contracts/auth-and-allowlist.md § Revocation timeline).
      const refusal = await admitToNewSession(table, sub);
      if (refusal) {
        outcome = sse.fail(refusal);
        return;
      }
      sessions.set(sub, session);

      // The pruner reads this stamp to decide whose memory has gone cold
      // (FR-056). Losing one write only delays that, so it must not cost a
      // friend their conversation — but it is never swallowed silently.
      try {
        await table.recordFriendSeen(sub, new Date());
      } catch (err) {
        console.error('Could not stamp lastSeenAt:', err);
      }
    }
    countedSessionId = session.sessionId;

    // FR-012: the windows bound the friend, where the caps below bound one
    // conversation. A friend who ends a session gets fresh caps; they do not
    // get a fresh hour. The write is conditional inside `consumeRate`, so a
    // message refused here is not counted against the window
    // (contracts/transport-sse.md § Refusal order, step 4).
    let rate;
    try {
      rate = await table.consumeRate(sub, new Date());
    } catch (err) {
      console.error('Could not read the rate-limit windows:', err);
      outcome = sse.fail('internal');
      return;
    }
    if (!rate.allowed) {
      outcome = sse.fail('rate_limited');
      return;
    }

    // Constitution P2 / FR-010: enforce the per-session hard caps before
    // invoking the model. Without this gate one friend could blow past the
    // token, turn and duration limits.
    const capCheck = checkSessionCaps(session);
    if (capCheck.exceeded) {
      sessions.set(sub, endSession(session, 'cap_reached'));
      outcome = sse.fail('session_cap_exceeded');
      return;
    }

    // The month's tally is read last among the refusals, because it is the
    // only one that costs a network call (contracts/spend-control.md
    // § Breaker). It fails closed: a turn we cannot price is a turn we do not
    // run.
    const turnStartedAt = new Date();
    let breaker;
    try {
      breaker = await checkBreaker({
        table,
        limits: {
          degradeMicroUsd: config.breakerDegradeMicroUsd,
          tripMicroUsd: config.breakerTripMicroUsd,
        },
        now: turnStartedAt,
      });
    } catch (err) {
      if (!(err instanceof BreakerReadError)) throw err;
      console.error(err.message);
      outcome = sse.fail('internal');
      return;
    }
    if (breaker.state === 'tripped') {
      outcome = sse.fail('breaker_tripped');
      return;
    }

    // The browser decides whether it wants audio; synthesizing for a muted
    // friend is spend with no listener. A degraded breaker is the second
    // reason to answer "off": the reply still arrives, as text.
    const voiceEnabled = parsed.voice !== 'off' && breaker.state !== 'degraded';
    sse.send({
      type: 'session',
      countedSessionId,
      opened,
      voice: voiceEnabled ? 'on' : 'off',
    });

    const agent = agentRegistry(config).acquire(runtimeSessionId, countedSessionId) as Agent;
    runtimeSessionOwners.set(runtimeSessionId, sub);

    // A friend who closes the tab mid-turn must stop costing us tokens. The
    // response emitting 'close' before it has finished writing is Node's
    // signal that the client went away, not that we completed.
    const cancellation = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) cancellation.abort();
    });

    // The turn deadline covers model, tool and voice work together. Reaching
    // it is not completion, and work already billed is still counted.
    let deadlineExceeded = false;
    const deadline = setTimeout(() => {
      deadlineExceeded = true;
      cancellation.abort();
    }, limits.deadlineMs);

    startSpan('first_token');
    startSpan('reply.complete');
    let firstTokenSeen = false;
    let reply = '';
    let pollyCharacters = 0;
    // Set the moment the model reports usage, so a turn that fails afterwards
    // is still counted: the tokens were billed either way.
    let modelUsage: ReturnType<typeof readModelUsage> | undefined;

    try {
      const remainingGeneratedTokens = Math.max(0, config.sessionMaxTokens - session.tokenCount);
      const stream = agent.stream(message, {
        cancelSignal: cancellation.signal,
        limits: invokeLimitsFor(limits, { remainingGeneratedTokens }),
      });

      // `stream()` *returns* the AgentResult rather than yielding it, so the
      // iterator is driven by hand: a `for await` would discard it.
      let step = await stream.next();
      while (!step.done) {
        const delta = textDeltaOf(step.value);
        if (delta) {
          if (!firstTokenSeen) {
            endSpan('first_token');
            firstTokenSeen = true;
          }
          reply += delta;
          sse.send({ type: 'text', delta });
        }
        step = await stream.next();
      }
      const result = step.value;

      // Conversational tokens: this invocation's outputTokens plus the
      // estimated message, not the reused Agent's lifetime usage. This runs
      // before the limit-stop check, because work that was billed is counted
      // whether or not the turn produced a usable reply.
      const usage = readModelUsage(result);
      modelUsage = usage;
      session = {
        ...session,
        turnCount: session.turnCount + 1,
        tokenCount: session.tokenCount + usage.outputTokens + estimateMessageTokens(message),
        state: 'ACTIVE',
      };
      sessions.set(sub, session);

      const stopReason = (result as { stopReason?: string } | undefined)?.stopReason ?? '';
      if (LIMIT_STOP_REASONS[stopReason]) {
        // A truncated answer presented as a finished one is a lie to the
        // friend and hides that we hit a spend ceiling. The reason names an
        // internal ceiling, so it goes to the log, not to the browser.
        console.warn(`Turn stopped early: ${LIMIT_STOP_REASONS[stopReason]}`);
        outcome = sse.fail('session_cap_exceeded');
        return;
      }

      // Voice runs once the text is complete. The segments still reach the
      // browser before `done`, so playback starts without waiting for the
      // whole turn to settle.
      if (reply) {
        startSpan('audio.first_chunk');
        let firstChunkSeen = false;
        const synthesis = await synthesizeToAudioEvents(reply, {
          client: pollyClient(config),
          voice: {
            voiceId: config.pollyVoiceId,
            engine: config.pollyEngine,
            sampleRate: config.pollySampleRate,
          },
          voiceEnabled,
          signal: cancellation.signal,
          onAudio: (event) => {
            if (!firstChunkSeen) {
              endSpan('audio.first_chunk');
              firstChunkSeen = true;
            }
            sse.send({ type: 'audio', ...event });
          },
        });
        pollyCharacters = synthesis.pollyCharacters;
      }

      outcome = 'done';
      sse.send({ type: 'done', turnsUsed: session.turnCount, state: lifecycleStateOf(session) });
    } catch (err) {
      cancelled = cancellation.signal.aborted;
      if (err instanceof PollySynthesisError) {
        // Polly already billed for part of the reply; the text the friend can
        // read is worth more than a refusal, so the turn still completes.
        pollyCharacters = err.pollyCharacters;
        outcome = 'done';
        sse.send({ type: 'done', turnsUsed: session.turnCount, state: lifecycleStateOf(session) });
      } else if (deadlineExceeded) {
        console.warn(`Turn abandoned at the ${limits.deadlineMs}ms deadline`);
        outcome = sse.fail('session_cap_exceeded');
      } else if (!cancelled) {
        console.error('Turn failed:', err);
        outcome = sse.fail('internal');
      } else {
        // A friend who left: there is no one to report it to, and the socket
        // is already gone.
        outcome = 'cancelled';
      }
    } finally {
      clearTimeout(deadline);
      // The breaker's other half: every turn that reached the model is added
      // to the month, whether it finished, failed or was abandoned. A failed
      // write is loud but does not fail the turn the friend already received.
      if (modelUsage) {
        const turnUsage = computeTurnUsage(
          {
            model: modelUsage,
            pollyCharacters,
            memoryEvents: 0,
            memoryRetrievals: 0,
          },
          config.prices,
        );
        await recordTurnSpend({ table, now: turnStartedAt }, turnUsage.estimatedMicroUsd);
      }
      endSpan('reply.complete', {
        inputTokens: String(session.tokenCount),
        pollyCharacters: String(pollyCharacters),
      });
      if (!firstTokenSeen) endSpan('first_token');
    }
  } finally {
    endSpan('invocation', { countedSessionId, outcome, cancelled: String(cancelled) });
    sse.end();
  }
}

/**
 * Actions are friend-facing memory operations, not chat turns. The dispatch
 * itself arrives with US4 (memory-api.md § Friend-facing operations); until
 * then a known action is refused honestly rather than reported as unknown.
 */
const KNOWN_ACTIONS = new Set(['memory.list', 'memory.export', 'memory.delete', 'memory.forget']);

async function handleAction(action: string, sse: SseStream): Promise<string> {
  if (!KNOWN_ACTIONS.has(action)) return sse.fail('invalid_request');
  return sse.fail('internal');
}

/**
 * The two states the browser is told about. A session mid-conversation is
 * `ACTIVE`; a session the server has ended is reported as Max's in-character
 * sign-off, which is what tells the browser the next message opens a fresh
 * counted session. `sessionManager`'s wider state machine is spec 001's and
 * is reworked by T090.
 */
function lifecycleStateOf(session: Session): SessionLifecycleState {
  return session.state === 'ENDED' ? 'SIGNED_OFF' : 'ACTIVE';
}

/** Pulls the text out of a model stream event, or `undefined` for anything else. */
function textDeltaOf(event: unknown): string | undefined {
  const wrapper = event as { type?: string; event?: { type?: string; delta?: unknown } };
  if (wrapper?.type !== 'modelStreamUpdateEvent') return undefined;
  if (wrapper.event?.type !== 'modelContentBlockDeltaEvent') return undefined;
  const delta = wrapper.event.delta as { type?: string; text?: string } | undefined;
  return delta?.type === 'textDelta' ? delta.text : undefined;
}

function runtimeSessionIdFrom(req: IncomingMessage): string {
  const header = req.headers['x-amzn-bedrock-agentcore-runtime-session-id'];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) {
    throw new Error('AgentCore did not supply a runtime session ID header');
  }
  return value;
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
  createMaxHeightAgent,
  /** Clears every piece of per-instance state a test could carry over. */
  reset() {
    sessions.clear();
    runtimeSessionOwners.clear();
    registry = undefined;
    polly = undefined;
    control = undefined;
  },
  /** Supplies the control table, so no test reaches DynamoDB. */
  setControlTable(table: InvocationControlTable | undefined) {
    control = table;
  },
  /** Seeds the config the handler would otherwise get from `initialize()`. */
  setRuntimeConfig(config: RuntimeConfig | undefined) {
    runtimeConfig = config;
    // The registry and Polly client capture configuration, so a test that
    // changes it must not keep the ones built from the old values.
    registry = undefined;
    polly = undefined;
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
