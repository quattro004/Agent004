import { randomUUID } from 'node:crypto';

export type SessionState = 'GREETING' | 'ACTIVE' | 'IDLE' | 'WINDING_DOWN' | 'ENDED';

export type EndReason = 'cap_reached' | 'user_left' | 'error' | 'manual';

export interface Session {
  sessionId: string;
  actorId: string;
  greetingId: string;
  state: SessionState;
  turnCount: number;
  tokenCount: number;
  idleNudgeDelivered: boolean;
  reEngagementCount: number;
  startedAt: Date;
  endedAt: Date | null;
}

export interface SessionCapResult {
  exceeded: boolean;
  reason: 'turn_limit' | 'token_limit' | 'time_limit' | null;
}

// Hard caps from spec FR-010: 50 turns, 20,000 tokens, 30 minutes
const MAX_TURNS = 50;
const MAX_TOKENS = 20_000;
const MAX_DURATION_MS = 30 * 60 * 1000; // 30 minutes

export function createSession(params: {
  actorId: string;
  greetingId: string;
}): Session {
  return {
    sessionId: randomUUID(),
    actorId: params.actorId,
    greetingId: params.greetingId,
    state: 'GREETING',
    turnCount: 0,
    tokenCount: 0,
    idleNudgeDelivered: false,
    reEngagementCount: 0,
    startedAt: new Date(),
    endedAt: null,
  };
}

export function checkSessionCaps(session: Session): SessionCapResult {
  // Check turn limit first
  if (session.turnCount >= MAX_TURNS) {
    return { exceeded: true, reason: 'turn_limit' };
  }

  // Check token limit
  if (session.tokenCount >= MAX_TOKENS) {
    return { exceeded: true, reason: 'token_limit' };
  }

  // Check time limit
  const elapsed = Date.now() - session.startedAt.getTime();
  if (elapsed >= MAX_DURATION_MS) {
    return { exceeded: true, reason: 'time_limit' };
  }

  return { exceeded: false, reason: null };
}

export function endSession(session: Session, _reason: EndReason): Session {
  return {
    ...session,
    state: 'ENDED',
    endedAt: new Date(),
  };
}

export function getSessionState(session: Session): SessionState {
  return session.state;
}
