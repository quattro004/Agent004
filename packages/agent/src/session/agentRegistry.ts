/**
 * Lifetime management for the per-conversation Strands `Agent`.
 *
 * A Runtime V2 instance serves many friends, and an `Agent` carries the
 * conversation history. Sharing one across sessions would leak one friend's
 * conversation into another's reply, so the registry keys an `Agent` to the
 * runtime session ID the browser sends and rebuilds it whenever the counted
 * session behind it changes (strict continuity; `specs/003-architecture-review/data-model.md`).
 */

/**
 * AgentCore Runtime requires a session identifier of at least 33 characters.
 * Checking it here means a too-short ID fails in our code with a clear
 * message, rather than as an opaque service error part-way through a turn.
 */
export const RUNTIME_SESSION_ID_MIN_LENGTH = 33;

interface Entry<TAgent> {
  agent: TAgent;
  countedSessionId: string;
  lastUsedAt: number;
}

export interface AgentRegistryOptions<TAgent, TContext = void> {
  /** Builds a fresh `Agent` for a counted session. */
  create: (countedSessionId: string, context?: TContext) => TAgent;
  /** Injectable clock, so eviction is testable without waiting. */
  now?: () => number;
}

export class AgentRegistry<TAgent = unknown, TContext = void> {
  readonly #entries = new Map<string, Entry<TAgent>>();
  readonly #create: (countedSessionId: string, context?: TContext) => TAgent;
  readonly #now: () => number;

  constructor(options: AgentRegistryOptions<TAgent, TContext>) {
    this.#create = options.create;
    this.#now = options.now ?? (() => Date.now());
  }

  get size(): number {
    return this.#entries.size;
  }

  /**
   * Returns the agent for this runtime session, building one if it is new or
   * if the counted session behind it has changed.
   */
  acquire(runtimeSessionId: string, countedSessionId: string, context?: TContext): TAgent {
    if (runtimeSessionId.length < RUNTIME_SESSION_ID_MIN_LENGTH) {
      throw new Error(
        `Runtime session ID must be at least ${RUNTIME_SESSION_ID_MIN_LENGTH} characters; got ${runtimeSessionId.length}`,
      );
    }

    const existing = this.#entries.get(runtimeSessionId);
    // A changed counted session means a new conversation, so the old history
    // must go rather than carry over into it.
    if (existing && existing.countedSessionId === countedSessionId) {
      existing.lastUsedAt = this.#now();
      return existing.agent;
    }

    const agent =
      context === undefined
        ? this.#create(countedSessionId)
        : this.#create(countedSessionId, context);
    this.#entries.set(runtimeSessionId, {
      agent,
      countedSessionId,
      lastUsedAt: this.#now(),
    });
    return agent;
  }

  /** When the entry was last acquired, or `undefined` if it is not held. */
  lastUsedAt(runtimeSessionId: string): number | undefined {
    return this.#entries.get(runtimeSessionId)?.lastUsedAt;
  }

  /** Drops an entry outright, for a session that has signed off. */
  release(runtimeSessionId: string): void {
    this.#entries.delete(runtimeSessionId);
  }

  /**
   * Drops every entry idle for longer than `idleMs`, and returns how many
   * went. This is local housekeeping only: the instance is one of several, so
   * it bounds this instance's memory and never ends a counted session.
   */
  evictIdle(idleMs: number): number {
    const cutoff = this.#now() - idleMs;
    let evicted = 0;
    for (const [id, entry] of this.#entries) {
      if (entry.lastUsedAt < cutoff) {
        this.#entries.delete(id);
        evicted += 1;
      }
    }
    return evicted;
  }
}
