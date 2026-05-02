import type {
  ClientMessage,
  ServerMessage,
  SessionResumePayload,
} from '../types/messages';
import type { SessionState } from '../types/domain';

// --- Constants ---

/** Maximum WebSocket message size in bytes (32KB per websocket-api.md) */
export const MAX_MESSAGE_SIZE = 32_768;

/** Maximum reconnection attempts before transitioning to SIGNAL_LOST */
export const MAX_RETRIES = 3;

// Valid server message types per the contract
const VALID_SERVER_MESSAGE_TYPES = new Set([
  'connection_ack',
  'agent_token',
  'agent_turn_complete',
  'session_state_change',
  'error',
]);

// --- Serialization ---

/**
 * Serialize a client message to a JSON string for WebSocket transmission.
 * Throws if the serialized message exceeds MAX_MESSAGE_SIZE.
 */
export function serialize(message: ClientMessage): string {
  const json = JSON.stringify(message);
  const byteLength = new TextEncoder().encode(json).length;

  if (byteLength > MAX_MESSAGE_SIZE) {
    throw new Error(
      `Message exceeds maximum size of ${MAX_MESSAGE_SIZE} bytes (got ${byteLength} bytes)`,
    );
  }

  return json;
}

/**
 * Deserialize a raw JSON string from the WebSocket into a typed ServerMessage.
 * Throws on invalid JSON, missing type field, or unknown message types.
 */
export function deserialize(raw: string): ServerMessage {
  const parsed = JSON.parse(raw);

  if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) {
    throw new Error('Invalid message: missing type field');
  }

  if (!VALID_SERVER_MESSAGE_TYPES.has(parsed.type)) {
    throw new Error(`Unknown message type: "${parsed.type}"`);
  }

  return parsed as ServerMessage;
}

// --- Reconnection ---

/**
 * Calculate exponential backoff delay for reconnection attempts.
 * Pattern: 1s → 2s → 4s (capped at 4s).
 */
export function calculateBackoffDelay(attempt: number): number {
  const delay = Math.min(1000 * Math.pow(2, attempt), 4000);
  return delay;
}

// --- Session Resume ---

/**
 * Build a session_resume client message for reconnection.
 */
export function buildSessionResumePayload(
  sessionId: string,
  actorId: string,
  lastReceivedTurnIndex: number,
): { type: 'session_resume'; payload: SessionResumePayload } {
  return {
    type: 'session_resume',
    payload: {
      sessionId,
      actorId,
      lastReceivedTurnIndex,
    },
  };
}

// --- Close Code Mapping ---

/**
 * Map a WebSocket close code to the corresponding SessionState transition.
 * Returns null if no state change is needed (normal closure).
 */
export function mapCloseCodeToState(code: number): SessionState | null {
  switch (code) {
    case 1000: // Normal closure
    case 1001: // Client going away
      return null;
    case 4000: // Session cap reached
      return 'ENDED';
    case 4001: // Budget hard-stop
      return 'BUDGET_CAPPED';
    case 4002: // Rate limit exceeded
      return 'RATE_LIMITED';
    case 4008: // Presigned URL expired
      return 'SIGNAL_LOST';
    case 4500: // Internal server error
      return 'ERROR';
    default:
      return 'SIGNAL_LOST';
  }
}
