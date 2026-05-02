// AudioWorklet type declarations for processors
// These run in a separate scope with their own globals

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}

declare function registerProcessor(name: string, processorCtor: new () => AudioWorkletProcessor): void;

interface AudioWorkletProcessorConstructor {
  new (): AudioWorkletProcessor;
}
