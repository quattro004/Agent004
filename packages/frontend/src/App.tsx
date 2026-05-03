import { useState, useEffect, useCallback, useRef } from 'react';
import { CrtFrame } from './components/CrtFrame';
import { Avatar2D } from './components/Avatar2D';
import { TvKnob } from './components/TvKnob';
import { VolumeKnob } from './components/VolumeKnob';
import { TextInput } from './components/TextInput';
import { BroadcastText } from './components/BroadcastText';
import { BufferingOverlay } from './components/BufferingOverlay';
import { SessionStateOverlay, type OverlayState } from './components/SessionStateOverlay';
import { MicButton } from './components/MicButton';
import { SpeechDisclosure } from './components/SpeechDisclosure';
import { NeonBackdrop } from './effects/NeonBackdrop';
import { useWebSocket } from './hooks/useWebSocket';
import { createUseAudio } from './hooks/useAudio';
import { createUseGreeting } from './hooks/useGreeting';
import { useIsMobile } from './hooks/useIsMobile';
import { useSpeech, getSpeechProvider } from './hooks/useSpeech';
import { createAudioChain } from './audio/audioChain';
import { probeMic } from './services/micDetection';
import { useConnectionStore } from './stores/connectionStore';
import { useConversationStore } from './stores/conversationStore';
import { useVoiceStore } from './stores/voiceStore';
import type { SessionState } from './types/domain';
import './effects/crtFallback.css';
import './App.css';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8080';

/** Map domain SessionState to the overlay subset (null if no overlay needed). */
function toOverlayState(state: SessionState): OverlayState {
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
  const [isTvOn, setIsTvOn] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [hasMic, setHasMic] = useState(false);
  const [showDisclosure, setShowDisclosure] = useState(false);
  const audioChainRef = useRef(createAudioChain());
  const audioRef = useRef(createUseAudio(audioChainRef.current));
  const greetingRef = useRef(createUseGreeting(audioChainRef.current));
  const isMobile = useIsMobile();
  const speech = useSpeech();

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
  const isTerminal =
    sessionState === 'ENDED' || sessionState === 'BUDGET_CAPPED' || sessionState === 'SIGNAL_LOST';

  const turnIndexAtMicStartRef = useRef(currentTurnIndex);

  useEffect(() => {
    probeMic().then(setHasMic);
    return () => {
      audioRef.current.dispose();
      audioChainRef.current.dispose();
    };
  }, []);

  const handleTvOn = useCallback(async () => {
    if (isTvOn) return;
    setIsTvOn(true);

    try {
      await audioChainRef.current.init();
    } catch {
      // AudioContext may fail; continue without audio
    }

    void greetingRef.current.playGreeting();
  }, [isTvOn]);

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

  const handleMicStart = useCallback(() => {
    if (!localStorage.getItem('speech-disclosure-dismissed')) {
      setShowDisclosure(true);
      localStorage.setItem('speech-disclosure-dismissed', 'true');
    }
    turnIndexAtMicStartRef.current = currentTurnIndex;
    speech.start();
  }, [speech, currentTurnIndex]);

  const handleMicStop = useCallback(() => {
    const transcript = speech.stop();
    if (transcript.trim() && isActive) {
      sendMessage({
        type: 'user_message',
        payload: {
          text: transcript,
          turnIndex: turnIndexAtMicStartRef.current,
          inputMethod: 'voice',
        },
      });
    }
  }, [speech, isActive, sendMessage]);

  return (
    <div id="max-height-app" className="crt-fallback">
      <CrtFrame
        panel={
          <>
            <VolumeKnob volume={volume} onVolumeChange={setVolume} disabled={!isTvOn} />
            <TvKnob onTurnOn={handleTvOn} disabled={isTvOn && isTerminal} />
          </>
        }
      >
        {isTvOn && <Avatar2D isMouthOpen={isMouthOpen} />}
        {isTvOn && <BroadcastText tokens={tokens.split('')} fullText={fullText} />}
        {isTvOn && <NeonBackdrop isMobile={isMobile} />}
        <BufferingOverlay isConnecting={!isConnected && isTvOn} isThinking={isStreaming} />
        <SessionStateOverlay state={toOverlayState(sessionState)} />
      </CrtFrame>

      <div className="controls-area">
        <TextInput onSubmit={handleSend} disabled={!isTvOn || !isActive} />
        {hasMic && (
          <MicButton
            onStart={handleMicStart}
            onStop={handleMicStop}
            disabled={!isTvOn || !isActive}
          />
        )}
      </div>

      <SpeechDisclosure
        provider={getSpeechProvider()}
        visible={showDisclosure}
        onDismiss={() => setShowDisclosure(false)}
      />
    </div>
  );
}
