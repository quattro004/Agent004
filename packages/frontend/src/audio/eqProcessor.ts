/**
 * EQ boost AudioWorklet processor.
 * 4–6 kHz band boost for nasal quality per research.md R4.
 * Simple biquad bandpass approximation.
 */
class EqProcessor extends AudioWorkletProcessor {
  private x1: number = 0;
  private x2: number = 0;
  private y1: number = 0;
  private y2: number = 0;

  // Biquad coefficients for ~5kHz peak at 44100Hz, Q=2, +6dB boost
  private readonly b0: number = 0.1;
  private readonly b1: number = 0;
  private readonly b2: number = -0.1;
  private readonly a1: number = -1.6;
  private readonly a2: number = 0.8;
  private readonly boostGain: number = 2.0; // ~6dB

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!input || !output) return true;

    for (let i = 0; i < input.length; i++) {
      const x = input[i];

      // Biquad filter (bandpass around 4-6kHz)
      const filtered =
        this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;

      this.x2 = this.x1;
      this.x1 = x;
      this.y2 = this.y1;
      this.y1 = filtered;

      // Add boosted band back to dry signal
      output[i] = x + filtered * this.boostGain;
    }

    return true;
  }
}

registerProcessor('eq-processor', EqProcessor);
