import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AudioChain } from '../../src/audio/audioChain';

// Mock visitorStore
const mockPushGreeting = vi.fn();
vi.mock('../../src/stores/visitorStore', () => ({
  useVisitorStore: Object.assign(() => ({ greetingHistory: [] }), {
    getState: () => ({ greetingHistory: [], pushGreeting: mockPushGreeting }),
  }),
}));

// Mock voiceStore
const mockSetSpeaking = vi.fn();
const mockSetMouthOpen = vi.fn();
const mockSetGreeting = vi.fn();
vi.mock('../../src/stores/voiceStore', () => ({
  useVoiceStore: Object.assign(() => ({ isSpeaking: false }), {
    getState: () => ({
      setSpeaking: mockSetSpeaking,
      setMouthOpen: mockSetMouthOpen,
      setGreeting: mockSetGreeting,
    }),
  }),
}));

// Mock greetingSelector
const mockSelectGreeting = vi.fn();
vi.mock('../../src/services/greetingSelector', () => ({
  selectGreeting: (...args: unknown[]) => mockSelectGreeting(...args),
  loadManifest: vi.fn((raw: string) => JSON.parse(raw)),
}));

// Mock browserTts
const { mockBrowserIsAvailable, mockBrowserSpeak, mockBrowserStop } = vi.hoisted(() => ({
  mockBrowserIsAvailable: vi.fn(),
  mockBrowserSpeak: vi.fn(),
  mockBrowserStop: vi.fn(),
}));
vi.mock('../../src/services/browserTts', () => ({
  speak: (...args: unknown[]) => mockBrowserSpeak(...args),
  isAvailable: () => mockBrowserIsAvailable(),
  stop: mockBrowserStop,
}));

// Mock fetch globally
const mockFetch = vi.fn();

