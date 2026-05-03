import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Mock all child components
vi.mock('../src/components/CrtFrame', () => ({
  CrtFrame: ({ children, panel }: { children: React.ReactNode; panel?: React.ReactNode }) => (
    <div data-testid="crt-frame">
      {children}
      {panel}
    </div>
  ),
}));

vi.mock('../src/components/Avatar2D', () => ({
  Avatar2D: ({ isMouthOpen }: { isMouthOpen: boolean }) => (
    <div data-testid="avatar-2d" data-mouth-open={isMouthOpen} />
  ),
}));

vi.mock('../src/components/TvKnob', () => ({
  TvKnob: ({ onTurnOn, disabled }: { onTurnOn: () => void; disabled: boolean }) => (
    <button data-testid="tv-knob" onClick={onTurnOn} disabled={disabled}>
      Knob
    </button>
  ),
}));

vi.mock('../src/components/TextInput', () => ({
  TextInput: ({ onSubmit, disabled }: { onSubmit: (text: string) => void; disabled: boolean }) => (
    <input
      data-testid="text-input"
      disabled={disabled}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSubmit((e.target as HTMLInputElement).value);
      }}
    />
  ),
}));

vi.mock('../src/components/BroadcastText', () => ({
  BroadcastText: ({ tokens, fullText }: { tokens: string[]; fullText: string | null }) => (
    <div data-testid="broadcast-text">{fullText ?? tokens.join('')}</div>
  ),
}));

vi.mock('../src/components/BufferingOverlay', () => ({
  BufferingOverlay: ({
    isConnecting,
    isThinking,
  }: {
    isConnecting: boolean;
    isThinking: boolean;
  }) => (isConnecting || isThinking ? <div data-testid="buffering-overlay" /> : null),
}));

vi.mock('../src/components/SessionStateOverlay', () => ({
  SessionStateOverlay: ({ state }: { state: string | null }) =>
    state ? <div data-testid="session-state-overlay">{state}</div> : null,
}));

vi.mock('../src/effects/NeonBackdrop', () => ({
  NeonBackdrop: () => <div data-testid="neon-backdrop" />,
}));

vi.mock('../src/components/VolumeKnob', () => ({
  VolumeKnob: ({
    onVolumeChange,
    disabled,
  }: {
    volume: number;
    onVolumeChange: (v: number) => void;
    disabled: boolean;
  }) => (
    <button data-testid="volume-knob" onClick={() => onVolumeChange(0.5)} disabled={disabled}>
      Volume
    </button>
  ),
}));

vi.mock('../src/components/MicButton', () => ({
  MicButton: ({
    onStart,
    onStop,
    disabled,
  }: {
    onStart: () => void;
    onStop: () => void;
    disabled: boolean;
  }) => (
    <button data-testid="mic-button" onClick={onStart} onDoubleClick={onStop} disabled={disabled}>
      Mic
    </button>
  ),
}));

vi.mock('../src/components/SpeechDisclosure', () => ({
  SpeechDisclosure: () => null,
}));

// Mock hooks
const mockSendMessage = vi.fn();
const mockStartSession = vi.fn();
const mockSpeechStop = vi.fn().mockReturnValue('');
const mockSpeechStart = vi.fn();
vi.mock('../src/hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    sendMessage: mockSendMessage,
    startSession: mockStartSession,
    endSession: vi.fn(),
    sendInterrupt: vi.fn(),
  }),
}));

vi.mock('../src/hooks/useIsMobile', () => ({
  useIsMobile: () => false,
  isMobileQuery: () => false,
}));

vi.mock('../src/hooks/useSpeech', () => ({
  useSpeech: () => ({
    isListening: false,
    transcript: '',
    error: null,
    start: mockSpeechStart,
    stop: mockSpeechStop,
  }),
  getSpeechProvider: () => 'Google',
}));

vi.mock('../src/services/micDetection', () => ({
  probeMic: vi.fn().mockResolvedValue(false),
}));

vi.mock('../src/hooks/useAudio', () => ({
  createUseAudio: vi.fn().mockReturnValue({ dispose: vi.fn() }),
}));

