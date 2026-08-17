# Contract: WebSocket API (AgentCore Runtime)

**Feature**: 001-max-height-ai-character  
**Date**: 2026-04-19  
**Source**: spec.md §Requirements, research.md §R2

---

## Connection

| Field | Value |
|-------|-------|
| Protocol | `wss://` |
| Auth | SigV4 presigned URL via Cognito guest credentials |
| URL expiry | 5 minutes (must refresh before expiry) |
| Endpoint | API Gateway WebSocket → Lambda → AgentCore Runtime |
| Subprotocol | None (plain WebSocket frames) |

### Connection lifecycle

```
1. Client obtains Cognito guest identity
2. Client generates SigV4 presigned WebSocket URL (5-min TTL)
3. Client opens WebSocket connection
4. Server sends `connection_ack` frame
5. ... conversation ...
6. Client or server sends `session_end` frame
7. WebSocket closed (code 1000)
```

### Reconnection

- On unexpected close: exponential backoff (1s, 2s, 4s) up to 3 retries.
- On presigned URL expiry: obtain fresh URL, reconnect, send `session_resume` with `sessionId`.
- After 3 failed retries: transition to `SIGNAL_LOST` state.

---

## Client → Server Messages

### `session_start`

Sent once after connection opens. Initiates a new session.

```jsonc
{
  "type": "session_start",
  "payload": {
    "actorId": "uuid-v4",               // Visitor's persistent ID
    "displayAlias": "string | null",     // Optional visitor alias
    "greetingId": "greeting-001",        // Selected greeting ID
    "clientTimestamp": "ISO-8601"        // For time-of-day context
  }
}
```

### `user_message`

Visitor sends text input to Max.

```jsonc
{
  "type": "user_message",
  "payload": {
    "text": "string",                    // 1–2000 chars
    "turnIndex": 0,                      // Client-tracked turn number
    "inputMethod": "text | voice"        // How the input was captured
  }
}
```

### `interrupt`

Visitor interrupts Max mid-response.

```jsonc
{
  "type": "interrupt",
  "payload": {
    "turnIndex": 0                       // Which turn to interrupt
  }
}
```

### `session_resume`

Sent after reconnection to resume an existing session.

```jsonc
{
  "type": "session_resume",
  "payload": {
    "sessionId": "uuid-v4",
    "actorId": "uuid-v4",
    "lastReceivedTurnIndex": 0           // For gap detection
  }
}
```

### `session_end`

Client-initiated session close (tab close, explicit end).

```jsonc
{
  "type": "session_end",
  "payload": {
    "reason": "user_exit | cap_reached | timeout"
  }
}
```

---

## Server → Client Messages

### `connection_ack`

Confirms WebSocket connection is ready.

```jsonc
{
  "type": "connection_ack",
  "payload": {
    "agentCoreSessionId": "string"       // AgentCore-assigned session ID
  }
}
```

### `agent_token`

Streaming token from Max's response. Delivered as individual chunks for progressive rendering.

```jsonc
{
  "type": "agent_token",
  "payload": {
    "turnIndex": 0,
    "token": "string",                   // 1+ chars (word or partial word)
    "isFinal": false                     // true on last token of turn
  }
}
```

### `agent_turn_complete`

Signals the full turn text is available. Client uses this to trigger Polly synthesis.

```jsonc
{
  "type": "agent_turn_complete",
  "payload": {
    "turnIndex": 0,
    "fullText": "string",               // Complete response text (stutter-injected)
    "tokenCount": 150,                  // Tokens used this turn
    "sessionTokenTotal": 3200,          // Running session total
    "sessionTurnTotal": 7               // Running turn count
  }
}
```

### `session_state_change`

Server-initiated state transition.

```jsonc
{
  "type": "session_state_change",
  "payload": {
    "previousState": "ACTIVE",
    "newState": "ENDED | BUDGET_CAPPED | RATE_LIMITED | SIGNAL_LOST | ERROR",
    "reason": "string",                  // Human-readable reason
    "inCharacterMessage": "string | null" // Max's in-character farewell/error
  }
}
```

### `error`

Non-fatal error during processing.

```jsonc
{
  "type": "error",
  "payload": {
    "code": "RATE_LIMITED | INPUT_TOO_LONG | MODERATION_BLOCKED | INTERNAL",
    "message": "string",
    "retryable": true                    // Whether client should retry
  }
}
```

---

## Wire Format

- All frames are UTF-8 JSON text frames (no binary).
- Maximum message size: 32 KB.
- Server heartbeat: ping frame every 30 seconds. Client must respond with pong.

---

## Rate Limits (enforced server-side)

| Limit | Value | Behavior on breach |
|-------|-------|--------------------|
| Messages per hour | 60 | `error` frame with `RATE_LIMITED` code, then `session_state_change` |
| Messages per day | 500 | Same as above |
| Message length | 2,000 chars | `error` frame with `INPUT_TOO_LONG` |
| Concurrent sessions per visitor | 1 | New session_start closes previous |

---

## Close Codes

| Code | Meaning |
|------|---------|
| 1000 | Normal closure |
| 1001 | Client going away (tab close) |
| 4000 | Session cap reached |
| 4001 | Budget hard-stop |
| 4002 | Rate limit exceeded |
| 4008 | Presigned URL expired |
| 4500 | Internal server error |
