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
  getIsMouthOpen(): boolean;
  triggerStutter(): void;
  triggerStaticBurst(): void;
  dispose(): void;
}

const FFT_SIZE = 256;
const MOUTH_THRESHOLD = 100;
const LOW_FREQ_BIN_COUNT = 8; // ~0–500Hz at 44100Hz with FFT 256

export function createAudioChain(): AudioChain {
  let ctx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let stutterNode: AudioWorkletNode | null = null;
  let pitchNode: AudioWorkletNode | null = null;
  let eqNode: AudioWorkletNode | null = null;
  let staticNode: AudioWorkletNode | null = null;
  let currentSource: AudioBufferSourceNode | null = null;
  let frequencyData: Uint8Array<ArrayBuffer> | null = null;

  return {
    async init() {
      ctx = new AudioContext();

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

      // Chain: stutter → pitch → EQ → static → analyser → destination
      stutterNode.connect(pitchNode);
      pitchNode.connect(eqNode);
      eqNode.connect(staticNode);
      staticNode.connect(analyser);
      analyser.connect(ctx.destination);
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

    dispose() {
      currentSource?.stop();
      ctx?.close();
      ctx = null;
      analyser = null;
      stutterNode = null;
      pitchNode = null;
      eqNode = null;
      staticNode = null;
      currentSource = null;
    },
  };
}
