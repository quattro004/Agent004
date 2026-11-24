import { useState, useEffect, useCallback, useRef } from 'react';
import { CrtFrame } from './components/CrtFrame';
import { AvatarFrameCycler } from './components/AvatarFrameCycler';
import { ChannelKnob } from './components/ChannelKnob';
import { BackgroundCycler } from './components/BackgroundCycler';
import { BroadcastText } from './components/BroadcastText';
import { SessionStateOverlay, type OverlayState } from './components/SessionStateOverlay';
import { SignIn, type SignInStatus } from './components/SignIn';
import { PrivacyPage } from './components/PrivacyPage';
import { TextInput } from './components/TextInput';
import { TuningOverlay } from './components/TuningOverlay';
import { TvKnob } from './components/TvKnob';
import { VolumeKnob } from './components/VolumeKnob';
import { useAgentStream } from './hooks/useAgentStream';
import { createUseAudio } from './hooks/useAudio';
import { createUseGreeting, type PreloadedGreeting } from './hooks/useGreeting';
import { createAudioChain } from './audio/audioChain';
import {
  AVATAR_THEMES,
  nextTheme,
  GREETING_DISPLAY_MS,
  TUNING_MIN_MS,
  TUNING_MAX_MS,
  SETTLING_DURATION_MS,
  TUNE_IN_GLITCH_PATTERN,
} from './config/constants';
import { authService, RUNTIME_ARN } from './services/authService';
import { useConnectionStore } from './stores/connectionStore';
import { useConversationStore } from './stores/conversationStore';
import { useVoiceStore } from './stores/voiceStore';
import { useVisitorStore } from './stores/visitorStore';
import type { SessionState } from './types/domain';
import './effects/crtFallback.css';
import './App.css';

const THEME_STORAGE_KEY = 'avatarThemeIndex';
const CALLBACK_PATH = '/auth/callback';
const PRIVACY_PATH = '/privacy';

/**
 * TV power states:
 * - off:      dark screen, no audio, no UI
 * - tuning:   full-screen static + white-noise audio (no avatar / greeting)
 * - settling: avatar visible, brief glitch flashes (signal locking in)
 * - on:       fully active — greeting plays, normal operation
 */
export type TvPowerState = 'off' | 'tuning' | 'settling' | 'on';

/** The sign-in states, plus the one in which the broadcast is reachable. */
type AuthStatus = SignInStatus | 'signed-in';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readStoredThemeIndex(): number {
  const storedValue = localStorage.getItem(THEME_STORAGE_KEY);
  if (storedValue === null) return 0;

  const parsedValue = Number.parseInt(storedValue, 10);
  if (!Number.isInteger(parsedValue) || parsedValue < 0 || parsedValue >= AVATAR_THEMES.length) {
    return 0;
  }

  return parsedValue;
}

/** Map domain SessionState to the overlay subset (null if no overlay needed). */
// Over SSE the session state is INITIALIZING until a send is answered, and
// SIGNAL_LOST must let the next message open a fresh session (spec 003 FR-037),
// so sending is blocked only by a refusal that retrying cannot change.
const SEND_BLOCKED_STATES: SessionState[] = [
  'ENDED',
  'BUDGET_CAPPED',
  'RATE_LIMITED',
  'DENIED',
  'ERROR',
];

function toOverlayState(state: SessionState, isGreetingDone: boolean): OverlayState {
  if (!isGreetingDone) return null;
  switch (state) {
    case 'ENDED':
    case 'BUDGET_CAPPED':
    case 'RATE_LIMITED':
    case 'SIGNAL_LOST':
    case 'DENIED':
    case 'ERROR':
      return state;
    default:
      return null;
  }
}

