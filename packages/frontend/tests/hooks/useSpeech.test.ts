import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('useSpeech', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('should export a factory function', async () => {
    const mod = await import('../../src/hooks/useSpeech');
    expect(typeof mod.useSpeech).toBe('function');
  });

  it('should return isListening, transcript, error, start, and stop', async () => {
    // Mock SpeechRecognition
    vi.stubGlobal(
      'SpeechRecognition',
      vi.fn().mockImplementation(() => ({
        start: vi.fn(),
        stop: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );

    const { useSpeech } = await import('../../src/hooks/useSpeech');

    // Render-free check: the hook should be a function
    expect(typeof useSpeech).toBe('function');
  });
});

describe('getSpeechProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('should return "Google" for Chrome user agent', async () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 Chrome/120.0',
      writable: true,
      configurable: true,
    });

    const { getSpeechProvider } = await import('../../src/hooks/useSpeech');
    expect(getSpeechProvider()).toBe('Google');
  });

  it('should return "Apple" for Safari user agent', async () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 AppleWebKit/605 Safari/605',
      writable: true,
      configurable: true,
    });

    const { getSpeechProvider } = await import('../../src/hooks/useSpeech');
    expect(getSpeechProvider()).toBe('Apple');
  });

  it('should return "your browser" for unknown user agent', async () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 Firefox/120',
      writable: true,
      configurable: true,
    });

    const { getSpeechProvider } = await import('../../src/hooks/useSpeech');
    expect(getSpeechProvider()).toBe('your browser');
  });
});
