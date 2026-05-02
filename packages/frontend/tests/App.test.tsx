import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock all child components
vi.mock('../src/components/CrtFrame', () => ({
  CrtFrame: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="crt-frame">{children}</div>
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

vi.mock('../src/effects/WireframeBackdrop', () => ({
  WireframeBackdrop: () => <div data-testid="wireframe-backdrop" />,
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
    start: vi.fn(),
    stop: vi.fn().mockReturnValue(''),
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

vi.mock('../src/stores/conversationStore', () => ({
  useConversationStore: Object.assign(
    (selector?: (s: Record<string, unknown>) => unknown) => {
      const state = { currentResponseText: '', isStreaming: false, currentTurnIndex: 0 };
      return selector ? selector(state) : state;
    },
    {
      getState: () => ({ currentResponseText: '', isStreaming: false }),
      subscribe: vi.fn().mockReturnValue(vi.fn()),
    },
  ),
}));

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

  it('should render wireframe backdrop', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    expect(screen.getByTestId('wireframe-backdrop')).toBeInTheDocument();
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
