import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock all child components
vi.mock('../src/components/CrtFrame', () => ({
  CrtFrame: ({ children, videoSrc }: { children?: React.ReactNode; videoSrc?: string }) => (
    <div data-testid="crt-frame" data-video-src={videoSrc}>
      <div data-testid="crt-screen-mock">{children}</div>
    </div>
  ),
}));

vi.mock('../src/components/Avatar2D', () => ({
  Avatar2D: ({ isMouthOpen }: { isMouthOpen: boolean }) => (
    <div data-testid="avatar-2d" data-mouth-open={isMouthOpen} />
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

// Mock hooks
const mockSendMessage = vi.fn();
vi.mock('../src/hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    sendMessage: mockSendMessage,
    startSession: vi.fn(),
    endSession: vi.fn(),
    sendInterrupt: vi.fn(),
  }),
}));

vi.mock('../src/hooks/useIsMobile', () => ({
  useIsMobile: () => false,
  isMobileQuery: () => false,
}));

vi.mock('../src/hooks/useAudio', () => ({
  createUseAudio: vi.fn().mockReturnValue({ dispose: vi.fn() }),
}));

vi.mock('../src/hooks/useGreeting', () => ({
  createUseGreeting: vi.fn().mockReturnValue({
    playGreeting: vi.fn().mockResolvedValue({ id: 'g-001', text: 'Hello!' }),
    stopGreeting: vi.fn(),
  }),
}));

// Mock stores
vi.mock('../src/stores/connectionStore', () => {
  let state = {
    sessionState: 'ACTIVE' as string,
    sessionId: 'test-session',
    isWebSocketReady: true,
  };
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

  it('should render avatar (TV is always on)', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    expect(screen.getByTestId('avatar-2d')).toBeInTheDocument();
  });

  it('should render neon backdrop (TV is always on)', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    expect(screen.getByTestId('neon-backdrop')).toBeInTheDocument();
  });

  it('should render broadcast text', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    expect(screen.getByTestId('broadcast-text')).toBeInTheDocument();
  });

  it('should render children inside CrtFrame screen area', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    const screenArea = screen.getByTestId('crt-screen-mock');
    expect(screenArea.querySelector('[data-testid="avatar-2d"]')).toBeInTheDocument();
    expect(screenArea.querySelector('[data-testid="neon-backdrop"]')).toBeInTheDocument();
    expect(screenArea.querySelector('[data-testid="broadcast-text"]')).toBeInTheDocument();
  });

  it('should show buffering overlay when not connected', async () => {
    const { useConnectionStore } = await import('../src/stores/connectionStore');
    const connStore = useConnectionStore as unknown as {
      _setState: (s: Record<string, unknown>) => void;
    };
    connStore._setState({ isWebSocketReady: false });

    const { App } = await import('../src/App');
    render(<App />);
    expect(screen.getByTestId('buffering-overlay')).toBeInTheDocument();
  });

  it('should render TextInput in a chat-bar container', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    const input = screen.getByTestId('text-input');
    expect(input).toBeInTheDocument();
    expect(input.closest('.chat-bar')).toBeInTheDocument();
  });

  it('should render chat-bar outside CrtFrame (viewport-level overlay)', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    const chatBar = document.querySelector('.chat-bar');
    expect(chatBar).not.toBeNull();
    // chat-bar is a sibling of CrtFrame, not nested inside it
    const crtFrame = screen.getByTestId('crt-frame');
    expect(crtFrame.contains(chatBar)).toBe(false);
  });

  it('should send message when TextInput is submitted', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    const input = screen.getByTestId('text-input');
    fireEvent.change(input, { target: { value: 'hello Max' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'user_message',
        payload: expect.objectContaining({ text: 'hello Max' }),
      }),
    );
  });
});
