/**
 * Pitch shift AudioWorklet processor.
 * Slight upward pitch shift for "digital" quality.
 * Uses simple sample-rate conversion (skip samples for pitch up).
 */
class PitchProcessor extends AudioWorkletProcessor {
  private phase: number = 0;
  private readonly pitchFactor: number = 1.05; // 5% pitch up

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!input || !output) return true;

    for (let i = 0; i < output.length; i++) {
      const index = Math.floor(this.phase);
      const frac = this.phase - index;

      if (index < input.length - 1) {
        // Linear interpolation
        output[i] = input[index] * (1 - frac) + input[index + 1] * frac;
      } else if (index < input.length) {
        output[i] = input[index];
      } else {
        output[i] = 0;
      }

      this.phase += this.pitchFactor;
    }

    // Wrap phase relative to input length
    this.phase -= input.length;
    if (this.phase < 0) this.phase = 0;

    return true;
  }
}

registerProcessor('pitch-processor', PitchProcessor);
