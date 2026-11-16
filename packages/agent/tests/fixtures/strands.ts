/**
 * Fakes for the Strands SDK's streaming surface.
 *
 * The handler consumes `agent.stream()` rather than `agent.invoke()` so text
 * reaches the friend as it is generated (transport-sse.md § Events; #45). That
 * generator *returns* the `AgentResult` instead of yielding it, so a plain
 * `for await` never sees it — these helpers build fakes with the same shape.
 */

export interface FakeUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface FakeResultOptions {
  usage?: Partial<FakeUsage>;
  stopReason?: string;
}

/** The `AgentResult` shape the handler reads: last message plus request usage. */
export function fakeResult(text: string, options: FakeResultOptions = {}) {
  const usage = { inputTokens: 10, outputTokens: 20, totalTokens: 30, ...options.usage };
  return {
    lastMessage: { content: [{ type: 'textBlock', text }] },
    invocationContext: { usage },
    ...(options.stopReason ? { stopReason: options.stopReason } : {}),
  };
}

/** One model text delta, wrapped the way `agent.stream()` wraps it. */
export function textDelta(text: string) {
  return {
    type: 'modelStreamUpdateEvent',
    event: {
      type: 'modelContentBlockDeltaEvent',
      delta: { type: 'textDelta', text },
    },
  };
}

/**
 * A `stream()` implementation that yields `chunks` as text deltas and returns
 * the assembled result. Pass several chunks to prove ordering.
 */
export function streamOf(chunks: string[], options: FakeResultOptions = {}) {
  return async function* () {
    for (const chunk of chunks) {
      yield textDelta(chunk);
    }
    return fakeResult(chunks.join(''), options);
  };
}