const mockPlayGreeting = vi.fn().mockResolvedValue({ id: 'g-001', text: 'Hello!' });
vi.mock('../src/hooks/useGreeting', () => ({
  createUseGreeting: vi.fn().mockReturnValue({
    playGreeting: mockPlayGreeting,
    stopGreeting: vi.fn(),
  }),
}));

// Mock stores
vi.mock('../src/stores/connectionStore', () => {
  let state = { sessionState: 'INITIALIZING' as string, sessionId: null, isWebSocketReady: false };
  const listeners = new Set<() => void>();
  return {
    useConnectionStore: Object.assign(
      (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
      {
        getState: () => state,
        subscribe: (fn: () => void) => {
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
        _setState: (s: Partial<typeof state>) => {
          state = { ...state, ...s };
          listeners.forEach((fn) => fn());
        },
      },
    ),
  };
});

vi.mock('../src/stores/conversationStore', () => {
  let state = { currentResponseText: '', isStreaming: false, currentTurnIndex: 0 };
  const listeners = new Set<() => void>();
  return {
    useConversationStore: Object.assign(
      (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
      {
        getState: () => state,
        subscribe: (fn: () => void) => {
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
        _setState: (s: Partial<typeof state>) => {
          state = { ...state, ...s };
          listeners.forEach((fn) => fn());
        },
        _reset: () => {
          state = { currentResponseText: '', isStreaming: false, currentTurnIndex: 0 };
        },
      },
    ),
  };
});

vi.mock('../src/stores/voiceStore', () => ({
  useVoiceStore: Object.assign(
    (selector?: (s: Record<string, boolean>) => unknown) => {
      const state = { isSpeaking: false, isMouthOpen: false, isMicActive: false };
      return selector ? selector(state) : state;
    },
    {
      getState: () => ({
        isSpeaking: false,
        isMouthOpen: false,
        setSpeaking: vi.fn(),
        setMouthOpen: vi.fn(),
      }),
    },
  ),
}));

vi.mock('../src/stores/visitorStore', () => ({
  useVisitorStore: Object.assign(
    (selector?: (s: Record<string, unknown>) => unknown) => {
      const state = { actorId: 'test-actor', displayAlias: null, greetingHistory: [] };
      return selector ? selector(state) : state;
    },
    {
      getState: () => ({ actorId: 'test-actor', greetingHistory: [], pushGreeting: vi.fn() }),
    },
  ),
}));

// Mock audio chain
vi.mock('../src/audio/audioChain', () => ({
  createAudioChain: vi.fn().mockReturnValue({
    init: vi.fn().mockResolvedValue(undefined),
    play: vi.fn(),
    stop: vi.fn(),
    getIsMouthOpen: vi.fn().mockReturnValue(false),
    triggerStutter: vi.fn(),
    triggerStaticBurst: vi.fn(),
    dispose: vi.fn(),
  }),
}));

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the CRT frame', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    expect(screen.getByTestId('crt-frame')).toBeInTheDocument();
  });

  it('should render the TV knob', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    expect(screen.getByTestId('tv-knob')).toBeInTheDocument();
  });

  it('should render the text input', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    expect(screen.getByTestId('text-input')).toBeInTheDocument();
  });

  it('should have text input disabled before TV is on', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    expect(screen.getByTestId('text-input')).toBeDisabled();
  });

  it('should not render avatar before TV is on', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    expect(screen.queryByTestId('avatar-2d')).not.toBeInTheDocument();
  });

  it('should NOT render neon backdrop when TV is off', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    expect(screen.queryByTestId('neon-backdrop')).not.toBeInTheDocument();
  });

  it('should render neon backdrop after turning TV on', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    const knob = screen.getByTestId('tv-knob');
    await act(async () => {
      fireEvent.click(knob);
    });
    expect(screen.getByTestId('neon-backdrop')).toBeInTheDocument();
  });

  it('should render the volume knob', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    expect(screen.getByTestId('volume-knob')).toBeInTheDocument();
  });

  it('should call playGreeting when TV knob is clicked', async () => {
    const { App } = await import('../src/App');
    render(<App />);

    const knob = screen.getByTestId('tv-knob');
    fireEvent.click(knob);

    // handleTvOn is async — wait for microtask to flush
    await vi.waitFor(() => {
      expect(mockPlayGreeting).toHaveBeenCalled();
    });
  });
});

