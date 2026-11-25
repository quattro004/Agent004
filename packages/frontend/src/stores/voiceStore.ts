import { create } from 'zustand';

/** One independently decodable Polly segment, as the agent's SSE stream numbers it. */
export interface AudioSegment {
  seq: number;
  format: 'mp3';
  data: string;
}

/**
 * The agent restarts `seq` at 0 in every turn, so a segment is only ordered
 * against the others of its own turn.
 */
export interface AudioClip extends AudioSegment {
  turn: number;
}

interface VoiceState {
  isSpeaking: boolean;
  isMouthOpen: boolean;
  isMicActive: boolean;
  isGreeting: boolean;
  audioQueue: AudioClip[];
  /** Counts turns; clips enqueued now belong to this one. */
  audioTurn: number;
  setSpeaking: (value: boolean) => void;
  setMouthOpen: (value: boolean) => void;
  setMicActive: (value: boolean) => void;
  setGreeting: (value: boolean) => void;
  beginAudioTurn: () => void;
  enqueueAudio: (segment: AudioSegment) => void;
  shiftAudio: () => AudioClip | undefined;
  clearAudio: () => void;
  reset: () => void;
}

const initialState = {
  isSpeaking: false,
  isMouthOpen: false,
  isMicActive: false,
  isGreeting: false,
  audioQueue: [] as AudioClip[],
  audioTurn: 0,
};

export const useVoiceStore = create<VoiceState>()((set, get) => ({
  ...initialState,
  setSpeaking: (isSpeaking) => set({ isSpeaking }),
  setMouthOpen: (isMouthOpen) => set({ isMouthOpen }),
  setMicActive: (isMicActive) => set({ isMicActive }),
  setGreeting: (isGreeting) => set({ isGreeting }),
  beginAudioTurn: () => set((state) => ({ audioTurn: state.audioTurn + 1 })),
  enqueueAudio: (segment) =>
    set((state) => ({ audioQueue: [...state.audioQueue, { ...segment, turn: state.audioTurn }] })),
  shiftAudio: () => {
    const [next, ...rest] = get().audioQueue;
    if (!next) return undefined;
    set({ audioQueue: rest });
    return next;
  },
  clearAudio: () => set({ audioQueue: [] }),
  reset: () => set({ ...initialState, audioQueue: [] }),
}));
