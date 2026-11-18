import { describe, it, expect } from 'vitest';
import {
  openSession,
  evaluateSession,
  recordTurn,
  type SessionCaps,
} from '../../src/handlers/sessionManager.js';
import type { CountedSession } from '../../src/session/controlTable.js';

const CAPS: SessionCaps = { maxTurns: 50, maxTokens: 20_000, maxMinutes: 30 };
const T0 = new Date('2026-11-20T10:00:00.000Z');

function stored(overrides: Partial<CountedSession> = {}): CountedSession {
  return {
    sessionId: 'sess-1',
    state: 'Active',
    openedAt: T0.toISOString(),
    turns: 0,
    conversationalTokens: 0,
    webSearches: 0,
    ttl: 0,
    ...overrides,
  };
}

const minutesAfter = (minutes: number): Date => new Date(T0.getTime() + minutes * 60_000);

describe('openSession', () => {
  it('starts an Active session with nothing counted, stamped with the opening time', () => {
    expect(openSession(T0)).toMatchObject({
      state: 'Active',
      openedAt: T0.toISOString(),
      turns: 0,
      conversationalTokens: 0,
      webSearches: 0,
    });
  });

  it('mints a distinct id each time', () => {
    expect(openSession(T0).sessionId).not.toBe(openSession(T0).sessionId);
  });
});

describe('evaluateSession', () => {
  it('opens a session when none is stored', () => {
    expect(evaluateSession(undefined, CAPS, T0)).toEqual({ kind: 'open' });
  });

  it('continues an Active session that is within every cap', () => {
    const session = stored({ turns: 10, conversationalTokens: 5000 });
    expect(evaluateSession(session, CAPS, minutesAfter(5))).toEqual({
      kind: 'continue',
      session,
    });
  });

  it.each(['SignedOff', 'Expired'] as const)(
    'opens a fresh session after a %s one, with fresh caps',
    (state) => {
      expect(evaluateSession(stored({ state, turns: 50 }), CAPS, minutesAfter(1))).toEqual({
        kind: 'open',
      });
    },
  );

  it('opens a fresh session when the time cap elapsed, evaluated at this request', () => {
    expect(evaluateSession(stored({ turns: 3 }), CAPS, minutesAfter(30))).toEqual({
      kind: 'open',
    });
  });

  it('still continues one millisecond before the time cap', () => {
    const justBefore = new Date(T0.getTime() + 30 * 60_000 - 1);
    expect(evaluateSession(stored(), CAPS, justBefore).kind).toBe('continue');
  });

  it('refuses an Active session already at the turn cap', () => {
    const session = stored({ turns: 50 });
    expect(evaluateSession(session, CAPS, minutesAfter(1))).toEqual({
      kind: 'exceeded',
      session,
      reason: 'turn_limit',
    });
  });

  it('refuses an Active session already at the token cap', () => {
    const session = stored({ conversationalTokens: 20_000 });
    expect(evaluateSession(session, CAPS, minutesAfter(1))).toEqual({
      kind: 'exceeded',
      session,
      reason: 'token_limit',
    });
  });

  it('uses the configured caps, not figures of its own', () => {
    const tight: SessionCaps = { maxTurns: 2, maxTokens: 100, maxMinutes: 1 };
    expect(evaluateSession(stored({ turns: 2 }), tight, T0)).toMatchObject({
      kind: 'exceeded',
      reason: 'turn_limit',
    });
    expect(evaluateSession(stored(), tight, minutesAfter(1)).kind).toBe('open');
  });
});

describe('recordTurn', () => {
  it('adds the turn and its conversational tokens, and stays Active under the caps', () => {
    expect(recordTurn(stored({ turns: 2, conversationalTokens: 100 }), 40, 0, CAPS)).toEqual({
      sessionId: 'sess-1',
      state: 'Active',
      openedAt: T0.toISOString(),
      turns: 3,
      conversationalTokens: 140,
      webSearches: 0,
    });
  });

  it('signs the session off when the turn cap is reached by this turn', () => {
    expect(recordTurn(stored({ turns: 49 }), 10, 0, CAPS).state).toBe('SignedOff');
  });

  it('signs the session off when the token cap is reached by this turn', () => {
    expect(recordTurn(stored({ conversationalTokens: 19_990 }), 10, 0, CAPS).state).toBe(
      'SignedOff',
    );
  });

  it('does not carry the stored ttl into the write', () => {
    expect(recordTurn(stored({ ttl: 123 }), 1, 0, CAPS)).not.toHaveProperty('ttl');
  });

  // Spec 003 Session 2026-11-18 (T181): the per-session search cap needs a running count.
  it("adds the searches this turn sent to the session's count", () => {
    expect(recordTurn(stored({ webSearches: 4 }), 1, 3, CAPS).webSearches).toBe(7);
  });

  it('does not sign the session off at the search cap; only searching stops', () => {
    expect(recordTurn(stored({ webSearches: 9 }), 1, 5, CAPS).state).toBe('Active');
  });
});