describe('useGreeting', () => {
  let mockAudioChain: AudioChain;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockSelectGreeting.mockReset();
    mockPushGreeting.mockReset();
    mockSetSpeaking.mockReset();
    mockSetMouthOpen.mockReset();
    mockSetGreeting.mockReset();
    mockBrowserIsAvailable.mockReset();
    mockBrowserSpeak.mockReset();
    mockBrowserStop.mockReset();

    // Stub globals each test (clearAllMocks doesn't restore stubs)
    vi.stubGlobal('fetch', mockFetch);
    mockBrowserIsAvailable.mockReturnValue(true);
    mockBrowserSpeak.mockResolvedValue(undefined);

    // Mock AudioContext for decoding (jsdom doesn't have it)
    const mockAudioBuffer = {} as AudioBuffer;
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        return {
          decodeAudioData: vi.fn().mockResolvedValue(mockAudioBuffer),
          close: vi.fn().mockResolvedValue(undefined),
        };
      }),
    );

    mockAudioChain = {
      init: vi.fn().mockResolvedValue(undefined),
      play: vi.fn(),
      stop: vi.fn(),
      setVolume: vi.fn(),
      getIsMouthOpen: vi.fn().mockReturnValue(false),
      triggerStutter: vi.fn(),
      triggerStaticBurst: vi.fn(),
      playStatic: vi.fn(),
      stopStatic: vi.fn(),
      dispose: vi.fn(),
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should export a createUseGreeting function', async () => {
    const { createUseGreeting } = await import('../../src/hooks/useGreeting');
    expect(createUseGreeting).toBeDefined();
    expect(typeof createUseGreeting).toBe('function');
  });

  it('should preload greeting audio without playing it', async () => {
    const { createUseGreeting } = await import('../../src/hooks/useGreeting');

    const greetingEntry = {
      id: 'g-010',
      archetype: 'TV_PRESENTER_INTRO' as const,
      text: 'Signal acquired.',
      audioPath: 'audio/g-010.mp3',
      audioDurationMs: 3000,
      videoPath: 'video/g-010.mp4',
      weight: 1.0,
      tags: [],
    };

    const manifestData = {
      version: '1.0.0',
      voiceConfig: { voiceId: 'Matthew', engine: 'neural', ssmlPitch: '+10%', ssmlRate: '105%' },
      greetings: [greetingEntry],
    };

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(manifestData)),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });

    mockSelectGreeting.mockReturnValue(greetingEntry);

    const greeting = createUseGreeting(mockAudioChain);
    const preloaded = await greeting.preloadGreeting();

    expect(preloaded).toEqual(
      expect.objectContaining({
        id: 'g-010',
        text: 'Signal acquired.',
        audioBuffer: expect.any(Object),
        durationMs: 3000,
      }),
    );
    expect(mockAudioChain.play).not.toHaveBeenCalled();
    expect(mockPushGreeting).not.toHaveBeenCalled();
  });

  it('should fetch /greetings/manifest.json on first playGreeting call', async () => {
    const { createUseGreeting } = await import('../../src/hooks/useGreeting');

    const manifestData = {
      version: '1.0.0',
      voiceConfig: { voiceId: 'Matthew', engine: 'neural', ssmlPitch: '+10%', ssmlRate: '105%' },
      greetings: [
        {
          id: 'g-001',
          archetype: 'TV_PRESENTER_INTRO',
          text: 'Hello!',
          audioPath: 'audio/g-001.mp3',
          audioDurationMs: 3000,
          videoPath: 'video/g-001.mp4',
          weight: 1.0,
          tags: [],
        },
      ],
    };

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(manifestData)),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });

    mockSelectGreeting.mockReturnValue(manifestData.greetings[0]);

    const greeting = createUseGreeting(mockAudioChain);
    await greeting.playGreeting();

    expect(mockFetch).toHaveBeenCalledWith('/greetings/manifest.json');
  });

  // The manifest contract defines audioPath as relative to the manifest's own
  // directory (pattern: ^audio/greeting-\d{3}\.mp3$). Fetching it verbatim
  // resolves it against the page root instead, which 404s to index.html and
  // makes decodeAudioData throw "unknown content type".
  it('should resolve a relative audioPath against the /greetings/ base directory', async () => {
    const { createUseGreeting } = await import('../../src/hooks/useGreeting');

    const greetingEntry = {
      id: 'greeting-001',
      archetype: 'TV_PRESENTER_INTRO' as const,
      text: 'Hello!',
      audioPath: 'audio/greeting-001.mp3',
      audioDurationMs: 3000,
      videoPath: 'video/greeting-001.mp4',
      weight: 1.0,
      tags: [],
    };

    const manifestData = {
      version: '1.0.0',
      voiceConfig: { voiceId: 'Matthew', engine: 'neural', ssmlPitch: '+10%', ssmlRate: '105%' },
      greetings: [greetingEntry],
    };

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(manifestData)),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });

    mockSelectGreeting.mockReturnValue(greetingEntry);

    const greeting = createUseGreeting(mockAudioChain);
    await greeting.preloadGreeting();

    expect(mockFetch).toHaveBeenCalledWith('/greetings/audio/greeting-001.mp3');
  });

  it('should push selected greeting ID to visitorStore.greetingHistory', async () => {
    const { createUseGreeting } = await import('../../src/hooks/useGreeting');

    const greetingEntry = {
      id: 'g-002',
      archetype: 'MID_MONOLOGUE' as const,
      text: 'Well well well!',
      audioPath: 'audio/g-002.mp3',
      audioDurationMs: 4000,
      videoPath: 'video/g-002.mp4',
      weight: 1.0,
      tags: [],
    };

    const manifestData = {
      version: '1.0.0',
      voiceConfig: { voiceId: 'Matthew', engine: 'neural', ssmlPitch: '+10%', ssmlRate: '105%' },
      greetings: [greetingEntry],
    };

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(manifestData)),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });

    mockSelectGreeting.mockReturnValue(greetingEntry);

    const greeting = createUseGreeting(mockAudioChain);
    await greeting.playGreeting();

    expect(mockPushGreeting).toHaveBeenCalledWith('g-002');
  });

  it('should return { id, text } of the selected greeting', async () => {
    const { createUseGreeting } = await import('../../src/hooks/useGreeting');

    const greetingEntry = {
      id: 'g-003',
      archetype: 'SPONSOR_BREAK' as const,
      text: 'And now a word from our sponsor... me!',
      audioPath: 'audio/g-003.mp3',
      audioDurationMs: 3500,
      videoPath: 'video/g-003.mp4',
      weight: 1.0,
      tags: [],
    };

    const manifestData = {
      version: '1.0.0',
      voiceConfig: { voiceId: 'Matthew', engine: 'neural', ssmlPitch: '+10%', ssmlRate: '105%' },
      greetings: [greetingEntry],
    };

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(manifestData)),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });

    mockSelectGreeting.mockReturnValue(greetingEntry);

    const greeting = createUseGreeting(mockAudioChain);
    const result = await greeting.playGreeting();

    expect(result).toMatchObject({ id: 'g-003', text: 'And now a word from our sponsor... me!' });
  });

  it('should return null gracefully on fetch failure', async () => {
    const { createUseGreeting } = await import('../../src/hooks/useGreeting');

    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const greeting = createUseGreeting(mockAudioChain);
    const result = await greeting.playGreeting();

    expect(result).toBeNull();
  });

  it('should cache manifest after first fetch', async () => {
    const { createUseGreeting } = await import('../../src/hooks/useGreeting');

    const greetingEntry = {
      id: 'g-001',
      archetype: 'TV_PRESENTER_INTRO' as const,
      text: 'Hello!',
      audioPath: 'audio/g-001.mp3',
      audioDurationMs: 3000,
      videoPath: 'video/g-001.mp4',
      weight: 1.0,
      tags: [],
    };

    const manifestData = {
      version: '1.0.0',
      voiceConfig: { voiceId: 'Matthew', engine: 'neural', ssmlPitch: '+10%', ssmlRate: '105%' },
      greetings: [greetingEntry],
    };

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(manifestData)),
      })
      .mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });

    mockSelectGreeting.mockReturnValue(greetingEntry);

    const greeting = createUseGreeting(mockAudioChain);
    await greeting.playGreeting();
    await greeting.playGreeting();

    // Manifest fetch should only happen once, audio fetches happen each time
    const manifestCalls = mockFetch.mock.calls.filter(
      (call) => call[0] === '/greetings/manifest.json',
    );
    expect(manifestCalls).toHaveLength(1);
  });

  it('should fall back to browser TTS when greeting audio fetch returns 404', async () => {
    const { createUseGreeting } = await import('../../src/hooks/useGreeting');

    const greetingEntry = {
      id: 'g-004',
      archetype: 'TV_PRESENTER_INTRO' as const,
      text: 'G-G-Good evening!',
      audioPath: 'audio/g-004.mp3',
      audioDurationMs: 3000,
      videoPath: 'video/g-004.mp4',
      weight: 1.0,
      tags: [],
    };

    const manifestData = {
      version: '1.0.0',
      voiceConfig: { voiceId: 'Matthew', engine: 'neural', ssmlPitch: '+10%', ssmlRate: '105%' },
      greetings: [greetingEntry],
    };

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(manifestData)),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

    mockSelectGreeting.mockReturnValue(greetingEntry);

    const greeting = createUseGreeting(mockAudioChain);
    const result = await greeting.playGreeting();

    expect(result).toMatchObject({ id: 'g-004', text: 'G-G-Good evening!' });
    expect(mockBrowserSpeak).toHaveBeenCalledWith('G-G-Good evening!');
  });

  it('should reuse a preloaded audio buffer without refetching or decoding again', async () => {
    const { createUseGreeting } = await import('../../src/hooks/useGreeting');

    const preloaded = {
      id: 'g-011',
      text: 'Instant playback.',
      audioBuffer: {} as AudioBuffer,
      durationMs: 1800,
    };

    const greeting = createUseGreeting(mockAudioChain);
    const result = await greeting.playGreeting(preloaded);

    expect(result).toMatchObject({ id: 'g-011', text: 'Instant playback.' });
    expect(mockAudioChain.play).toHaveBeenCalledWith(preloaded.audioBuffer);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should return a completion promise for browser TTS fallback', async () => {
    const { createUseGreeting } = await import('../../src/hooks/useGreeting');

    const greetingEntry = {
      id: 'g-014',
      archetype: 'TV_PRESENTER_INTRO' as const,
      text: 'Text should stay up until I finish.',
      audioPath: 'audio/g-014.mp3',
      audioDurationMs: 3000,
      videoPath: 'video/g-014.mp4',
      weight: 1.0,
      tags: [],
    };

    const manifestData = {
      version: '1.0.0',
      voiceConfig: { voiceId: 'Matthew', engine: 'neural', ssmlPitch: '+10%', ssmlRate: '105%' },
      greetings: [greetingEntry],
    };

    let resolveSpeech!: () => void;
    const speechCompletion = new Promise<void>((resolve) => {
      resolveSpeech = resolve;
    });

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(manifestData)),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

    mockSelectGreeting.mockReturnValue(greetingEntry);
    mockBrowserSpeak.mockReturnValueOnce(speechCompletion);

    const greeting = createUseGreeting(mockAudioChain);
    const result = await greeting.playGreeting();

    expect(result).toMatchObject({
      id: 'g-014',
      text: 'Text should stay up until I finish.',
    });
    expect(result?.completion).toBeDefined();

    let didComplete = false;
    void result?.completion?.then(() => {
      didComplete = true;
    });

    await Promise.resolve();
    expect(didComplete).toBe(false);

    resolveSpeech();
    await result?.completion;
    expect(didComplete).toBe(true);
  });

  it('should preload a text-only fallback when greeting audio fetch fails', async () => {
    const { createUseGreeting } = await import('../../src/hooks/useGreeting');

    const greetingEntry = {
      id: 'g-012',
      archetype: 'TV_PRESENTER_INTRO' as const,
      text: 'Audio fallback ready.',
      audioPath: 'audio/g-012.mp3',
      audioDurationMs: 3000,
      videoPath: 'video/g-012.mp4',
      weight: 1.0,
      tags: [],
    };

    const manifestData = {
      version: '1.0.0',
      voiceConfig: { voiceId: 'Matthew', engine: 'neural', ssmlPitch: '+10%', ssmlRate: '105%' },
      greetings: [greetingEntry],
    };

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(manifestData)),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

    mockSelectGreeting.mockReturnValue(greetingEntry);

    const greeting = createUseGreeting(mockAudioChain);
    const preloaded = await greeting.preloadGreeting();

    expect(preloaded).toEqual(
      expect.objectContaining({
        id: 'g-012',
        text: 'Audio fallback ready.',
        audioBuffer: null,
        durationMs: 3000,
      }),
    );
    expect(mockAudioChain.play).not.toHaveBeenCalled();
  });

  it('should fall back to the normal fetch path when playGreeting receives null preloaded audio', async () => {
    const { createUseGreeting } = await import('../../src/hooks/useGreeting');

    const greetingEntry = {
      id: 'g-013',
      archetype: 'TV_PRESENTER_INTRO' as const,
      text: 'Late preload fallback.',
      audioPath: 'audio/g-013.mp3',
      audioDurationMs: 3000,
      videoPath: 'video/g-013.mp4',
      weight: 1.0,
      tags: [],
    };

    const manifestData = {
      version: '1.0.0',
      voiceConfig: { voiceId: 'Matthew', engine: 'neural', ssmlPitch: '+10%', ssmlRate: '105%' },
      greetings: [greetingEntry],
    };

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(manifestData)),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });

    mockSelectGreeting.mockReturnValue(greetingEntry);

    const greeting = createUseGreeting(mockAudioChain);
    const result = await greeting.playGreeting(null);

    expect(result).toMatchObject({ id: 'g-013', text: 'Late preload fallback.' });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockAudioChain.play).toHaveBeenCalled();
  });

  it('stopGreeting should cancel browser TTS fallback', async () => {
    const { createUseGreeting } = await import('../../src/hooks/useGreeting');

    const greeting = createUseGreeting(mockAudioChain);
    greeting.stopGreeting();

    expect(mockBrowserStop).toHaveBeenCalled();
    expect(mockAudioChain.stop).toHaveBeenCalled();
  });

  describe('isGreeting state tracking', () => {
    it('should set isGreeting=true when MP3 greeting starts playing', async () => {
      const { createUseGreeting } = await import('../../src/hooks/useGreeting');

      const greetingEntry = {
        id: 'g-audio-001',
        archetype: 'TV_PRESENTER_INTRO' as const,
        text: 'Hello from audio!',
        audioPath: 'audio/g-audio-001.mp3',
        audioDurationMs: 2000,
        videoPath: 'video/g-audio-001.mp4',
        weight: 1.0,
        tags: [],
      };

      const manifestData = {
        version: '1.0.0',
        voiceConfig: { voiceId: 'Matthew', engine: 'neural', ssmlPitch: '+10%', ssmlRate: '105%' },
        greetings: [greetingEntry],
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify(manifestData)),
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
        });

      mockSelectGreeting.mockReturnValue(greetingEntry);

      const greeting = createUseGreeting(mockAudioChain);
      await greeting.playGreeting();

      // setGreeting(true) should be called when playing MP3
      expect(mockSetGreeting).toHaveBeenCalledWith(true);
    });

    it('should set isGreeting=true when TTS fallback greeting starts playing', async () => {
      const { createUseGreeting } = await import('../../src/hooks/useGreeting');

      const greetingEntry = {
        id: 'g-tts-001',
        archetype: 'TV_PRESENTER_INTRO' as const,
        text: 'Hello from TTS!',
        audioPath: 'audio/g-tts-001.mp3',
        audioDurationMs: 2000,
        videoPath: 'video/g-tts-001.mp4',
        weight: 1.0,
        tags: [],
      };

      const manifestData = {
        version: '1.0.0',
        voiceConfig: { voiceId: 'Matthew', engine: 'neural', ssmlPitch: '+10%', ssmlRate: '105%' },
        greetings: [greetingEntry],
      };

      // Mock audio fetch to fail, so it falls back to TTS
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify(manifestData)),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        });

      mockSelectGreeting.mockReturnValue(greetingEntry);
      mockBrowserSpeak.mockResolvedValue(undefined);

      const greeting = createUseGreeting(mockAudioChain);
      await greeting.playGreeting();

      // setGreeting(true) should be called when playing TTS
      expect(mockSetGreeting).toHaveBeenCalledWith(true);
    });

    it('should set isGreeting=false when greeting playback completes', async () => {
      const { createUseGreeting } = await import('../../src/hooks/useGreeting');

      const greetingEntry = {
        id: 'g-complete-001',
        archetype: 'TV_PRESENTER_INTRO' as const,
        text: 'Brief greeting.',
        audioPath: 'audio/g-complete-001.mp3',
        audioDurationMs: 500,
        videoPath: 'video/g-complete-001.mp4',
        weight: 1.0,
        tags: [],
      };

      const manifestData = {
        version: '1.0.0',
        voiceConfig: { voiceId: 'Matthew', engine: 'neural', ssmlPitch: '+10%', ssmlRate: '105%' },
        greetings: [greetingEntry],
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify(manifestData)),
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
        });

      mockSelectGreeting.mockReturnValue(greetingEntry);

      const greeting = createUseGreeting(mockAudioChain);
      const result = await greeting.playGreeting();

      expect(mockSetGreeting).toHaveBeenCalledWith(true);

      // Wait for completion promise to resolve
      await result?.completion;

      expect(mockSetGreeting).toHaveBeenCalledWith(false);
    });

    it('should set isGreeting=false when stopGreeting is called', async () => {
      const { createUseGreeting } = await import('../../src/hooks/useGreeting');

      const greetingEntry = {
        id: 'g-stop-001',
        archetype: 'TV_PRESENTER_INTRO' as const,
        text: 'Should be stopped.',
        audioPath: 'audio/g-stop-001.mp3',
        audioDurationMs: 5000,
        videoPath: 'video/g-stop-001.mp4',
        weight: 1.0,
        tags: [],
      };

      const manifestData = {
        version: '1.0.0',
        voiceConfig: { voiceId: 'Matthew', engine: 'neural', ssmlPitch: '+10%', ssmlRate: '105%' },
        greetings: [greetingEntry],
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify(manifestData)),
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
        });

      mockSelectGreeting.mockReturnValue(greetingEntry);

      const greeting = createUseGreeting(mockAudioChain);
      await greeting.playGreeting();

      expect(mockSetGreeting).toHaveBeenCalledWith(true);

      greeting.stopGreeting();

      expect(mockSetGreeting).toHaveBeenCalledWith(false);
    });
  });
});
