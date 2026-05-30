/**
 * useGreeting — greeting selection → pre-recorded MP3 → mouth sync.
 * Loads manifest once, selects greeting via greetingSelector,
 * fetches pre-generated MP3, plays through audioChain with mouth polling.
 */

import type { AudioChain } from '../audio/audioChain';
import { useVisitorStore } from '../stores/visitorStore';
import { useVoiceStore } from '../stores/voiceStore';
import { selectGreeting, loadManifest, type GreetingManifest } from '../services/greetingSelector';
import {
  speak as browserSpeak,
  isAvailable as browserTtsAvailable,
  stop as stopBrowserTts,
} from '../services/browserTts';

const MOUTH_POLL_INTERVAL_MS = 50;

export interface GreetingResult {
  id: string;
  text: string;
  completion?: Promise<void>;
}

export interface PreloadedGreeting extends GreetingResult {
  audioBuffer: AudioBuffer | null;
  durationMs: number;
}

export interface UseGreetingHandle {
  preloadGreeting: (options?: { signal?: AbortSignal }) => Promise<PreloadedGreeting | null>;
  playGreeting: (preloaded?: PreloadedGreeting | null) => Promise<GreetingResult | null>;
  stopGreeting: () => void;
}

export function createUseGreeting(audioChain: AudioChain): UseGreetingHandle {
  let cachedManifest: GreetingManifest | null = null;
  let mouthPollTimer: ReturnType<typeof setInterval> | null = null;
  let playbackToken = 0;

  function isAbortError(error: unknown): boolean {
    return (
      (error instanceof DOMException && error.name === 'AbortError') ||
      (typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        (error as { name?: string }).name === 'AbortError')
    );
  }

  async function fetchResource(input: string, signal?: AbortSignal): Promise<Response> {
    if (signal) {
      return fetch(input, { signal });
    }
    return fetch(input);
  }

  async function loadCachedManifest(signal?: AbortSignal): Promise<GreetingManifest | null> {
    if (cachedManifest) return cachedManifest;
    const response = await fetchResource('/greetings/manifest.json', signal);
    if (!response.ok) return null;
    const raw = await response.text();
    cachedManifest = loadManifest(raw);
    return cachedManifest;
  }

  async function decodeGreetingAudio(
    audioPath: string,
    signal?: AbortSignal,
  ): Promise<AudioBuffer | null> {
    const audioResponse = await fetchResource(audioPath, signal);
    if (!audioResponse.ok) return null;

    const arrayBuffer = await audioResponse.arrayBuffer();
    const audioCtx = new AudioContext();
    try {
      return await audioCtx.decodeAudioData(arrayBuffer);
    } finally {
      await audioCtx.close();
    }
  }

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

  function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function preloadGreeting(options?: {
    signal?: AbortSignal;
  }): Promise<PreloadedGreeting | null> {
    try {
      const manifest = await loadCachedManifest(options?.signal);
      if (!manifest) return null;

      const visitorState = useVisitorStore.getState();
      const selected = selectGreeting(manifest, visitorState.greetingHistory);

      let audioBuffer: AudioBuffer | null = null;
      try {
        audioBuffer = await decodeGreetingAudio(selected.audioPath, options?.signal);
      } catch (error) {
        if (isAbortError(error)) return null;
        console.error('[useGreeting] Failed to preload greeting audio', error);
      }

      return {
        id: selected.id,
        text: selected.text,
        audioBuffer,
        durationMs: selected.audioDurationMs,
      };
    } catch (error) {
      if (isAbortError(error)) return null;
      console.error('[useGreeting] Failed to preload greeting', error);
      return null;
    }
  }

  async function playGreeting(
    preloaded?: PreloadedGreeting | null,
  ): Promise<GreetingResult | null> {
    try {
      const greeting = preloaded ?? (await preloadGreeting());
      if (!greeting) return null;
      useVisitorStore.getState().pushGreeting(greeting.id);
      const currentPlaybackToken = ++playbackToken;
      const finalizePlayback = (completion: Promise<void>) =>
        completion.finally(() => {
          if (playbackToken !== currentPlaybackToken) return;
          stopMouthPolling();
          useVoiceStore.getState().setSpeaking(false);
          useVoiceStore.getState().setMouthOpen(false);
        });

      if (greeting.audioBuffer) {
        useVoiceStore.getState().setSpeaking(true);
        audioChain.play(greeting.audioBuffer);
        startMouthPolling();
        return {
          id: greeting.id,
          text: greeting.text,
          completion: finalizePlayback(delay(greeting.durationMs)),
        };
      }

      if (greeting.text && browserTtsAvailable()) {
        useVoiceStore.getState().setSpeaking(true);
        return {
          id: greeting.id,
          text: greeting.text,
          completion: finalizePlayback(
            browserSpeak(greeting.text).catch((error) => {
              console.error('[useGreeting] Browser TTS playback failed', error);
            }),
          ),
        };
      }

      return { id: greeting.id, text: greeting.text, completion: Promise.resolve() };
    } catch (error) {
      if (!isAbortError(error)) {
        console.error('[useGreeting] Failed to play greeting', error);
      }
      return null;
    }
  }

  function stopGreeting() {
    playbackToken += 1;
    audioChain.stop();
    stopBrowserTts();
    stopMouthPolling();
    useVoiceStore.getState().setSpeaking(false);
    useVoiceStore.getState().setMouthOpen(false);
  }

  return { preloadGreeting, playGreeting, stopGreeting };
}
