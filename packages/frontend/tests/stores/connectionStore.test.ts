import { describe, it, expect, beforeEach } from 'vitest';
import { useConnectionStore } from '../../src/stores/connectionStore';

describe('connectionStore', () => {
  beforeEach(() => {
    useConnectionStore.getState().reset();
  });

  it('should initialize with INITIALIZING state', () => {
    const state = useConnectionStore.getState();
    expect(state.sessionState).toBe('INITIALIZING');
    expect(state.sessionId).toBeNull();
    expect(state.agentCoreSessionId).toBeNull();
    expect(state.isWebSocketReady).toBe(false);
  });

  it('should transition through all 8 SessionState values', () => {
    const store = useConnectionStore.getState();
    const states = [
      'INITIALIZING',
      'GREETING',
      'ACTIVE',
      'ENDED',
      'BUDGET_CAPPED',
      'RATE_LIMITED',
      'SIGNAL_LOST',
      'ERROR',
    ] as const;

    for (const state of states) {
      store.setSessionState(state);
      expect(useConnectionStore.getState().sessionState).toBe(state);
    }
  });

  it('should set connected state with session IDs', () => {
    const store = useConnectionStore.getState();
    store.setConnected('session-123', 'agentcore-456');

    const state = useConnectionStore.getState();
    expect(state.sessionId).toBe('session-123');
    expect(state.agentCoreSessionId).toBe('agentcore-456');
    expect(state.isWebSocketReady).toBe(true);
  });

  it('should reset all state', () => {
    const store = useConnectionStore.getState();
    store.setConnected('session-123', 'agentcore-456');
    store.setSessionState('ACTIVE');
    store.reset();

    const state = useConnectionStore.getState();
    expect(state.sessionState).toBe('INITIALIZING');
    expect(state.sessionId).toBeNull();
    expect(state.agentCoreSessionId).toBeNull();
    expect(state.isWebSocketReady).toBe(false);
  });
});
