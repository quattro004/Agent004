import { describe, it, expect, vi } from 'vitest';
import { AgentRegistry, RUNTIME_SESSION_ID_MIN_LENGTH } from '../../src/session/agentRegistry.js';
import { testRuntimeConfig } from '../fixtures/runtimeConfig.js';

/**
 * A stand-in for a Strands `Agent`. The registry's job is lifetime, not
 * invocation, so the double only needs identity.
 */
function fakeAgent(label: string) {
  return { label, messages: [] as unknown[] };
}

function makeRegistry(
  overrides: Partial<Parameters<typeof AgentRegistry.prototype.constructor>[0]> = {},
) {
  const create = vi.fn((countedSessionId: string) => fakeAgent(countedSessionId));
  let clock = 1_000;
  const registry = new AgentRegistry({
    create,
    now: () => clock,
    ...overrides,
  } as ConstructorParameters<typeof AgentRegistry>[0]);
  return { registry, create, tick: (ms: number) => (clock += ms), at: () => clock };
}

const RUNTIME_ID = 'rt-0123456789abcdef0123456789abcdef';

describe('AgentRegistry', () => {
  it('reports fresh creation once and reuse thereafter', () => {
    const { registry } = makeRegistry();

    const fresh = registry.acquire(RUNTIME_ID, 'counted-1');
    const reused = registry.acquire(RUNTIME_ID, 'counted-1');

    expect(fresh).toMatchObject({ fresh: true });
    expect(reused).toMatchObject({ fresh: false });
  });

  it('keeps one agent per runtime session, so a turn continues the same conversation', () => {
    const { registry, create } = makeRegistry();

    const first = registry.acquire(RUNTIME_ID, 'counted-1');
    const second = registry.acquire(RUNTIME_ID, 'counted-1');

    expect(second.agent).toBe(first.agent);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith('counted-1');
  });

  it('gives different runtime sessions different agents', () => {
    const { registry, create } = makeRegistry();
    const other = `rt-${'b'.repeat(40)}`;

    const a = registry.acquire(RUNTIME_ID, 'counted-1');
    const b = registry.acquire(other, 'counted-1');

    expect(b.agent).not.toBe(a.agent);
    expect(create).toHaveBeenCalledTimes(2);
    expect(registry.size).toBe(2);
  });

  it('rebuilds the agent when the counted session changes, so history never crosses a session', () => {
    const { registry, create } = makeRegistry();

    const first = registry.acquire(RUNTIME_ID, 'counted-1');
    const second = registry.acquire(RUNTIME_ID, 'counted-2');

    expect(second.agent).not.toBe(first.agent);
    expect(create).toHaveBeenNthCalledWith(2, 'counted-2');
    // The stale entry is replaced, not accumulated.
    expect(registry.size).toBe(1);
  });

  it('refuses a runtime session ID shorter than AgentCore allows', () => {
    const { registry, create } = makeRegistry();

    expect(() => registry.acquire('too-short', 'counted-1')).toThrow(
      new RegExp(String(RUNTIME_SESSION_ID_MIN_LENGTH)),
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('records lastUsedAt on every acquire, so eviction can tell idle from busy', () => {
    const { registry, tick, at } = makeRegistry();

    registry.acquire(RUNTIME_ID, 'counted-1');
    const first = registry.lastUsedAt(RUNTIME_ID);

    tick(5_000);
    registry.acquire(RUNTIME_ID, 'counted-1');

    expect(first).toBeLessThan(registry.lastUsedAt(RUNTIME_ID)!);
    expect(registry.lastUsedAt(RUNTIME_ID)).toBe(at());
  });

  it('evicts only entries idle longer than the cutoff', () => {
    const { registry, tick } = makeRegistry();
    const busy = `rt-${'c'.repeat(40)}`;

    registry.acquire(RUNTIME_ID, 'counted-1');
    tick(10_000);
    registry.acquire(busy, 'counted-2');

    // RUNTIME_ID is 10s idle; `busy` is 0s idle.
    const evicted = registry.evictIdle(5_000);

    expect(evicted).toBe(1);
    expect(registry.lastUsedAt(RUNTIME_ID)).toBeUndefined();
    expect(registry.lastUsedAt(busy)).toBeDefined();
  });

  it('drops an entry on release, so a signed-off session frees its memory', () => {
    const { registry, create } = makeRegistry();

    registry.acquire(RUNTIME_ID, 'counted-1');
    registry.release(RUNTIME_ID);

    expect(registry.size).toBe(0);
    registry.acquire(RUNTIME_ID, 'counted-1');
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe('createMaxHeightAgent conversation window (N2)', () => {
  it('pins the sliding window to 40 messages rather than inheriting the SDK default', async () => {
    const { SlidingWindowConversationManager } = await import('@strands-agents/sdk');
    const { __test } = await import('../../src/index.js');

    const agent = __test.createMaxHeightAgent({ config: testRuntimeConfig() }) as unknown as {
      _conversationManager?: unknown;
    };

    // The SDK currently defaults to a 40-message sliding window, so an
    // implicit default looks identical until the SDK changes it. Passing it
    // explicitly is what makes the 40 ours.
    // The SDK keeps it on a private field; there is no public accessor.
    const manager = agent._conversationManager as
      | (InstanceType<typeof SlidingWindowConversationManager> & { _windowSize?: number })
      | undefined;

    expect(manager).toBeInstanceOf(SlidingWindowConversationManager);
    expect(manager!['_windowSize']).toBe(40);
  });
});
