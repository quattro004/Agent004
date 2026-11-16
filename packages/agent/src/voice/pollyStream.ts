import {
  PollyClient,
  SynthesizeSpeechCommand,
  type SynthesizeSpeechCommandInput,
} from '@aws-sdk/client-polly';
import { wrapInSsml } from './ssml.js';

/**
 * Server-side voice.
 *
 * The browser never calls Polly: credentials would have to reach it, and the
 * DSP chain that gives Max his voice runs on audio we produce. The reply is
 * split into segments so the first sound arrives long before the last word is
 * written (`audio.first_chunk`), each one emitted as an SSE `audio` event.
 */

/**
 * `SynthesizeSpeech` accepts 6,000 characters, of which at most 3,000 may be
 * billed characters. SSML tags are not billed, so the cap applies to the plain
 * text we submit.
 *
 * https://docs.aws.amazon.com/polly/latest/dg/limits.html
 */
export const POLLY_MAX_BILLED_CHARACTERS = 3000;

/** The SSE `audio` event, shaped as transport-sse.md § Events defines it. */
export interface AudioEvent {
  /** Playback order. The browser buffers and plays by `seq`. */
  seq: number;
  format: 'mp3';
  /** Base64, because SSE frames are text and carry no binary. */
  data: string;
}

/** The voice settings, which live in runtime configuration (amendment A6). */
export interface VoiceSettings {
  voiceId: string;
  engine: string;
  sampleRate: number;
}

export interface SynthesizeOptions {
  client: PollyClient;
  voice: VoiceSettings;
  /** When false nothing is sent to Polly, so nothing is billed. */
  voiceEnabled: boolean;
  onAudio: (event: AudioEvent) => void | Promise<void>;
  /** Overridable only so tests can force segmentation on short input. */
  maxBilledCharacters?: number;
  signal?: AbortSignal;
}

export interface SynthesisResult {
  /** Plain-text characters sent to Polly; SSML tags are not billed. */
  pollyCharacters: number;
  segments: number;
}

/** A synthesis failure that still reports what Polly had already billed. */
export class PollySynthesisError extends Error implements SynthesisResult {
  constructor(
    message: string,
    readonly pollyCharacters: number,
    readonly segments: number,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PollySynthesisError';
  }
}

/**
 * Splits on sentence boundaries where it can, and mid-run only when a single
 * run exceeds the limit, so a long reply still gets spoken rather than
 * rejected.
 */
export function segmentForSynthesis(text: string, maxChars: number): string[] {
  const segments: string[] = [];
  let current = '';

  const push = () => {
    const trimmed = current.trim();
    if (trimmed) segments.push(trimmed);
    current = '';
  };

  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (sentence.length > maxChars) {
      push();
      for (let i = 0; i < sentence.length; i += maxChars) {
        segments.push(sentence.slice(i, i + maxChars));
      }
      continue;
    }
    if (current.length + sentence.length > maxChars) push();
    current = current ? `${current} ${sentence}` : sentence;
  }
  push();

  return segments;
}

export async function synthesizeToAudioEvents(
  text: string,
  options: SynthesizeOptions,
): Promise<SynthesisResult> {
  if (!options.voiceEnabled) {
    return { pollyCharacters: 0, segments: 0 };
  }

  const maxChars = options.maxBilledCharacters ?? POLLY_MAX_BILLED_CHARACTERS;
  const segments = segmentForSynthesis(text, maxChars);

  let pollyCharacters = 0;
  let emitted = 0;

  for (const segment of segments) {
    const input: SynthesizeSpeechCommandInput = {
      // Standard, not Neural: amendment A6 chose it on cost, and Matthew is
      // the voice the DSP chain was tuned against. Both are configuration, so
      // the choice can change without a code deploy.
      Engine: options.voice.engine as SynthesizeSpeechCommandInput['Engine'],
      VoiceId: options.voice.voiceId as SynthesizeSpeechCommandInput['VoiceId'],
      OutputFormat: 'mp3',
      SampleRate: String(options.voice.sampleRate),
      TextType: 'ssml',
      Text: wrapInSsml(segment),
    };

    let audio: Uint8Array;
    try {
      const response = await options.client.send(new SynthesizeSpeechCommand(input), {
        abortSignal: options.signal,
      });
      // Polly charges on receipt of the request, so the count moves before
      // the bytes are read: a stream that fails mid-read was still billed.
      pollyCharacters += segment.length;
      audio = await streamToBytes(response.AudioStream);
    } catch (err) {
      throw new PollySynthesisError(
        `Polly synthesis failed on segment ${emitted}`,
        pollyCharacters,
        emitted,
        err,
      );
    }

    await options.onAudio({
      seq: emitted,
      format: 'mp3',
      // SSE frames are text, so the mp3 travels base64-encoded.
      data: Buffer.from(audio).toString('base64'),
    });
    emitted += 1;
  }

  return { pollyCharacters, segments: emitted };
}

async function streamToBytes(stream: unknown): Promise<Uint8Array> {
  if (!stream) throw new Error('Polly returned no AudioStream');

  const sdkStream = stream as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof sdkStream.transformToByteArray === 'function') {
    return sdkStream.transformToByteArray();
  }

  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return new Uint8Array(Buffer.concat(chunks));
}
