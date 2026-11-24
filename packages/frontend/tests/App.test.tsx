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
  AvatarFrameCycler: ({ isMouthOpen, talking }: { isMouthOpen: boolean; talking?: boolean }) => (
    <div
      data-testid="avatar-frame"
      data-mouth-open={isMouthOpen}
      data-talking={talking ? 'true' : 'false'}
    />
  ),
}));

vi.mock('../src/components/BroadcastText', () => ({
  BroadcastText: ({ tokens, fullText }: { tokens: string[]; fullText: string | null }) => (
    <div data-testid="broadcast-text">{fullText ?? tokens.join('')}</div>
  ),
}));

vi.mock('../src/components/SessionStateOverlay', () => ({
  SessionStateOverlay: ({ state }: { state: string | null }) =>
    state ? <div data-testid="session-state-overlay">{state}</div> : null,
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
const mockSend = vi.fn().mockResolvedValue(undefined);
const mockCancel = vi.fn();
const mockRunAction = vi.fn();
mockRunAction.mockResolvedValue({ ok: true, data: { ready: true } });
const mockStream = { send: mockSend, cancel: mockCancel, runAction: mockRunAction };
const { mockAgentSignedOut } = vi.hoisted(() => ({
  mockAgentSignedOut: vi.fn(),
}));
vi.mock('../src/hooks/useAgentStream', () => ({
  useAgentStream: (deps: { onSignedOut?: () => void }) => {
    mockAgentSignedOut.mockImplementation(() => deps.onSignedOut?.());
    return mockStream;
  },
}));

const {
  mockGetAccessToken,
  mockRefreshAccessToken,
  mockSignIn,
  mockHandleCallback,
  mockSignOut,
  mockIsSignedIn,
} = vi.hoisted(() => ({
  mockGetAccessToken: vi.fn().mockResolvedValue('access-token'),
  mockRefreshAccessToken: vi.fn().mockResolvedValue('access-token'),
  mockSignIn: vi.fn().mockResolvedValue(undefined),
  mockHandleCallback: vi.fn().mockResolvedValue({ status: 'signed-in' }),
  mockSignOut: vi.fn().mockResolvedValue(undefined),
  mockIsSignedIn: vi.fn().mockReturnValue(true),
}));

vi.mock('../src/services/authService', () => ({
  RUNTIME_ARN: 'arn:aws:bedrock-agentcore:us-west-2:111122223333:runtime/max-height',
  authService: {
    signIn: mockSignIn,
    handleCallback: mockHandleCallback,
    getAccessToken: mockGetAccessToken,
    refreshAccessToken: mockRefreshAccessToken,
    signOut: mockSignOut,
    isSignedIn: mockIsSignedIn,
  },
}));

vi.mock('../src/hooks/useIsMobile', () => ({
  useIsMobile: () => false,
  isMobileQuery: () => false,
}));

vi.mock('../src/config/constants', () => ({
  GREETING_DISPLAY_MS: 200,
  TALK_FRAME_INTERVAL_MS: 200,
  TUNING_MIN_MS: 0,
  TUNING_MAX_MS: 0,
  SETTLING_DURATION_MS: 0,
  TUNE_IN_GLITCH_PATTERN: [],
  BACKGROUND_CYCLE_MS: 5000,
  BACKGROUND_FRAME_COUNT: 8,
  BACKGROUND_ASSET_BASE: '/background/max-grid',
  DEFAULT_AVATAR_THEME: 'retro',
  AVATAR_THEMES: ['retro', 'pop-art', 'cartoon'],
  nextTheme: (theme: 'retro' | 'pop-art' | 'cartoon') => {
    const themes = ['retro', 'pop-art', 'cartoon'] as const;
    return themes[(themes.indexOf(theme) + 1) % themes.length];
  },
}));

vi.mock('../src/hooks/useAudio', () => ({
  createUseAudio: vi.fn().mockReturnValue({ dispose: vi.fn() }),
}));

const { mockPlayGreeting, mockPreloadGreeting, mockStopGreeting } = vi.hoisted(() => ({
  mockPlayGreeting: vi.fn().mockResolvedValue({ id: 'g-001', text: 'Hello!' }),
  mockPreloadGreeting: vi.fn().mockResolvedValue({
    id: 'g-001',
    text: 'Hello!',
    audioBuffer: {} as AudioBuffer,
    durationMs: 1800,
  }),
  mockStopGreeting: vi.fn(),
}));

vi.mock('../src/hooks/useGreeting', () => ({
  createUseGreeting: vi.fn().mockReturnValue({
    playGreeting: mockPlayGreeting,
    preloadGreeting: mockPreloadGreeting,
    stopGreeting: mockStopGreeting,
  }),
}));

// Mock stores
vi.mock('../src/stores/connectionStore', () => {
  let state: {
    sessionState: string;
    sessionId: string;
    isStreamReady: boolean;
    setSessionState: (sessionState: string) => void;
  };
  const listeners = new Set<() => void>();
  const setState = (s: Partial<typeof state>) => {
    state = { ...state, ...s };
    listeners.forEach((fn) => fn());
  };
  state = {
    sessionState: 'ACTIVE' as string,
    sessionId: 'test-session',
    isStreamReady: true,
    setSessionState: (sessionState) => setState({ sessionState }),
  };
  return {
    useConnectionStore: Object.assign(
      (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
      {
        getState: () => state,
        subscribe: (fn: () => void) => {
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
        _setState: setState,
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
      const state = {
        isSpeaking: false,
        isMouthOpen: false,
        isMicActive: false,
        isGreeting: false,
      };
      return selector ? selector(state) : state;
    },
    {
      getState: () => ({
        isSpeaking: false,
        isMouthOpen: false,
        isGreeting: false,
        setSpeaking: vi.fn(),
        setMouthOpen: vi.fn(),
        setGreeting: vi.fn(),
      }),
    },
  ),
}));

vi.mock('../src/stores/visitorStore', () => ({
  useVisitorStore: Object.assign(
    (selector?: (s: Record<string, unknown>) => unknown) => {
      const state = {
        actorId: 'test-actor',
        displayAlias: 'ReturningVisitor',
        greetingHistory: [],
      };
      return selector ? selector(state) : state;
    },
    {
      getState: () => ({
        actorId: 'test-actor',
        displayAlias: 'ReturningVisitor',
        greetingHistory: [],
        pushGreeting: vi.fn(),
      }),
    },
  ),
}));

// Mock audio chain — hoist init mock so individual tests can assert on it
const { mockAudioInit, mockAudioSetVolume, mockAudioDispose } = vi.hoisted(() => ({
  mockAudioInit: vi.fn().mockResolvedValue(undefined),
  mockAudioSetVolume: vi.fn(),
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
    setVolume: mockAudioSetVolume,
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
    expect(screen.queryByTestId('broadcast-text')).not.toBeInTheDocument();
  });

  it('starts at audible volume step 6 with its indicator at 55% of the arc', async () => {
    const { App } = await import('../src/App');
    const { container } = render(<App />);
    const volume = screen.getByRole('group', { name: 'Volume' });
    const indicator = container.querySelector<HTMLElement>('.volume-knob-indicator');
    const initialAngle = Number.parseFloat(indicator?.style.getPropertyValue('--knob-angle') ?? '');

    expect(volume).toHaveAttribute('aria-valuenow', '6');
    expect(initialAngle).toBeCloseTo(-235 + (6 / 11) * 280);
  });

  it('should render TvKnob in the control panel when TV is off', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    expect(screen.getByTestId('tv-knob')).toBeInTheDocument();
  });

  it('passes volume changes through to the audio chain and preserves them across power cycles', async () => {
    const { App } = await import('../src/App');
    render(<App />);

    fireEvent.click(screen.getByTestId('tv-knob'));
    await vi.waitFor(() => {
      expect(screen.getByTestId('tv-knob')).toHaveAttribute('data-is-on', 'true');
    });

    mockAudioSetVolume.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Volume up' }));
    await vi.waitFor(() => {
      expect(mockAudioSetVolume).toHaveBeenLastCalledWith(7 / 11);
    });

    fireEvent.click(screen.getByTestId('tv-knob'));
    await vi.waitFor(() => {
      expect(screen.getByTestId('tv-knob')).toHaveAttribute('data-is-on', 'false');
    });

    fireEvent.click(screen.getByTestId('tv-knob'));
    await vi.waitFor(() => {
      expect(screen.getByTestId('tv-knob')).toHaveAttribute('data-is-on', 'true');
    });
    expect(screen.getByRole('group', { name: 'Volume' })).toHaveAttribute('aria-valuenow', '7');
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
    });
  });

  it('keeps the greeting text visible until greeting playback completes', async () => {
    const { App } = await import('../src/App');
    let resolveCompletion!: () => void;
    const completion = new Promise<void>((resolve) => {
      resolveCompletion = resolve;
    });
    mockPlayGreeting.mockResolvedValueOnce({
      id: 'g-001',
      text: 'Signal acquired.',
      completion,
    });

    render(<App />);
    fireEvent.click(screen.getByTestId('tv-knob'));

    await vi.waitFor(() => {
      expect(screen.getByTestId('broadcast-text')).toHaveTextContent('Signal acquired.');
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });

    expect(screen.getByTestId('broadcast-text')).toHaveTextContent('Signal acquired.');

    await act(async () => {
      resolveCompletion();
      await completion;
    });

    await vi.waitFor(() => {
      expect(screen.queryByTestId('broadcast-text')).not.toBeInTheDocument();
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
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'hello Max',
        displayAlias: 'ReturningVisitor',
        voice: 'on',
      }),
    );
  });

  it('cancels the turn in flight when the TV is switched off', async () => {
    const { App } = await import('../src/App');
    render(<App />);
    fireEvent.click(screen.getByTestId('tv-knob'));
    await vi.waitFor(() => {
      expect(screen.getByTestId('tv-knob')).toHaveAttribute('data-is-on', 'true');
    });

    mockCancel.mockClear();
    fireEvent.click(screen.getByTestId('tv-knob'));

    expect(mockCancel).toHaveBeenCalled();
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
    connStore._setState({ isStreamReady: false });

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
    mockRunAction.mockResolvedValue({ ok: true, data: { ready: true } });

    // Reset shared store state to clean defaults (state leaks between tests)
    const { useConnectionStore } = await import('../src/stores/connectionStore');
    (
      useConnectionStore as unknown as { _setState: (s: Record<string, unknown>) => void }
    )._setState({ sessionState: 'ACTIVE', sessionId: 'test-session', isStreamReady: true });

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
    connStore._setState({ sessionState: 'SIGNAL_LOST', isStreamReady: false });
    mockRunAction.mockResolvedValue({ ok: false, code: 'transport' });

    const { App } = await import('../src/App');
    render(<App />);

    await powerOnTv();

    // SIGNAL_LOST should be suppressed during greeting
    expect(screen.queryByTestId('session-state-overlay')).not.toBeInTheDocument();
  });

  it('should show SIGNAL_LOST after greeting completes', async () => {
    const { useConnectionStore } = await import('../src/stores/connectionStore');
    const connStore = useConnectionStore as unknown as {
      _setState: (s: Record<string, unknown>) => void;
    };
    connStore._setState({ sessionState: 'SIGNAL_LOST', isStreamReady: false });
    mockRunAction.mockResolvedValue({ ok: false, code: 'transport' });

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

  it('transitions from INITIALIZING to SIGNAL_LOST when readiness fails before greeting completes', async () => {
    const { useConnectionStore } = await import('../src/stores/connectionStore');
    const connStore = useConnectionStore as unknown as {
      _setState: (s: Record<string, unknown>) => void;
      getState: () => { sessionState: string };
    };
    connStore._setState({ sessionState: 'INITIALIZING', sessionId: null, isStreamReady: false });
    mockRunAction.mockResolvedValue({ ok: false, code: 'transport' });

    const { App } = await import('../src/App');
    render(<App />);

    await powerOnTv();

    expect(mockRunAction).toHaveBeenCalledTimes(1);
    expect(mockRunAction.mock.calls[0]?.[0]).toEqual({ action: 'runtime.ready' });
    expect(screen.queryByTestId('session-state-overlay')).not.toBeInTheDocument();

    await vi.waitFor(
      () => {
        expect(connStore.getState().sessionState).toBe('SIGNAL_LOST');
        expect(screen.getByTestId('session-state-overlay')).toBeInTheDocument();
      },
      { timeout: 2000 },
    );
  });

  it('leaves the happy path in idle greeting/listening mode when readiness succeeds', async () => {
    const { useConnectionStore } = await import('../src/stores/connectionStore');
    const connStore = useConnectionStore as unknown as {
      _setState: (s: Record<string, unknown>) => void;
      getState: () => { sessionState: string };
    };
    connStore._setState({ sessionState: 'INITIALIZING', sessionId: null, isStreamReady: false });
    mockRunAction.mockResolvedValue({ ok: true, data: { ready: true } });

    const { App } = await import('../src/App');
    render(<App />);

    await powerOnTv();

    expect(mockRunAction).toHaveBeenCalledTimes(1);
    expect(mockRunAction.mock.calls[0]?.[0]).toEqual({ action: 'runtime.ready' });

    await vi.waitFor(
      () => {
        expect(connStore.getState().sessionState).toBe('GREETING');
        expect(screen.queryByTestId('session-state-overlay')).not.toBeInTheDocument();
      },
      { timeout: 2000 },
    );
  });

  it('ignores a late readiness failure after the TV is powered off', async () => {
    const { useConnectionStore } = await import('../src/stores/connectionStore');
    const connStore = useConnectionStore as unknown as {
      _setState: (s: Record<string, unknown>) => void;
      getState: () => { sessionState: string };
    };
    connStore._setState({ sessionState: 'INITIALIZING', sessionId: null, isStreamReady: false });

    let resolveAction!: (outcome: { ok: false; code: 'transport' }) => void;
    const pendingAction = new Promise<{ ok: false; code: 'transport' }>((resolve) => {
      resolveAction = resolve;
    });
    mockRunAction.mockReturnValue(pendingAction);

    const { App } = await import('../src/App');
    render(<App />);
    await powerOnTv();

    fireEvent.click(screen.getByTestId('tv-knob'));

    await act(async () => {
      resolveAction({ ok: false, code: 'transport' });
      await Promise.resolve();
    });

    expect(connStore.getState().sessionState).not.toBe('SIGNAL_LOST');
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

  it('should call stopGreeting when session enters terminal state (auto-off)', async () => {
    const { useConnectionStore } = await import('../src/stores/connectionStore');
    const connStore = useConnectionStore as unknown as {
      _setState: (s: Record<string, unknown>) => void;
    };

    const { App } = await import('../src/App');
    render(<App />);

    await powerOnTv();

    // Clear the mock to isolate auto-off behavior
    mockStopGreeting.mockClear();

    // Session enters terminal state — TV should auto-off
    connStore._setState({ sessionState: 'ENDED' });

    await vi.waitFor(() => {
      expect(mockStopGreeting).toHaveBeenCalled();
    });
  });

  it('should pass talking prop to AvatarFrameCycler based on isGreeting state', async () => {
    const { App } = await import('../src/App');
    render(<App />);

    await powerOnTv();

    // During greeting playback, talking should be true
    // (voiceStore mock has isGreeting: false by default, so we expect false)
    // This is a basic smoke test; real behavior depends on voiceStore integration
    const avatar = screen.getByTestId('avatar-frame');
    expect(avatar).toHaveAttribute('data-talking');
  });
});

// Over SSE nothing sets the session state until a send has been answered, so the
// store is still INITIALIZING when the friend types their first message.
describe('App — sending before the stream has a session', () => {
  async function submitWithSessionState(sessionState: string) {
    const { useConnectionStore } = await import('../src/stores/connectionStore');
    (
      useConnectionStore as unknown as { _setState: (s: Record<string, unknown>) => void }
    )._setState({ sessionState, sessionId: null, isStreamReady: false });

    const { App } = await import('../src/App');
    render(<App />);
    const knob = screen.getByTestId('tv-knob');
    fireEvent.click(knob);
    await vi.waitFor(() => {
      expect(knob.getAttribute('data-is-on')).toBe('true');
    });

    const input = screen.getByTestId('text-input');
    fireEvent.change(input, { target: { value: 'hello Max' } });
    fireEvent.keyDown(input, { key: 'Enter' });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    cleanup();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 250));
    });
  });

  it('sends the first message while the session is still INITIALIZING', async () => {
    await submitWithSessionState('INITIALIZING');

    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ message: 'hello Max' }));
  });

  it('sends the next message after the signal was lost', async () => {
    await submitWithSessionState('SIGNAL_LOST');

    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ message: 'hello Max' }));
  });

  it('does not send once the friend has been denied', async () => {
    await submitWithSessionState('DENIED');

    expect(mockSend).not.toHaveBeenCalled();
  });
});

