import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  synthesizeTurn,
  wrapInSsml,
  truncateText,
} from '../../src/services/pollyTts';

// Mock the @aws-sdk/client-polly module
const mockSend = vi.fn();
vi.mock('@aws-sdk/client-polly', () => ({
  PollyClient: vi.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  SynthesizeSpeechCommand: vi.fn().mockImplementation((params) => ({
    ...params,
    _type: 'SynthesizeSpeechCommand',
  })),
}));

describe('pollyTts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('wrapInSsml', () => {
    it('should wrap text in SSML prosody tags with pitch +10% rate 105%', () => {
      const text = 'Hello, welcome to the show!';
      const ssml = wrapInSsml(text);

      expect(ssml).toBe(
        '<speak><prosody pitch="+10%" rate="105%">Hello, welcome to the show!</prosody></speak>',
      );
    });

    it('should handle empty text', () => {
      const ssml = wrapInSsml('');
      expect(ssml).toBe('<speak><prosody pitch="+10%" rate="105%"></prosody></speak>');
    });
  });

  describe('truncateText', () => {
    it('should not truncate text under 2900 characters', () => {
      const text = 'Hello world';
      expect(truncateText(text)).toBe(text);
    });

    it('should truncate text at 2900 characters', () => {
      const text = 'a'.repeat(3000);
      const result = truncateText(text);
      expect(result.length).toBe(2900);
    });
  });

  describe('synthesizeTurn', () => {
    it('should make dual Promise.all calls for audio and viseme', async () => {
      const audioBlob = new Uint8Array([1, 2, 3, 4]);
      const visemeData = '{"time":0,"type":"viseme","value":"p"}\n';

      mockSend
        .mockResolvedValueOnce({
          AudioStream: { transformToByteArray: () => Promise.resolve(audioBlob) },
        })
        .mockResolvedValueOnce({
          AudioStream: {
            transformToByteArray: () =>
              Promise.resolve(new TextEncoder().encode(visemeData)),
          },
        });

      const result = await synthesizeTurn('Hello Max fans!');

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(result.audioData).toBeDefined();
      expect(result.visemeMarks).toBeDefined();
    });

    it('should retry once on 429 throttle error after 500ms', async () => {
      const audioBlob = new Uint8Array([1, 2, 3]);
      const visemeData = '{"time":0,"type":"viseme","value":"p"}\n';

      // First call: throttle error
      const throttleError = Object.assign(new Error('Throttling'), {
        name: 'ThrottlingException',
        $metadata: { httpStatusCode: 429 },
      });

      mockSend
        .mockRejectedValueOnce(throttleError) // Audio first try - throttled
        .mockResolvedValueOnce({
          AudioStream: {
            transformToByteArray: () =>
              Promise.resolve(new TextEncoder().encode(visemeData)),
          },
        }) // Viseme succeeds
        .mockResolvedValueOnce({
          AudioStream: { transformToByteArray: () => Promise.resolve(audioBlob) },
        }); // Audio retry succeeds

      vi.useFakeTimers();
      const resultPromise = synthesizeTurn('Test retry');
      await vi.advanceTimersByTimeAsync(500);
      const result = await resultPromise;

      expect(result.audioData).toBeDefined();
      vi.useRealTimers();
    });

    it('should fallback to text-only on second failure', async () => {
      const throttleError = Object.assign(new Error('Throttling'), {
        name: 'ThrottlingException',
        $metadata: { httpStatusCode: 429 },
      });

      const visemeData = '{"time":0,"type":"viseme","value":"p"}\n';

      mockSend
        .mockRejectedValueOnce(throttleError) // Audio first try
        .mockResolvedValueOnce({
          AudioStream: {
            transformToByteArray: () =>
              Promise.resolve(new TextEncoder().encode(visemeData)),
          },
        }) // Viseme
        .mockRejectedValueOnce(throttleError); // Audio retry

      vi.useFakeTimers();
      const resultPromise = synthesizeTurn('Test double fail');
      await vi.advanceTimersByTimeAsync(500);
      const result = await resultPromise;

      expect(result.audioData).toBeNull();
      expect(result.textOnly).toBe(true);
      vi.useRealTimers();
    });

    it('should truncate text at 2900 chars before synthesis', async () => {
      const longText = 'a'.repeat(3000);
      const audioBlob = new Uint8Array([1, 2, 3]);
      const visemeData = '{"time":0,"type":"viseme","value":"p"}\n';

      mockSend
        .mockResolvedValueOnce({
          AudioStream: { transformToByteArray: () => Promise.resolve(audioBlob) },
        })
        .mockResolvedValueOnce({
          AudioStream: {
            transformToByteArray: () =>
              Promise.resolve(new TextEncoder().encode(visemeData)),
          },
        });

      const result = await synthesizeTurn(longText);
      expect(result.audioData).toBeDefined();
      // Verify the command was called with truncated SSML
      const firstCall = mockSend.mock.calls[0][0];
      expect(firstCall.Text.length).toBeLessThanOrEqual(
        2900 + '<speak><prosody pitch="+10%" rate="105%"></prosody></speak>'.length,
      );
    });

    it('should silently handle viseme call failures', async () => {
      const audioBlob = new Uint8Array([1, 2, 3]);

      mockSend
        .mockResolvedValueOnce({
          AudioStream: { transformToByteArray: () => Promise.resolve(audioBlob) },
        })
        .mockRejectedValueOnce(new Error('Viseme failure'));

      const result = await synthesizeTurn('Hello!');

      expect(result.audioData).toBeDefined();
      expect(result.visemeMarks).toBeNull();
    });
  });
});
