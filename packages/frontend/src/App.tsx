import { useState, useEffect, useCallback, useRef } from 'react';
import { CrtFrame } from './components/CrtFrame';
import { AvatarFrameCycler } from './components/AvatarFrameCycler';
import { BroadcastText } from './components/BroadcastText';
import { BufferingOverlay } from './components/BufferingOverlay';
import { SessionStateOverlay, type OverlayState } from './components/SessionStateOverlay';
import { TextInput } from './components/TextInput';
import { TvKnob } from './components/TvKnob';
import { VolumeKnob } from './components/VolumeKnob';
import { NeonBackdrop } from './effects/NeonBackdrop';
import { useWebSocket } from './hooks/useWebSocket';
import { createUseAudio } from './hooks/useAudio';
import { createUseGreeting } from './hooks/useGreeting';
import { useIsMobile } from './hooks/useIsMobile';
import { createAudioChain } from './audio/audioChain';
import { useConnectionStore } from './stores/connectionStore';
import { useConversationStore } from './stores/conversationStore';
import { useVoiceStore } from './stores/voiceStore';
import type { SessionState } from './types/domain';
import './effects/crtFallback.css';
import './App.css';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8080';

/** TV power states: off (dark screen), powering (transition), on (fully active). */
export type TvPowerState = 'off' | 'powering' | 'on';

const POWER_UP_DURATION_MS = 800;

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
  const isTvOn = tvPower === 'on';
  const [volume, setVolume] = useState(0.5);
  const [greetingText, setGreetingText] = useState<string | null>(null);
  const [isGreetingDone, setIsGreetingDone] = useState(false);
  const audioChainRef = useRef(createAudioChain());
  const audioRef = useRef(createUseAudio(audioChainRef.current));
  const greetingRef = useRef(createUseGreeting(audioChainRef.current));
  const isMobile = useIsMobile();

  const sessionId = useConnectionStore((s) => s.sessionId) ?? 'pending';
  const { sendMessage } = useWebSocket({ url: WS_URL, sessionId, enabled: isTvOn });
  const sessionState = useConnectionStore((s) => s.sessionState);
  const tokens = useConversationStore((s) => s.currentResponseText);
  const fullText = useConversationStore((s) => (s.isStreaming ? null : s.currentResponseText));
  const isMouthOpen = useVoiceStore((s) => s.isMouthOpen);
  const isStreaming = useConversationStore((s) => s.isStreaming);
  const isConnected = useConnectionStore((s) => s.isWebSocketReady);
  const currentTurnIndex = useConversationStore((s) => s.currentTurnIndex);

  const isActive = sessionState === 'ACTIVE' || sessionState === 'GREETING';

  const GREETING_DISPLAY_MS = 5000;

  // Play greeting when TV powers on
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

  useEffect(() => {
    try {
      void audioChainRef.current.init();
    } catch {
      // AudioContext may fail; continue without audio
    }
    return () => {
      audioRef.current.dispose();
      audioChainRef.current.dispose();
    };
  }, []);

  // Power-up transition: advance from 'powering' to 'on' after brief delay
  useEffect(() => {
    if (tvPower !== 'powering') return;
    const timer = setTimeout(() => setTvPower('on'), POWER_UP_DURATION_MS);
    return () => clearTimeout(timer);
  }, [tvPower]);

  // Reset TV power when session enters a terminal state
  useEffect(() => {
    const terminalStates: SessionState[] = ['ENDED', 'BUDGET_CAPPED', 'RATE_LIMITED', 'ERROR'];
    if (isTvOn && terminalStates.includes(sessionState)) {
      setTvPower('off');
    }
  }, [sessionState, isTvOn]);

  const handlePowerToggle = useCallback(() => {
    if (tvPower === 'off') {
      setTvPower('powering');
      setIsGreetingDone(false);
      setGreetingText(null);
    } else if (tvPower === 'on') {
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
      <VolumeKnob volume={volume} onVolumeChange={setVolume} disabled={!isTvOn} />
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
        {isTvOn && <NeonBackdrop isMobile={isMobile} />}
        {isTvOn && <AvatarFrameCycler isMouthOpen={isMouthOpen} />}
        {isTvOn && (
          <BroadcastText tokens={displayText.split('')} fullText={greetingText ? null : fullText} />
        )}
        {isTvOn && <BufferingOverlay isConnecting={showBuffering} isThinking={isStreaming} />}
        {isTvOn && <SessionStateOverlay state={toOverlayState(sessionState, isGreetingDone)} />}
      </CrtFrame>
    </div>
  );
}
