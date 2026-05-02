// WebSocket message types per websocket-api.md contract
// All client→server and server→client message interfaces

import type { SessionState } from './domain';

// --- Client → Server ---

export interface SessionStartPayload {
  actorId: string;
  displayAlias: string | null;
  greetingId: string;
  clientTimestamp: string;
}

export interface UserMessagePayload {
  text: string;
  turnIndex: number;
  inputMethod: 'text' | 'voice';
}

export interface InterruptPayload {
  turnIndex: number;
}

export interface SessionResumePayload {
  sessionId: string;
  actorId: string;
  lastReceivedTurnIndex: number;
}

export interface SessionEndPayload {
  reason: 'user_exit' | 'cap_reached' | 'timeout';
}

export type ClientMessage =
  | { type: 'session_start'; payload: SessionStartPayload }
  | { type: 'user_message'; payload: UserMessagePayload }
  | { type: 'interrupt'; payload: InterruptPayload }
  | { type: 'session_resume'; payload: SessionResumePayload }
  | { type: 'session_end'; payload: SessionEndPayload };

// --- Server → Client ---

export interface ConnectionAckPayload {
  agentCoreSessionId: string;
}

export interface AgentTokenPayload {
  turnIndex: number;
  token: string;
  isFinal: boolean;
}

export interface AgentTurnCompletePayload {
  turnIndex: number;
  fullText: string;
  tokenCount: number;
  sessionTokenTotal: number;
  sessionTurnTotal: number;
}

export interface SessionStateChangePayload {
  previousState: SessionState;
  newState: SessionState;
  reason: string;
  inCharacterMessage: string | null;
}

export type ErrorCode = 'RATE_LIMITED' | 'INPUT_TOO_LONG' | 'MODERATION_BLOCKED' | 'INTERNAL';

export interface ErrorPayload {
  code: ErrorCode;
  message: string;
  retryable: boolean;
}

export type ServerMessage =
  | { type: 'connection_ack'; payload: ConnectionAckPayload }
  | { type: 'agent_token'; payload: AgentTokenPayload }
  | { type: 'agent_turn_complete'; payload: AgentTurnCompletePayload }
  | { type: 'session_state_change'; payload: SessionStateChangePayload }
  | { type: 'error'; payload: ErrorPayload };

// Re-export SessionState for convenience
export type { SessionState } from './domain';
