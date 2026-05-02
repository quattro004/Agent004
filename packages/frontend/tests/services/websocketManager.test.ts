import { describe, it, expect } from 'vitest';
import {
  serialize,
  deserialize,
  calculateBackoffDelay,
  buildSessionResumePayload,
  mapCloseCodeToState,
  MAX_MESSAGE_SIZE,
  MAX_RETRIES,
} from '../../src/services/websocketManager';
import type { ClientMessage } from '../../src/types/messages';

describe('WebSocket Manager', () => {
  describe('serialize', () => {
    it('should serialize session_start message to JSON string', () => {
      const message: ClientMessage = {
        type: 'session_start',
        payload: {
          actorId: '123e4567-e89b-12d3-a456-426614174000',
          displayAlias: 'Reesey',
          greetingId: 'greeting-001',
          clientTimestamp: '2026-04-30T12:00:00Z',
        },
      };

      const result = serialize(message);
      const parsed = JSON.parse(result);

      expect(parsed.type).toBe('session_start');
      expect(parsed.payload.actorId).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(parsed.payload.displayAlias).toBe('Reesey');
      expect(parsed.payload.greetingId).toBe('greeting-001');
    });

    it('should serialize user_message to JSON string', () => {
      const message: ClientMessage = {
        type: 'user_message',
        payload: {
          text: 'Hello Max!',
          turnIndex: 1,
          inputMethod: 'text',
        },
      };

      const result = serialize(message);
      const parsed = JSON.parse(result);

      expect(parsed.type).toBe('user_message');
      expect(parsed.payload.text).toBe('Hello Max!');
      expect(parsed.payload.turnIndex).toBe(1);
    });

    it('should serialize interrupt message to JSON string', () => {
      const message: ClientMessage = {
        type: 'interrupt',
        payload: { turnIndex: 3 },
      };

      const result = serialize(message);
      const parsed = JSON.parse(result);

      expect(parsed.type).toBe('interrupt');
      expect(parsed.payload.turnIndex).toBe(3);
    });

    it('should reject messages exceeding 32KB', () => {
      const longText = 'x'.repeat(33_000);
      const message: ClientMessage = {
        type: 'user_message',
        payload: {
          text: longText,
          turnIndex: 1,
          inputMethod: 'text',
        },
      };

      expect(() => serialize(message)).toThrow(/exceeds maximum/i);
    });
  });

  describe('deserialize', () => {
    it('should deserialize connection_ack message', () => {
      const raw = JSON.stringify({
        type: 'connection_ack',
        payload: { agentCoreSessionId: 'session-abc-123' },
      });

      const result = deserialize(raw);

      expect(result.type).toBe('connection_ack');
      if (result.type === 'connection_ack') {
        expect(result.payload.agentCoreSessionId).toBe('session-abc-123');
      }
    });

    it('should deserialize agent_token message', () => {
      const raw = JSON.stringify({
        type: 'agent_token',
        payload: {
          turnIndex: 2,
          token: 'M-M-Max',
          isFinal: false,
        },
      });

      const result = deserialize(raw);

      expect(result.type).toBe('agent_token');
      if (result.type === 'agent_token') {
        expect(result.payload.token).toBe('M-M-Max');
        expect(result.payload.isFinal).toBe(false);
      }
    });

    it('should deserialize agent_turn_complete message', () => {
      const raw = JSON.stringify({
        type: 'agent_turn_complete',
        payload: {
          turnIndex: 2,
          fullText: 'W-W-Well hello there!',
          tokenCount: 15,
          sessionTokenTotal: 150,
          sessionTurnTotal: 3,
        },
      });

      const result = deserialize(raw);

      expect(result.type).toBe('agent_turn_complete');
      if (result.type === 'agent_turn_complete') {
        expect(result.payload.fullText).toBe('W-W-Well hello there!');
        expect(result.payload.sessionTurnTotal).toBe(3);
      }
    });

    it('should deserialize session_state_change message', () => {
      const raw = JSON.stringify({
        type: 'session_state_change',
        payload: {
          previousState: 'ACTIVE',
          newState: 'ENDED',
          reason: 'Turn limit reached',
          inCharacterMessage: "That's a w-wrap, folks!",
        },
      });

      const result = deserialize(raw);

      expect(result.type).toBe('session_state_change');
      if (result.type === 'session_state_change') {
        expect(result.payload.newState).toBe('ENDED');
        expect(result.payload.inCharacterMessage).toBe("That's a w-wrap, folks!");
      }
    });

    it('should deserialize error message', () => {
      const raw = JSON.stringify({
        type: 'error',
        payload: {
          code: 'RATE_LIMITED',
          message: 'Too many messages',
          retryable: false,
        },
      });

      const result = deserialize(raw);

      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.payload.code).toBe('RATE_LIMITED');
        expect(result.payload.retryable).toBe(false);
      }
    });

    it('should throw on invalid JSON', () => {
      expect(() => deserialize('not valid json {')).toThrow();
    });

    it('should throw on message missing type field', () => {
      const raw = JSON.stringify({ payload: { something: 'value' } });
      expect(() => deserialize(raw)).toThrow(/invalid message/i);
    });

    it('should throw on unknown message type', () => {
      const raw = JSON.stringify({ type: 'unknown_type', payload: {} });
      expect(() => deserialize(raw)).toThrow(/unknown message type/i);
    });
  });

  describe('calculateBackoffDelay', () => {
    it('should return 1000ms for first retry attempt', () => {
      expect(calculateBackoffDelay(0)).toBe(1000);
    });

    it('should return 2000ms for second retry attempt', () => {
      expect(calculateBackoffDelay(1)).toBe(2000);
    });

    it('should return 4000ms for third retry attempt', () => {
      expect(calculateBackoffDelay(2)).toBe(4000);
    });

    it('should cap at 4000ms for attempts beyond 3', () => {
      expect(calculateBackoffDelay(5)).toBe(4000);
    });
  });

  describe('buildSessionResumePayload', () => {
    it('should construct session_resume message with lastReceivedTurnIndex', () => {
      const result = buildSessionResumePayload(
        'session-123',
        'actor-456',
        7,
      );

      expect(result.type).toBe('session_resume');
      expect(result.payload.sessionId).toBe('session-123');
      expect(result.payload.actorId).toBe('actor-456');
      expect(result.payload.lastReceivedTurnIndex).toBe(7);
    });
  });

  describe('mapCloseCodeToState', () => {
    it('should map 1000 (normal) to null (no state change needed)', () => {
      expect(mapCloseCodeToState(1000)).toBeNull();
    });

    it('should map 1001 (going away) to null (no state change needed)', () => {
      expect(mapCloseCodeToState(1001)).toBeNull();
    });

    it('should map 4000 (session cap) to ENDED', () => {
      expect(mapCloseCodeToState(4000)).toBe('ENDED');
    });

    it('should map 4001 (budget hard-stop) to BUDGET_CAPPED', () => {
      expect(mapCloseCodeToState(4001)).toBe('BUDGET_CAPPED');
    });

    it('should map 4002 (rate limit) to RATE_LIMITED', () => {
      expect(mapCloseCodeToState(4002)).toBe('RATE_LIMITED');
    });

    it('should map 4008 (URL expired) to SIGNAL_LOST', () => {
      expect(mapCloseCodeToState(4008)).toBe('SIGNAL_LOST');
    });

    it('should map 4500 (internal error) to ERROR', () => {
      expect(mapCloseCodeToState(4500)).toBe('ERROR');
    });

    it('should map unknown close codes to SIGNAL_LOST', () => {
      expect(mapCloseCodeToState(9999)).toBe('SIGNAL_LOST');
    });
  });

  describe('MAX_RETRIES constant', () => {
    it('should be 3', () => {
      expect(MAX_RETRIES).toBe(3);
    });
  });

  describe('MAX_MESSAGE_SIZE constant', () => {
    it('should be 32768 bytes (32KB)', () => {
      expect(MAX_MESSAGE_SIZE).toBe(32_768);
    });
  });
});
