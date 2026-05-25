import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

// === Mocks for child components (copied/adapted from App.test.tsx) ===

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
  AvatarFrameCycler: ({
    isMouthOpen,
    forceFrame,
  }: {
    isMouthOpen: boolean;
    forceFrame?: string;
  }) => (
    <div
      data-testid="avatar-frame"
      data-mouth-open={isMouthOpen}
      data-frame={forceFrame ?? 'idle'}
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

vi.mock('../src/components/VolumeKnob', () => ({
  VolumeKnob: () => <div data-testid="volume-knob" />,
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

// Use short durations so tests run quickly but still exercise transitions.
vi.mock('../src/config/timing', () => ({
  GREETING_DISPLAY_MS: 200,
  TUNING_DURATION_MS: 60,
  SETTLING_DURATION_MS: 300,
  TUNE_IN_GLITCH_PATTERN: [
    { frame: 'glitch', durationMs: 30 },
    { frame: 'idle', durationMs: 20 },
    { frame: 'glitch', durationMs: 30 },
  ],
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

const { mockAudioInit, mockAudioDispose, mockPlayStatic, mockStopStatic } = vi.hoisted(() => ({
  mockAudioInit: vi.fn().mockResolvedValue(undefined),
  mockAudioDispose: vi.fn(),
  mockPlayStatic: vi.fn(),
  mockStopStatic: vi.fn(),
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
    playStatic: mockPlayStatic,
    stopStatic: mockStopStatic,
    dispose: mockAudioDispose,
  }),
}));

describe('App — Tune-In Sequence (off → tuning → settling → on)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockPlayGreeting.mockResolvedValue({ id: 'g-001', text: 'Hello!' });

    const { useConnectionStore } = await import('../src/stores/connectionStore');
    (
      useConnectionStore as unknown as { _setState: (s: Record<string, unknown>) => void }
    )._setState({ sessionState: 'ACTIVE', sessionId: 'test-session', isWebSocketReady: true });
  });

  afterEach(async () => {
    cleanup();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });
  });

  it('shows TuningOverlay and starts static audio immediately after power-on click', async () => {
    const { App } = await import('../src/App');
    render(<App />);

    fireEvent.click(screen.getByTestId('tv-knob'));

    // During tuning phase: overlay visible, static audio started.
    await vi.waitFor(() => {
      expect(screen.getByTestId('tuning-overlay')).toBeInTheDocument();
    });
    expect(mockPlayStatic).toHaveBeenCalledWith(60);
  });

  it('does NOT render avatar, neon backdrop, or broadcast text during tuning', async () => {
    const { App } = await import('../src/App');
    render(<App />);

    fireEvent.click(screen.getByTestId('tv-knob'));
    await vi.waitFor(() => {
      expect(screen.getByTestId('tuning-overlay')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('avatar-frame')).not.toBeInTheDocument();
    expect(screen.queryByTestId('broadcast-text')).not.toBeInTheDocument();
  });

  it('does NOT play the greeting while in tuning phase', async () => {
    const { App } = await import('../src/App');
    render(<App />);

    fireEvent.click(screen.getByTestId('tv-knob'));
    await vi.waitFor(() => {
      expect(screen.getByTestId('tuning-overlay')).toBeInTheDocument();
    });

    expect(mockPlayGreeting).not.toHaveBeenCalled();
  });

  it('transitions to settling: TuningOverlay unmounts, avatar appears, glitch overlay flashes', async () => {
    const { App } = await import('../src/App');
    render(<App />);

    fireEvent.click(screen.getByTestId('tv-knob'));

    // After TUNING_DURATION_MS (60ms): tuning overlay gone, glitch overlay visible.
    await vi.waitFor(() => {
      expect(screen.queryByTestId('tuning-overlay')).not.toBeInTheDocument();
      expect(screen.getByTestId('tune-in-glitch')).toBeInTheDocument();
      // Avatar appears in settling so the glitch frames have something to show.
      expect(screen.getByTestId('avatar-frame')).toBeInTheDocument();
    });
  });

  it('forces the avatar to glitch.png at least once during settling', async () => {
    const { App } = await import('../src/App');
    render(<App />);

    fireEvent.click(screen.getByTestId('tv-knob'));

    // Wait into the settling window and observe that the avatar is forced
    // to the glitch frame at some point (so the user actually sees Max glitch).
    await vi.waitFor(() => {
      expect(screen.getByTestId('avatar-frame').getAttribute('data-frame')).toBe('glitch');
    });
  });

  it('does NOT play the greeting while in settling phase', async () => {
    const { App } = await import('../src/App');
    render(<App />);

    fireEvent.click(screen.getByTestId('tv-knob'));
    await vi.waitFor(() => {
      expect(screen.getByTestId('tune-in-glitch')).toBeInTheDocument();
    });

    expect(mockPlayGreeting).not.toHaveBeenCalled();
  });

  it('reaches on state: glitch overlay gone, knob marked on, greeting plays', async () => {
    const { App } = await import('../src/App');
    render(<App />);

    fireEvent.click(screen.getByTestId('tv-knob'));

    // After TUNING + SETTLING (~90ms): fully on, greeting kicks off.
    await vi.waitFor(() => {
      expect(screen.getByTestId('tv-knob').getAttribute('data-is-on')).toBe('true');
      expect(screen.queryByTestId('tune-in-glitch')).not.toBeInTheDocument();
      expect(mockPlayGreeting).toHaveBeenCalled();
    });
  });

  it('power-off mid-tuning calls stopStatic and resets to off state', async () => {
    const { App } = await import('../src/App');
    render(<App />);

    const knob = screen.getByTestId('tv-knob');
    fireEvent.click(knob);
    await vi.waitFor(() => {
      expect(screen.getByTestId('tuning-overlay')).toBeInTheDocument();
    });

    fireEvent.click(knob);

    await vi.waitFor(() => {
      expect(mockStopStatic).toHaveBeenCalled();
      expect(screen.queryByTestId('tuning-overlay')).not.toBeInTheDocument();
    });
    // Greeting must not have started — we aborted before the on state.
    expect(mockPlayGreeting).not.toHaveBeenCalled();
  });

  it('initializes the audio chain on power-on (user gesture)', async () => {
    const { App } = await import('../src/App');
    render(<App />);

    expect(mockAudioInit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('tv-knob'));
    await vi.waitFor(() => {
      expect(mockAudioInit).toHaveBeenCalled();
    });
  });
});
