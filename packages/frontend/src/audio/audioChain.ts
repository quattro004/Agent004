/**
 * Audio chain orchestrator.
 * Manages AudioContext lifecycle, registers AudioWorklet processors,
 * glitches each clip (see glitchEngine.ts), then connects
 * source → stutter → EQ → static → analyser → gain → destination.
 * Provides mouth-open detection via AnalyserNode FFT.
 */
import { createGlitcher, type Glitcher } from './glitchEngine';

export interface AudioChain {
  init(): Promise<void>;
  /** Plays a clip with voice glitches applied; returns the played duration in ms (0 before init). */
  play(audioBuffer: AudioBuffer): number;
  stop(): void;
  setVolume(level: number): void;
  getIsMouthOpen(): boolean;
  triggerStutter(): void;
  triggerStaticBurst(): void;
  playStatic(durationMs?: number): void;
  stopStatic(): void;
  dispose(): void;
}

export interface AudioChainOptions {
  glitcher?: Glitcher;
}

const FFT_SIZE = 256;
const MOUTH_THRESHOLD = 100;
const LOW_FREQ_BIN_COUNT = 8; // ~0–500Hz at 44100Hz with FFT 256
const VOLUME_RAMP_SECONDS = 0.02; // 20ms ramp avoids clicks
const DEFAULT_VOLUME = 0.5;
const STATIC_GAIN = 0.11;
const TICK_SAMPLES = 441;
const TICK_GAIN = 0.15;

