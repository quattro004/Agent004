import { create } from 'zustand';

/** A web search result's source, which AWS's terms require the reply to show. */
export interface SearchSource {
  title: string;
  url: string;
}

interface ConversationState {
  turnCount: number;
  tokenCount: number;
  currentResponseText: string;
  isStreaming: boolean;
  currentTurnIndex: number;
  sources: SearchSource[];
  appendToken: (token: string) => void;
  setFullText: (text: string) => void;
  addSources: (sources: SearchSource[]) => void;
  clearSources: () => void;
  advanceTurn: () => void;
  updateCounters: (counters: { sessionTokenTotal: number; sessionTurnTotal: number }) => void;
  reset: () => void;
}

const initialState = {
  turnCount: 0,
  tokenCount: 0,
  currentResponseText: '',
  isStreaming: false,
  currentTurnIndex: 0,
  sources: [] as SearchSource[],
};

export const useConversationStore = create<ConversationState>()((set) => ({
  ...initialState,
  appendToken: (token) =>
    set((state) => ({
      currentResponseText: state.currentResponseText + token,
      isStreaming: true,
    })),
  setFullText: (text) => set({ currentResponseText: text, isStreaming: false }),
  addSources: (sources) => set((state) => ({ sources: [...state.sources, ...sources] })),
  clearSources: () => set({ sources: [] }),
  advanceTurn: () => set((state) => ({ currentTurnIndex: state.currentTurnIndex + 1 })),
  updateCounters: ({ sessionTokenTotal, sessionTurnTotal }) =>
    set({ tokenCount: sessionTokenTotal, turnCount: sessionTurnTotal }),
  reset: () => set(initialState),
}));
