/**
 * useAudio — plays the voice the runtime synthesized.
 *
 * Voice is Polly, server-side, streamed to the browser as SSE `audio`
 * events (contracts/transport-sse.md; research Q1). Each event is one
 * independently decodable MP3 segment, so this drains the voice store's
 * queue in order, decodes each segment and plays it through the DSP chain.
 *
 * There is no browser speech-synthesis fallback. Browser TTS was rejected
 * because it breaches P1, and the soft-degrade is text-only: when the
 * server sends no audio, Max is simply silent.
 */

import type { AudioChain } from '../audio/audioChain';
import { useVoiceStore, type AudioClip } from '../stores/voiceStore';

const MOUTH_POLL_INTERVAL_MS = 50; // ~20Hz

export interface UseAudioHandle {
  dispose: () => void;
}

function decodeBase64(data: string): ArrayBuffer {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function createUseAudio(audioChain: AudioChain): UseAudioHandle {
  let mouthPollTimer: ReturnType<typeof setInterval> | null = null;
  let draining = false;
  let disposed = false;
  let lastPlayedSeq = -1;

  function startMouthPolling() {
    if (mouthPollTimer !== null) return;
    mouthPollTimer = setInterval(() => {
      useVoiceStore.getState().setMouthOpen(audioChain.getIsMouthOpen());
    }, MOUTH_POLL_INTERVAL_MS);
  }

  function stopMouthPolling() {
    if (mouthPollTimer !== null) {
      clearInterval(mouthPollTimer);
      mouthPollTimer = null;
    }
    useVoiceStore.getState().setMouthOpen(false);
  }

  function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function play(clip: AudioClip): Promise<void> {
    const context = new AudioContext();
    try {
      const buffer = await context.decodeAudioData(decodeBase64(clip.data));
      if (disposed) return;
      const durationMs = audioChain.play(buffer);
      startMouthPolling();
      await wait(durationMs);
    } finally {
      await context.close();
    }
  }

  async function drain(): Promise<void> {
    if (draining) return;
    draining = true;
    const voice = () => useVoiceStore.getState();
    voice().setSpeaking(true);

    try {
      for (;;) {
        if (disposed) return;
        const clip = voice().shiftAudio();
        if (!clip) return;
        if (clip.seq <= lastPlayedSeq) continue;
        lastPlayedSeq = clip.seq;

        try {
          await play(clip);
        } catch (error) {
          // A segment that will not decode is lost, but the rest of the
          // turn still plays. There is no fallback voice to reach for.
          console.warn('[useAudio] Dropping an undecodable audio segment', error);
        }
      }
    } finally {
      draining = false;
      if (!disposed) {
        voice().setSpeaking(false);
        stopMouthPolling();
      }
    }
  }

  const unsubscribe = useVoiceStore.subscribe((state) => {
    if (state.audioQueue.length > 0 && !draining && !disposed) {
      void drain();
    }
  });

  return {
    dispose() {
      disposed = true;
      unsubscribe();
      stopMouthPolling();
      const voice = useVoiceStore.getState();
      voice.clearAudio();
      voice.setSpeaking(false);
    },
  };
}
