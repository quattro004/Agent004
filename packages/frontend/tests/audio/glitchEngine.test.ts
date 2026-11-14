import { describe, it, expect } from 'vitest';
import { applyGlitches, createEpisodeClock, GlitchEffect } from '../../src/audio/glitchEngine';

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RATE = 1000; // a coarse rate keeps the episode-clock tests fast

/** Splits a mask into runs of identical values: [value, lengthInSamples]. */
function runs(mask: Uint8Array): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const value of mask) {
    const last = out[out.length - 1];
    if (last && last[0] === value) last[1]++;
    else out.push([value, 1]);
  }
  return out;
}

/** Plays the clock through many uneven buffers, as greetings and replies would. */
function playThrough(seed: number, totalSeconds: number): Uint8Array {
  const clock = createEpisodeClock(seeded(seed));
  const sizes = seeded(seed + 1);
  const parts: Uint8Array[] = [];
  let total = 0;
  while (total < totalSeconds * RATE) {
    const part = clock.take(Math.round((0.5 + sizes() * 7) * RATE), RATE);
    parts.push(part);
    total += part.length;
  }
  const mask = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    mask.set(part, offset);
    offset += part.length;
  }
  return mask;
}

describe('episode clock', () => {
  it('starts glitched, then alternates 6–10 s glitch spells with 5–10 s of clean voice across buffers', () => {
    const all = runs(playThrough(7, 3000));
    const complete = all.slice(0, -1); // the final run is cut off by the end of the test

    expect(all[0][0]).not.toBe(0);
    for (let i = 0; i < complete.length; i++) {
      const [mix, length] = complete[i];
      expect(mix === 0).toBe(i % 2 === 1);
      const seconds = length / RATE;
      if (mix === 0) {
        expect(seconds).toBeGreaterThanOrEqual(5);
        expect(seconds).toBeLessThanOrEqual(10);
      } else {
        expect(seconds).toBeGreaterThanOrEqual(6);
        expect(seconds).toBeLessThanOrEqual(10);
      }
    }
  });

  it('gives each spell one random, non-empty mix of effects, covering all seven mixes', () => {
    const mixes = runs(playThrough(11, 6000))
      .map(([mix]) => mix)
      .filter((mix) => mix !== 0);

    expect(mixes.length).toBeGreaterThan(100);
    expect(new Set(mixes)).toEqual(new Set([1, 2, 3, 4, 5, 6, 7]));
  });
});

const SR = 48000;

function tone(seconds: number, hz = 1000, amplitude = 0.5): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR));
  for (let i = 0; i < out.length; i++) out[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / SR);
  return out;
}

function maskOf(length: number, effects: number, fromSample = 0, toSample = length): Uint8Array {
  const mask = new Uint8Array(length);
  mask.fill(effects, fromSample, toSample);
  return mask;
}

/** Frequency of a tone in consecutive windows, as a ratio of `hz`, from upward zero crossings. */
function frequencyRatios(samples: Float32Array, hz = 1000, windowMs = 20): number[] {
  const size = Math.round((windowMs / 1000) * SR);
  const ratios: number[] = [];
  for (let start = 0; start + size <= samples.length; start += size) {
    let crossings = 0;
    for (let i = start + 1; i < start + size; i++) {
      if (samples[i - 1] < 0 && samples[i] >= 0) crossings++;
    }
    ratios.push(crossings / (windowMs / 1000) / hz);
  }
  return ratios;
}

/** Index of the first sample that differs (or the shorter length if one is a prefix), or -1 if identical. */
function firstDifference(a: Float32Array, b: Float32Array): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : length;
}

function rms(samples: Float32Array): number {
  let sum = 0;
  for (const s of samples) sum += s * s;
  return Math.sqrt(sum / samples.length);
}

describe('applyGlitches — clean voice', () => {
  it('leaves audio outside a glitch spell sample-for-sample untouched', () => {
    const input = tone(3);

    const result = applyGlitches(input, SR, maskOf(input.length, 0), seeded(3));

    expect(firstDifference(result.samples, input)).toBe(-1);
    expect(result.tickOffsets).toEqual([]);
  });
});

describe('applyGlitches — pitch jumps', () => {
  it('jumps down to 0.8–0.9 and up to 1.25–1.6, and is otherwise unshifted', () => {
    const input = tone(30);

    const result = applyGlitches(input, SR, maskOf(input.length, GlitchEffect.Pitch), seeded(5));
    const ratios = frequencyRatios(result.samples);

    expect(result.samples.length).toBe(input.length);
    expect(Math.min(...ratios)).toBeGreaterThanOrEqual(0.75);
    expect(Math.max(...ratios)).toBeLessThanOrEqual(1.65);
    expect(ratios.some((r) => r <= 0.9)).toBe(true);
    expect(ratios.some((r) => r >= 1.25)).toBe(true);
    const unshifted = ratios.filter((r) => r > 0.97 && r < 1.03).length;
    expect(unshifted / ratios.length).toBeGreaterThan(0.4);
  });

  it('keeps the level of the voice through a jump', () => {
    const input = tone(30);

    const result = applyGlitches(input, SR, maskOf(input.length, GlitchEffect.Pitch), seeded(5));

    expect(rms(result.samples) / rms(input)).toBeGreaterThan(0.8);
    expect(rms(result.samples) / rms(input)).toBeLessThan(1.2);
  });

  it('stops jumping within a few milliseconds of the spell ending', () => {
    const input = tone(20);
    const spellEnd = 10 * SR;
    const mask = maskOf(input.length, GlitchEffect.Pitch, 0, spellEnd);

    const result = applyGlitches(input, SR, mask, seeded(9));

    expect(frequencyRatios(result.samples.subarray(0, spellEnd)).some((r) => r > 1.2)).toBe(true);
    const settle = Math.round(0.01 * SR);
    expect(
      firstDifference(
        result.samples.subarray(spellEnd + settle),
        input.subarray(spellEnd + settle),
      ),
    ).toBe(-1);
  });

  it('turns silence into silence', () => {
    const input = new Float32Array(5 * SR);

    const result = applyGlitches(input, SR, maskOf(input.length, GlitchEffect.Pitch), seeded(5));

    expect(result.samples.every((s) => s === 0)).toBe(true);
  });
});

