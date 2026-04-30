import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createSession,
  endSession,
  checkSessionCaps,
  getSessionState,
  type Session,
} from '../../src/handlers/sessionManager.js';

describe('sessionManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createSession', () => {
    it('should create a session with initial state', () => {
      const session = createSession({
        actorId: 'test-actor-123',
        greetingId: 'greeting-001',
      });

      expect(session.sessionId).toBeDefined();
      expect(session.actorId).toBe('test-actor-123');
      expect(session.greetingId).toBe('greeting-001');
      expect(session.state).toBe('GREETING');
      expect(session.turnCount).toBe(0);
      expect(session.tokenCount).toBe(0);
      expect(session.idleNudgeDelivered).toBe(false);
      expect(session.reEngagementCount).toBe(0);
      expect(session.startedAt).toBeDefined();
      expect(session.endedAt).toBeNull();
    });

    it('should generate a unique sessionId', () => {
      const session1 = createSession({
        actorId: 'actor-1',
        greetingId: 'greeting-001',
      });
      const session2 = createSession({
        actorId: 'actor-2',
        greetingId: 'greeting-002',
      });
      expect(session1.sessionId).not.toBe(session2.sessionId);
    });
  });

  describe('checkSessionCaps', () => {
    it('should return not-exceeded when under all caps', () => {
      const session = createSession({
        actorId: 'test-actor',
        greetingId: 'greeting-001',
      });
      session.state = 'ACTIVE';
      session.turnCount = 10;
      session.tokenCount = 5000;

      const result = checkSessionCaps(session);
      expect(result.exceeded).toBe(false);
      expect(result.reason).toBeNull();
    });

    it('should trigger at 50 turns', () => {
      const session = createSession({
        actorId: 'test-actor',
        greetingId: 'greeting-001',
      });
      session.state = 'ACTIVE';
      session.turnCount = 50;
      session.tokenCount = 5000;

      const result = checkSessionCaps(session);
      expect(result.exceeded).toBe(true);
      expect(result.reason).toBe('turn_limit');
    });

    it('should trigger at 20,000 tokens', () => {
      const session = createSession({
        actorId: 'test-actor',
        greetingId: 'greeting-001',
      });
      session.state = 'ACTIVE';
      session.turnCount = 10;
      session.tokenCount = 20000;

      const result = checkSessionCaps(session);
      expect(result.exceeded).toBe(true);
      expect(result.reason).toBe('token_limit');
    });

    it('should trigger at 30 minutes', () => {
      const now = new Date('2026-04-29T10:00:00Z');
      vi.setSystemTime(now);

      const session = createSession({
        actorId: 'test-actor',
        greetingId: 'greeting-001',
      });
      session.state = 'ACTIVE';
      session.turnCount = 10;
      session.tokenCount = 5000;

      // Advance 30 minutes
      vi.setSystemTime(new Date('2026-04-29T10:30:00Z'));

      const result = checkSessionCaps(session);
      expect(result.exceeded).toBe(true);
      expect(result.reason).toBe('time_limit');
    });

    it('should trigger on whichever cap is hit first', () => {
      const session = createSession({
        actorId: 'test-actor',
        greetingId: 'greeting-001',
      });
      session.state = 'ACTIVE';
      session.turnCount = 50;
      session.tokenCount = 20000;

      const result = checkSessionCaps(session);
      expect(result.exceeded).toBe(true);
      // Should report the first cap hit (turn limit checked first)
      expect(result.reason).toBeTruthy();
    });
  });

  describe('endSession', () => {
    it('should set state to ENDED and record endedAt', () => {
      const session = createSession({
        actorId: 'test-actor',
        greetingId: 'greeting-001',
      });
      session.state = 'ACTIVE';

      const ended = endSession(session, 'cap_reached');
      expect(ended.state).toBe('ENDED');
      expect(ended.endedAt).toBeDefined();
      expect(ended.endedAt).not.toBeNull();
    });
  });

  describe('getSessionState', () => {
    it('should return current session state', () => {
      const session = createSession({
        actorId: 'test-actor',
        greetingId: 'greeting-001',
      });
      expect(getSessionState(session)).toBe('GREETING');

      session.state = 'ACTIVE';
      expect(getSessionState(session)).toBe('ACTIVE');
    });
  });

});
