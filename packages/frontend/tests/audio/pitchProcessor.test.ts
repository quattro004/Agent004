/**
 * pitch-processor AudioWorklet DSP.
 *
 * The greeting MP3 is the first real audio routed through the worklet chain
 * (browser TTS bypasses it, and playStatic connects straight to the gain node),
 * so this processor was previously unexercised.
 */
import { describe, it, expect, beforeAll } from 'vitest';

interface Processor {
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
}

const RENDER_QUANTUM = 128;

let ProcessorCtor: new () => Processor;

beforeAll(async () => {
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.AudioWorkletProcessor = class {
    port = { onmessage: null, postMessage: () => {} };
  };
  globals.registerProcessor = (_name: string, ctor: new () => Processor) => {
    ProcessorCtor = ctor;
  };
  globals.sampleRate = 48000;
  await import('../../src/audio/pitchProcessor');
});

/** Run `quanta` render blocks of a steady signal, returning each block's RMS. */
function runSteadySignal(processor: Processor, quanta: number, amplitude = 0.5): number[] {
  const rms: number[] = [];
  for (let q = 0; q < quanta; q++) {
    const input = new Float32Array(RENDER_QUANTUM).fill(amplitude);
    const output = new Float32Array(RENDER_QUANTUM);
    processor.process([[input]], [[output]]);
    let sum = 0;
    for (const sample of output) sum += sample * sample;
    rms.push(Math.sqrt(sum / output.length));
  }
  return rms;
}

describe('pitch-processor', () => {
  it('registers under the name the audio chain instantiates', () => {
    expect(ProcessorCtor).toBeDefined();
  });

  // Regression: the original implementation advanced `phase` by
  // pitchFactor * 128 = 134.4 per quantum but only rewound it by the 128
  // samples it was actually given. The ~6.4-sample deficit accumulated until
  // `phase` permanently exceeded the input block, after which every sample was
  // written as 0 with no recovery — silence after ~56ms.
  it('still produces audio after sustained playback', () => {
    const processor = new ProcessorCtor();
    const rms = runSteadySignal(processor, 200);

    expect(rms[rms.length - 1]).toBeGreaterThan(0.05);
  });

  it('never decays to permanent silence mid-stream', () => {
    const processor = new ProcessorCtor();
    const rms = runSteadySignal(processor, 400);

    const silentBlocks = rms.slice(20).filter((value) => value < 0.01).length;
    expect(silentBlocks).toBe(0);
  });

  it('roughly preserves the level of a steady signal', () => {
    const processor = new ProcessorCtor();
    const rms = runSteadySignal(processor, 200, 0.5);

    const settled = rms.slice(50);
    const average = settled.reduce((a, b) => a + b, 0) / settled.length;
    expect(average).toBeGreaterThan(0.3);
    expect(average).toBeLessThan(0.7);
  });

  it('passes through silence without generating noise', () => {
    const processor = new ProcessorCtor();
    const rms = runSteadySignal(processor, 50, 0);

    expect(Math.max(...rms)).toBe(0);
  });

  it('shifts a tone up by roughly the 5% pitch factor', () => {
    const processor = new ProcessorCtor();
    const sampleRate = 48000;
    const inputHz = 440;
    const collected: number[] = [];
    let n = 0;

    for (let q = 0; q < 400; q++) {
      const input = new Float32Array(RENDER_QUANTUM);
      for (let i = 0; i < RENDER_QUANTUM; i++, n++) {
        input[i] = Math.sin((2 * Math.PI * inputHz * n) / sampleRate);
      }
      const output = new Float32Array(RENDER_QUANTUM);
      processor.process([[input]], [[output]]);
      collected.push(...output);
    }

    // Measure output frequency by counting upward zero crossings, skipping the
    // ring-buffer warm-up.
    const settled = collected.slice(20000);
    let crossings = 0;
    for (let i = 1; i < settled.length; i++) {
      if (settled[i - 1] < 0 && settled[i] >= 0) crossings++;
    }
    const outputHz = (crossings * sampleRate) / settled.length;

    expect(outputHz / inputHz).toBeGreaterThan(1.02);
    expect(outputHz / inputHz).toBeLessThan(1.08);
  });
});