export function App() {
  // A tab that still holds a refresh token is almost certainly still signed
  // in, so the broadcast renders immediately and the async check below only
  // corrects it. Starting at 'checking' instead would blank the screen on
  // every reload.
  const [authStatus, setAuthStatus] = useState<AuthStatus>(() =>
    import.meta.env.DEV || (window.location.pathname !== CALLBACK_PATH && authService.isSignedIn())
      ? 'signed-in'
      : 'checking',
  );
  const [route] = useState(() => window.location.pathname);
  const [tvPower, setTvPower] = useState<TvPowerState>('off');
  const [glitchStep, setGlitchStep] = useState(0);
  const isTvOn = tvPower === 'on';
  const isTuning = tvPower === 'tuning';
  const isSettling = tvPower === 'settling';
  // Avatar + backdrop appear from settling onward so the tune-in glitch
  // flashes have an avatar to overlay.
  const showSceneContent = isSettling || isTvOn;
  const [volume, setVolume] = useState(6 / 11);
  const [themeIndex, setThemeIndex] = useState<number>(() => readStoredThemeIndex());
  const [greetingText, setGreetingText] = useState<string | null>(null);
  const [greetingNonce, setGreetingNonce] = useState(0);
  const [isGreetingDone, setIsGreetingDone] = useState(false);
  // `useRef(createX())` would build a new instance on every render.
  const [audioChain] = useState(() => createAudioChain());
  const [greeting] = useState(() => createUseGreeting(audioChain));
  const preloadedGreetingRef = useRef<PreloadedGreeting | null>(null);
  const powerSequenceIdRef = useRef(0);
  const powerOnAbortRef = useRef<AbortController | null>(null);
  const tvPowerRef = useRef<TvPowerState>('off');
  const prevTvPowerRef = useRef<TvPowerState>('off');
  const startupReadyRef = useRef(false);
  const greetingDoneRef = useRef(false);

  const stream = useAgentStream({
    runtimeArn: RUNTIME_ARN,
    getAccessToken: () => authService.getAccessToken(),
    refreshAccessToken: () => authService.refreshAccessToken(),
    onSignedOut: () => {
      if (import.meta.env.DEV) {
        useConnectionStore.getState().setSessionState('SIGNAL_LOST');
        return;
      }
      setAuthStatus('signed-out');
    },
  });
  const sessionState = useConnectionStore((s) => s.sessionState);
  const tokens = useConversationStore((s) => s.currentResponseText);
  const fullText = useConversationStore((s) => (s.isStreaming ? null : s.currentResponseText));
  const sources = useConversationStore((s) => s.sources);
  const isMouthOpen = useVoiceStore((s) => s.isMouthOpen);
  const isGreeting = useVoiceStore((s) => s.isGreeting);
  const currentTheme = AVATAR_THEMES[themeIndex];

  const canSend = !SEND_BLOCKED_STATES.includes(sessionState);

  useEffect(() => {
    tvPowerRef.current = tvPower;
  }, [tvPower]);

  // The SSE transport opens only for a request. Probe runtime readiness once
  // while the power-on greeting gives it time to boot, without spending a model turn.
  useEffect(() => {
    if (!isTvOn) return undefined;

    const sequenceId = powerSequenceIdRef.current;
    const signal = powerOnAbortRef.current?.signal;
    let cancelled = false;
    startupReadyRef.current = false;

    void stream.runAction({ action: 'runtime.ready' }, signal).then((outcome) => {
      if (
        cancelled ||
        powerSequenceIdRef.current !== sequenceId ||
        signal?.aborted ||
        greetingDoneRef.current
      ) {
        return;
      }

      const currentState = useConnectionStore.getState().sessionState;
      if (outcome.ok) {
        startupReadyRef.current = true;
        if (currentState === 'INITIALIZING' || currentState === 'SIGNAL_LOST') {
          useConnectionStore.getState().setSessionState('GREETING');
        }
        return;
      }

      startupReadyRef.current = false;
      if (!SEND_BLOCKED_STATES.includes(currentState)) {
        useConnectionStore.getState().setSessionState('SIGNAL_LOST');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isTvOn, stream]);

  // Decide whether the friend is signed in before anything else renders.
  // On the callback route the code is exchanged first, then the URL is
  // cleaned so a reload cannot replay a spent code.
  useEffect(() => {
    if (route === PRIVACY_PATH || import.meta.env.DEV) return;
    let cancelled = false;

    void (async () => {
      if (route === CALLBACK_PATH) {
        const result = await authService.handleCallback(
          new URLSearchParams(window.location.search),
        );
        window.history.replaceState({}, '', '/');
        if (cancelled) return;
        setAuthStatus(
          result.status === 'signed-in'
            ? 'signed-in'
            : result.status === 'denied'
              ? 'denied'
              : 'error',
        );
        return;
      }

      const token = await authService.getAccessToken();
      if (!cancelled) setAuthStatus(token ? 'signed-in' : 'signed-out');
    })();

    return () => {
      cancelled = true;
    };
  }, [route]);

  // Play greeting only after the TV reaches the 'on' state (post tune-in).
  useEffect(() => {
    if (!isTvOn) return;

    const preloadedGreeting = preloadedGreetingRef.current;
    preloadedGreetingRef.current = null;
    greetingDoneRef.current = false;
    let cancelled = false;

    void greeting.playGreeting(preloadedGreeting).then((result) => {
      if (cancelled) return;
      if (!result?.text) {
        greetingDoneRef.current = true;
        setIsGreetingDone(true);
        setGreetingText(null);
        if (
          !startupReadyRef.current &&
          !SEND_BLOCKED_STATES.includes(useConnectionStore.getState().sessionState)
        ) {
          useConnectionStore.getState().setSessionState('SIGNAL_LOST');
        }
        return;
      }

      setGreetingText(result.text);
      const completion = result.completion ?? delay(GREETING_DISPLAY_MS);
      void completion.then(() => {
        if (!cancelled) {
          greetingDoneRef.current = true;
          setIsGreetingDone(true);
          setGreetingText(null);
          if (
            !startupReadyRef.current &&
            !SEND_BLOCKED_STATES.includes(useConnectionStore.getState().sessionState)
          ) {
            useConnectionStore.getState().setSessionState('SIGNAL_LOST');
          }
        }
      });
    });

    return () => {
      cancelled = true;
    };
  }, [isTvOn, greetingNonce, greeting]);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, String(themeIndex));
  }, [themeIndex]);

  // Apply volume changes to the audio chain (no-op until init resolves)
  useEffect(() => {
    audioChain.setVolume(volume);
  }, [volume, audioChain]);

  // The voice player subscribes to the voice queue and cannot be revived once
  // disposed, so StrictMode's simulated unmount needs a fresh one per mount.
  useEffect(() => {
    const voicePlayer = createUseAudio(audioChain);
    return () => {
      powerOnAbortRef.current?.abort();
      voicePlayer.dispose();
      audioChain.dispose();
    };
  }, [audioChain]);

  // Drive the avatar through the tune-in glitch pattern while in `settling`.
  // Each step holds the frame for its configured duration, then advances.
  useEffect(() => {
    if (tvPower !== 'settling') {
      setGlitchStep(0);
      return undefined;
    }
    if (glitchStep >= TUNE_IN_GLITCH_PATTERN.length) return undefined;
    const step = TUNE_IN_GLITCH_PATTERN[glitchStep];
    const t = setTimeout(() => setGlitchStep((s) => s + 1), step.durationMs);
    return () => clearTimeout(t);
  }, [tvPower, glitchStep]);

  // Reset TV power when session enters a terminal state
  useEffect(() => {
    const terminalStates: SessionState[] = ['ENDED', 'BUDGET_CAPPED', 'RATE_LIMITED', 'ERROR'];
    if (isTvOn && terminalStates.includes(sessionState)) {
      setTvPower('off');
    }
  }, [sessionState, isTvOn]);

  // Stop greeting audio on every transition to TV off
  useEffect(() => {
    if (prevTvPowerRef.current !== 'off' && tvPower === 'off') {
      greeting.stopGreeting();
      audioChain.stopStatic();
    }
    prevTvPowerRef.current = tvPower;
  }, [tvPower, greeting, audioChain]);

  const handlePowerToggle = useCallback(() => {
    if (tvPower === 'off') {
      const sequenceId = powerSequenceIdRef.current + 1;
      const abortController = new AbortController();
      const isCurrentSequence = () =>
        powerSequenceIdRef.current === sequenceId && !abortController.signal.aborted;

      powerSequenceIdRef.current = sequenceId;
      powerOnAbortRef.current?.abort();
      powerOnAbortRef.current = abortController;
      preloadedGreetingRef.current = null;
      startupReadyRef.current = false;
      greetingDoneRef.current = false;
      tvPowerRef.current = 'tuning';
      setTvPower('tuning');
      setIsGreetingDone(false);
      setGreetingText(null);

      const maxTuningPromise = delay(TUNING_MAX_MS);

      const minStaticPromise = (async () => {
        try {
          await audioChain.init();
        } catch (error) {
          console.error('[App] Failed to initialize tuning audio', error);
          await maxTuningPromise;
          return;
        }

        if (!isCurrentSequence() || tvPowerRef.current !== 'tuning') {
          return;
        }

        audioChain.playStatic();
        await delay(TUNING_MIN_MS);
      })();

      const preloadPromise = greeting
        .preloadGreeting({ signal: abortController.signal })
        .then((preloaded) => {
          if (isCurrentSequence()) {
            preloadedGreetingRef.current = preloaded;
          }
          return preloaded;
        });

      void (async () => {
        await Promise.race([Promise.all([minStaticPromise, preloadPromise]), maxTuningPromise]);

        if (!isCurrentSequence() || tvPowerRef.current !== 'tuning') {
          return;
        }

        audioChain.stopStatic();
        tvPowerRef.current = 'settling';
        setTvPower('settling');

        await delay(SETTLING_DURATION_MS);

        if (!isCurrentSequence() || tvPowerRef.current !== 'settling') {
          return;
        }

        tvPowerRef.current = 'on';
        setTvPower('on');
      })();
    } else {
      // Any non-off state (tuning, settling, on) → power down cleanly.
      powerSequenceIdRef.current += 1;
      powerOnAbortRef.current?.abort();
      powerOnAbortRef.current = null;
      preloadedGreetingRef.current = null;
      startupReadyRef.current = false;
      greetingDoneRef.current = false;
      // A turn still streaming is a turn still being paid for.
      stream.cancel();
      audioChain.stopStatic();
      tvPowerRef.current = 'off';
      setTvPower('off');
      setIsGreetingDone(false);
      setGreetingText(null);
    }
  }, [tvPower, stream, audioChain, greeting]);

  const handleChannelChange = useCallback(() => {
    if (tvPower === 'off') return;

    greeting.stopGreeting();
    preloadedGreetingRef.current = null;
    greetingDoneRef.current = false;
    setIsGreetingDone(false);
    setGreetingText(null);
    setThemeIndex((currentIndex) => {
      const currentTheme = AVATAR_THEMES[currentIndex] ?? AVATAR_THEMES[0];
      return AVATAR_THEMES.indexOf(nextTheme(currentTheme));
    });
    setGreetingNonce((current) => current + 1);
  }, [tvPower, greeting]);

  const handleSend = useCallback(
    (text: string) => {
      if (!text.trim() || !canSend) return;
      const displayAlias = useVisitorStore.getState().displayAlias;
      void stream.send({
        message: text,
        displayAlias: displayAlias ?? undefined,
        clientTimestamp: new Date().toISOString(),
        voice: 'on',
      });
    },
    [canSend, stream],
  );

  const controlPanel = (
    <>
      <TvKnob onToggle={handlePowerToggle} isOn={isTvOn} />
      <ChannelKnob onChannelChange={handleChannelChange} disabled={tvPower === 'off'} />
      <VolumeKnob volume={volume} onVolumeChange={setVolume} disabled={tvPower === 'off'} />
    </>
  );

  const footerControls = null; // TextInput moved below CrtFrame

  const displayText = greetingText ?? tokens;
  const overlayState = toOverlayState(sessionState, isGreetingDone);
  // Hide avatar when a session overlay is active (e.g., "PLEASE STAND BY")
  const showAvatar = showSceneContent && !overlayState;

  if (route === PRIVACY_PATH) {
    return <PrivacyPage />;
  }

  if (authStatus !== 'signed-in') {
    return (
      <div id="max-height-app" className="crt-fallback signed-out">
        <SignIn status={authStatus} onSignIn={() => void authService.signIn()} />
      </div>
    );
  }

  return (
    <div id="max-height-app" className="crt-fallback">
      <div className="tv-wrapper">
        <CrtFrame panel={controlPanel} footer={footerControls}>
          {showSceneContent && !overlayState && <BackgroundCycler />}
          {showAvatar && (
            <AvatarFrameCycler
              isMouthOpen={isMouthOpen}
              theme={currentTheme}
              talking={isGreeting}
              forceFrame={
                isSettling && glitchStep < TUNE_IN_GLITCH_PATTERN.length
                  ? TUNE_IN_GLITCH_PATTERN[glitchStep].frame
                  : undefined
              }
            />
          )}
          {isTvOn && Boolean(displayText) && (
            <BroadcastText
              tokens={displayText.split('')}
              fullText={greetingText ? null : fullText}
              sources={greetingText ? [] : sources}
            />
          )}
          {isTvOn && <SessionStateOverlay state={overlayState} />}
          {isSettling && (
            <div
              data-testid="tune-in-glitch"
              className="tune-in-glitch-overlay"
              aria-hidden="true"
            />
          )}
          <TuningOverlay visible={isTuning} />
        </CrtFrame>
      </div>
      <div className="chat-bar">
        <TextInput onSubmit={handleSend} disabled={!isTvOn} />
      </div>
    </div>
  );
}
