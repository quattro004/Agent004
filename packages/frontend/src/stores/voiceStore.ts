import { create } from 'zustand';

interface VoiceState {
  isSpeaking: boolean;
  isMouthOpen: boolean;
  isMicActive: boolean;
  setSpeaking: (value: boolean) => void;
  setMouthOpen: (value: boolean) => void;
  setMicActive: (value: boolean) => void;
  reset: () => void;
}

const initialState = {
  isSpeaking: false,
  isMouthOpen: false,
  isMicActive: false,
};

export const useVoiceStore = create<VoiceState>()((set) => ({
  ...initialState,
  setSpeaking: (isSpeaking) => set({ isSpeaking }),
  setMouthOpen: (isMouthOpen) => set({ isMouthOpen }),
  setMicActive: (isMicActive) => set({ isMicActive }),
  reset: () => set(initialState),
}));
