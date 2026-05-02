/**
 * useGreeting — greeting selection → pre-recorded MP3 → mouth sync.
 * Loads manifest once, selects greeting via greetingSelector,
 * fetches pre-generated MP3, plays through audioChain with mouth polling.
 */

import type { AudioChain } from '../audio/audioChain';
import { useVisitorStore } from '../stores/visitorStore';
import { useVoiceStore } from '../stores/voiceStore';
import { selectGreeting, loadManifest, type GreetingManifest } from '../services/greetingSelector';

const MOUTH_POLL_INTERVAL_MS = 50;

export interface GreetingResult {
  id: string;
  text: string;
}

export interface UseGreetingHandle {
  playGreeting: () => Promise<GreetingResult | null>;
  stopGreeting: () => void;
}

export function createUseGreeting(audioChain: AudioChain): UseGreetingHandle {
  let cachedManifest: GreetingManifest | null = null;
  let mouthPollTimer: ReturnType<typeof setInterval> | null = null;

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

  async function playGreeting(): Promise<GreetingResult | null> {
    try {
      // Load manifest (cached after first fetch)
      if (!cachedManifest) {
        const response = await fetch('/greetings/manifest.json');
        if (!response.ok) return null;
        const raw = await response.text();
        cachedManifest = loadManifest(raw);
      }

      const visitorState = useVisitorStore.getState();
      const selected = selectGreeting(cachedManifest, visitorState.greetingHistory);

      // Record selection
      visitorState.pushGreeting(selected.id);

      // Fetch the pre-generated MP3
      const audioResponse = await fetch(selected.audioPath);
      if (!audioResponse.ok) return { id: selected.id, text: selected.text };

      const arrayBuffer = await audioResponse.arrayBuffer();
      const audioCtx = new AudioContext();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      await audioCtx.close();

      useVoiceStore.getState().setSpeaking(true);
      audioChain.play(audioBuffer);
      startMouthPolling();

      return { id: selected.id, text: selected.text };
    } catch {
      return null;
    }
  }

  function stopGreeting() {
    audioChain.stop();
    stopMouthPolling();
    useVoiceStore.getState().setSpeaking(false);
  }

  return { playGreeting, stopGreeting };
}
