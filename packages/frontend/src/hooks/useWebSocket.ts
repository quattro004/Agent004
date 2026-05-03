import { useEffect, useCallback, useRef } from 'react';
import { useConnectionStore } from '../stores/connectionStore';
import { useConversationStore } from '../stores/conversationStore';
import {
  serialize,
  deserialize,
  calculateBackoffDelay,
  mapCloseCodeToState,
  MAX_RETRIES,
} from '../services/websocketManager';
import type { ClientMessage, ServerMessage } from '../types/messages';

export interface UseWebSocketOptions {
  url: string;
  sessionId: string;
}

export function useWebSocket({ url, sessionId }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);

  const setConnected = useConnectionStore((s) => s.setConnected);
  const setSessionState = useConnectionStore((s) => s.setSessionState);
  const appendToken = useConversationStore((s) => s.appendToken);
  const setFullText = useConversationStore((s) => s.setFullText);
  const updateCounters = useConversationStore((s) => s.updateCounters);
  const advanceTurn = useConversationStore((s) => s.advanceTurn);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      let msg: ServerMessage;
      try {
        msg = deserialize(event.data as string);
      } catch {
        return;
      }

      switch (msg.type) {
        case 'connection_ack':
          setConnected(sessionId, msg.payload.agentCoreSessionId);
          retriesRef.current = 0;
          break;
        case 'agent_token':
          appendToken(msg.payload.token);
          break;
        case 'agent_turn_complete':
          setFullText(msg.payload.fullText);
          updateCounters({
            sessionTokenTotal: msg.payload.sessionTokenTotal,
            sessionTurnTotal: msg.payload.sessionTurnTotal,
          });
          advanceTurn();
          break;
        case 'session_state_change':
          setSessionState(msg.payload.newState);
          break;
        case 'error':
          // Errors handled by error recovery service (T061)
          break;
      }
    },
    [
      sessionId,
      setConnected,
      setSessionState,
      appendToken,
      setFullText,
      updateCounters,
      advanceTurn,
    ],
  );

  const connect = useCallback(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.addEventListener('message', handleMessage);

    ws.addEventListener('close', (event) => {
      const newState = mapCloseCodeToState(event.code);
      if (newState) {
        setSessionState(newState);
      } else if (retriesRef.current < MAX_RETRIES) {
        const delay = calculateBackoffDelay(retriesRef.current);
        retriesRef.current++;
        setTimeout(connect, delay);
      } else {
        setSessionState('SIGNAL_LOST');
      }
    });
  }, [url, handleMessage, setSessionState]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close(1000);
    };
  }, [connect]);

  const sendMessage = useCallback((message: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(serialize(message));
    }
  }, []);

  const startSession = useCallback(
    (actorId: string, displayAlias: string | null, greetingId: string) => {
      sendMessage({
        type: 'session_start',
        payload: { actorId, displayAlias, greetingId, clientTimestamp: new Date().toISOString() },
      });
    },
    [sendMessage],
  );

  const endSession = useCallback(
    (reason: 'user_exit' | 'cap_reached' | 'timeout') => {
      sendMessage({ type: 'session_end', payload: { reason } });
    },
    [sendMessage],
  );

  const sendInterrupt = useCallback(
    (turnIndex: number) => {
      sendMessage({ type: 'interrupt', payload: { turnIndex } });
    },
    [sendMessage],
  );

  return { sendMessage, startSession, endSession, sendInterrupt };
}
