import { create } from 'zustand';

/** One independently decodable Polly segment from the agent's SSE stream. */
export interface AudioClip {
  seq: number;
  format: 'mp3';
  data: string;
}

interface VoiceState {
  isSpeaking: boolean;
  isMouthOpen: boolean;
  isMicActive: boolean;
  isGreeting: boolean;
  audioQueue: AudioClip[];
  setSpeaking: (value: boolean) => void;
  setMouthOpen: (value: boolean) => void;
  setMicActive: (value: boolean) => void;
  setGreeting: (value: boolean) => void;
  enqueueAudio: (clip: AudioClip) => void;
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
};

export const useVoiceStore = create<VoiceState>()((set, get) => ({
  ...initialState,
  setSpeaking: (isSpeaking) => set({ isSpeaking }),
  setMouthOpen: (isMouthOpen) => set({ isMouthOpen }),
  setMicActive: (isMicActive) => set({ isMicActive }),
  setGreeting: (isGreeting) => set({ isGreeting }),
  enqueueAudio: (clip) => set((state) => ({ audioQueue: [...state.audioQueue, clip] })),
  shiftAudio: () => {
    const [next, ...rest] = get().audioQueue;
    if (!next) return undefined;
    set({ audioQueue: rest });
    return next;
  },
  clearAudio: () => set({ audioQueue: [] }),
  reset: () => set({ ...initialState, audioQueue: [] }),
}));
