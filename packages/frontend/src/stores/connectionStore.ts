import { create } from 'zustand';
import type { SessionState } from '../types/domain';

interface ConnectionState {
  sessionState: SessionState;
  sessionId: string | null;
  agentCoreSessionId: string | null;
  isStreamReady: boolean;
  setSessionState: (state: SessionState) => void;
  setConnected: (sessionId: string, agentCoreSessionId: string) => void;
  reset: () => void;
}

const initialState = {
  sessionState: 'INITIALIZING' as SessionState,
  sessionId: null as string | null,
  agentCoreSessionId: null as string | null,
  isStreamReady: false,
};

export const useConnectionStore = create<ConnectionState>()((set) => ({
  ...initialState,
  setSessionState: (sessionState) => set({ sessionState }),
  setConnected: (sessionId, agentCoreSessionId) =>
    set({ sessionId, agentCoreSessionId, isStreamReady: true }),
  reset: () => set(initialState),
}));
