/**
 * Voice glitch engine: the stutter, pitch-jump and tape-wobble effects that make
 * Max Height sound like a misbehaving broadcast.
 *
 * Effects run on a decoded buffer before playback, because a syllable replay
 * inserts time and a speed wobble moves it — a real-time worklet would have to
 * drop words to keep up. An episode clock, which advances only with played
 * audio, decides when glitches may happen: short glitch spells, each with its
 * own mix of effects, separated by stretches of the clean voice.
 *
 * Numbers were chosen by the builder by ear (audition Take K, 2026-11-07); see
 * the wiki's Component-Audio-Chain page before changing them.
 */
export type Random = () => number;

export const GlitchEffect = { Pitch: 1, Replay: 2, Wobble: 4 } as const;

const ALL_EFFECTS = GlitchEffect.Pitch | GlitchEffect.Replay | GlitchEffect.Wobble;

export const GLITCH_CONFIG = {
  glitchSpellSeconds: [6, 13],
  cleanGapSeconds: [3, 7],
  pitchJump: {
    perSecond: 1.2,
    downChance: 0.4,
    down: [0.8, 0.9],
    up: [1.25, 1.6],
    milliseconds: [120, 350],
    fadeMilliseconds: 5,
  },
  replay: {
    perSecond: 0.7,
    milliseconds: [60, 120],
    totalPlays: [2, 3],
    fadeMilliseconds: 2,
    minimumRms: 0.02,
    notBeforeSeconds: 0.3,
    cooldownSlices: 3,
  },
  wobble: {
    perSecond: 0.4,
    depth: [0.12, 0.25],
    milliseconds: [150, 300],
  },
} as const;

export interface EpisodeClock {
  /** Effect mask for each of the next `sampleCount` samples of played audio. */
  take(sampleCount: number, sampleRate: number): Uint8Array;
}

export interface GlitchResult {
  samples: Float32Array;
  /** Output sample offsets where a static tick should sound (one per replayed repeat). */
  tickOffsets: number[];
}

/** Glitches one decoded clip, advancing the shared episode clock by its length. */
export type Glitcher = (samples: Float32Array, sampleRate: number) => GlitchResult;

export function createGlitcher(random: Random = Math.random): Glitcher {
  const clock = createEpisodeClock(random);
  return (samples, sampleRate) =>
    applyGlitches(samples, sampleRate, clock.take(samples.length, sampleRate), random);
}

export function applyGlitches(
  samples: Float32Array,
  sampleRate: number,
  mask: Uint8Array,
  random: Random = Math.random,
): GlitchResult {
  const output = samples.slice();
  if (!mask.some((effects) => effects !== 0)) return { samples: output, tickOffsets: [] };
  const wobbled = wobbleTape(output, sampleRate, mask, random);
  const replayed = replaySyllables(wobbled.samples, sampleRate, wobbled.mask, random);
  return {
    samples: jumpPitch(replayed.samples, sampleRate, replayed.mask, random),
    tickOffsets: replayed.tickOffsets,
  };
}

/**
 * Tape wobble: playback speed (and so pitch) swells to 1 ± depth and back
 * along a raised cosine, like a stretched tape. Resamples with linear
 * interpolation, then snaps back to whole samples so the clean voice that
 * follows is untouched.
 */
function wobbleTape(
  samples: Float32Array,
  sampleRate: number,
  mask: Uint8Array,
  random: Random,
): { samples: Float32Array; mask: Uint8Array } {
  const config = GLITCH_CONFIG.wobble;
  const capacity = Math.ceil(samples.length / (1 - config.depth[1])) + 1;
  const output = new Float32Array(capacity);
  const outputMask = new Uint8Array(capacity);
  let written = 0;
  let position = 0;
  let bumpLength = 0;
  let bumpLeft = 0;
  let depth = 0;
  let untilNext = samplesUntilNext(random, config.perSecond, sampleRate);

  while (position < samples.length) {
    const index = Math.floor(position);
    if (bumpLeft === 0 && mask[index] & GlitchEffect.Wobble && --untilNext <= 0) {
      untilNext = samplesUntilNext(random, config.perSecond, sampleRate);
      bumpLength = bumpLeft = Math.round(
        (between(random, config.milliseconds) / 1000) * sampleRate,
      );
      depth = (random() < 0.5 ? -1 : 1) * between(random, config.depth);
    }

    output[written] = readAt(samples, position);
    outputMask[written] = mask[index];
    written++;

    if (bumpLeft > 0) {
      const progress = (bumpLength - bumpLeft) / bumpLength;
      position += 1 + depth * 0.5 * (1 - Math.cos(2 * Math.PI * progress));
      if (--bumpLeft === 0) position = Math.round(position);
    } else {
      position += 1;
    }
  }

  return { samples: output.slice(0, written), mask: outputMask.slice(0, written) };
}

