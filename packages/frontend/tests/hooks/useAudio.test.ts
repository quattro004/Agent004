import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AudioChain } from '../../src/audio/audioChain';

// Mock stores
vi.mock('../../src/stores/voiceStore', () => {
  const setSpeaking = vi.fn();
  const setMouthOpen = vi.fn();
  return {
    useVoiceStore: Object.assign(() => ({ isSpeaking: false }), {
      getState: () => ({ setSpeaking, setMouthOpen }),
    }),
  };
});

vi.mock('../../src/stores/conversationStore', () => {
  let state = { currentResponseText: '', isStreaming: false, currentTurnIndex: 0 };
  const subscribers = new Set<() => void>();
  return {
    useConversationStore: Object.assign(() => state, {
      getState: () => state,
      subscribe: (fn: () => void) => {
        subscribers.add(fn);
        return () => subscribers.delete(fn);
      },
      _setState: (s: Partial<typeof state>) => {
        state = { ...state, ...s };
        subscribers.forEach((fn) => fn());
      },
      _reset: () => {
        state = { currentResponseText: '', isStreaming: false, currentTurnIndex: 0 };
      },
    }),
  };
});

vi.mock('../../src/stores/connectionStore', () => ({
  useConnectionStore: Object.assign(() => ({ sessionState: 'ACTIVE' }), {
    getState: () => ({ sessionState: 'ACTIVE' }),
  }),
}));

// Mock pollyTts
const mockSynthesizeTurn = vi.fn();
vi.mock('../../src/services/pollyTts', () => ({
  synthesizeTurn: (...args: unknown[]) => mockSynthesizeTurn(...args),
}));

// Mock browserTts
const mockBrowserSpeak = vi.fn();
const mockBrowserIsAvailable = vi.fn();
vi.mock('../../src/services/browserTts', () => ({
  speak: (...args: unknown[]) => mockBrowserSpeak(...args),
  isAvailable: () => mockBrowserIsAvailable(),
  stop: vi.fn(),
}));

