import { useState, useEffect, useCallback, useRef } from 'react';
import { CrtFrame } from './components/CrtFrame';
import { AvatarFrameCycler } from './components/AvatarFrameCycler';
import { ChannelKnob } from './components/ChannelKnob';
import { BackgroundCycler } from './components/BackgroundCycler';
import { BroadcastText } from './components/BroadcastText';
import { SessionStateOverlay, type OverlayState } from './components/SessionStateOverlay';
import { TextInput } from './components/TextInput';
import { TuningOverlay } from './components/TuningOverlay';
import { TvKnob } from './components/TvKnob';
import { VolumeKnob } from './components/VolumeKnob';
import { useWebSocket } from './hooks/useWebSocket';
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
import { resolveWsUrl } from './config/wsUrl';
import { useConnectionStore } from './stores/connectionStore';
import { useConversationStore } from './stores/conversationStore';
import { useVoiceStore } from './stores/voiceStore';
import type { SessionState } from './types/domain';
import './effects/crtFallback.css';
import './App.css';

const wsResolution = resolveWsUrl(import.meta.env.VITE_WS_URL, Boolean(import.meta.env.PROD));
if (!wsResolution.connect) {
  console.error(
    `[App] Refusing to open WebSocket in production: ${wsResolution.reason}. ` +
      `Set VITE_WS_URL to a non-localhost wss:// URL at build time.`,
  );
}
const WS_URL = wsResolution.url || 'ws://invalid';
const THEME_STORAGE_KEY = 'avatarThemeIndex';

/**
 * TV power states:
 * - off:      dark screen, no audio, no UI
 * - tuning:   full-screen static + white-noise audio (no avatar / greeting)
 * - settling: avatar visible, brief glitch flashes (signal locking in)
 * - on:       fully active — greeting plays, normal operation
 */
export type TvPowerState = 'off' | 'tuning' | 'settling' | 'on';

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
function toOverlayState(state: SessionState, isGreetingDone: boolean): OverlayState {
  if (!isGreetingDone) return null;
  switch (state) {
    case 'ENDED':
    case 'BUDGET_CAPPED':
    case 'RATE_LIMITED':
    case 'SIGNAL_LOST':
    case 'ERROR':
      return state;
    default:
      return null;
  }
}

