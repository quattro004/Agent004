/**
 * Stutter AudioWorklet processor.
 * Replays last ~50ms of audio for segments marked as stutters.
 */
class StutterProcessor extends AudioWorkletProcessor {
  private buffer: Float32Array;
  private writePos: number = 0;
  private stuttering: boolean = false;
  private readPos: number = 0;
  private readonly bufferSize: number;

  constructor() {
    super();
    // ~50ms at 44100Hz ≈ 2205 samples
    this.bufferSize = 2205;
    this.buffer = new Float32Array(this.bufferSize);

    this.port.onmessage = (event: MessageEvent) => {
      if (event.data.type === 'stutter-start') {
        this.stuttering = true;
        this.readPos = this.writePos;
      } else if (event.data.type === 'stutter-stop') {
        this.stuttering = false;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!input || !output) return true;

    for (let i = 0; i < input.length; i++) {
      // Always record into ring buffer
      this.buffer[this.writePos % this.bufferSize] = input[i];

      if (this.stuttering) {
        // Replay from ring buffer
        output[i] = this.buffer[this.readPos % this.bufferSize];
        this.readPos++;
        // Loop the replay section
        if (this.readPos >= this.writePos) {
          this.readPos = this.writePos - this.bufferSize;
          if (this.readPos < 0) this.readPos = 0;
        }
      } else {
        output[i] = input[i];
      }

      this.writePos++;
    }

    return true;
  }
}

registerProcessor('stutter-processor', StutterProcessor);
