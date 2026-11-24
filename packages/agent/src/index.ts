import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import {
  Agent,
  Message,
  SlidingWindowConversationManager,
  TextBlock,
  type AgentStreamEvent,
} from '@strands-agents/sdk';
import { BedrockModel } from '@strands-agents/sdk/models/bedrock';
import { tool } from '@strands-agents/sdk';
import { PollyClient } from '@aws-sdk/client-polly';
import { BedrockAgentCoreClient } from '@aws-sdk/client-bedrock-agentcore';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { buildSystemPrompt } from './personality/systemPrompt.js';
import { probeBedrockRuntime } from './bedrock/warmup.js';
import { newsToolSchema, fetchNews } from './tools/newsTool.js';
import { weatherToolSchema, fetchWeather } from './tools/weatherTool.js';
import {
  webSearchToolSchema,
  searchForTurn,
  WebSearchTurn,
  WEB_SEARCH_TURN,
} from './tools/webSearchTool.js';
import { startSpan, endSpan, withRequestTrace } from './handlers/observability.js';
import { randomUUID } from 'node:crypto';
import { readModelUsage, computeTurnUsage, MissingUsageError } from './spend/usage.js';
import { checkBreaker, BreakerReadError } from './spend/breaker.js';
import { estimateReservationMicroUsd } from './spend/reservation.js';
import {
  ControlTable,
  type CountedSession,
  type CountedSessionWrite,
  type Lease,
} from './session/controlTable.js';
import { readVerifiedClaims, InvalidTokenError } from './identity/jwtClaims.js';
import { loadRuntimeConfig, type RuntimeConfig } from './config/runtimeConfig.js';
import { SseStream, type SessionLifecycleState, type SseErrorCode } from './transport/sse.js';
import { AgentRegistry } from './session/agentRegistry.js';
import { synthesizeToAudioEvents, PollySynthesisError } from './voice/pollyStream.js';
import { createAgentCoreMemoryClient } from './memory/agentCoreMemoryClient.js';
import {
  createMemoryAdapter,
  type MemoryAdapter,
  type MemorySearchResult,
} from './memory/memoryAdapter.js';
import {
  buildPriorSessionContext,
  PRIOR_SESSION_CONTEXT_MARKER,
} from './memory/untrustedMemoryContext.js';
import { handleDeleteMemory, handleForgetMe, handleListMemories } from './memory/memoryHandlers.js';
import {
  readBoundedBody,
  BodyTooLargeError,
  invokeLimitsFor,
  registerTurnLimits,
} from './limits/turnLimits.js';
import { evaluateSession, openSession, recordTurn } from './handlers/sessionManager.js';

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
let registry: AgentRegistry<Agent, string | undefined> | undefined;

function agentRegistry(config: RuntimeConfig): AgentRegistry<Agent, string | undefined> {
  registry ??= new AgentRegistry<Agent, string | undefined>({
    create: (_countedSessionId, displayAlias) =>
      createMaxHeightAgent({ displayAlias: displayAlias ?? undefined, config }),
  });
  return registry;
}

/** One Polly client per process, so its connection pool is reused. */
let polly: PollyClient | undefined;

function pollyClient(config: RuntimeConfig): PollyClient {
  polly ??= new PollyClient({ region: config.awsRegion });
  return polly;
}

/** One AgentCore data-plane client for web search, built on first use like Polly's. */
let webSearchClient: BedrockAgentCoreClient | undefined;

function agentCoreWebSearchClient(config: RuntimeConfig): BedrockAgentCoreClient {
  webSearchClient ??= new BedrockAgentCoreClient({ region: config.awsRegion });
  return webSearchClient;
}

/**
 * The part of the control table the invocation path uses: the halt the hard
 * stop writes, the month's spend tally the breaker reads, the admission lease
 * and counted session that make one friend's turns and the month's spend
 * agree across runtime instances, and `addSpend` for memory actions.
 */