describe('useAudio', () => {
  let mockAudioChain: AudioChain;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockBrowserIsAvailable.mockReturnValue(true);
    mockBrowserSpeak.mockResolvedValue(undefined);

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
    vi.useRealTimers();
  });

  it('should export a createUseAudio function', async () => {
    const { createUseAudio } = await import('../../src/hooks/useAudio');
    expect(createUseAudio).toBeDefined();
    expect(typeof createUseAudio).toBe('function');
  });

  it('should call synthesizeTurn when conversation transitions from streaming to complete', async () => {
    const { createUseAudio } = await import('../../src/hooks/useAudio');
    const { useConversationStore } = await import('../../src/stores/conversationStore');
    const store = useConversationStore as unknown as {
      _setState: (s: Record<string, unknown>) => void;
    };

    mockSynthesizeTurn.mockResolvedValue({
      audioData: new Uint8Array([1, 2, 3]),
      visemeMarks: null,
      textOnly: false,
    });

    const audio = createUseAudio(mockAudioChain);

    // Simulate streaming→complete
    store._setState({ currentResponseText: 'Hello!', isStreaming: true, currentTurnIndex: 1 });
    store._setState({ currentResponseText: 'Hello!', isStreaming: false, currentTurnIndex: 1 });

    // Allow async processing
    await vi.advanceTimersByTimeAsync(100);

    expect(mockSynthesizeTurn).toHaveBeenCalledWith('Hello!');
    audio.dispose();
  });

  it('should call audioChain.play with decoded AudioBuffer on successful synthesis', async () => {
    const { createUseAudio } = await import('../../src/hooks/useAudio');
    const { useConversationStore } = await import('../../src/stores/conversationStore');
    const store = useConversationStore as unknown as {
      _setState: (s: Record<string, unknown>) => void;
    };

    const fakeAudioData = new Uint8Array([1, 2, 3, 4]);
    mockSynthesizeTurn.mockResolvedValue({
      audioData: fakeAudioData,
      visemeMarks: null,
      textOnly: false,
    });

    // Mock AudioContext for decoding
    const mockAudioBuffer = {} as AudioBuffer;
    const mockDecodeAudioData = vi.fn().mockResolvedValue(mockAudioBuffer);
    const mockClose = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        return {
          decodeAudioData: mockDecodeAudioData,
          close: mockClose,
        };
      }),
    );

    const audio = createUseAudio(mockAudioChain);

    store._setState({ currentResponseText: 'Test', isStreaming: true, currentTurnIndex: 1 });
    store._setState({ currentResponseText: 'Test', isStreaming: false, currentTurnIndex: 1 });

    await vi.advanceTimersByTimeAsync(100);

    expect(mockAudioChain.play).toHaveBeenCalledWith(mockAudioBuffer);
    audio.dispose();
    vi.unstubAllGlobals();
  });

  it('should set voiceStore.isSpeaking during playback', async () => {
    const { createUseAudio } = await import('../../src/hooks/useAudio');
    const { useVoiceStore } = await import('../../src/stores/voiceStore');
    const voiceState = useVoiceStore.getState();

    mockSynthesizeTurn.mockResolvedValue({
      audioData: new Uint8Array([1, 2, 3]),
      visemeMarks: null,
      textOnly: false,
    });

    const audio = createUseAudio(mockAudioChain);
    const { useConversationStore } = await import('../../src/stores/conversationStore');
    const store = useConversationStore as unknown as {
      _setState: (s: Record<string, unknown>) => void;
    };

    store._setState({ currentResponseText: 'Hi', isStreaming: true, currentTurnIndex: 1 });
    store._setState({ currentResponseText: 'Hi', isStreaming: false, currentTurnIndex: 1 });
    await vi.advanceTimersByTimeAsync(100);

    expect(voiceState.setSpeaking).toHaveBeenCalledWith(true);
    audio.dispose();
  });

  it('should not crash when synthesis returns textOnly: true', async () => {
    const { createUseAudio } = await import('../../src/hooks/useAudio');
    const { useConversationStore } = await import('../../src/stores/conversationStore');
    const store = useConversationStore as unknown as {
      _setState: (s: Record<string, unknown>) => void;
    };

    mockSynthesizeTurn.mockResolvedValue({
      audioData: null,
      visemeMarks: null,
      textOnly: true,
    });

    const audio = createUseAudio(mockAudioChain);

    store._setState({ currentResponseText: 'Fallback', isStreaming: true, currentTurnIndex: 1 });
    store._setState({
      currentResponseText: 'Fallback',
      isStreaming: false,
      currentTurnIndex: 1,
    });
    await vi.advanceTimersByTimeAsync(100);

    // Should not throw and should not call play
    expect(mockAudioChain.play).not.toHaveBeenCalled();
    audio.dispose();
  });

  it('should not reprocess the same turn index twice', async () => {
    const { createUseAudio } = await import('../../src/hooks/useAudio');
    const { useConversationStore } = await import('../../src/stores/conversationStore');
    const store = useConversationStore as unknown as {
      _setState: (s: Record<string, unknown>) => void;
      _reset: () => void;
    };

    store._reset();

    mockSynthesizeTurn.mockResolvedValue({
      audioData: new Uint8Array([1]),
      visemeMarks: null,
      textOnly: false,
    });

    const audio = createUseAudio(mockAudioChain);

    // First transition
    store._setState({ currentResponseText: 'First', isStreaming: true, currentTurnIndex: 1 });
    store._setState({ currentResponseText: 'First', isStreaming: false, currentTurnIndex: 1 });
    await vi.advanceTimersByTimeAsync(100);

    // Same turn index again
    store._setState({ currentResponseText: 'First', isStreaming: true, currentTurnIndex: 1 });
    store._setState({ currentResponseText: 'First', isStreaming: false, currentTurnIndex: 1 });
    await vi.advanceTimersByTimeAsync(100);

    expect(mockSynthesizeTurn).toHaveBeenCalledTimes(1);
    audio.dispose();
  });

  it('should fall back to browser TTS when Polly synthesis fails', async () => {
    const { createUseAudio } = await import('../../src/hooks/useAudio');
    const { useConversationStore } = await import('../../src/stores/conversationStore');
    const store = useConversationStore as unknown as {
      _setState: (s: Record<string, unknown>) => void;
      _reset: () => void;
    };

    store._reset();

    // Polly fails
    mockSynthesizeTurn.mockRejectedValue(new Error('No AWS credentials'));

    const audio = createUseAudio(mockAudioChain);

    store._setState({ currentResponseText: 'Hello world', isStreaming: true, currentTurnIndex: 1 });
    store._setState({
      currentResponseText: 'Hello world',
      isStreaming: false,
      currentTurnIndex: 1,
    });
    await vi.advanceTimersByTimeAsync(100);

    expect(mockBrowserSpeak).toHaveBeenCalledWith('Hello world');
    audio.dispose();
  });

  it('should not call browser TTS when it is unavailable', async () => {
    const { createUseAudio } = await import('../../src/hooks/useAudio');
    const { useConversationStore } = await import('../../src/stores/conversationStore');
    const store = useConversationStore as unknown as {
      _setState: (s: Record<string, unknown>) => void;
      _reset: () => void;
    };

    store._reset();

    mockSynthesizeTurn.mockRejectedValue(new Error('No AWS credentials'));
    mockBrowserIsAvailable.mockReturnValue(false);

    const audio = createUseAudio(mockAudioChain);

    store._setState({ currentResponseText: 'Test', isStreaming: true, currentTurnIndex: 1 });
    store._setState({ currentResponseText: 'Test', isStreaming: false, currentTurnIndex: 1 });
    await vi.advanceTimersByTimeAsync(100);

    expect(mockBrowserSpeak).not.toHaveBeenCalled();
    audio.dispose();
  });

  describe('budget degradation mode', () => {
    it('should skip Polly and use browser TTS directly when budget mode is browser_tts', async () => {
      const { createUseAudio } = await import('../../src/hooks/useAudio');
      const { createBudgetDegradation } = await import('../../src/services/budgetDegradation');
      const { useConversationStore } = await import('../../src/stores/conversationStore');
      const store = useConversationStore as unknown as {
        _setState: (s: Record<string, unknown>) => void;
        _reset: () => void;
      };

      store._reset();

      const budget = createBudgetDegradation();
      budget.onBudgetCapped(true); // browser_tts mode

      const audio = createUseAudio(mockAudioChain, budget);

      store._setState({
        currentResponseText: 'Budget test',
        isStreaming: true,
        currentTurnIndex: 1,
      });
      store._setState({
        currentResponseText: 'Budget test',
        isStreaming: false,
        currentTurnIndex: 1,
      });
      await vi.advanceTimersByTimeAsync(100);

      expect(mockSynthesizeTurn).not.toHaveBeenCalled();
      expect(mockBrowserSpeak).toHaveBeenCalled();
      expect(mockAudioChain.play).not.toHaveBeenCalled();
      audio.dispose();
    });

    it('should prepend first-fallback message on first utterance in browser_tts mode', async () => {
      const { createUseAudio } = await import('../../src/hooks/useAudio');
      const { createBudgetDegradation } = await import('../../src/services/budgetDegradation');
      const { useConversationStore } = await import('../../src/stores/conversationStore');
      const store = useConversationStore as unknown as {
        _setState: (s: Record<string, unknown>) => void;
        _reset: () => void;
      };

      store._reset();

      const budget = createBudgetDegradation();
      budget.onBudgetCapped(true);

      const audio = createUseAudio(mockAudioChain, budget);

      store._setState({ currentResponseText: 'Response', isStreaming: true, currentTurnIndex: 1 });
      store._setState({ currentResponseText: 'Response', isStreaming: false, currentTurnIndex: 1 });
      await vi.advanceTimersByTimeAsync(100);

      const spokenText = mockBrowserSpeak.mock.calls[0][0] as string;
      expect(spokenText).toContain('Signal');
      expect(spokenText).toContain('Response');
      audio.dispose();
    });

    it('should not prepend degradation message on subsequent utterances', async () => {
      const { createUseAudio } = await import('../../src/hooks/useAudio');
      const { createBudgetDegradation } = await import('../../src/services/budgetDegradation');
      const { useConversationStore } = await import('../../src/stores/conversationStore');
      const store = useConversationStore as unknown as {
        _setState: (s: Record<string, unknown>) => void;
        _reset: () => void;
      };

      store._reset();

      const budget = createBudgetDegradation();
      budget.onBudgetCapped(true);

      const audio = createUseAudio(mockAudioChain, budget);

      // First utterance
      store._setState({ currentResponseText: 'First', isStreaming: true, currentTurnIndex: 1 });
      store._setState({ currentResponseText: 'First', isStreaming: false, currentTurnIndex: 1 });
      await vi.advanceTimersByTimeAsync(100);

      // Second utterance
      store._setState({ currentResponseText: 'Second', isStreaming: true, currentTurnIndex: 2 });
      store._setState({ currentResponseText: 'Second', isStreaming: false, currentTurnIndex: 2 });
      await vi.advanceTimersByTimeAsync(100);

      const secondCall = mockBrowserSpeak.mock.calls[1][0] as string;
      expect(secondCall).toBe('Second');
      audio.dispose();
    });
  });
});
