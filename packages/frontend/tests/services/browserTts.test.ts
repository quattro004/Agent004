import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We'll import the service once it exists — tests should fail at the behavioral level
import { isAvailable, speak, stop, selectVoice } from '../../src/services/browserTts';

describe('browserTts', () => {
  let mockSpeechSynthesis: {
    speak: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
    getVoices: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockSpeechSynthesis = {
      speak: vi.fn(),
      cancel: vi.fn(),
      getVoices: vi.fn().mockReturnValue([]),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(globalThis, 'speechSynthesis', {
      value: mockSpeechSynthesis,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
      value: vi.fn(function (text: string) {
        return {
          text,
          voice: null,
          pitch: 1,
          rate: 1,
          onend: null,
          onerror: null,
        };
      }),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isAvailable', () => {
    it('should return true when speechSynthesis exists on window', () => {
      expect(isAvailable()).toBe(true);
    });

    it('should return false when speechSynthesis is missing', () => {
      Object.defineProperty(globalThis, 'speechSynthesis', {
        value: undefined,
        writable: true,
        configurable: true,
      });
      expect(isAvailable()).toBe(false);
    });
  });

  describe('selectVoice', () => {
    it('should prefer en-US voice with Google in name', () => {
      const voices = [
        { name: 'Default', lang: 'en-US', localService: true },
        { name: 'Google US English', lang: 'en-US', localService: false },
        { name: 'Some Other', lang: 'fr-FR', localService: true },
      ] as SpeechSynthesisVoice[];

      const selected = selectVoice(voices);
      expect(selected?.name).toBe('Google US English');
    });

    it('should prefer en-US voice with Microsoft in name', () => {
      const voices = [
        { name: 'Default', lang: 'en-US', localService: true },
        { name: 'Microsoft David', lang: 'en-US', localService: false },
        { name: 'French Voice', lang: 'fr-FR', localService: true },
      ] as SpeechSynthesisVoice[];

      const selected = selectVoice(voices);
      expect(selected?.name).toBe('Microsoft David');
    });

    it('should fall back to any en-US voice if no Google/Microsoft', () => {
      const voices = [
        { name: 'Some English', lang: 'en-US', localService: true },
        { name: 'French Voice', lang: 'fr-FR', localService: true },
      ] as SpeechSynthesisVoice[];

      const selected = selectVoice(voices);
      expect(selected?.name).toBe('Some English');
    });

    it('should fall back to any en voice if no en-US', () => {
      const voices = [
        { name: 'British English', lang: 'en-GB', localService: true },
        { name: 'French Voice', lang: 'fr-FR', localService: true },
      ] as SpeechSynthesisVoice[];

      const selected = selectVoice(voices);
      expect(selected?.name).toBe('British English');
    });

    it('should return null when no voices available', () => {
      const selected = selectVoice([]);
      expect(selected).toBeNull();
    });
  });

  describe('speak', () => {
    it('should create utterance with pitch 1.2 and rate 1.05', async () => {
      mockSpeechSynthesis.getVoices.mockReturnValue([
        { name: 'Google US English', lang: 'en-US', localService: false },
      ]);
      mockSpeechSynthesis.speak.mockImplementation((utterance: { onend: (() => void) | null }) => {
        // Simulate immediate end
        if (utterance.onend) utterance.onend();
      });

      await speak('Hello Max');

      expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(1);
      const utterance = mockSpeechSynthesis.speak.mock.calls[0][0];
      expect(utterance.text).toBe('Hello Max');
      expect(utterance.pitch).toBe(1.2);
      expect(utterance.rate).toBe(1.05);
    });

    it('should resolve promise when utterance ends', async () => {
      mockSpeechSynthesis.getVoices.mockReturnValue([]);
      mockSpeechSynthesis.speak.mockImplementation((utterance: { onend: (() => void) | null }) => {
        setTimeout(() => {
          if (utterance.onend) utterance.onend();
        }, 10);
      });

      const result = await speak('Test text');
      expect(result).toBeUndefined();
    });

    it('should reject promise on utterance error', async () => {
      mockSpeechSynthesis.getVoices.mockReturnValue([]);
      mockSpeechSynthesis.speak.mockImplementation(
        (utterance: { onerror: ((e: unknown) => void) | null }) => {
          setTimeout(() => {
            if (utterance.onerror) utterance.onerror(new Error('synthesis failed'));
          }, 10);
        },
      );

      await expect(speak('Failing text')).rejects.toThrow('synthesis failed');
    });

    it('should set voice from selectVoice when available', async () => {
      const mockVoice = { name: 'Microsoft David', lang: 'en-US', localService: false };
      mockSpeechSynthesis.getVoices.mockReturnValue([mockVoice]);
      mockSpeechSynthesis.speak.mockImplementation((utterance: { onend: (() => void) | null }) => {
        if (utterance.onend) utterance.onend();
      });

      await speak('Test');

      const utterance = mockSpeechSynthesis.speak.mock.calls[0][0];
      expect(utterance.voice).toBe(mockVoice);
    });
  });

  describe('stop', () => {
    it('should call speechSynthesis.cancel()', () => {
      stop();
      expect(mockSpeechSynthesis.cancel).toHaveBeenCalledTimes(1);
    });
  });
});
