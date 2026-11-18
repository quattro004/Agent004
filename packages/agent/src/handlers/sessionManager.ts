/**
 * The counted-session model (spec 003 data-model.md § Counted Session).
 *
 * Pure functions over the control table's `SESSION#<sub>` shape. The caps come
 * from runtime configuration, never from figures in this file, and expiry is
 * decided from `openedAt` at the request because DynamoDB TTL deletion is only
 * cleanup (spec.md Session 2026-11-15).
 */
import { randomUUID } from 'node:crypto';
import type { CountedSession, CountedSessionWrite } from '../session/controlTable.js';

export interface SessionCaps {
  maxTurns: number;
  maxTokens: number;
  maxMinutes: number;
}

export type SessionEvaluation =
  /** No usable session: absent, signed off, or past its time cap. The next message opens one. */
  | { kind: 'open' }
  | { kind: 'continue'; session: CountedSession }
  /** An Active session already at a turn or token cap, which must not run another turn. */
  | { kind: 'exceeded'; session: CountedSession; reason: 'turn_limit' | 'token_limit' };

export function openSession(now: Date): CountedSessionWrite {
  return {
    sessionId: randomUUID(),
    state: 'Active',
    openedAt: now.toISOString(),
    turns: 0,
    conversationalTokens: 0,
    webSearches: 0,
  };
}

export function evaluateSession(
  stored: CountedSession | undefined,
  caps: SessionCaps,
  now: Date,
): SessionEvaluation {
  if (!stored || stored.state !== 'Active') return { kind: 'open' };

  const expiresAtMs = Date.parse(stored.openedAt) + caps.maxMinutes * 60_000;
  if (now.getTime() >= expiresAtMs) return { kind: 'open' };

  if (stored.turns >= caps.maxTurns) {
    return { kind: 'exceeded', session: stored, reason: 'turn_limit' };
  }
  if (stored.conversationalTokens >= caps.maxTokens) {
    return { kind: 'exceeded', session: stored, reason: 'token_limit' };
  }
  return { kind: 'continue', session: stored };
}

/**
 * Counts one turn. A turn that reaches a cap is Max's in-character sign-off,
 * so the session ends here and the next message opens a fresh one. The search
 * cap is not one of those: reaching it stops searching, not the conversation.
 */
export function recordTurn(
  session: CountedSessionWrite,
  conversationalTokens: number,
  webSearches: number,
  caps: SessionCaps,
): CountedSessionWrite {
  const turns = session.turns + 1;
  const tokens = session.conversationalTokens + conversationalTokens;
  const capReached = turns >= caps.maxTurns || tokens >= caps.maxTokens;

  return {
    sessionId: session.sessionId,
    state: capReached ? 'SignedOff' : 'Active',
    openedAt: session.openedAt,
    turns,
    conversationalTokens: tokens,
    webSearches: session.webSearches + webSearches,
  };
}