describe('App – voice turn-index race condition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should send voice message with the turn index captured at mic-start, not mic-stop', async () => {
    // Use the REAL conversationStore so Zustand triggers React re-renders
    vi.doUnmock('../src/stores/conversationStore');
    vi.resetModules();

    // Set connection to ACTIVE and mic available
    const { useConnectionStore } = await import('../src/stores/connectionStore');
    const connStore = useConnectionStore as unknown as {
      _setState: (s: Record<string, unknown>) => void;
    };
    connStore._setState({
      sessionState: 'ACTIVE',
      sessionId: 'test-session',
      isWebSocketReady: true,
    });

    // Enable mic
    const micDetection = await import('../src/services/micDetection');
    vi.mocked(micDetection.probeMic).mockResolvedValue(true);

    // Speech stop returns a transcript
    mockSpeechStop.mockReturnValue('hello from voice');

    // Get the real store so we can call advanceTurn
    const { useConversationStore } = await import('../src/stores/conversationStore');
    useConversationStore.getState().reset();

    const { App } = await import('../src/App');
    render(<App />);

    // Turn on the TV first (required for mic button to be enabled)
    await act(async () => {
      fireEvent.click(screen.getByTestId('tv-knob'));
    });

    // Wait for mic button to appear (probeMic resolves)
    await vi.waitFor(() => {
      expect(screen.getByTestId('mic-button')).toBeInTheDocument();
    });
    expect(screen.getByTestId('mic-button')).not.toBeDisabled();

    // Act: start mic — captures currentTurnIndex (0) in ref
    await act(async () => {
      fireEvent.click(screen.getByTestId('mic-button'));
    });

    // Simulate agent_turn_complete arriving: advance turn index via real Zustand
    // This triggers a React re-render with currentTurnIndex = 1
    await act(async () => {
      useConversationStore.getState().advanceTurn();
    });
    expect(useConversationStore.getState().currentTurnIndex).toBe(1);

    // Stop mic — should use the ref value (0) captured at mic-start, NOT the live value (1)
    await act(async () => {
      fireEvent.doubleClick(screen.getByTestId('mic-button'));
    });

    // Assert: turnIndex should be 0 (captured at start), not 1 (current)
    expect(mockSendMessage).toHaveBeenCalledWith({
      type: 'user_message',
      payload: {
        text: 'hello from voice',
        turnIndex: 0,
        inputMethod: 'voice',
      },
    });
  });

  it('should send text message with the current turn index at submission time', async () => {
    // Use the REAL conversationStore
    vi.doUnmock('../src/stores/conversationStore');
    vi.resetModules();

    const { useConnectionStore } = await import('../src/stores/connectionStore');
    const connStore = useConnectionStore as unknown as {
      _setState: (s: Record<string, unknown>) => void;
    };
    connStore._setState({
      sessionState: 'ACTIVE',
      sessionId: 'test-session',
      isWebSocketReady: true,
    });

    // Advance turnIndex to 3 via real store
    const { useConversationStore } = await import('../src/stores/conversationStore');
    useConversationStore.getState().reset();
    useConversationStore.getState().advanceTurn(); // 1
    useConversationStore.getState().advanceTurn(); // 2
    useConversationStore.getState().advanceTurn(); // 3

    const { App } = await import('../src/App');
    render(<App />);

    const input = screen.getByTestId('text-input');
    fireEvent.change(input, { target: { value: 'hello from text' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // Text input should use the live currentTurnIndex (3)
    expect(mockSendMessage).toHaveBeenCalledWith({
      type: 'user_message',
      payload: {
        text: 'hello from text',
        turnIndex: 3,
        inputMethod: 'text',
      },
    });
  });
});
