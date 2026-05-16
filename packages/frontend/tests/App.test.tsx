import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock all child components
vi.mock('../src/components/CrtFrame', () => ({
  CrtFrame: ({
    children,
    videoSrc,
    panel,
    footer,
  }: {
    children?: React.ReactNode;
    videoSrc?: string;
    panel?: React.ReactNode;
    footer?: React.ReactNode;
  }) => (
    <div data-testid="crt-frame" data-video-src={videoSrc}>
      <div data-testid="crt-screen-mock">{children}</div>
      {panel && <div data-testid="crt-panel-mock">{panel}</div>}
      {footer && <div data-testid="crt-footer-mock">{footer}</div>}
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

vi.mock('../src/components/TvKnob', () => ({
  TvKnob: ({ onToggle, isOn }: { onToggle: () => void; isOn: boolean }) => (
    <button data-testid="tv-knob" onClick={onToggle} data-is-on={isOn}>
      ON/OFF
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

describe('App — TV Power Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the CRT frame regardless of power state', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    expect(screen.getByTestId('crt-frame')).toBeInTheDocument();
  });

  it('should start with TV off — no avatar, no backdrop, no broadcast text', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    expect(screen.queryByTestId('avatar-2d')).not.toBeInTheDocument();
    expect(screen.queryByTestId('neon-backdrop')).not.toBeInTheDocument();
    expect(screen.queryByTestId('broadcast-text')).not.toBeInTheDocument();
  });

  it('should render TvKnob in the control panel when TV is off', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    expect(screen.getByTestId('tv-knob')).toBeInTheDocument();
  });

  it('should not render session state overlays when TV is off', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    expect(screen.queryByTestId('session-state-overlay')).not.toBeInTheDocument();
  });

  it('should show screen content after TvKnob is clicked (power on)', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    const knob = screen.getByTestId('tv-knob');
    fireEvent.click(knob);
    // After powering transition completes, content should appear
    await vi.waitFor(() => {
      expect(screen.getByTestId('avatar-2d')).toBeInTheDocument();
      expect(screen.getByTestId('neon-backdrop')).toBeInTheDocument();
    });
  });

  it('should keep TvKnob enabled while TV is on (toggle behavior)', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    const knob = screen.getByTestId('tv-knob');
    fireEvent.click(knob);
    await vi.waitFor(() => {
      expect(knob).toBeEnabled();
      expect(knob.getAttribute('data-is-on')).toBe('true');
    });
  });

  it('should not render TextInput when TV is off', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    expect(screen.queryByTestId('text-input')).not.toBeInTheDocument();
  });

  it('should render TextInput after TV is turned on and session is active', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    const knob = screen.getByTestId('tv-knob');
    fireEvent.click(knob);
    await vi.waitFor(() => {
      expect(screen.getByTestId('text-input')).toBeInTheDocument();
    });
  });

  it('should send message when TextInput is submitted while TV is on', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    const knob = screen.getByTestId('tv-knob');
    fireEvent.click(knob);
    await vi.waitFor(() => {
      expect(screen.getByTestId('text-input')).toBeInTheDocument();
    });
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

  it('should turn TV off when session enters ENDED state', async () => {
    const { useConnectionStore } = await import('../src/stores/connectionStore');
    const connStore = useConnectionStore as unknown as {
      _setState: (s: Record<string, unknown>) => void;
    };

    const { App } = await import('../src/App');
    const { rerender } = render(<App />);

    // Turn on the TV
    const knob = screen.getByTestId('tv-knob');
    fireEvent.click(knob);
    await vi.waitFor(() => {
      expect(knob.getAttribute('data-is-on')).toBe('true');
    });

    // Session ends — TV should turn off
    connStore._setState({ sessionState: 'ENDED' });
    rerender(<App />);

    await vi.waitFor(() => {
      expect(screen.getByTestId('tv-knob').getAttribute('data-is-on')).toBe('false');
    });
  });

  it('should show session state overlay only when TV is on', async () => {
    const { useConnectionStore } = await import('../src/stores/connectionStore');
    const connStore = useConnectionStore as unknown as {
      _setState: (s: Record<string, unknown>) => void;
    };
    connStore._setState({ sessionState: 'SIGNAL_LOST' });

    const { App } = await import('../src/App');
    render(<App />);

    // TV is off — should NOT show SIGNAL_LOST overlay
    expect(screen.queryByTestId('session-state-overlay')).not.toBeInTheDocument();
  });

  it('should NOT show avatar when TV is on but WebSocket is not connected', async () => {
    const { useConnectionStore } = await import('../src/stores/connectionStore');
    const connStore = useConnectionStore as unknown as {
      _setState: (s: Record<string, unknown>) => void;
    };
    connStore._setState({ isWebSocketReady: false });

    const { App } = await import('../src/App');
    render(<App />);

    // Turn on TV
    const knob = screen.getByTestId('tv-knob');
    fireEvent.click(knob);
    await vi.waitFor(() => {
      expect(knob.getAttribute('data-is-on')).toBe('true');
    });

    // TV is on but WebSocket not connected — avatar should NOT render
    expect(screen.queryByTestId('avatar-2d')).not.toBeInTheDocument();
    // Buffering overlay should still show "Tuning in..."
    expect(screen.getByTestId('buffering-overlay')).toBeInTheDocument();
  });

  it('should disable TextInput on terminal session state', async () => {
    const { useConnectionStore } = await import('../src/stores/connectionStore');
    const connStore = useConnectionStore as unknown as {
      _setState: (s: Record<string, unknown>) => void;
    };

    const { App } = await import('../src/App');
    render(<App />);

    // Turn on TV
    const knob = screen.getByTestId('tv-knob');
    fireEvent.click(knob);
    await vi.waitFor(() => {
      expect(screen.getByTestId('text-input')).toBeInTheDocument();
    });

    // Session state goes to ENDED — input should become disabled
    connStore._setState({ sessionState: 'ENDED' });

    await vi.waitFor(() => {
      expect(screen.getByTestId('text-input')).toBeDisabled();
    });
  });
});
