import { describe, it, expect, beforeEach } from 'vitest';
import { useConversationStore } from '../../src/stores/conversationStore';

describe('conversationStore', () => {
  beforeEach(() => {
    useConversationStore.getState().reset();
  });

  it('should initialize with zero counters', () => {
    const state = useConversationStore.getState();
    expect(state.turnCount).toBe(0);
    expect(state.tokenCount).toBe(0);
    expect(state.currentResponseText).toBe('');
    expect(state.isStreaming).toBe(false);
    expect(state.currentTurnIndex).toBe(0);
  });

  it('should append tokens to current response', () => {
    const store = useConversationStore.getState();
    store.appendToken('Hello');
    store.appendToken(' world');

    const state = useConversationStore.getState();
    expect(state.currentResponseText).toBe('Hello world');
    expect(state.isStreaming).toBe(true);
  });

  it('should set full text and stop streaming', () => {
    const store = useConversationStore.getState();
    store.appendToken('partial');
    store.setFullText('The complete response text.');

    const state = useConversationStore.getState();
    expect(state.currentResponseText).toBe('The complete response text.');
    expect(state.isStreaming).toBe(false);
  });

  it('should increment turn count', () => {
    const store = useConversationStore.getState();
    store.incrementTurn();
    store.incrementTurn();

    expect(useConversationStore.getState().turnCount).toBe(2);
  });

  it('should update counters from agent_turn_complete payload', () => {
    const store = useConversationStore.getState();
    store.updateCounters({
      sessionTokenTotal: 1500,
      sessionTurnTotal: 5,
    });

    const state = useConversationStore.getState();
    expect(state.tokenCount).toBe(1500);
    expect(state.turnCount).toBe(5);
  });

  it('should reset all conversation state', () => {
    const store = useConversationStore.getState();
    store.appendToken('text');
    store.updateCounters({ sessionTokenTotal: 500, sessionTurnTotal: 3 });
    store.reset();

    const state = useConversationStore.getState();
    expect(state.turnCount).toBe(0);
    expect(state.tokenCount).toBe(0);
    expect(state.currentResponseText).toBe('');
    expect(state.isStreaming).toBe(false);
  });
});
