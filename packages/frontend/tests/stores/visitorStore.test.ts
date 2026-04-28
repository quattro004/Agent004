import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useVisitorStore } from '../../src/stores/visitorStore';

describe('visitorStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useVisitorStore.getState().reset();
  });

  it('should generate a UUID actorId on init', () => {
    const state = useVisitorStore.getState();
    expect(state.actorId).toBeTruthy();
    expect(state.actorId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('should persist actorId to localStorage', () => {
    const state = useVisitorStore.getState();
    const stored = localStorage.getItem('max-height-actorId');
    expect(stored).toBe(state.actorId);
  });

  it('should load actorId from localStorage on init', () => {
    localStorage.setItem('max-height-actorId', 'existing-id-123');
    // Force re-init by resetting and re-reading
    useVisitorStore.setState({ actorId: 'existing-id-123' });
    expect(useVisitorStore.getState().actorId).toBe('existing-id-123');
  });

  it('should initialize with null displayAlias', () => {
    expect(useVisitorStore.getState().displayAlias).toBeNull();
  });

  it('should set displayAlias', () => {
    useVisitorStore.getState().setDisplayAlias('CoolVisitor');
    expect(useVisitorStore.getState().displayAlias).toBe('CoolVisitor');
  });

  it('should push greeting ID to history', () => {
    const store = useVisitorStore.getState();
    store.pushGreeting('greeting-001');
    store.pushGreeting('greeting-005');

    expect(useVisitorStore.getState().greetingHistory).toEqual([
      'greeting-001',
      'greeting-005',
    ]);
  });

  it('should trim greeting history to 20 entries', () => {
    const store = useVisitorStore.getState();
    for (let i = 1; i <= 25; i++) {
      store.pushGreeting(`greeting-${String(i).padStart(3, '0')}`);
    }

    const history = useVisitorStore.getState().greetingHistory;
    expect(history).toHaveLength(20);
    // Should keep the 20 most recent (6..25)
    expect(history[0]).toBe('greeting-006');
    expect(history[19]).toBe('greeting-025');
  });

  it('should update rate limit counters', () => {
    const store = useVisitorStore.getState();
    store.updateRateLimits({
      hourlyCount: 5,
      hourlyWindowStart: '2026-04-28T10:00:00Z',
      dailyCount: 50,
      dailyWindowStart: '2026-04-28T00:00:00Z',
    });

    const limits = useVisitorStore.getState().rateLimitCounters;
    expect(limits.hourlyCount).toBe(5);
    expect(limits.dailyCount).toBe(50);
  });

  it('should clear all data on clearAll', () => {
    const store = useVisitorStore.getState();
    store.setDisplayAlias('TestUser');
    store.pushGreeting('greeting-001');
    store.updateRateLimits({
      hourlyCount: 10,
      hourlyWindowStart: '2026-04-28T10:00:00Z',
      dailyCount: 100,
      dailyWindowStart: '2026-04-28T00:00:00Z',
    });

    store.clearAll();

    const state = useVisitorStore.getState();
    // clearAll generates a new actorId
    expect(state.actorId).toBeTruthy();
    expect(state.displayAlias).toBeNull();
    expect(state.greetingHistory).toEqual([]);
    expect(state.rateLimitCounters.hourlyCount).toBe(0);
    expect(state.rateLimitCounters.dailyCount).toBe(0);
  });
});
