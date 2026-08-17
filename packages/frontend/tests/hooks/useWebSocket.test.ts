import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWebSocket } from '../../src/hooks/useWebSocket';

// Mock Zustand stores before importing hook
vi.mock('../../src/stores/connectionStore', () => ({
  useConnectionStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      setConnected: vi.fn(),
      setSessionState: vi.fn(),
    }),
}));

vi.mock('../../src/stores/conversationStore', () => ({
  useConversationStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      appendToken: vi.fn(),
      setFullText: vi.fn(),
      updateCounters: vi.fn(),
      advanceTurn: vi.fn(),
    }),
}));

describe('useWebSocket – enabled gate', () => {
  let MockWebSocket: ReturnType<typeof vi.fn>;
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    MockWebSocket = vi.fn(function () {
      return {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        close: vi.fn(),
        readyState: 0,
      };
    });
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
  });

  it('should not open a WebSocket when enabled is false', () => {
    renderHook(() =>
      useWebSocket({ url: 'ws://localhost:8080', sessionId: 'test', enabled: false }),
    );

    expect(MockWebSocket).not.toHaveBeenCalled();
  });

  it('should open a WebSocket when enabled is true', () => {
    renderHook(() =>
      useWebSocket({ url: 'ws://localhost:8080', sessionId: 'test', enabled: true }),
    );

    expect(MockWebSocket).toHaveBeenCalledWith('ws://localhost:8080');
  });

  it('should open a WebSocket when enabled is omitted (defaults to true)', () => {
    renderHook(() => useWebSocket({ url: 'ws://localhost:8080', sessionId: 'test' }));

    expect(MockWebSocket).toHaveBeenCalledWith('ws://localhost:8080');
  });
});
