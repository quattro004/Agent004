import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

// Mock all child components
vi.mock('../src/components/CrtFrame', () => ({
  CrtFrame: ({
    children,
    panel,
    footer,
  }: {
    children?: React.ReactNode;
    panel?: React.ReactNode;
    footer?: React.ReactNode;
  }) => (
    <div data-testid="crt-frame">
      <div data-testid="crt-screen-mock">{children}</div>
      {panel && <div data-testid="crt-panel-mock">{panel}</div>}
      {footer && <div data-testid="crt-footer-mock">{footer}</div>}
    </div>
  ),
}));

vi.mock('../src/components/AvatarFrameCycler', () => ({
  AvatarFrameCycler: ({ isMouthOpen }: { isMouthOpen: boolean }) => (
    <div data-testid="avatar-frame" data-mouth-open={isMouthOpen} />
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

vi.mock('../src/components/TvKnob', () => ({
  TvKnob: ({ onToggle, isOn }: { onToggle: () => void; isOn: boolean }) => (
    <button data-testid="tv-knob" onClick={onToggle} data-is-on={isOn}>
      ON/OFF
    </button>
  ),
}));

vi.mock('../src/components/TextInput', () => ({
  TextInput: ({ onSubmit, disabled }: { onSubmit: (text: string) => void; disabled?: boolean }) => (
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

vi.mock('../src/config/timing', () => ({
  GREETING_DISPLAY_MS: 200,
  TUNING_DURATION_MS: 0,
  SETTLING_DURATION_MS: 0,
  TUNE_IN_GLITCH_PATTERN: [],
}));

vi.mock('../src/hooks/useAudio', () => ({
  createUseAudio: vi.fn().mockReturnValue({ dispose: vi.fn() }),
}));

const { mockPlayGreeting, mockStopGreeting } = vi.hoisted(() => ({
  mockPlayGreeting: vi.fn().mockResolvedValue({ id: 'g-001', text: 'Hello!' }),
  mockStopGreeting: vi.fn(),
}));

vi.mock('../src/hooks/useGreeting', () => ({
  createUseGreeting: vi.fn().mockReturnValue({
    playGreeting: mockPlayGreeting,
    stopGreeting: mockStopGreeting,
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

// Mock audio chain — hoist init mock so individual tests can assert on it
const { mockAudioInit, mockAudioDispose } = vi.hoisted(() => ({
  mockAudioInit: vi.fn().mockResolvedValue(undefined),
  mockAudioDispose: vi.fn(),
}));
vi.mock('../src/audio/audioChain', () => ({
  createAudioChain: vi.fn().mockReturnValue({
    init: mockAudioInit,
    play: vi.fn(),
    stop: vi.fn(),
    getIsMouthOpen: vi.fn().mockReturnValue(false),
    triggerStutter: vi.fn(),
    triggerStaticBurst: vi.fn(),
    setVolume: vi.fn(),
    playStatic: vi.fn(),
    stopStatic: vi.fn(),
    dispose: mockAudioDispose,
  }),
}));

describe('App — TV Power Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Power-up (POWER_UP_DURATION_MS) and greeting (GREETING_DISPLAY_MS,
    // mocked to 200ms) schedule real setTimeouts that may still be pending
    // when the test returns. Unmounting then flushing pending timers under
    // act() prevents "update was not wrapped in act(...)" warnings.
    cleanup();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 250));
    });
  });

  it('should render the CRT frame regardless of power state', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    expect(screen.getByTestId('crt-frame')).toBeInTheDocument();
  });

  it('should start with TV off — no avatar, no backdrop, no broadcast text', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    expect(screen.queryByTestId('avatar-frame')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wireframe-backdrop')).not.toBeInTheDocument();
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
      expect(screen.getByTestId('avatar-frame')).toBeInTheDocument();
      expect(screen.getByTestId('wireframe-backdrop')).toBeInTheDocument();
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

  it('should render TextInput disabled when TV is off', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    expect(screen.getByTestId('text-input')).toBeInTheDocument();
    expect(screen.getByTestId('text-input')).toBeDisabled();
  });

  it('should render TextInput enabled after TV is turned on', async () => {
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

  it('should show avatar when TV is on even without WebSocket connection', async () => {
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

    // TV is on — avatar should render regardless of WebSocket
    expect(screen.getByTestId('avatar-frame')).toBeInTheDocument();
  });

  it('should NOT initialize the audio chain on mount (defer to user gesture)', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    // Wait a tick to ensure mount effects ran
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockAudioInit).not.toHaveBeenCalled();
  });

  it('should initialize the audio chain when the TV is powered on (user gesture)', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    expect(mockAudioInit).not.toHaveBeenCalled();
    const knob = screen.getByTestId('tv-knob');
    fireEvent.click(knob);
    await vi.waitFor(() => {
      expect(mockAudioInit).toHaveBeenCalled();
    });
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
      expect(screen.getByTestId('text-input')).not.toBeDisabled();
    });

    // Session state goes to ENDED — TV powers off, input becomes disabled
    connStore._setState({ sessionState: 'ENDED' });

    await vi.waitFor(() => {
      expect(screen.getByTestId('text-input')).toBeDisabled();
    });
  });
});

describe('App — Greeting Flow', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockPlayGreeting.mockResolvedValue({ id: 'g-001', text: 'Hello!' });

    // Reset shared store state to clean defaults (state leaks between tests)
    const { useConnectionStore } = await import('../src/stores/connectionStore');
    (
      useConnectionStore as unknown as { _setState: (s: Record<string, unknown>) => void }
    )._setState({ sessionState: 'ACTIVE', sessionId: 'test-session', isWebSocketReady: true });

    const { useConversationStore } = await import('../src/stores/conversationStore');
    (
      useConversationStore as unknown as { _setState: (s: Record<string, unknown>) => void }
    )._setState({ currentResponseText: '', isStreaming: false, currentTurnIndex: 0 });
  });

  afterEach(async () => {
    // Flush any pending greeting / power-up timers inside act() so they
    // don't trigger post-test "update was not wrapped in act(...)" warnings.
    cleanup();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 250));
    });
  });

  async function powerOnTv() {
    const knob = screen.getByTestId('tv-knob');
    fireEvent.click(knob);
    await vi.waitFor(() => {
      expect(knob.getAttribute('data-is-on')).toBe('true');
    });
    // Flush microtasks for playGreeting promise
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it('should call playGreeting when TV powers on', async () => {
    const { App } = await import('../src/App');
    render(<App />);

    await powerOnTv();

    expect(mockPlayGreeting).toHaveBeenCalled();
  });

  it('should display greeting text in broadcast text during greeting', async () => {
    const { App } = await import('../src/App');
    render(<App />);

    await powerOnTv();

    // Mock playGreeting returns { text: 'Hello!' }
    expect(screen.getByTestId('broadcast-text')).toHaveTextContent('Hello!');
  });

  it('should suppress SIGNAL_LOST overlay during greeting', async () => {
    const { useConnectionStore } = await import('../src/stores/connectionStore');
    const connStore = useConnectionStore as unknown as {
      _setState: (s: Record<string, unknown>) => void;
    };
    connStore._setState({ sessionState: 'SIGNAL_LOST', isWebSocketReady: false });

    const { App } = await import('../src/App');
    render(<App />);

    await powerOnTv();

    // SIGNAL_LOST should be suppressed during greeting
    expect(screen.queryByTestId('session-state-overlay')).not.toBeInTheDocument();
  });

  it('should suppress buffering overlay during greeting', async () => {
    const { useConnectionStore } = await import('../src/stores/connectionStore');
    const connStore = useConnectionStore as unknown as {
      _setState: (s: Record<string, unknown>) => void;
    };
    connStore._setState({ isWebSocketReady: false });

    const { App } = await import('../src/App');
    render(<App />);

    await powerOnTv();

    // Buffering overlay should NOT show during greeting
    expect(screen.queryByTestId('buffering-overlay')).not.toBeInTheDocument();
  });

  it('should show buffering overlay after greeting completes if not connected', async () => {
    const { useConnectionStore } = await import('../src/stores/connectionStore');
    const connStore = useConnectionStore as unknown as {
      _setState: (s: Record<string, unknown>) => void;
    };
    connStore._setState({ isWebSocketReady: false });

    const { App } = await import('../src/App');
    render(<App />);

    await powerOnTv();

    // Wait for greeting display duration to elapse (mocked to 200ms)
    await vi.waitFor(
      () => {
        expect(screen.getByTestId('buffering-overlay')).toBeInTheDocument();
      },
      { timeout: 2000 },
    );
  });

  it('should show SIGNAL_LOST after greeting completes', async () => {
    const { useConnectionStore } = await import('../src/stores/connectionStore');
    const connStore = useConnectionStore as unknown as {
      _setState: (s: Record<string, unknown>) => void;
    };
    connStore._setState({ sessionState: 'SIGNAL_LOST', isWebSocketReady: false });

    const { App } = await import('../src/App');
    render(<App />);

    await powerOnTv();

    // During greeting — suppressed
    expect(screen.queryByTestId('session-state-overlay')).not.toBeInTheDocument();

    // Wait for greeting display duration to elapse
    await vi.waitFor(
      () => {
        expect(screen.getByTestId('session-state-overlay')).toBeInTheDocument();
      },
      { timeout: 2000 },
    );
  });

  it('should switch from greeting text to conversation tokens after greeting', async () => {
    const { useConversationStore } = await import('../src/stores/conversationStore');
    const convStore = useConversationStore as unknown as {
      _setState: (s: Record<string, unknown>) => void;
    };
    // Pre-set conversation text before render
    convStore._setState({ currentResponseText: 'Agent response' });

    const { App } = await import('../src/App');
    render(<App />);

    await powerOnTv();

    // During greeting — greeting text overrides conversation tokens
    expect(screen.getByTestId('broadcast-text')).toHaveTextContent('Hello!');

    // Wait for greeting to elapse — conversation tokens appear
    await vi.waitFor(
      () => {
        expect(screen.getByTestId('broadcast-text')).toHaveTextContent('Agent response');
      },
      { timeout: 2000 },
    );
  });

  it('should call stopGreeting when TV is turned off', async () => {
    const { App } = await import('../src/App');
    render(<App />);

    await powerOnTv();

    // Turn off TV
    const knob = screen.getByTestId('tv-knob');
    fireEvent.click(knob);

    expect(mockStopGreeting).toHaveBeenCalled();
  });
});
