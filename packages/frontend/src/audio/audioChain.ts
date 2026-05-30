/**
 * Audio chain orchestrator.
 * Manages AudioContext lifecycle, registers AudioWorklet processors,
 * connects chain: source → stutter → pitch → EQ → static → analyser → destination.
 * Provides mouth-open detection via AnalyserNode FFT.
 */

export interface AudioChain {
  init(): Promise<void>;
  play(audioBuffer: AudioBuffer): void;
  stop(): void;
  setVolume(level: number): void;
  getIsMouthOpen(): boolean;
  triggerStutter(): void;
  triggerStaticBurst(): void;
  playStatic(durationMs?: number): void;
  stopStatic(): void;
  dispose(): void;
}

const FFT_SIZE = 256;
const MOUTH_THRESHOLD = 100;
const LOW_FREQ_BIN_COUNT = 8; // ~0–500Hz at 44100Hz with FFT 256
const VOLUME_RAMP_SECONDS = 0.02; // 20ms ramp avoids clicks
const DEFAULT_VOLUME = 0.5;

export function createAudioChain(): AudioChain {
  let ctx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let gainNode: GainNode | null = null;
  let stutterNode: AudioWorkletNode | null = null;
  let pitchNode: AudioWorkletNode | null = null;
  let eqNode: AudioWorkletNode | null = null;
  let staticNode: AudioWorkletNode | null = null;
  let currentSource: AudioBufferSourceNode | null = null;
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
        await ctx.audioWorklet.addModule(new URL('./pitchProcessor.ts', import.meta.url).href);
        await ctx.audioWorklet.addModule(new URL('./eqProcessor.ts', import.meta.url).href);
        await ctx.audioWorklet.addModule(new URL('./staticProcessor.ts', import.meta.url).href);

        stutterNode = new AudioWorkletNode(ctx, 'stutter-processor');
        pitchNode = new AudioWorkletNode(ctx, 'pitch-processor');
        eqNode = new AudioWorkletNode(ctx, 'eq-processor');
        staticNode = new AudioWorkletNode(ctx, 'static-processor');

        analyser = ctx.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        frequencyData = new Uint8Array(analyser.frequencyBinCount);

        gainNode = ctx.createGain();
        gainNode.gain.value = currentVolume;

        // Chain: stutter → pitch → EQ → static → analyser → gain → destination
        stutterNode.connect(pitchNode);
        pitchNode.connect(eqNode);
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
      if (!ctx || !stutterNode) return;

      // Stop any currently playing source
      currentSource?.stop();

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(stutterNode);
      source.start();
      currentSource = source;

      source.onended = () => {
        if (currentSource === source) currentSource = null;
      };
    },

    stop() {
      currentSource?.stop();
      currentSource = null;
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
        data[i] = Math.random() * 2 - 1;
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
      currentSource?.stop();
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
      pitchNode = null;
      eqNode = null;
      staticNode = null;
      currentSource = null;
      initPromise = null;
      pendingVolume = null;
    },
  };
}
