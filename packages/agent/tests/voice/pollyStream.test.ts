import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { Readable } from 'node:stream';
import {
  synthesizeToAudioEvents,
  POLLY_MAX_BILLED_CHARACTERS,
} from '../../src/voice/pollyStream.js';

const polly = mockClient(PollyClient);

/** Polly returns the mp3 as a stream carrying a `transformToByteArray` helper. */
function audioResponse(bytes: number[]) {
  const stream = Readable.from([Buffer.from(bytes)]) as Readable & {
    transformToByteArray?: () => Promise<Uint8Array>;
  };
  stream.transformToByteArray = async () => new Uint8Array(bytes);
  return { AudioStream: stream };
}

const client = () => new PollyClient({ region: 'us-west-2' });

/** The voice settings the runtime configuration supplies (amendment A6). */
const voice = { voiceId: 'Matthew', engine: 'standard', sampleRate: 24000 } as const;

describe('synthesizeToAudioEvents', () => {
  beforeEach(() => {
    polly.reset();
    polly.on(SynthesizeSpeechCommand).resolves(audioResponse([1, 2, 3]));
  });

  it('speaks with the configured voice, engine and sample rate', async () => {
    await synthesizeToAudioEvents('Hello there.', {
      client: client(),
      voice,
      voiceEnabled: true,
      onAudio: vi.fn(),
    });

    expect(polly.commandCalls(SynthesizeSpeechCommand)[0].args[0].input).toMatchObject({
      Engine: 'standard',
      VoiceId: 'Matthew',
      OutputFormat: 'mp3',
      SampleRate: '24000',
      TextType: 'ssml',
    });
  });

  it('takes the voice from configuration rather than a hardcoded default', async () => {
    // A6 chose Standard Matthew, but the choice lives in runtime configuration
    // so it can be changed without a code deploy. Asserting a different voice
    // is what proves the setting is read rather than coincidentally matched.
    await synthesizeToAudioEvents('Hello there.', {
      client: client(),
      voice: { voiceId: 'Joanna', engine: 'neural', sampleRate: 16000 },
      voiceEnabled: true,
      onAudio: vi.fn(),
    });

    expect(polly.commandCalls(SynthesizeSpeechCommand)[0].args[0].input).toMatchObject({
      Engine: 'neural',
      VoiceId: 'Joanna',
      SampleRate: '16000',
    });
  });

  it('never asks for speech marks, which would be a second billed request', async () => {
    await synthesizeToAudioEvents('Hello there.', {
      client: client(),
      voice,
      voiceEnabled: true,
      onAudio: vi.fn(),
    });

    for (const call of polly.commandCalls(SynthesizeSpeechCommand)) {
      expect(call.args[0].input.SpeechMarkTypes).toBeUndefined();
      expect(call.args[0].input.OutputFormat).not.toBe('json');
    }
  });

  it('emits one audio event per segment with an increasing seq', async () => {
    const onAudio = vi.fn();

    const result = await synthesizeToAudioEvents(
      'First sentence. Second sentence. Third sentence.',
      { client: client(), voice, voiceEnabled: true, onAudio, maxBilledCharacters: 20 },
    );

    const seqs = onAudio.mock.calls.map(([event]) => event.seq);
    expect(seqs.length).toBeGreaterThan(1);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(seqs[0]).toBe(0);
    expect(result.segments).toBe(seqs.length);
  });

  it('emits base64 mp3, because SSE frames carry no binary', async () => {
    const onAudio = vi.fn();

    await synthesizeToAudioEvents('Hello there.', {
      client: client(),
      voice,
      voiceEnabled: true,
      onAudio,
    });

    expect(onAudio.mock.calls[0][0]).toMatchObject({
      format: 'mp3',
      data: Buffer.from([1, 2, 3]).toString('base64'),
    });
  });

  it('bills the plain text, not the SSML wrapper', async () => {
    const text = 'Hello there.';

    const result = await synthesizeToAudioEvents(text, {
      client: client(),
      voice,
      voiceEnabled: true,
      onAudio: vi.fn(),
    });

    // Polly does not count SSML tags as billed characters, so neither do we:
    // counting the wrapper would overstate spend and trip the breaker early.
    expect(result.pollyCharacters).toBe(text.length);
    const sent = polly.commandCalls(SynthesizeSpeechCommand)[0].args[0].input.Text as string;
    expect(sent.length).toBeGreaterThan(result.pollyCharacters);
  });

  it('spends nothing and emits nothing when voice is off', async () => {
    const onAudio = vi.fn();

    const result = await synthesizeToAudioEvents('Hello there.', {
      client: client(),
      voice,
      voiceEnabled: false,
      onAudio,
    });

    expect(onAudio).not.toHaveBeenCalled();
    expect(polly.commandCalls(SynthesizeSpeechCommand)).toHaveLength(0);
    expect(result.pollyCharacters).toBe(0);
    expect(result.segments).toBe(0);
  });

  it('keeps every request under the billed-character limit', async () => {
    // One unbroken run, so there is no sentence boundary to split on.
    const long = 'a'.repeat(POLLY_MAX_BILLED_CHARACTERS * 2 + 50);

    await synthesizeToAudioEvents(long, {
      client: client(),
      voice,
      voiceEnabled: true,
      onAudio: vi.fn(),
    });

    const calls = polly.commandCalls(SynthesizeSpeechCommand);
    expect(calls.length).toBeGreaterThan(2);
    for (const call of calls) {
      const sent = call.args[0].input.Text as string;
      // Strip the SSML wrapper the way Polly's billing does.
      expect(sent.replace(/<[^>]*>/g, '').length).toBeLessThanOrEqual(POLLY_MAX_BILLED_CHARACTERS);
    }
  });

  it('reports what was already billed when a later segment fails', async () => {
    polly
      .on(SynthesizeSpeechCommand)
      .resolvesOnce(audioResponse([1]))
      .rejects(new Error('Polly is down'));

    const onAudio = vi.fn();
    // A failure is not a refund: the caller still has to account for the
    // segment Polly already charged for.
    await expect(
      synthesizeToAudioEvents('First sentence. Second sentence.', {
        client: client(),
        voice,
        voiceEnabled: true,
        onAudio,
        maxBilledCharacters: 16,
      }),
    ).rejects.toMatchObject({ pollyCharacters: expect.any(Number) });

    expect(onAudio).toHaveBeenCalledTimes(1);
  });
});
