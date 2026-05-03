import { create } from 'zustand';

interface ConversationState {
  turnCount: number;
  tokenCount: number;
  currentResponseText: string;
  isStreaming: boolean;
  currentTurnIndex: number;
  appendToken: (token: string) => void;
  setFullText: (text: string) => void;
  advanceTurn: () => void;
  incrementTurn: () => void;
  updateCounters: (counters: { sessionTokenTotal: number; sessionTurnTotal: number }) => void;
  reset: () => void;
}

const initialState = {
  turnCount: 0,
  tokenCount: 0,
  currentResponseText: '',
  isStreaming: false,
  currentTurnIndex: 0,
};

export const useConversationStore = create<ConversationState>()((set) => ({
  ...initialState,
  appendToken: (token) =>
    set((state) => ({
      currentResponseText: state.currentResponseText + token,
      isStreaming: true,
    })),
  setFullText: (text) => set({ currentResponseText: text, isStreaming: false }),
  advanceTurn: () => set((state) => ({ currentTurnIndex: state.currentTurnIndex + 1 })),
  incrementTurn: () => set((state) => ({ turnCount: state.turnCount + 1 })),
  updateCounters: ({ sessionTokenTotal, sessionTurnTotal }) =>
    set({ tokenCount: sessionTokenTotal, turnCount: sessionTurnTotal }),
  reset: () => set(initialState),
}));