export interface InvocationControlTable {
  getHalt: ControlTable['getHalt'];
  getSpend: ControlTable['getSpend'];
  addSpend: ControlTable['addSpend'];
  admitRequest: ControlTable['admitRequest'];
  settleRequest: ControlTable['settleRequest'];
  getSession: ControlTable['getSession'];
  putSession: ControlTable['putSession'];
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

let memory: MemoryAdapter | undefined;

function memoryAdapter(config: RuntimeConfig): MemoryAdapter {
  memory ??= createMemoryAdapter({
    memoryId: config.memoryId,
    client: createAgentCoreMemoryClient({ region: config.awsRegion }),
  });
  return memory;
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

/** The Strands stream ended in `stopReason: 'cancelled'` instead of throwing. */
class TurnCancelledError extends Error {
  constructor() {
    super('The agent stream was cancelled');
    this.name = 'TurnCancelledError';
  }
}

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
    return result;
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
    return result;
  },
});

const webSearchTool = tool({
  name: 'web_search',
  description:
    'Search the web for current information. Use when the user asks about recent events, facts you are unsure about, or anything requiring up-to-date information beyond your training data. Returns real search results — never fabricate URLs or content.',
  inputSchema: webSearchToolSchema,
  callback: async (input, context) => {
    const turn = context?.invocationState[WEB_SEARCH_TURN];
    if (!(turn instanceof WebSearchTurn)) {
      throw new Error('web_search ran without a WebSearchTurn in invocationState');
    }
    const result = await searchForTurn(input, {
      client: agentCoreWebSearchClient(getRuntimeConfig()),
      signal: context?.cancelSignal,
      turn,
    });
    return result;
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

function removePriorSessionContextFromHistory(
  agent: Agent,
  historyLength: number,
  originalMessage: string,
): void {
  const history = agent.messages;
  const input = history[historyLength];
  const firstBlock = input?.content[0];
  const firstText = firstBlock instanceof TextBlock ? firstBlock.text : undefined;
  if (
    input?.role === 'user' &&
    typeof firstText === 'string' &&
    firstText.startsWith(PRIOR_SESSION_CONTEXT_MARKER)
  ) {
    history[historyLength] = new Message({
      role: 'user',
      content: [new TextBlock(originalMessage)],
    });
  }
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

/** Each request is its own trace, so two in flight never end each other's spans. */
function handleInvocations(req: IncomingMessage, res: ServerResponse): Promise<void> {
  return withRequestTrace(() => serveInvocation(req, res));
}

async function serveInvocation(req: IncomingMessage, res: ServerResponse): Promise<void> {
  startSpan('invocation');

  const config = getRuntimeConfig();
  const { limits } = config;
  const sse = new SseStream(res);

  // Idle local agents and owner mappings are process-local. Evict them on
  // later requests, never in a background timer that could outlive AgentCore
  // invocations or add a second scheduling cost.
  const idleEvicted = registry?.evictIdle(config.sessionMaxMinutes * 60 * 1000) ?? 0;
  if (idleEvicted > 0) {
    for (const [runtimeSessionId] of runtimeSessionOwners) {
      if (registry?.lastUsedAt(runtimeSessionId) === undefined) {
        runtimeSessionOwners.delete(runtimeSessionId);
      }
    }
  }

  // Install disconnect and deadline state before session setup or memory
  // retrieval, so a friend who leaves cannot continue a billable setup phase.
  const cancellation = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) cancellation.abort();
  });
  let deadlineExceeded = false;
  const deadline = setTimeout(() => {
    deadlineExceeded = true;
    cancellation.abort();
  }, limits.deadlineMs);

  // Filled in as we learn them, and reported on the `invocation` span whatever
  // path the turn takes.
  let outcome = 'internal';
  let countedSessionId = '';
  let cancelled = false;

  // The admission lease, and what settlement will charge for it. Anything not
  // known to be cheap is charged at the full reservation: a turn we cannot
  // price is never refunded (spend-control.md § Settlement).
  let lease: Lease | undefined;
  let settleMicroUsd = 0;
  let turnStartedAt = new Date();

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
      memoryRecordId?: string;
      displayAlias?: string;
      greetingId?: string;
      voice?: 'on' | 'off';
    };
    try {
      const value: unknown = JSON.parse(body);
      if (!isInvocationBody(value)) {
        outcome = sse.fail('invalid_request');
        return;
      }
      parsed = value;
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
      if (typeof parsed.action !== 'string') {
        outcome = sse.fail('invalid_request');
        return;
      }
      outcome = await handleAction(parsed.action, parsed.memoryRecordId, sub, table, config, sse);
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

    // The counted session is the server's to choose, keyed to the verified
    // subject, so no client-supplied value can reach another friend's turn
    // and token allowance (P-05, FR-011). It is read under the admission
    // lease below.
    const runtimeSessionId = runtimeSessionIdFrom(req);
    const owner = runtimeSessionOwners.get(runtimeSessionId);
    if (owner !== undefined && owner !== sub) {
      outcome = sse.fail('session_mismatch');
      return;
    }

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

    // The month's tally is read next, because it decides voice as well as
    // refusal (contracts/spend-control.md § Breaker). It fails closed: a turn
    // we cannot price is a turn we do not run.
    turnStartedAt = new Date();
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

    // Admission commits the turn's conservative maximum to the month and
    // takes the friend's lease in one transaction, before any model call
    // (T167). A concurrent turn from the same friend, a full house, and a
    // reservation that would pass the trip threshold are all refused here, so
    // concurrency cannot spend past a ceiling that was only checked before.
    // The lease is settled to the measured spend in the outer `finally`.
    try {
      const admission = await table.admitRequest({
        sub,
        requestId: randomUUID(),
        reserveMicroUsd: estimateReservationMicroUsd({
          limits,
          maxOutputTokensPerCall: config.maxOutputTokens,
          rates: config.prices,
        }),
        spendCeilingMicroUsd: config.breakerTripMicroUsd,
        maxActiveRequests: config.maxActiveRequests,
        now: turnStartedAt,
      });
      if (!admission.admitted) {
        outcome = sse.fail(admission.reason === 'spend_limit' ? 'breaker_tripped' : 'busy');
        return;
      }
      lease = admission.lease;
    } catch (err) {
      console.error('Could not admit the request:', err);
      outcome = sse.fail('internal');
      return;
    }

    // Constitution P2 / FR-010: the counted session's caps are enforced before
    // the model runs. The session is read under the lease, so two instances
    // cannot both extend it.
    const caps = {
      maxTurns: config.sessionMaxTurns,
      maxTokens: config.sessionMaxTokens,
      maxMinutes: config.sessionMaxMinutes,
    };
    let stored: CountedSession | undefined;
    try {
      stored = await table.getSession(sub);
    } catch (err) {
      console.error('Could not read the counted session:', err);
      outcome = sse.fail('internal');
      return;
    }
    const evaluation = evaluateSession(stored, caps, turnStartedAt);

    if (evaluation.kind === 'exceeded') {
      try {
        await table.putSession(sub, withState(evaluation.session, 'SignedOff'), evaluation.session);
      } catch (err) {
        console.error('Could not sign off the capped session:', err);
        emitCountMetric('SessionWriteFailures');
      }
      outcome = sse.fail('session_cap_exceeded');
      return;
    }

    const opened = evaluation.kind === 'open';
    // Covers opening a session, from the allowlist check to the end of memory
    // retrieval. A turn in a session already open records `opened: false`.
    startSpan('session.open');
    let session: CountedSessionWrite;
    if (evaluation.kind === 'continue') {
      session = evaluation.session;
    } else {
      // FR-042: the second gate. Cognito's triggers refuse a stranger at
      // sign-in and at every refresh, but an access token stays valid for an
      // hour after the builder removes someone, so a *new* conversation is
      // checked against the list here. A conversation already underway is not
      // re-checked; the session's time cap ends it
      // (contracts/auth-and-allowlist.md § Revocation timeline).
      const refusal = await admitToNewSession(table, sub);
      if (refusal) {
        outcome = sse.fail(refusal);
        return;
      }

      session = openSession(turnStartedAt);
      try {
        await table.putSession(sub, session, stored);
      } catch (err) {
        console.error('Could not open the counted session:', err);
        outcome = sse.fail('internal');
        return;
      }

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

    // The browser decides whether it wants audio; synthesizing for a muted
    // friend is spend with no listener. A degraded breaker is the second
    // reason to answer "off": the reply still arrives, as text.
    const voiceEnabled = parsed.voice !== 'off' && breaker.state !== 'degraded';
    let memories: MemorySearchResult[] = [];
    let memoryRetrievals = 0;
    if (opened) {
      memoryRetrievals = 1;
      startSpan('memory.retrieve');
      try {
        memories = await memoryAdapter(config).retrieveMemories(
          sub,
          message,
          config.memoryTopK,
          cancellation.signal,
        );
        endSpan('memory.retrieve', { count: memories.length, failed: false });
      } catch (error) {
        emitMemoryFailureWarning('retrieve', error);
        emitCountMetric('MemoryRetrieveFailures');
        endSpan('memory.retrieve', { count: 0, failed: true });
      }
      if (cancellation.signal.aborted) {
        outcome = deadlineExceeded ? 'session_cap_exceeded' : 'cancelled';
        return;
      }
      // Retrieval was attempted, so it is billed even if nothing else runs.
      settleMicroUsd = memoryRetrievals * config.prices.memoryRetrievalMicroUsd;
    }
    if (cancellation.signal.aborted) {
      outcome = deadlineExceeded ? 'session_cap_exceeded' : 'cancelled';
      return;
    }
    endSpan('session.open', { opened });

    sse.send({
      type: 'session',
      countedSessionId,
      opened,
      voice: voiceEnabled ? 'on' : 'off',
    });

    const agent = agentRegistry(config).acquire(
      runtimeSessionId,
      countedSessionId,
      parsed.displayAlias,
    ) as Agent;
    runtimeSessionOwners.set(runtimeSessionId, sub);

    startSpan('first_token');
    startSpan('reply.complete');
    let firstTokenSeen = false;
    let reply = '';
    let pollyCharacters = 0;
    let memoryEvents = 0;
    let turnDelivered = false;
    // This turn's share of the session's search allowance (Session 2026-11-18).
    const searchTurn = new WebSearchTurn(
      Math.max(0, config.sessionMaxWebSearches - session.webSearches),
      (sources) => sse.send({ type: 'sources', sources }),
    );
    // Set the moment the model reports usage, so a turn that fails afterwards
    // is still counted: the tokens were billed either way.
    let modelUsage: ReturnType<typeof readModelUsage> | undefined;
    // Ends when `done` is written, not after the work that follows it. Ending it
    // again in the `finally` below only matters for a turn that never got that far.
    const completeReply = () =>
      endSpan('reply.complete', {
        inputTokens: modelUsage?.inputTokens ?? 0,
        outputTokens: modelUsage?.outputTokens ?? 0,
        pollyCharacters,
      });

    const memoryContext = opened ? buildPriorSessionContext(memories) : '';
    const memoryContextAdded = memoryContext !== '';
    const historyLength = agent.messages.length;
    const invocationInput =
      memoryContext === '' ? message : [{ text: memoryContext }, { text: message }];

    try {
      const remainingGeneratedTokens = Math.max(
        0,
        config.sessionMaxTokens - session.conversationalTokens,
      );
      // From here the model may bill us, and until it reports usage the only
      // safe price for the request is its full reservation.
      settleMicroUsd = lease.reservedMicroUsd;
      const stream = agent.stream(invocationInput, {
        cancelSignal: cancellation.signal,
        limits: invokeLimitsFor(limits, { remainingGeneratedTokens }),
        invocationState: { [WEB_SEARCH_TURN]: searchTurn },
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
      const stopReason = result?.stopReason ?? '';

      // Strands resolves, rather than throws, when the cancelSignal fires, and
      // the aborted model call never reported what it billed. Handle it as the
      // abort it is, so the reservation stands and no partial reply is kept.
      if (stopReason === 'cancelled') throw new TurnCancelledError();

      // Conversational tokens: this invocation's outputTokens plus the
      // estimated message, not the reused Agent's lifetime usage. This runs
      // before the limit-stop check, because work that was billed is counted
      // whether or not the turn produced a usable reply.
      const usage = readModelUsage(result);
      modelUsage = usage;
      const counted = recordTurn(
        session,
        usage.outputTokens + estimateMessageTokens(message),
        searchTurn.sent,
        caps,
      );
      try {
        await table.putSession(sub, counted, session);
      } catch (err) {
        // The reply is already generated and billed, so the turn still
        // reaches the friend; the lost count is loud so it can be repaired.
        console.error('Could not persist the counted session:', err);
        emitCountMetric('SessionWriteFailures');
      }
      session = counted;

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
      sse.send({ type: 'done', turnsUsed: session.turns, state: lifecycleStateOf(session) });
      completeReply();
      turnDelivered = true;
    } catch (err) {
      cancelled = cancellation.signal.aborted;
      if (err instanceof MissingUsageError) {
        // A model reply we cannot meter stays charged at its reservation; the
        // metric is how the builder learns the usage contract has changed.
        emitCountMetric('UnmeteredRequests');
      }
      if (deadlineExceeded) {
        console.warn(`Turn abandoned at the ${limits.deadlineMs}ms deadline`);
        outcome = sse.fail('session_cap_exceeded');
      } else if (cancelled) {
        // A friend who left: there is no one to report it to, and the socket
        // is already gone.
        outcome = 'cancelled';
      } else if (err instanceof PollySynthesisError) {
        // Polly already billed for part of the reply; the text the friend can
        // read is worth more than a refusal, so the turn still completes.
        pollyCharacters = err.pollyCharacters;
        outcome = 'done';
        sse.send({ type: 'done', turnsUsed: session.turns, state: lifecycleStateOf(session) });
        completeReply();
        turnDelivered = true;
      } else if (!cancelled) {
        console.error('Turn failed:', err);
        outcome = sse.fail('internal');
      }
    } finally {
      if (memoryContextAdded) {
        removePriorSessionContextFromHistory(agent, historyLength, message);
      }
      if (turnDelivered && !cancelled) {
        memoryEvents = 1;
        startSpan('memory.create_event');
        try {
          await memoryAdapter(config).createEvent(
            sub,
            countedSessionId,
            message,
            reply,
            new Date(),
          );
          endSpan('memory.create_event', { failed: false });
        } catch (error) {
          emitMemoryFailureWarning('create_event', error);
          emitCountMetric('MemoryEventFailures');
          endSpan('memory.create_event', { failed: true });
        }
      }

      // Every turn that reached the model is charged to the month, whether it
      // finished, failed or was abandoned: usage prices it exactly, and
      // without usage the reservation stands. The charge is applied when the
      // lease settles, below.
      if (modelUsage) {
        settleMicroUsd =
          meteredMicroUsd(
            {
              model: modelUsage,
              pollyCharacters,
              memoryEvents,
              memoryRetrievals,
              webSearches: searchTurn.sent,
            },
            config.prices,
          ) ?? settleMicroUsd;
      }
      completeReply();
      if (!firstTokenSeen) endSpan('first_token');
    }
  } finally {
    clearTimeout(deadline);
    // Settle before the stream closes, so the slot and the correction are not
    // left to a runtime that may freeze once the response ends. A settlement
    // failure never fails or replays the turn: the work is already done and
    // paid for, and replaying it would spend again.
    if (lease) await settleLease(controlTable(config), lease, settleMicroUsd, turnStartedAt);
    endSpan('invocation', { countedSessionId, outcome, cancelled });
    sse.end();
  }
}

/** The turn's measured cost, or `undefined` when usage is missing so the caller keeps the reservation. */
function meteredMicroUsd(
  usage: Parameters<typeof computeTurnUsage>[0],
  prices: Parameters<typeof computeTurnUsage>[1],
): number | undefined {
  try {
    return computeTurnUsage(usage, prices).estimatedMicroUsd;
  } catch (err) {
    if (!(err instanceof MissingUsageError)) throw err;
    console.error(err.message);
    emitCountMetric('UnmeteredRequests');
    return undefined;
  }
}

async function settleLease(
  table: InvocationControlTable,
  lease: Lease,
  actualMicroUsd: number,
  now: Date,
): Promise<void> {
  try {
    await table.settleRequest(lease, actualMicroUsd, now);
  } catch (err) {
    console.error(
      `Could not settle request ${lease.requestId} for ${lease.sub} at ${actualMicroUsd} microUSD ` +
        `(reserved ${lease.reservedMicroUsd}); the lease and reservation stand until reconciled:`,
      err,
    );
    emitCountMetric('SettlementFailures');
  }
}

/** The stored item minus its `ttl`, in the shape a conditional write expects. */
function withState(session: CountedSessionWrite, state: CountedSessionWrite['state']) {
  return {
    sessionId: session.sessionId,
    state,
    openedAt: session.openedAt,
    turns: session.turns,
    conversationalTokens: session.conversationalTokens,
    webSearches: session.webSearches,
  };
}

const KNOWN_ACTIONS = new Set([
  'runtime.ready',
  'memory.list',
  'memory.export',
  'memory.delete',
  'memory.forget',
]);

async function handleAction(
  action: string,
  memoryRecordId: string | undefined,
  sub: string,
  table: InvocationControlTable,
  config: RuntimeConfig,
  sse: SseStream,
): Promise<string> {
  startSpan('memory.action', { action });
  let failed = true;
  let count = 0;
  let memoryCallAttempted = false;
  let actionLease: Lease | undefined;
  let actionStartedAt = new Date();

  try {
    if (!KNOWN_ACTIONS.has(action)) return sse.fail('invalid_request');
    if (action === 'runtime.ready') {
      sse.send({ type: 'result', action, data: { ready: true } });
      return 'done';
    }
    if (action === 'memory.delete' && !memoryRecordId) return sse.fail('invalid_request');

    const refusal = await admitToNewSession(table, sub);
    if (refusal) return sse.fail(refusal);

    if (action !== 'memory.forget') {
      let rate;
      try {
        rate = await table.consumeRate(sub, new Date());
      } catch (error) {
        console.error('Could not read the rate-limit windows for a memory action:', error);
        return sse.fail('internal');
      }
      if (!rate.allowed) return sse.fail('rate_limited');
    }

    actionStartedAt = new Date();
    let breaker;
    try {
      breaker = await checkBreaker({
        table,
        limits: {
          degradeMicroUsd: config.breakerDegradeMicroUsd,
          tripMicroUsd: config.breakerTripMicroUsd,
        },
        now: actionStartedAt,
      });
    } catch (error) {
      console.error('Could not read the spend breaker for a memory action:', error);
      return sse.fail('internal');
    }
    if (breaker.state === 'tripped') return sse.fail('breaker_tripped');

    try {
      const admission = await table.admitRequest({
        sub,
        requestId: randomUUID(),
        reserveMicroUsd: config.prices.memoryRetrievalMicroUsd,
        spendCeilingMicroUsd: config.breakerTripMicroUsd,
        maxActiveRequests: config.maxActiveRequests,
        now: actionStartedAt,
      });
      if (!admission.admitted) {
        return sse.fail(admission.reason === 'spend_limit' ? 'breaker_tripped' : 'busy');
      }
      actionLease = admission.lease;
    } catch (error) {
      console.error('Could not admit a memory action:', error);
      return sse.fail('internal');
    }

    const adapter = memoryAdapter(config);
    memoryCallAttempted = true;

    if (action === 'memory.list' || action === 'memory.export') {
      const result = await handleListMemories(adapter, sub);
      if (!result.success) {
        if (result.error) console.warn('AgentCore Memory list failed:', result.error);
        return sse.fail(result.code ?? 'internal');
      }

      const records = result.memories ?? [];
      count = records.length;
      if (action === 'memory.export') {
        sse.send({
          type: 'result',
          action: 'memory.export',
          data: { exportedAt: new Date().toISOString(), records },
        });
      } else {
        sse.send({
          type: 'result',
          action: 'memory.list',
          data: { records },
        });
      }
      failed = false;
      return 'done';
    }

    if (action === 'memory.delete') {
      if (!memoryRecordId) return sse.fail('invalid_request');
      const result = await handleDeleteMemory(adapter, sub, memoryRecordId);
      if (!result.success) {
        if (result.error) console.warn('AgentCore Memory delete failed:', result.error);
        return sse.fail(result.code ?? 'internal');
      }

      count = 1;
      sse.send({ type: 'result', action: 'memory.delete', data: { deleted: 1 } });
      failed = false;
      return 'done';
    }

    const result = await handleForgetMe(adapter, sub);
    if (!result.success) {
      if (result.error) console.warn('AgentCore Memory forget failed:', result.error);
      return sse.fail(result.code ?? 'internal');
    }

    count = (result.recordsDeleted ?? 0) + (result.eventsDeleted ?? 0);
    try {
      const stored = await table.getSession(sub);
      if (stored?.state === 'Active') {
        await table.putSession(sub, withState(stored, 'SignedOff'), stored);
      }
    } catch (error) {
      // The memory is already gone; a session that could not be closed simply
      // continues, so this is reported rather than failed.
      console.error('Could not sign off the session after forget-me:', error);
      emitCountMetric('SessionWriteFailures');
    }
    for (const [runtimeSessionId, owner] of runtimeSessionOwners) {
      if (owner !== sub) continue;
      registry?.release(runtimeSessionId);
      runtimeSessionOwners.delete(runtimeSessionId);
    }

    sse.send({
      type: 'result',
      action: 'memory.forget',
      data: {
        recordsDeleted: result.recordsDeleted ?? 0,
        eventsDeleted: result.eventsDeleted ?? 0,
      },
    });
    failed = false;
    return 'done';
  } catch (error) {
    console.error('AgentCore Memory action failed:', error);
    emitCountMetric('MemoryActionFailures');
    return sse.fail('internal');
  } finally {
    if (actionLease) {
      await settleLease(
        table,
        actionLease,
        memoryCallAttempted ? config.prices.memoryRetrievalMicroUsd : 0,
        actionStartedAt,
      );
    }
    endSpan('memory.action', { count, failed });
  }
}

/**
 * The two states the browser is told about. A session mid-conversation is
 * `ACTIVE`; one that reached its turn or token cap is Max's in-character
 * sign-off, which tells the browser the next message opens a fresh counted
 * session.
 */
function lifecycleStateOf(session: CountedSessionWrite): SessionLifecycleState {
  return session.state === 'SignedOff' ? 'SIGNED_OFF' : 'ACTIVE';
}

/** Pulls the text out of a model stream event, or `undefined` for anything else. */
function textDeltaOf(event: AgentStreamEvent): string | undefined {
  if (event.type !== 'modelStreamUpdateEvent') return undefined;
  if (event.event.type !== 'modelContentBlockDeltaEvent') return undefined;
  const delta = event.event.delta;
  return delta.type === 'textDelta' ? delta.text : undefined;
}

interface InvocationBody {
  message?: string;
  action?: string;
  memoryRecordId?: string;
  displayAlias?: string;
  greetingId?: string;
  voice?: 'on' | 'off';
}

function isInvocationBody(value: unknown): value is InvocationBody {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  return (
    (body.message === undefined || typeof body.message === 'string') &&
    (body.action === undefined || typeof body.action === 'string') &&
    (body.memoryRecordId === undefined || typeof body.memoryRecordId === 'string') &&
    (body.displayAlias === undefined || typeof body.displayAlias === 'string') &&
    (body.greetingId === undefined || typeof body.greetingId === 'string') &&
    (body.voice === undefined || body.voice === 'on' || body.voice === 'off')
  );
}

function emitCountMetric(name: string): void {
  const timestamp = Date.now();
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: timestamp,
        CloudWatchMetrics: [
          {
            Namespace: 'MaxHeight',
            Dimensions: [[]],
            Metrics: [{ Name: name, Unit: 'Count' }],
          },
        ],
      },
      [name]: 1,
    }),
  );
}

function emitMemoryFailureWarning(operation: string, error: unknown): void {
  console.warn(
    JSON.stringify({
      event: `memory.${operation}.failed`,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    }),
  );
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
    handleInvocations(req, res).catch((err) => answerInvocationFailure(res, err));
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
}

/**
 * An invocation always opens its SSE response before it finishes, so by the
 * time a failure reaches here the headers are usually sent. Writing a status
 * then would throw inside the `.catch` and, as an unhandled rejection, exit the
 * process.
 */
function answerInvocationFailure(res: ServerResponse, err: unknown): void {
  console.error('Invocation error:', err);
  if (res.headersSent) {
    if (!res.writableEnded) res.end();
    return;
  }
  res.writeHead(500, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Internal server error' }));
}

// Exposed for tests so they can assert/reset cap-enforcement state without
// having to issue HTTP requests against a live server.
export const __test = {
  requestHandler,
  handleInvocations,
  createMaxHeightAgent,
  /** Clears every piece of per-instance state a test could carry over. */
  reset() {
    runtimeSessionOwners.clear();
    registry = undefined;
    polly = undefined;
    control = undefined;
    memory = undefined;
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
    memory = undefined;
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
