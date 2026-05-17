import { useState, useEffect, useCallback, useRef } from 'react';
import { CrtFrame } from './components/CrtFrame';
import { AvatarFrameCycler } from './components/AvatarFrameCycler';
import { BroadcastText } from './components/BroadcastText';
import { BufferingOverlay } from './components/BufferingOverlay';
import { SessionStateOverlay, type OverlayState } from './components/SessionStateOverlay';
import { TextInput } from './components/TextInput';
import { TuningOverlay } from './components/TuningOverlay';
import { TvKnob } from './components/TvKnob';
import { VolumeKnob } from './components/VolumeKnob';
import { NeonBackdrop } from './effects/NeonBackdrop';
import { useWebSocket } from './hooks/useWebSocket';
import { createUseAudio } from './hooks/useAudio';
import { createUseGreeting } from './hooks/useGreeting';
import { useIsMobile } from './hooks/useIsMobile';
import { createAudioChain } from './audio/audioChain';
import {
  GREETING_DISPLAY_MS,
  TUNING_DURATION_MS,
  SETTLING_DURATION_MS,
  TUNE_IN_GLITCH_PATTERN,
} from './config/timing';
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

/**
 * TV power states:
 * - off:      dark screen, no audio, no UI
 * - tuning:   full-screen static + white-noise audio (no avatar / greeting)
 * - settling: avatar visible, brief glitch flashes (signal locking in)
 * - on:       fully active — greeting plays, normal operation
 */
export type TvPowerState = 'off' | 'tuning' | 'settling' | 'on';

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
  const [greetingText, setGreetingText] = useState<string | null>(null);
  const [isGreetingDone, setIsGreetingDone] = useState(false);
  const audioChainRef = useRef(createAudioChain());
  const audioRef = useRef(createUseAudio(audioChainRef.current));
  const greetingRef = useRef(createUseGreeting(audioChainRef.current));
  const isMobile = useIsMobile();

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
  const isStreaming = useConversationStore((s) => s.isStreaming);
  const isConnected = useConnectionStore((s) => s.isWebSocketReady);
  const currentTurnIndex = useConversationStore((s) => s.currentTurnIndex);

  const isActive = sessionState === 'ACTIVE' || sessionState === 'GREETING';

  // Play greeting only after the TV reaches the 'on' state (post tune-in).
  useEffect(() => {
    if (!isTvOn) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    void greetingRef.current.playGreeting().then((result) => {
      if (cancelled) return;
      if (result?.text) {
        setGreetingText(result.text);
      }
      timer = setTimeout(() => {
        if (!cancelled) {
          setIsGreetingDone(true);
          setGreetingText(null);
        }
      }, GREETING_DISPLAY_MS);
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isTvOn]);

  // Apply volume changes to the audio chain (no-op until init resolves)
  useEffect(() => {
    audioChainRef.current.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    return () => {
      audioRef.current.dispose();
      audioChainRef.current.dispose();
    };
  }, []);

  // Tuning → settling → on transitions are driven by timers anchored to
  // the current power state. Power-off cleanup is handled by handlePowerToggle
  // (which sets state to 'off', cancelling this effect's timer).
  useEffect(() => {
    if (tvPower === 'tuning') {
      const t = setTimeout(() => setTvPower('settling'), TUNING_DURATION_MS);
      return () => clearTimeout(t);
    }
    if (tvPower === 'settling') {
      const t = setTimeout(() => setTvPower('on'), SETTLING_DURATION_MS);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [tvPower]);

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
      // AudioContext requires a user gesture to start without warnings.
      // Initialize the audio chain (idempotent) and kick off the static.
      void audioChainRef.current
        .init()
        .then(() => {
          audioChainRef.current.playStatic(TUNING_DURATION_MS);
        })
        .catch(() => {
          // AudioContext may fail; continue silently — visual tuning still runs.
        });
      setTvPower('tuning');
      setIsGreetingDone(false);
      setGreetingText(null);
    } else {
      // Any non-off state (tuning, settling, on) → power down cleanly.
      audioChainRef.current.stopStatic();
      greetingRef.current.stopGreeting();
      setTvPower('off');
      setIsGreetingDone(false);
      setGreetingText(null);
    }
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
      <VolumeKnob volume={volume} onVolumeChange={setVolume} disabled={tvPower === 'off'} />
    </>
  );

  const footerControls = isTvOn ? (
    <div className="controls-area">
      <TextInput onSubmit={handleSend} disabled={!isActive} />
    </div>
  ) : null;

  const displayText = greetingText ?? tokens;
  const showBuffering = isGreetingDone && !isConnected;

  return (
    <div id="max-height-app" className="crt-fallback">
      <CrtFrame panel={controlPanel} footer={footerControls}>
        {showSceneContent && <NeonBackdrop isMobile={isMobile} />}
        {showSceneContent && (
          <AvatarFrameCycler
            isMouthOpen={isMouthOpen}
            forceFrame={
              isSettling && glitchStep < TUNE_IN_GLITCH_PATTERN.length
                ? TUNE_IN_GLITCH_PATTERN[glitchStep].frame
                : undefined
            }
          />
        )}
        {isTvOn && (
          <BroadcastText tokens={displayText.split('')} fullText={greetingText ? null : fullText} />
        )}
        {isTvOn && <BufferingOverlay isConnecting={showBuffering} isThinking={isStreaming} />}
        {isTvOn && <SessionStateOverlay state={toOverlayState(sessionState, isGreetingDone)} />}
        {isSettling && (
          <div data-testid="tune-in-glitch" className="tune-in-glitch-overlay" aria-hidden="true" />
        )}
        <TuningOverlay visible={isTuning} />
      </CrtFrame>
    </div>
  );
}
