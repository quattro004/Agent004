/**
 * useAudio — bridges Polly TTS → AudioWorklet chain → voiceStore mouth animation.
 * Subscribes to conversationStore for streaming→complete transitions,
 * calls synthesizeTurn(), decodes audio, plays through audioChain,
 * polls mouth state at ~20Hz.
 */

import type { AudioChain } from '../audio/audioChain';
import { useConversationStore } from '../stores/conversationStore';
import { useVoiceStore } from '../stores/voiceStore';
import { synthesizeTurn } from '../services/pollyTts';

const MOUTH_POLL_INTERVAL_MS = 50; // ~20Hz

export interface UseAudioHandle {
  dispose: () => void;
}

export function createUseAudio(audioChain: AudioChain): UseAudioHandle {
  let lastProcessedTurnIndex = -1;
  let mouthPollTimer: ReturnType<typeof setInterval> | null = null;
  let wasStreaming = false;

  function startMouthPolling() {
    stopMouthPolling();
    mouthPollTimer = setInterval(() => {
      const isOpen = audioChain.getIsMouthOpen();
      useVoiceStore.getState().setMouthOpen(isOpen);
    }, MOUTH_POLL_INTERVAL_MS);
  }

  function stopMouthPolling() {
    if (mouthPollTimer !== null) {
      clearInterval(mouthPollTimer);
      mouthPollTimer = null;
    }
    useVoiceStore.getState().setMouthOpen(false);
  }

  async function handleTurnComplete(text: string) {
    const voiceState = useVoiceStore.getState();
    voiceState.setSpeaking(true);

    try {
      const result = await synthesizeTurn(text);

      if (result.textOnly || !result.audioData) {
        voiceState.setSpeaking(false);
        return;
      }

      // Decode audio data into an AudioBuffer
      const audioCtx = new AudioContext();
      const audioBuffer = await audioCtx.decodeAudioData(
        result.audioData.buffer instanceof SharedArrayBuffer
          ? result.audioData.slice().buffer
          : result.audioData.buffer,
      );
      await audioCtx.close();

      audioChain.play(audioBuffer);
      startMouthPolling();
    } catch {
      useVoiceStore.getState().setSpeaking(false);
      stopMouthPolling();
    }
  }

  const unsubscribe = useConversationStore.subscribe(() => {
    const { isStreaming, currentResponseText, currentTurnIndex } = useConversationStore.getState();

    // Detect streaming→complete transition
    if (wasStreaming && !isStreaming && currentResponseText.length > 0) {
      if (currentTurnIndex !== lastProcessedTurnIndex) {
        lastProcessedTurnIndex = currentTurnIndex;
        void handleTurnComplete(currentResponseText);
      }
    }
    wasStreaming = isStreaming;
  });

  return {
    dispose() {
      unsubscribe();
      stopMouthPolling();
    },
  };
}