function concat<T extends Float32Array | Uint8Array>(
  parts: T[],
  Type: new (length: number) => T,
): T {
  const joined = new Type(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
}

/**
 * Plays the slice just heard two or three times in all, so the voice catches
 * on a syllable without losing a word. The clip grows by each extra repeat.
 */
function replaySyllables(
  samples: Float32Array,
  sampleRate: number,
  mask: Uint8Array,
  random: Random,
): { samples: Float32Array; mask: Uint8Array; tickOffsets: number[] } {
  const config = GLITCH_CONFIG.replay;
  const fade = Math.round((config.fadeMilliseconds / 1000) * sampleRate);
  const parts: Float32Array[] = [];
  const maskParts: Uint8Array[] = [];
  const tickOffsets: number[] = [];
  let copiedUpTo = 0;
  let inserted = 0;
  let untilNext = samplesUntilNext(random, config.perSecond, sampleRate);

  for (let t = Math.round(config.notBeforeSeconds * sampleRate); t < samples.length; t++) {
    if (!(mask[t] & GlitchEffect.Replay) || --untilNext > 0) continue;
    untilNext = samplesUntilNext(random, config.perSecond, sampleRate);

    const length = Math.round((between(random, config.milliseconds) / 1000) * sampleRate);
    const [fewest, most] = config.totalPlays;
    const plays = fewest + Math.floor(random() * (most - fewest + 1));
    if (length > t || rms(samples.subarray(t - length, t)) < config.minimumRms) continue;

    const slice = samples.slice(t - length, t);
    for (let k = 0; k < fade; k++) {
      slice[k] *= k / fade;
      slice[length - 1 - k] *= k / fade;
    }
    parts.push(samples.subarray(copiedUpTo, t));
    maskParts.push(mask.subarray(copiedUpTo, t));
    for (let repeat = 1; repeat < plays; repeat++) {
      tickOffsets.push(t + inserted);
      parts.push(slice);
      maskParts.push(mask.subarray(t - length, t));
      inserted += length;
    }
    copiedUpTo = t;
    t += length * config.cooldownSlices;
  }

  parts.push(samples.subarray(copiedUpTo));
  maskParts.push(mask.subarray(copiedUpTo));
  return {
    samples: concat(parts, Float32Array),
    mask: concat(maskParts, Uint8Array),
    tickOffsets,
  };
}

function rms(samples: Float32Array): number {
  let sum = 0;
  for (const s of samples) sum += s * s;
  return Math.sqrt(sum / samples.length);
}

/** Samples until the next event of a Poisson process running at `perSecond`. */
function samplesUntilNext(random: Random, perSecond: number, sampleRate: number): number {
  return Math.ceil((-Math.log(1 - random()) / perSecond) * sampleRate);
}

function readAt(samples: Float32Array, position: number): number {
  const base = Math.floor(position);
  const frac = position - base;
  const a = base >= 0 && base < samples.length ? samples[base] : 0;
  const b = base + 1 >= 0 && base + 1 < samples.length ? samples[base + 1] : 0;
  return a * (1 - frac) + b * frac;
}

const GRAIN_SIZE = 1024;
const HALF_GRAIN = GRAIN_SIZE / 2;

/**
 * Delay-line (granular) pitch shifter: two read heads half a grain apart slew
 * by (factor − 1) samples per sample, with triangular crossfades that sum to 1
 * and reach zero where each head wraps. Because the whole buffer is available,
 * the heads read half a grain ahead, so at offset 0 the output is the dry
 * signal with no delay and a jump can fade in and out of the clean voice.
 */
function granularRead(samples: Float32Array, n: number, offset: number): number {
  const other = offset >= HALF_GRAIN ? offset - HALF_GRAIN : offset + HALF_GRAIN;
  const weight = (o: number) => 1 - Math.abs((2 * o) / GRAIN_SIZE - 1);
  return (
    readAt(samples, n + offset - HALF_GRAIN) * weight(offset) +
    readAt(samples, n + other - HALF_GRAIN) * weight(other)
  );
}

function jumpPitch(
  samples: Float32Array,
  sampleRate: number,
  mask: Uint8Array,
  random: Random,
): Float32Array {
  const config = GLITCH_CONFIG.pitchJump;
  const fadeStep = 1 / Math.max(1, (config.fadeMilliseconds / 1000) * sampleRate);
  const output = samples.slice();
  let untilNext = samplesUntilNext(random, config.perSecond, sampleRate);
  let jumpLeft = 0;
  let factor = 1;
  let offset = 0;
  let wet = 0;

  for (let n = 0; n < samples.length; n++) {
    const allowed = (mask[n] & GlitchEffect.Pitch) !== 0;
    if (!allowed) jumpLeft = 0;
    else if (jumpLeft > 0) jumpLeft--;
    else if (--untilNext <= 0) {
      const range = random() < config.downChance ? config.down : config.up;
      factor = between(random, range);
      jumpLeft = Math.round((between(random, config.milliseconds) / 1000) * sampleRate);
      if (wet === 0) offset = 0;
      untilNext = samplesUntilNext(random, config.perSecond, sampleRate);
    }

    wet = jumpLeft > 0 ? Math.min(1, wet + fadeStep) : Math.max(0, wet - fadeStep);
    if (wet === 0) continue;

    output[n] = samples[n] * (1 - wet) + granularRead(samples, n, offset) * wet;
    offset += factor - 1;
    if (offset >= GRAIN_SIZE) offset -= GRAIN_SIZE;
    if (offset < 0) offset += GRAIN_SIZE;
  }
  return output;
}

function between(random: Random, [low, high]: readonly [number, number]): number {
  return low + random() * (high - low);
}

export function createEpisodeClock(random: Random = Math.random): EpisodeClock {
  let glitching = false;
  let mix = 0;
  let remainingSeconds = 0;

  function nextPhase(): void {
    glitching = !glitching;
    if (glitching) {
      mix = 1 + Math.floor(random() * ALL_EFFECTS);
      remainingSeconds = between(random, GLITCH_CONFIG.glitchSpellSeconds);
    } else {
      mix = 0;
      remainingSeconds = between(random, GLITCH_CONFIG.cleanGapSeconds);
    }
  }

  return {
    take(sampleCount, sampleRate) {
      const mask = new Uint8Array(sampleCount);
      let filled = 0;
      while (filled < sampleCount) {
        if (remainingSeconds <= 0) nextPhase();
        const count = Math.min(sampleCount - filled, Math.ceil(remainingSeconds * sampleRate));
        mask.fill(mix, filled, filled + count);
        filled += count;
        remainingSeconds -= count / sampleRate;
      }
      return mask;
    },
  };
}