export function createAudioChain(options: AudioChainOptions = {}): AudioChain {
  const glitcher = options.glitcher ?? createGlitcher();
  let ctx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let gainNode: GainNode | null = null;
  let stutterNode: AudioWorkletNode | null = null;
  let eqNode: AudioWorkletNode | null = null;
  let staticNode: AudioWorkletNode | null = null;
  let currentSource: AudioBufferSourceNode | null = null;
  let tickSources: AudioBufferSourceNode[] = [];
  let tickBuffer: AudioBuffer | null = null;
  let staticSource: AudioBufferSourceNode | null = null;
  let staticStopTimer: ReturnType<typeof setTimeout> | null = null;
  let frequencyData: Uint8Array<ArrayBuffer> | null = null;
  let visibilityHandler: (() => void) | null = null;
  let initPromise: Promise<void> | null = null;
  // Volume requested before init resolves is buffered and applied post-init
  let pendingVolume: number | null = null;
  let currentVolume = DEFAULT_VOLUME;

  function clamp01(value: number): number {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  }

  function applyVolume(level: number): void {
    if (!ctx || !gainNode) return;
    gainNode.gain.linearRampToValueAtTime(level, ctx.currentTime + VOLUME_RAMP_SECONDS);
  }

  function stopVoice(): void {
    currentSource?.stop();
    currentSource = null;
    for (const tick of tickSources) tick.stop();
    tickSources = [];
  }

  function scheduleTick(when: number): void {
    if (!ctx || !gainNode) return;
    if (!tickBuffer) {
      tickBuffer = ctx.createBuffer(1, TICK_SAMPLES, ctx.sampleRate);
      const data = tickBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * TICK_GAIN;
    }
    const tick = ctx.createBufferSource();
    tick.buffer = tickBuffer;
    tick.connect(gainNode);
    tick.start(when);
    tickSources.push(tick);
    tick.onended = () => {
      tickSources = tickSources.filter((pending) => pending !== tick);
    };
  }

  return {
    init() {
      // Idempotent: only create AudioContext once. Subsequent calls
      // return the same promise so callers can safely await ordering.
      if (initPromise) return initPromise;
      initPromise = (async () => {
        ctx = new AudioContext();

        // iOS Safari autoplay unlock — resume suspended context
        await ctx.resume();

        await ctx.audioWorklet.addModule(new URL('./stutterProcessor.ts', import.meta.url).href);
        await ctx.audioWorklet.addModule(new URL('./eqProcessor.ts', import.meta.url).href);
        await ctx.audioWorklet.addModule(new URL('./staticProcessor.ts', import.meta.url).href);

        stutterNode = new AudioWorkletNode(ctx, 'stutter-processor');
        eqNode = new AudioWorkletNode(ctx, 'eq-processor');
        staticNode = new AudioWorkletNode(ctx, 'static-processor');

        analyser = ctx.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        frequencyData = new Uint8Array(analyser.frequencyBinCount);

        gainNode = ctx.createGain();
        gainNode.gain.value = currentVolume;

        // Chain: stutter → EQ → static → analyser → gain → destination
        stutterNode.connect(eqNode);
        eqNode.connect(staticNode);
        staticNode.connect(analyser);
        analyser.connect(gainNode);
        gainNode.connect(ctx.destination);

        // iOS Safari 16–16.3 audio routing fix: resume on visibility return
        visibilityHandler = () => {
          if (document.visibilityState === 'visible' && ctx?.state === 'suspended') {
            ctx.resume();
          }
        };
        document.addEventListener('visibilitychange', visibilityHandler);

        // Apply any volume set before init resolved
        if (pendingVolume !== null) {
          applyVolume(pendingVolume);
          pendingVolume = null;
        }
      })();
      return initPromise;
    },

    play(audioBuffer: AudioBuffer) {
      if (!ctx || !stutterNode) return 0;

      stopVoice();

      const sampleRate = audioBuffer.sampleRate;
      const glitched = glitcher(audioBuffer.getChannelData(0), sampleRate);
      const buffer = ctx.createBuffer(1, glitched.samples.length, sampleRate);
      buffer.getChannelData(0).set(glitched.samples);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(stutterNode);
      const startAt = ctx.currentTime;
      source.start(startAt);
      currentSource = source;
      for (const offset of glitched.tickOffsets) scheduleTick(startAt + offset / sampleRate);

      source.onended = () => {
        if (currentSource === source) currentSource = null;
      };
      return (glitched.samples.length / sampleRate) * 1000;
    },

    stop() {
      stopVoice();
    },

    setVolume(level: number) {
      const clamped = clamp01(level);
      currentVolume = clamped;
      if (gainNode && ctx) {
        applyVolume(clamped);
      } else {
        pendingVolume = clamped;
      }
    },

    getIsMouthOpen(): boolean {
      if (!analyser || !frequencyData) return false;
      analyser.getByteFrequencyData(frequencyData);

      // Average energy in low-frequency bins (0–500Hz)
      let sum = 0;
      for (let i = 0; i < LOW_FREQ_BIN_COUNT; i++) {
        sum += frequencyData[i];
      }
      const avg = sum / LOW_FREQ_BIN_COUNT;
      return avg > MOUTH_THRESHOLD;
    },

    triggerStutter() {
      stutterNode?.port.postMessage({ type: 'stutter-start' });
      setTimeout(() => {
        stutterNode?.port.postMessage({ type: 'stutter-stop' });
      }, 80);
      staticNode?.port.postMessage({ type: 'burst' });
    },

    triggerStaticBurst() {
      staticNode?.port.postMessage({ type: 'burst' });
    },

    playStatic(durationMs?: number) {
      if (!ctx || !gainNode) return;

      // Stop any previous static noise (and cancel its pending auto-stop timer)
      if (staticStopTimer) {
        clearTimeout(staticStopTimer);
        staticStopTimer = null;
      }
      if (staticSource) {
        try {
          staticSource.stop();
        } catch {
          // Already stopped; ignore.
        }
        staticSource = null;
      }

      // 1-second loopable white-noise buffer (mono) — small + loops to fill duration.
      const sampleRate = ctx.sampleRate || 44100;
      const buffer = ctx.createBuffer(1, sampleRate, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * STATIC_GAIN;
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      // Route through gainNode so the volume knob controls static loudness.
      source.connect(gainNode);
      source.start();
      staticSource = source;

      if (durationMs !== undefined) {
        staticStopTimer = setTimeout(() => {
          try {
            source.stop();
          } catch {
            // Already stopped; ignore.
          }
          if (staticSource === source) staticSource = null;
          staticStopTimer = null;
        }, durationMs);
      }
    },

    stopStatic() {
      if (staticStopTimer) {
        clearTimeout(staticStopTimer);
        staticStopTimer = null;
      }
      if (staticSource) {
        try {
          staticSource.stop();
        } catch {
          // Already stopped; ignore.
        }
        staticSource = null;
      }
    },

    dispose() {
      stopVoice();
      if (staticStopTimer) {
        clearTimeout(staticStopTimer);
        staticStopTimer = null;
      }
      if (staticSource) {
        try {
          staticSource.stop();
        } catch {
          // Already stopped; ignore.
        }
        staticSource = null;
      }
      if (visibilityHandler) {
        document.removeEventListener('visibilitychange', visibilityHandler);
        visibilityHandler = null;
      }
      ctx?.close();
      ctx = null;
      analyser = null;
      gainNode = null;
      stutterNode = null;
      eqNode = null;
      staticNode = null;
      currentSource = null;
      tickBuffer = null;
      initPromise = null;
      pendingVolume = null;
    },
  };
}
