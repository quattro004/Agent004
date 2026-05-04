import { useState, useEffect, useCallback, useRef } from 'react';
import { CrtFrame } from './components/CrtFrame';
import { Avatar2D } from './components/Avatar2D';
import { BroadcastText } from './components/BroadcastText';
import { BufferingOverlay } from './components/BufferingOverlay';
import { SessionStateOverlay, type OverlayState } from './components/SessionStateOverlay';
import { TextInput } from './components/TextInput';
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
  // TV is always on for now — power button will be wired in a follow-up task
  const isTvOn = true;
  const [volume, setVolume] = useState(0.5);
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

  // Suppress unused variable warnings — these will be used when controls are wired
  void volume;
  void setVolume;
  void greetingRef;

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

  return (
    <div id="max-height-app" className="crt-fallback">
      <CrtFrame>
        {isTvOn && <NeonBackdrop isMobile={isMobile} />}
        {isTvOn && <Avatar2D isMouthOpen={isMouthOpen} />}
        {isTvOn && <BroadcastText tokens={tokens.split('')} fullText={fullText} />}
        <BufferingOverlay isConnecting={!isConnected && isTvOn} isThinking={isStreaming} />
        <SessionStateOverlay state={toOverlayState(sessionState)} />
      </CrtFrame>

      <div className="chat-bar">
        <TextInput onSubmit={handleSend} disabled={!isTvOn || !isActive} />
      </div>
    </div>
  );
}