export function App() {
  const [tvPower, setTvPower] = useState<TvPowerState>('off');
  const [glitchStep, setGlitchStep] = useState(0);
  const isTvOn = tvPower === 'on';
  const isTuning = tvPower === 'tuning';
  const isSettling = tvPower === 'settling';
  // Avatar + backdrop appear from settling onward so the tune-in glitch
  // flashes have an avatar to overlay.
  const showSceneContent = isSettling || isTvOn;
  const [volume, setVolume] = useState(0.5);
  const [themeIndex, setThemeIndex] = useState<number>(() => readStoredThemeIndex());
  const [greetingText, setGreetingText] = useState<string | null>(null);
  const [greetingNonce, setGreetingNonce] = useState(0);
  const [isGreetingDone, setIsGreetingDone] = useState(false);
  const audioChainRef = useRef(createAudioChain());
  const audioRef = useRef(createUseAudio(audioChainRef.current));
  const greetingRef = useRef(createUseGreeting(audioChainRef.current));
  const preloadedGreetingRef = useRef<PreloadedGreeting | null>(null);
  const powerSequenceIdRef = useRef(0);
  const powerOnAbortRef = useRef<AbortController | null>(null);
  const tvPowerRef = useRef<TvPowerState>('off');

  const sessionId = useConnectionStore((s) => s.sessionId) ?? 'pending';
  const { sendMessage } = useWebSocket({
    url: WS_URL,
    sessionId,
    enabled: isTvOn && wsResolution.connect,
  });
  const sessionState = useConnectionStore((s) => s.sessionState);
  const tokens = useConversationStore((s) => s.currentResponseText);
  const fullText = useConversationStore((s) => (s.isStreaming ? null : s.currentResponseText));
  const isMouthOpen = useVoiceStore((s) => s.isMouthOpen);
  const currentTurnIndex = useConversationStore((s) => s.currentTurnIndex);
  const currentTheme = AVATAR_THEMES[themeIndex];

  const isActive = sessionState === 'ACTIVE' || sessionState === 'GREETING';

  useEffect(() => {
    tvPowerRef.current = tvPower;
  }, [tvPower]);

  // Play greeting only after the TV reaches the 'on' state (post tune-in).
  useEffect(() => {
    if (!isTvOn) return;

    const preloadedGreeting = preloadedGreetingRef.current;
    preloadedGreetingRef.current = null;
    let cancelled = false;

    void greetingRef.current.playGreeting(preloadedGreeting).then((result) => {
      if (cancelled) return;
      if (!result?.text) {
        setIsGreetingDone(true);
        setGreetingText(null);
        return;
      }

      setGreetingText(result.text);
      const completion = result.completion ?? delay(GREETING_DISPLAY_MS);
      void completion.then(() => {
        if (!cancelled) {
          setIsGreetingDone(true);
          setGreetingText(null);
        }
      });
    });

    return () => {
      cancelled = true;
    };
  }, [isTvOn, greetingNonce]);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, String(themeIndex));
  }, [themeIndex]);

  // Apply volume changes to the audio chain (no-op until init resolves)
  useEffect(() => {
    audioChainRef.current.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    return () => {
      powerOnAbortRef.current?.abort();
      audioRef.current.dispose();
      audioChainRef.current.dispose();
    };
  }, []);

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
      tvPowerRef.current = 'tuning';
      setTvPower('tuning');
      setIsGreetingDone(false);
      setGreetingText(null);

      const maxTuningPromise = delay(TUNING_MAX_MS);

      const minStaticPromise = (async () => {
        try {
          await audioChainRef.current.init();
        } catch (error) {
          console.error('[App] Failed to initialize tuning audio', error);
          await maxTuningPromise;
          return;
        }

        if (!isCurrentSequence() || tvPowerRef.current !== 'tuning') {
          return;
        }

        audioChainRef.current.playStatic();
        await delay(TUNING_MIN_MS);
      })();

      const preloadPromise = greetingRef.current
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

        audioChainRef.current.stopStatic();
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
      audioChainRef.current.stopStatic();
      greetingRef.current.stopGreeting();
      tvPowerRef.current = 'off';
      setTvPower('off');
      setIsGreetingDone(false);
      setGreetingText(null);
    }
  }, [tvPower]);

  const handleChannelChange = useCallback(() => {
    if (tvPower === 'off') return;

    greetingRef.current.stopGreeting();
    preloadedGreetingRef.current = null;
    setIsGreetingDone(false);
    setGreetingText(null);
    setThemeIndex((currentIndex) => {
      const currentTheme = AVATAR_THEMES[currentIndex] ?? AVATAR_THEMES[0];
      return AVATAR_THEMES.indexOf(nextTheme(currentTheme));
    });
    setGreetingNonce((current) => current + 1);
  }, [tvPower]);

  const handleSend = useCallback(
    (text: string) => {
      if (!text.trim() || !isActive) return;
      sendMessage({
        type: 'user_message',
        payload: { text, turnIndex: currentTurnIndex, inputMethod: 'text' },
      });
    },
    [isActive, sendMessage, currentTurnIndex],
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

  return (
    <div id="max-height-app" className="crt-fallback">
      <div className="tv-wrapper">
        <CrtFrame panel={controlPanel} footer={footerControls}>
          {showSceneContent && !overlayState && <BackgroundCycler />}
          {showAvatar && (
            <AvatarFrameCycler
              isMouthOpen={isMouthOpen}
              theme={currentTheme}
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
