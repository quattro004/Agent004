import { create } from 'zustand';

interface VoiceState {
  isSpeaking: boolean;
  isMouthOpen: boolean;
  isMicActive: boolean;
  isGreeting: boolean;
  setSpeaking: (value: boolean) => void;
  setMouthOpen: (value: boolean) => void;
  setMicActive: (value: boolean) => void;
  setGreeting: (value: boolean) => void;
  reset: () => void;
}

const initialState = {
  isSpeaking: false,
  isMouthOpen: false,
  isMicActive: false,
  isGreeting: false,
};

export const useVoiceStore = create<VoiceState>()((set) => ({
  ...initialState,
  setSpeaking: (isSpeaking) => set({ isSpeaking }),
  setMouthOpen: (isMouthOpen) => set({ isMouthOpen }),
  setMicActive: (isMicActive) => set({ isMicActive }),
  setGreeting: (isGreeting) => set({ isGreeting }),
  reset: () => set(initialState),
}));
