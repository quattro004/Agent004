import { create } from 'zustand';
import type { SessionState } from '../types/domain';

interface ConnectionState {
  sessionState: SessionState;
  sessionId: string | null;
  agentCoreSessionId: string | null;
  isWebSocketReady: boolean;
  setSessionState: (state: SessionState) => void;
  setConnected: (sessionId: string, agentCoreSessionId: string) => void;
  reset: () => void;
}

const initialState = {
  sessionState: 'INITIALIZING' as SessionState,
  sessionId: null as string | null,
  agentCoreSessionId: null as string | null,
  isWebSocketReady: false,
};

export const useConnectionStore = create<ConnectionState>()((set) => ({
  ...initialState,
  setSessionState: (sessionState) => set({ sessionState }),
  setConnected: (sessionId, agentCoreSessionId) =>
    set({ sessionId, agentCoreSessionId, isWebSocketReady: true }),
  reset: () => set(initialState),
}));
