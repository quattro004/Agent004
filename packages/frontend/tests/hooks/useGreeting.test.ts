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
vi.mock('../../src/stores/voiceStore', () => ({
  useVoiceStore: Object.assign(() => ({ isSpeaking: false }), {
    getState: () => ({
      setSpeaking: mockSetSpeaking,
      setMouthOpen: mockSetMouthOpen,
    }),
  }),
}));

// Mock greetingSelector
const mockSelectGreeting = vi.fn();
vi.mock('../../src/services/greetingSelector', () => ({
  selectGreeting: (...args: unknown[]) => mockSelectGreeting(...args),
  loadManifest: vi.fn((raw: string) => JSON.parse(raw)),
}));

// Mock fetch globally
const mockFetch = vi.fn();

describe('useGreeting', () => {
  let mockAudioChain: AudioChain;

  beforeEach(() => {
    vi.clearAllMocks();

    // Stub globals each test (clearAllMocks doesn't restore stubs)
    vi.stubGlobal('fetch', mockFetch);

    // Mock AudioContext for decoding (jsdom doesn't have it)
    const mockAudioBuffer = {} as AudioBuffer;
    vi.stubGlobal(
      'AudioContext',
      vi.fn().mockImplementation(() => ({
        decodeAudioData: vi.fn().mockResolvedValue(mockAudioBuffer),
        close: vi.fn().mockResolvedValue(undefined),
      })),
    );

    mockAudioChain = {
      init: vi.fn().mockResolvedValue(undefined),
      play: vi.fn(),
      stop: vi.fn(),
      getIsMouthOpen: vi.fn().mockReturnValue(false),
      triggerStutter: vi.fn(),
      triggerStaticBurst: vi.fn(),
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

    expect(result).toEqual({ id: 'g-003', text: 'And now a word from our sponsor... me!' });
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
});
