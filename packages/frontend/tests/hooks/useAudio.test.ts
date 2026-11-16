import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AudioChain } from '../../src/audio/audioChain';
import { createUseAudio } from '../../src/hooks/useAudio';
import { createAgentStream } from '../../src/hooks/useAgentStream';
import { useVoiceStore } from '../../src/stores/voiceStore';

/**
 * Voice is synthesized server-side and arrives as SSE `audio` events
 * (contracts/transport-sse.md). The browser decodes and plays them through
 * the DSP chain. Browser speech synthesis is not a fallback: it would put
 * model-adjacent work in the browser and breach P1 (research Q1).
 */

const CLIP_MS = 400;

function clip(seq: number, data = 'AQID') {
  return { seq, format: 'mp3' as const, data };
}

describe('useAudio', () => {
  let audioChain: AudioChain;
  let decodeAudioData: ReturnType<typeof vi.fn>;
  let close: ReturnType<typeof vi.fn>;
  let speak: ReturnType<typeof vi.fn>;
  const decoded = { duration: CLIP_MS / 1000 } as AudioBuffer;

  beforeEach(() => {
    vi.useFakeTimers();
    useVoiceStore.getState().reset();

    audioChain = {
      init: vi.fn().mockResolvedValue(undefined),
      play: vi.fn().mockReturnValue(CLIP_MS),
      stop: vi.fn(),
      setVolume: vi.fn(),
      getIsMouthOpen: vi.fn().mockReturnValue(false),
      triggerStutter: vi.fn(),
      triggerStaticBurst: vi.fn(),
      playStatic: vi.fn(),
      stopStatic: vi.fn(),
      dispose: vi.fn(),
    };

    decodeAudioData = vi.fn().mockResolvedValue(decoded);
    close = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        return { decodeAudioData, close };
      }),
    );

    speak = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak, cancel: vi.fn(), getVoices: () => [] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('plays a server audio clip through the DSP chain', async () => {
    const audio = createUseAudio(audioChain);

    useVoiceStore.getState().enqueueAudio(clip(0));
    await vi.advanceTimersByTimeAsync(10);

    expect(decodeAudioData).toHaveBeenCalledTimes(1);
    expect(audioChain.play).toHaveBeenCalledWith(decoded);
    audio.dispose();
  });

  it('decodes the base64 payload into bytes before decoding audio', async () => {
    const audio = createUseAudio(audioChain);

    useVoiceStore.getState().enqueueAudio(clip(0, 'AQID'));
    await vi.advanceTimersByTimeAsync(10);

    const buffer = decodeAudioData.mock.calls[0][0] as ArrayBuffer;
    expect(Array.from(new Uint8Array(buffer))).toEqual([1, 2, 3]);
    audio.dispose();
  });

  it('plays queued clips one after another in seq order', async () => {
    const audio = createUseAudio(audioChain);
    const played: number[] = [];
    decodeAudioData.mockImplementation((buffer: ArrayBuffer) => {
      played.push(new Uint8Array(buffer)[0]);
      return Promise.resolve(decoded);
    });

    // 'AA==' is byte 0, 'AQ==' is byte 1, 'Ag==' is byte 2.
    useVoiceStore.getState().enqueueAudio(clip(0, 'AA=='));
    useVoiceStore.getState().enqueueAudio(clip(1, 'AQ=='));
    useVoiceStore.getState().enqueueAudio(clip(2, 'Ag=='));

    await vi.advanceTimersByTimeAsync(10);
    expect(played).toEqual([0]);

    await vi.advanceTimersByTimeAsync(CLIP_MS);
    await vi.advanceTimersByTimeAsync(CLIP_MS);

    expect(played).toEqual([0, 1, 2]);
    expect(audioChain.play).toHaveBeenCalledTimes(3);
    audio.dispose();
  });

  it('does not start the next clip before the current one finishes', async () => {
    const audio = createUseAudio(audioChain);

    useVoiceStore.getState().enqueueAudio(clip(0));
    useVoiceStore.getState().enqueueAudio(clip(1));
    await vi.advanceTimersByTimeAsync(10);

    expect(audioChain.play).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(CLIP_MS);
    expect(audioChain.play).toHaveBeenCalledTimes(2);
    audio.dispose();
  });

  it('ignores a clip whose seq has already played', async () => {
    const audio = createUseAudio(audioChain);

    useVoiceStore.getState().enqueueAudio(clip(0));
    await vi.advanceTimersByTimeAsync(10);
    useVoiceStore.getState().enqueueAudio(clip(0));
    await vi.advanceTimersByTimeAsync(CLIP_MS + 10);

    expect(audioChain.play).toHaveBeenCalledTimes(1);
    audio.dispose();
  });

  // The server numbers segments from 0 in every turn, so a later reply must
  // not be mistaken for a replay of the first.
  it('plays the voice of every turn, though each turn numbers its segments from 0', async () => {
    const audio = createUseAudio(audioChain);
    const encoder = new TextEncoder();
    const turn = () =>
      ({
        ok: true,
        status: 200,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            for (const event of [
              { type: 'session', countedSessionId: 'counted-1', opened: true, voice: 'on' },
              { type: 'audio', seq: 0, format: 'mp3', data: 'AQID' },
              { type: 'audio', seq: 1, format: 'mp3', data: 'AQID' },
              { type: 'done', turnsUsed: 1, state: 'ACTIVE' },
            ]) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            }
            controller.close();
          },
        }),
      }) as unknown as Response;
    const stream = createAgentStream({
      runtimeArn:
        'arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/max_height_agent-AbCdEf',
      getAccessToken: async () => 'token-1',
      fetchImpl: vi.fn(async () => turn()) as unknown as typeof fetch,
    });

    try {
      await stream.send({ message: 'one' });
      await vi.advanceTimersByTimeAsync(CLIP_MS * 2 + 10);
      expect(audioChain.play).toHaveBeenCalledTimes(2);

      await stream.send({ message: 'two' });
      await vi.advanceTimersByTimeAsync(CLIP_MS * 2 + 10);

      expect(audioChain.play).toHaveBeenCalledTimes(4);
    } finally {
      audio.dispose();
    }
  });

  it('marks Max as speaking while clips play and stops when the queue drains', async () => {
    const audio = createUseAudio(audioChain);

    useVoiceStore.getState().enqueueAudio(clip(0));
    await vi.advanceTimersByTimeAsync(10);
    expect(useVoiceStore.getState().isSpeaking).toBe(true);

    await vi.advanceTimersByTimeAsync(CLIP_MS + 10);
    expect(useVoiceStore.getState().isSpeaking).toBe(false);
    audio.dispose();
  });

  it('drives the mouth from the chain while speaking', async () => {
    (audioChain.getIsMouthOpen as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const audio = createUseAudio(audioChain);

    useVoiceStore.getState().enqueueAudio(clip(0));
    await vi.advanceTimersByTimeAsync(60);

    expect(useVoiceStore.getState().isMouthOpen).toBe(true);

    await vi.advanceTimersByTimeAsync(CLIP_MS + 60);
    expect(useVoiceStore.getState().isMouthOpen).toBe(false);
    audio.dispose();
  });

  it('never falls back to browser speech synthesis when decoding fails', async () => {
    decodeAudioData.mockRejectedValue(new Error('not mp3'));
    const audio = createUseAudio(audioChain);

    useVoiceStore.getState().enqueueAudio(clip(0));
    await vi.advanceTimersByTimeAsync(CLIP_MS + 10);

    expect(speak).not.toHaveBeenCalled();
    expect(audioChain.play).not.toHaveBeenCalled();
    expect(useVoiceStore.getState().isSpeaking).toBe(false);
    audio.dispose();
  });

  it('keeps playing the rest of the turn after one clip fails to decode', async () => {
    decodeAudioData.mockRejectedValueOnce(new Error('not mp3')).mockResolvedValue(decoded);
    const audio = createUseAudio(audioChain);

    useVoiceStore.getState().enqueueAudio(clip(0));
    useVoiceStore.getState().enqueueAudio(clip(1));
    await vi.advanceTimersByTimeAsync(CLIP_MS + 10);

    expect(audioChain.play).toHaveBeenCalledTimes(1);
    audio.dispose();
  });

  it('never synthesizes speech in the browser on a silent turn', async () => {
    const audio = createUseAudio(audioChain);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(speak).not.toHaveBeenCalled();
    expect(audioChain.play).not.toHaveBeenCalled();
    audio.dispose();
  });

  it('drops anything still queued when disposed', async () => {
    const audio = createUseAudio(audioChain);

    useVoiceStore.getState().enqueueAudio(clip(0));
    useVoiceStore.getState().enqueueAudio(clip(1));
    await vi.advanceTimersByTimeAsync(10);

    audio.dispose();
    await vi.advanceTimersByTimeAsync(CLIP_MS * 3);

    expect(audioChain.play).toHaveBeenCalledTimes(1);
    expect(useVoiceStore.getState().audioQueue).toEqual([]);
    expect(useVoiceStore.getState().isMouthOpen).toBe(false);
  });
});
