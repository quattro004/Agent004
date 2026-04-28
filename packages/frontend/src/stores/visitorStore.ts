import { create } from 'zustand';
import type { RateLimitState } from '../types/domain';

const STORAGE_PREFIX = 'max-height-';

function getOrCreateActorId(): string {
  const key = `${STORAGE_PREFIX}actorId`;
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(key, id);
  return id;
}

interface VisitorState {
  actorId: string;
  displayAlias: string | null;
  greetingHistory: string[];
  rateLimitCounters: RateLimitState;
  setDisplayAlias: (alias: string) => void;
  pushGreeting: (greetingId: string) => void;
  updateRateLimits: (limits: RateLimitState) => void;
  clearAll: () => void;
  reset: () => void;
}

const createInitialState = () => ({
  actorId: getOrCreateActorId(),
  displayAlias: null as string | null,
  greetingHistory: [] as string[],
  rateLimitCounters: {
    hourlyCount: 0,
    hourlyWindowStart: '',
    dailyCount: 0,
    dailyWindowStart: '',
  } as RateLimitState,
});

export const useVisitorStore = create<VisitorState>()((set) => ({
  ...createInitialState(),
  setDisplayAlias: (displayAlias) => set({ displayAlias }),
  pushGreeting: (greetingId) =>
    set((state) => {
      const updated = [...state.greetingHistory, greetingId];
      return { greetingHistory: updated.slice(-20) };
    }),
  updateRateLimits: (rateLimitCounters) => set({ rateLimitCounters }),
  clearAll: () => {
    localStorage.removeItem(`${STORAGE_PREFIX}actorId`);
    set(createInitialState());
  },
  reset: () => set(createInitialState()),
}));
