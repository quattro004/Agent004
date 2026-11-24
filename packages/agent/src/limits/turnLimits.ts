/**
 * Per-turn safety bounds (spec 003 § Clarifications, Session 2026-11-15).
 *
 * These exist to bound what one chat turn can spend and ingest before any
 * money is committed. Three of them are enforced here because the SDK has no
 * equivalent (request body, serialized model input, tool-result size); the
 * remaining three map onto the SDK's own `InvokeLimits`.
 *
 * The SDK checks token limits *between* calls, so the final call of a request
 * can overshoot `totalTokens`. That is why admission reserves the next call's
 * maximum cost before it starts rather than trusting these limits as exact
 * pre-spend accounting (T164, T167).
 */
import {
  BeforeInvocationEvent,
  BeforeToolCallEvent,
  AfterToolCallEvent,
  BeforeModelCallEvent,
  ToolResultBlock,
  TextBlock,
  type JSONValue,
  type LocalAgent,
  type SystemPrompt,
  type ToolSpec,
} from '@strands-agents/sdk';

/** Every approved per-turn bound, in one place. */
export interface TurnLimits {
  /** UTF-8 bytes accepted on the `/invocations` request body. */
  requestBodyMaxBytes: number;
  /** UTF-8 bytes of serialized messages sent to the model on one call. */
  modelInputMaxBytes: number;
  /** UTF-8 bytes of one serialized tool result. */
  toolResultMaxBytes: number;
  /** Model calls allowed across the turn. */
  maxModelCalls: number;
  /** Tool executions allowed across the turn. */
  maxToolExecutions: number;
  /** Model-generated tokens allowed across the turn. */
  maxGeneratedTokens: number;
  /** Input + output tokens after which the loop is cut off. */
  maxBilledTokens: number;
  /** Wall-clock budget for model, tool and voice work together. */
  deadlineMs: number;
}

/** The figures the builder approved on 2026-11-15. CDK overrides each one. */
export const TURN_LIMIT_DEFAULTS: TurnLimits = {
  requestBodyMaxBytes: 16 * 1024,
  modelInputMaxBytes: 32 * 1024,
  toolResultMaxBytes: 8 * 1024,
  maxModelCalls: 4,
  maxToolExecutions: 4,
  maxGeneratedTokens: 1000,
  maxBilledTokens: 64_000,
  deadlineMs: 60_000,
};

export class BodyTooLargeError extends Error {
  readonly limitBytes: number;

  constructor(limitBytes: number) {
    super(`Request body exceeds the ${limitBytes} bytes allowed`);
    this.name = 'BodyTooLargeError';
    this.limitBytes = limitBytes;
  }
}

/**
 * Reads the request body, refusing it as soon as it passes `maxBytes`.
 *
 * The refusal has to happen while reading rather than after, so a caller
 * cannot make us buffer an arbitrarily large payload before we reject it.
 * Destroying the stream stops the sender.
 */
export async function readBoundedBody(
  req: AsyncIterable<Buffer | string>,
  maxBytes: number,
): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8');
    total += buffer.byteLength;
    if (total > maxBytes) {
      (req as { destroy?: (error?: Error) => void }).destroy?.();
      throw new BodyTooLargeError(maxBytes);
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString('utf8');
}

interface ToolResultContentLike {
  type?: string;
  text?: string;
  json?: JSONValue;
}

export interface ToolResultLike {
  toolUseId: string;
  status: 'success' | 'error';
  content: ToolResultContentLike[];
}

const TRUNCATION_MARKER = ' …[truncated]';

function contentToText(content: ToolResultContentLike[]): string {
  return content
    .map((block) => {
      if (typeof block.text === 'string') return block.text;
      if ('json' in block) return JSON.stringify(block.json);
      return JSON.stringify(block);
    })
    .join('\n');
}

function serializedBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

export function completeModelRequestBytes(options: {
  messages: readonly object[];
  systemPrompt?: SystemPrompt;
  toolSpecs?: ToolSpec[];
}): number {
  return serializedBytes({
    systemPrompt: options.systemPrompt ?? '',
    toolSpecs: options.toolSpecs ?? [],
    messages: options.messages,
  });
}

/**
 * Bounds one tool result to `maxBytes` of serialized JSON.
 *
 * A model that receives a silently shortened result would treat it as the
 * whole answer, so the replacement says it was truncated. The search is on
 * characters rather than bytes because slicing UTF-8 mid-sequence would emit
 * replacement characters.
 */
