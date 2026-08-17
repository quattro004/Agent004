import { describe, it, expect, beforeEach } from 'vitest';
import { useVoiceStore } from '../../src/stores/voiceStore';

describe('voiceStore', () => {
  beforeEach(() => {
    useVoiceStore.getState().reset();
  });

  it('should initialize with all flags false', () => {
    const state = useVoiceStore.getState();
    expect(state.isSpeaking).toBe(false);
    expect(state.isMouthOpen).toBe(false);
    expect(state.isMicActive).toBe(false);
  });

  it('should toggle speaking state', () => {
    const store = useVoiceStore.getState();
    store.setSpeaking(true);
    expect(useVoiceStore.getState().isSpeaking).toBe(true);

    store.setSpeaking(false);
    expect(useVoiceStore.getState().isSpeaking).toBe(false);
  });

  it('should toggle mouth open state', () => {
    const store = useVoiceStore.getState();
    store.setMouthOpen(true);
    expect(useVoiceStore.getState().isMouthOpen).toBe(true);

    store.setMouthOpen(false);
    expect(useVoiceStore.getState().isMouthOpen).toBe(false);
  });

  it('should toggle mic active state', () => {
    const store = useVoiceStore.getState();
    store.setMicActive(true);
    expect(useVoiceStore.getState().isMicActive).toBe(true);

    store.setMicActive(false);
    expect(useVoiceStore.getState().isMicActive).toBe(false);
  });

  it('should reset all voice state', () => {
    const store = useVoiceStore.getState();
    store.setSpeaking(true);
    store.setMouthOpen(true);
    store.setMicActive(true);
    store.reset();

    const state = useVoiceStore.getState();
    expect(state.isSpeaking).toBe(false);
    expect(state.isMouthOpen).toBe(false);
    expect(state.isMicActive).toBe(false);
  });

  it('should initialize isGreeting as false', () => {
    const state = useVoiceStore.getState();
    expect(state.isGreeting).toBe(false);
  });

  it('should toggle greeting state via setGreeting', () => {
    const store = useVoiceStore.getState();
    store.setGreeting(true);
    expect(useVoiceStore.getState().isGreeting).toBe(true);

    store.setGreeting(false);
    expect(useVoiceStore.getState().isGreeting).toBe(false);
  });

  it('should clear isGreeting on reset', () => {
    const store = useVoiceStore.getState();
    store.setGreeting(true);
    expect(useVoiceStore.getState().isGreeting).toBe(true);

    store.reset();
    expect(useVoiceStore.getState().isGreeting).toBe(false);
  });
});
