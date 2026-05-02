/**
 * Static burst AudioWorklet processor.
 * Injects brief white noise burst at stutter boundaries to simulate signal interference.
 */
class StaticProcessor extends AudioWorkletProcessor {
  private burstRemaining: number = 0;
  private readonly burstLength: number = 441; // ~10ms at 44100Hz
  private readonly burstGain: number = 0.15;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent) => {
      if (event.data.type === 'burst') {
        this.burstRemaining = this.burstLength;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!input || !output) return true;

    for (let i = 0; i < input.length; i++) {
      if (this.burstRemaining > 0) {
        const noise = (Math.random() * 2 - 1) * this.burstGain;
        output[i] = input[i] + noise;
        this.burstRemaining--;
      } else {
        output[i] = input[i];
      }
    }

    return true;
  }
}

registerProcessor('static-processor', StaticProcessor);