function noise(seconds: number, seed: number): Float32Array {
  const random = seeded(seed);
  const out = new Float32Array(Math.round(seconds * SR));
  for (let i = 0; i < out.length; i++) out[i] = random() - 0.5;
  return out;
}

/** Length of the slice starting at `tick` that repeats the audio just before it, ignoring edge fades. */
function repeatedSliceLength(samples: Float32Array, tick: number): number | null {
  const fade = Math.round(0.002 * SR);
  for (let length = Math.round(0.06 * SR); length <= Math.round(0.12 * SR); length++) {
    let matches = true;
    for (let j = fade; j < length - fade && matches; j++) {
      matches = samples[tick + j] === samples[tick - length + j];
    }
    if (matches) return length;
  }
  return null;
}

describe('applyGlitches — syllable replays', () => {
  it('repeats the 60–120 ms just heard, with a tick per repeat, losing none of the original', () => {
    const input = noise(30, 21);

    const result = applyGlitches(input, SR, maskOf(input.length, GlitchEffect.Replay), seeded(4));

    expect(result.tickOffsets.length).toBeGreaterThan(5);
    const lengths = result.tickOffsets.map((tick) => repeatedSliceLength(result.samples, tick));
    expect(lengths).not.toContain(null);

    const restored: Float32Array[] = [];
    let from = 0;
    result.tickOffsets.forEach((tick, i) => {
      restored.push(result.samples.subarray(from, tick));
      from = tick + (lengths[i] as number);
    });
    restored.push(result.samples.subarray(from));
    const joined = new Float32Array(restored.reduce((total, part) => total + part.length, 0));
    restored.reduce((offset, part) => (joined.set(part, offset), offset + part.length), 0);
    expect(firstDifference(joined, input)).toBe(-1);
  });

  it('plays each replayed slice two or three times in all', () => {
    const input = noise(60, 22);

    const result = applyGlitches(input, SR, maskOf(input.length, GlitchEffect.Replay), seeded(6));
    const ticks = result.tickOffsets;
    const groupSizes: number[] = [];
    for (let i = 0; i < ticks.length; i++) {
      const length = repeatedSliceLength(result.samples, ticks[i]);
      if (i > 0 && ticks[i] - ticks[i - 1] === length) groupSizes[groupSizes.length - 1]++;
      else groupSizes.push(1);
    }

    expect(new Set(groupSizes)).toEqual(new Set([1, 2]));
  });

  it('never replays in the first 0.3 s of a buffer', () => {
    const input = noise(0.5, 23);
    for (let seed = 0; seed < 200; seed++) {
      const result = applyGlitches(
        input,
        SR,
        maskOf(input.length, GlitchEffect.Replay),
        seeded(seed),
      );
      for (const tick of result.tickOffsets) expect(tick).toBeGreaterThanOrEqual(0.3 * SR);
    }
  });

  it('never replays near-silence', () => {
    const input = new Float32Array(30 * SR).fill(0.01);

    const result = applyGlitches(input, SR, maskOf(input.length, GlitchEffect.Replay), seeded(4));

    expect(result.tickOffsets).toEqual([]);
    expect(firstDifference(result.samples, input)).toBe(-1);
  });
});

describe('applyGlitches — tape wobble', () => {
  it('speeds up and slows down by 12–25 % inside a spell', () => {
    const input = tone(30);

    const result = applyGlitches(input, SR, maskOf(input.length, GlitchEffect.Wobble), seeded(8));
    const ratios = frequencyRatios(result.samples);

    expect(result.samples.length).not.toBe(input.length);
    expect(ratios.some((r) => r > 1.08)).toBe(true);
    expect(ratios.some((r) => r < 0.92)).toBe(true);
    expect(Math.min(...ratios)).toBeGreaterThanOrEqual(0.72);
    expect(Math.max(...ratios)).toBeLessThanOrEqual(1.28);
  });

  it('returns to the untouched voice once the spell is over', () => {
    const input = noise(20, 24);
    const mask = maskOf(input.length, GlitchEffect.Wobble, 0, 10 * SR);

    const result = applyGlitches(input, SR, mask, seeded(8));

    const tail = 9 * SR;
    expect(result.samples.length).not.toBe(input.length);
    expect(
      firstDifference(
        result.samples.subarray(result.samples.length - tail),
        input.subarray(input.length - tail),
      ),
    ).toBe(-1);
  });
});