export function truncateToolResult<T extends ToolResultLike>(
  result: T,
  maxBytes: number,
  options: { measure?: (candidate: T) => number } = {},
): T {
  const measure = options.measure ?? ((candidate: T) => serializedBytes(candidate));
  if (measure(result) <= maxBytes) return result;

  const source = contentToText(result.content ?? []);
  const build = (chars: number): T => ({
    ...result,
    content: [{ type: 'text', text: source.slice(0, chars) + TRUNCATION_MARKER }],
  });

  let low = 0;
  let high = source.length;
  let best = build(0);

  if (measure(best) > maxBytes) {
    // Even the marker alone does not fit; return the smallest valid block we
    // can rather than an invalid or oversized one.
    return { ...result, content: [{ type: 'text', text: TRUNCATION_MARKER.trim() }] } as T;
  }

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = build(mid);
    if (measure(candidate) <= maxBytes) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

export interface MessageLike {
  role: string;
  content: readonly object[];
}

export interface BoundModelInputOptions {
  maxBytes: number;
  systemPrompt?: SystemPrompt;
  toolSpecs?: ToolSpec[];
}

export interface BoundModelInputResult<T> {
  messages: T[];
  dropped: number;
  completeBytes: number;
  fits: boolean;
}

/**
 * Bounds the serialized model input by dropping the oldest turns.
 *
 * Bedrock Converse refuses a conversation that opens with a reply or answers a
 * tool call it was never shown, so the cut falls only where a turn begins: a
 * user message that carries more than tool results. The current turn, which
 * starts at the last such message and includes any tool calls it has made so
 * far, is never dropped. A turn that alone exceeds the limit is passed through
 * and bounded by the request-body limit and per-tool-result bound instead. The
 * system prompt is counted but never removed.
 */
export function boundModelInput<T extends MessageLike>(
  messages: T[],
  options: BoundModelInputOptions,
): BoundModelInputResult<T> {
  const { maxBytes, systemPrompt = '', toolSpecs = [] } = options;

  const completeBytes = (candidate: T[]) =>
    completeModelRequestBytes({
      systemPrompt,
      toolSpecs,
      messages: candidate,
    });

  const turnStarts = messages.flatMap((message, index) => (startsATurn(message) ? [index] : []));
  const currentTurn = turnStarts.at(-1);
  if (currentTurn === undefined) {
    const bytes = completeBytes(messages);
    return { messages, dropped: 0, completeBytes: bytes, fits: bytes <= maxBytes };
  }

  const start =
    turnStarts.find((index) => completeBytes(messages.slice(index)) <= maxBytes) ?? currentTurn;
  const bounded = start === 0 ? messages : messages.slice(start);
  const bytes = completeBytes(bounded);
  return { messages: bounded, dropped: start, completeBytes: bytes, fits: bytes <= maxBytes };
}

/** A user message that is the friend speaking, not the return of a tool call. */
function startsATurn(message: MessageLike): boolean {
  return (
    message.role === 'user' &&
    !message.content.some(
      (block) =>
        typeof block === 'object' &&
        block !== null &&
        'type' in block &&
        block.type === 'toolResultBlock',
    )
  );
}

/** The SDK's per-request limit dimensions (`InvokeOptions.limits`). */
export interface InvokeLimitsShape {
  turns: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Maps the approved ceilings onto the SDK's limits.
 *
 * `remainingGeneratedTokens` shrinks the next call's allowance to the capacity
 * the session has left, so a turn cannot generate tokens the budget has
 * already spent. It only ever lowers the ceiling.
 */
export function invokeLimitsFor(
  limits: TurnLimits,
  options: { remainingGeneratedTokens?: number } = {},
): InvokeLimitsShape {
  const { remainingGeneratedTokens } = options;
  const outputTokens =
    remainingGeneratedTokens === undefined
      ? limits.maxGeneratedTokens
      : Math.max(0, Math.min(limits.maxGeneratedTokens, remainingGeneratedTokens));

  return {
    turns: limits.maxModelCalls,
    outputTokens,
    totalTokens: limits.maxBilledTokens,
  };
}

/**
 * Registers the bounds `InvokeOptions.limits` cannot express.
 *
 * The SDK caps model calls and tokens but has no tool-execution ceiling and
 * no result size bound, so an agent that kept choosing tools would spend
 * without limit and a large tool result would arrive as input tokens on the
 * next call. Both are enforced here.
 */
export function registerTurnLimits(agent: LocalAgent, limits: TurnLimits): void {
  let toolExecutions = 0;

  agent.addHook(BeforeInvocationEvent, () => {
    toolExecutions = 0;
  });

  agent.addHook(BeforeToolCallEvent, (event: BeforeToolCallEvent) => {
    toolExecutions += 1;
    if (toolExecutions > limits.maxToolExecutions) {
      event.cancel = `Tool execution limit of ${limits.maxToolExecutions} per turn reached; answer with what you already have.`;
    }
  });

  agent.addHook(AfterToolCallEvent, (event: AfterToolCallEvent) => {
    // Measure and rebuild through the SDK's own classes: a `ToolResultBlock`
    // serializes to a wrapped shape, and plain content objects would not
    // survive the SDK's serialization at all.
    const data = JSON.parse(JSON.stringify(event.result)).toolResult as ToolResultLike;
    const toBlock = (r: ToolResultLike): ToolResultBlock =>
      new ToolResultBlock({
        toolUseId: r.toolUseId,
        status: r.status,
        content: (r.content ?? []).map(
          (block) =>
            new TextBlock(typeof block.text === 'string' ? block.text : JSON.stringify(block)),
        ),
      });

    const bounded = truncateToolResult(data, limits.toolResultMaxBytes, {
      measure: (candidate) => Buffer.byteLength(JSON.stringify(toBlock(candidate)), 'utf8'),
    });
    if (bounded === data) return;
    event.result = toBlock(bounded);
  });

  agent.addHook(BeforeModelCallEvent, (event: BeforeModelCallEvent) => {
    const hookAgent = event.agent;
    const messages = hookAgent.messages;
    const toolSpecs = hookAgent.toolRegistry?.toolSpecs?.() ?? [];
    const { dropped, fits } = boundModelInput(messages, {
      maxBytes: limits.modelInputMaxBytes,
      systemPrompt: hookAgent.systemPrompt ?? '',
      toolSpecs,
    });
    if (dropped > 0) messages.splice(0, dropped);
    if (!fits) {
      event.cancel =
        'Complete model request exceeds the configured model input limit; answer with what you already have.';
    }
  });
}
