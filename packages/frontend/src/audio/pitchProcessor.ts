/**
 * Pitch shift AudioWorklet processor.
 * Slight upward pitch shift for "digital" quality.
 *
 * Implemented as a delay-line (granular) pitch shifter: input is written to a
 * ring buffer and read back by two heads half a grain apart whose delay slews
 * at (pitchFactor - 1) samples per sample. Triangular crossfade weights sum to
 * 1 and fall to zero exactly where each head wraps, so the grain seam is
 * inaudible.
 *
 * A naive resampler cannot be used here: shifting up by 5% needs 1.05 input
 * samples per output sample, but `process` is only ever handed one render
 * quantum, so the read position runs past the block and the output collapses to
 * permanent silence. The ring buffer decouples read rate from block size.
 */
const RING_SIZE = 8192;
const GRAIN_SIZE = 1024;
const HALF_GRAIN = GRAIN_SIZE / 2;

class PitchProcessor extends AudioWorkletProcessor {
  private readonly buffer: Float32Array = new Float32Array(RING_SIZE);
  private writePos: number = 0;
  private readOffset: number = 0;
  private readonly pitchFactor: number = 1.05; // 5% pitch up

  /** Linear-interpolated read from the ring buffer at a fractional position. */
  private readAt(position: number): number {
    const base = Math.floor(position);
    const frac = position - base;
    const i0 = ((base % RING_SIZE) + RING_SIZE) % RING_SIZE;
    const i1 = (i0 + 1) % RING_SIZE;
    return this.buffer[i0] * (1 - frac) + this.buffer[i1] * frac;
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!input || !output) return true;

    for (let i = 0; i < output.length; i++) {
      this.buffer[this.writePos % RING_SIZE] = input[i];
      this.writePos++;

      const offset1 = this.readOffset;
      const offset2 = offset1 >= HALF_GRAIN ? offset1 - HALF_GRAIN : offset1 + HALF_GRAIN;

      const sample1 = this.readAt(this.writePos - (GRAIN_SIZE - offset1));
      const sample2 = this.readAt(this.writePos - (GRAIN_SIZE - offset2));

      const weight1 = 1 - Math.abs((2 * offset1) / GRAIN_SIZE - 1);
      const weight2 = 1 - Math.abs((2 * offset2) / GRAIN_SIZE - 1);

      output[i] = sample1 * weight1 + sample2 * weight2;

      this.readOffset += this.pitchFactor - 1;
      if (this.readOffset >= GRAIN_SIZE) this.readOffset -= GRAIN_SIZE;
      if (this.readOffset < 0) this.readOffset += GRAIN_SIZE;
    }

    return true;
  }
}

registerProcessor('pitch-processor', PitchProcessor);