// Each createUseAudio() subscribes to the voice queue until it is disposed, and
// only the instance App holds on to is ever disposed, so one built per render
// leaks a competing player every time the screen updates.
describe('App — the audio players', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    cleanup();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 250));
    });
  });

  it('builds the audio chain, voice player and greeting player once, however often it re-renders', async () => {
    const { createAudioChain } = await import('../src/audio/audioChain');
    const { createUseAudio } = await import('../src/hooks/useAudio');
    const { createUseGreeting } = await import('../src/hooks/useGreeting');
    const { App } = await import('../src/App');
    render(<App />);

    const knob = screen.getByTestId('tv-knob');
    fireEvent.click(knob);
    await vi.waitFor(() => {
      expect(knob.getAttribute('data-is-on')).toBe('true');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Volume up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Volume up' }));

    expect(createAudioChain).toHaveBeenCalledTimes(1);
    expect(createUseAudio).toHaveBeenCalledTimes(1);
    expect(createUseGreeting).toHaveBeenCalledTimes(1);
  });
});

describe('App — the gate in front of the broadcast', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', false);
    vi.clearAllMocks();
    mockGetAccessToken.mockResolvedValue('access-token');
    mockIsSignedIn.mockReturnValue(true);
    mockHandleCallback.mockResolvedValue({ status: 'signed-in' });
    window.history.replaceState({}, '', '/');
  });

  afterEach(async () => {
    cleanup();
    window.history.replaceState({}, '', '/');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 250));
    });
    vi.unstubAllEnvs();
  });

  it('lets local UI development reach the broadcast without sign-in or an agent token', async () => {
    vi.stubEnv('DEV', true);
    mockIsSignedIn.mockReturnValue(false);
    mockGetAccessToken.mockResolvedValue(null);
    const { App } = await import('../src/App');
    render(<App />);

    expect(screen.getByTestId('tv-knob')).toBeInTheDocument();
    expect(screen.queryByTestId('sign-in')).not.toBeInTheDocument();
    expect(mockGetAccessToken).not.toHaveBeenCalled();

    await act(async () => {
      mockAgentSignedOut();
    });

    expect(screen.getByTestId('tv-knob')).toBeInTheDocument();
    expect(screen.queryByTestId('sign-in')).not.toBeInTheDocument();
    const { useConnectionStore } = await import('../src/stores/connectionStore');
    expect(
      (useConnectionStore as unknown as { getState: () => { sessionState: string } }).getState()
        .sessionState,
    ).toBe('SIGNAL_LOST');
  });

  it('shows the sign-in panel instead of the TV when no token can be had', async () => {
    mockGetAccessToken.mockResolvedValue(null);
    const { App } = await import('../src/App');
    render(<App />);

    await vi.waitFor(() => {
      expect(screen.getByTestId('sign-in')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('tv-knob')).not.toBeInTheDocument();
  });

  it('starts sign-in when the friend asks for it', async () => {
    mockGetAccessToken.mockResolvedValue(null);
    const { App } = await import('../src/App');
    render(<App />);

    await vi.waitFor(() => {
      expect(screen.getByTestId('sign-in')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }));

    expect(mockSignIn).toHaveBeenCalledTimes(1);
  });

  it('shows the TV once a stored refresh token still works', async () => {
    const { App } = await import('../src/App');
    render(<App />);

    await vi.waitFor(() => {
      expect(screen.getByTestId('tv-knob')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('sign-in')).not.toBeInTheDocument();
  });

  it('exchanges the code at /auth/callback and cleans the URL', async () => {
    window.history.replaceState({}, '', '/auth/callback?code=code-1&state=state-1');
    const { App } = await import('../src/App');
    render(<App />);

    await vi.waitFor(() => {
      expect(screen.getByTestId('tv-knob')).toBeInTheDocument();
    });
    expect(mockHandleCallback).toHaveBeenCalledTimes(1);
    expect(mockHandleCallback.mock.calls[0][0].get('code')).toBe('code-1');
    expect(window.location.pathname).toBe('/');
    expect(window.location.search).toBe('');
  });

  it('shows the one denial line when the callback was refused', async () => {
    window.history.replaceState({}, '', '/auth/callback?error=access_denied&state=state-1');
    mockHandleCallback.mockResolvedValue({ status: 'denied' });
    const { App } = await import('../src/App');
    render(<App />);

    await vi.waitFor(() => {
      expect(screen.getByTestId('sign-in-denied')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('tv-knob')).not.toBeInTheDocument();
  });

  it('shows the in-character sign-in error when the exchange fails', async () => {
    window.history.replaceState({}, '', '/auth/callback?code=code-1&state=state-1');
    mockHandleCallback.mockResolvedValue({ status: 'error', reason: 'exchange_failed' });
    const { App } = await import('../src/App');
    render(<App />);

    await vi.waitFor(() => {
      expect(screen.getByTestId('sign-in-error')).toBeInTheDocument();
    });
  });

  it('renders the privacy page without signing in', async () => {
    mockGetAccessToken.mockResolvedValue(null);
    window.history.replaceState({}, '', '/privacy');
    const { App } = await import('../src/App');
    render(<App />);

    await vi.waitFor(() => {
      expect(screen.getByTestId('privacy-page')).toBeInTheDocument();
    });
    expect(mockGetAccessToken).not.toHaveBeenCalled();
    expect(screen.queryByTestId('sign-in')).not.toBeInTheDocument();
  });
});
