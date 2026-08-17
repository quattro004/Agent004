import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

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
    theme,
    forceFrame,
  }: {
    isMouthOpen: boolean;
    theme?: string;
    forceFrame?: string;
  }) => (
    <div
      data-testid="avatar-frame"
      data-mouth-open={isMouthOpen}
      data-theme={theme}
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

vi.mock('../src/components/ChannelKnob', () => ({
  ChannelKnob: ({
    onChannelChange,
    disabled,
  }: {
    onChannelChange: () => void;
    disabled: boolean;
  }) => (
    <button data-testid="channel-knob" onClick={onChannelChange} disabled={disabled}>
      CHANNEL
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

vi.mock('../src/config/constants', () => {
  const avatarThemes = ['retro', 'pop-art', 'cartoon'] as const;
  return {
    GREETING_DISPLAY_MS: 200,
    TUNING_MIN_MS: 30,
    TUNING_MAX_MS: 120,
    SETTLING_DURATION_MS: 40,
    TUNE_IN_GLITCH_PATTERN: [
      { frame: 'glitch', durationMs: 10 },
      { frame: 'idle', durationMs: 10 },
    ],
    BACKGROUND_CYCLE_MS: 5000,
    BACKGROUND_FRAME_COUNT: 8,
    BACKGROUND_ASSET_BASE: '/background/max-grid',
    AVATAR_THEMES: avatarThemes,
    DEFAULT_AVATAR_THEME: avatarThemes[0],
    nextTheme: (theme: (typeof avatarThemes)[number]) =>
      avatarThemes[(avatarThemes.indexOf(theme) + 1) % avatarThemes.length],
  };
});

vi.mock('../src/hooks/useAudio', () => ({
  createUseAudio: vi.fn().mockReturnValue({ dispose: vi.fn() }),
}));

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

const { defaultPreloadedGreeting, mockPlayGreeting, mockPreloadGreeting, mockStopGreeting } =
  vi.hoisted(() => ({
    defaultPreloadedGreeting: {
      id: 'g-001',
      text: 'Hello!',
      audioBuffer: {} as AudioBuffer,
      durationMs: 1800,
    },
    mockPlayGreeting: vi.fn().mockResolvedValue({ id: 'g-001', text: 'Hello!' }),
    mockPreloadGreeting: vi.fn(),
    mockStopGreeting: vi.fn(),
  }));

vi.mock('../src/hooks/useGreeting', () => ({
  createUseGreeting: vi.fn().mockReturnValue({
    playGreeting: mockPlayGreeting,
    preloadGreeting: mockPreloadGreeting,
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
    (selector?: (s: Record<string, boolean | unknown>) => unknown) => {
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

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  mockPlayGreeting.mockResolvedValue({ id: 'g-001', text: 'Hello!' });
  mockPreloadGreeting.mockResolvedValue(defaultPreloadedGreeting);

  const { useConnectionStore } = await import('../src/stores/connectionStore');
  (useConnectionStore as unknown as { _setState: (s: Record<string, unknown>) => void })._setState({
    sessionState: 'ACTIVE',
    sessionId: 'test-session',
    isWebSocketReady: true,
  });
});

afterEach(async () => {
  cleanup();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 120));
  });
});

describe('App — channel knob', () => {
  it('keeps the channel control disabled while the TV is off', async () => {
    const { App } = await import('../src/App');
    render(<App />);

    expect(screen.getByTestId('channel-knob')).toBeDisabled();
  });

  it('cycles themes, replays greeting, and restores the theme from localStorage', async () => {
    const { App } = await import('../src/App');
    render(<App />);

    fireEvent.click(screen.getByTestId('tv-knob'));

    await vi.waitFor(() => {
      expect(mockPlayGreeting).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('data-theme', 'retro');
      expect(screen.getByTestId('channel-knob')).not.toBeDisabled();
    });

    fireEvent.click(screen.getByTestId('channel-knob'));

    await vi.waitFor(() => {
      expect(mockStopGreeting).toHaveBeenCalledTimes(1);
      expect(mockPlayGreeting).toHaveBeenCalledTimes(2);
      expect(mockPlayGreeting.mock.calls[1]).toEqual([null]);
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('data-theme', 'pop-art');
      expect(localStorage.getItem('avatarThemeIndex')).toBe('1');
    });

    fireEvent.click(screen.getByTestId('channel-knob'));
    await vi.waitFor(() => {
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('data-theme', 'cartoon');
      expect(localStorage.getItem('avatarThemeIndex')).toBe('2');
    });

    fireEvent.click(screen.getByTestId('channel-knob'));
    await vi.waitFor(() => {
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('data-theme', 'retro');
      expect(localStorage.getItem('avatarThemeIndex')).toBe('0');
    });

    const callsBeforeUnmount = mockPlayGreeting.mock.calls.length;
    cleanup();
    render(<App />);
    fireEvent.click(screen.getByTestId('tv-knob'));

    await vi.waitFor(() => {
      expect(mockPlayGreeting.mock.calls.length).toBeGreaterThan(callsBeforeUnmount);
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('data-theme', 'retro');
    });
  });
});
