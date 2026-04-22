# Contract: Frontend ↔ Agent Message Protocol

**Feature**: 001-max-height-ai-character  
**Date**: 2026-04-19  
**Source**: spec.md §User Stories, research.md §R1/R3

---

## Overview

This contract defines the logical message flow between the React frontend and the Strands agent running in AgentCore Runtime. The transport layer (WebSocket) is defined in `websocket-api.md`. This document covers the application-level protocol: what the frontend sends, what the agent returns, and how the two coordinate for streaming, interruption, voice synthesis, and state management.

---

## Turn Lifecycle

A single conversation turn follows this sequence:

```
┌──────────┐                          ┌──────────┐
│ Frontend  │                          │  Agent   │
└────┬─────┘                          └────┬─────┘
     │                                      │
     │  user_message { text, turnIndex }    │
     │─────────────────────────────────────→│
     │                                      │
     │  agent_token { token, turnIndex }    │  ← repeated N times
     │←─────────────────────────────────────│
     │                                      │
     │  agent_turn_complete { fullText }    │
     │←─────────────────────────────────────│
     │                                      │
     │  [Frontend triggers Polly TTS]       │
     │  [Audio playback begins]             │
     │  [Mouth animation starts]            │
     │                                      │
```

---

## Frontend Responsibilities

### On `session_start`

1. Select greeting from manifest (see `greeting-manifest.md`).
2. Open WebSocket connection.
3. Send `session_start` with `actorId`, `greetingId`, `clientTimestamp`.
4. Begin greeting audio playback immediately (pre-generated asset).
5. Show "buffering" UX until `connection_ack` received.
6. Initialize Zustand stores: `connection`, `conversation`, `voice`, `visitor`.

### On sending user input

1. Check client-side rate limits (optimistic enforcement).
2. Increment `turnIndex`.
3. Send `user_message` with text, turnIndex, inputMethod.
4. Set UI state to "Max is thinking" (show buffering animation).
5. Start 1.5s P95 timer — if no `agent_token` within 3s, show warning.

### On receiving `agent_token`

1. Append token to current turn's progressive text display.
2. Update "Max is speaking" indicator.
3. Reset timeout timer on each token received.

### On receiving `agent_turn_complete`

1. Replace progressive text with `fullText` (canonical).
2. Trigger dual Polly calls (`Promise.all()` — see `polly-tts.md`).
3. On audio ready: start playback via AudioWorklet chain.
4. Drive mouth animation via AnalyserNode FFT energy.
5. Update session counters (`turnCount`, `tokenCount`) from payload.
6. Check session caps — if at limit, expect `session_state_change`.

### On interruption

1. User sends new input while Max is speaking.
2. Frontend immediately:
   - Stops audio playback.
   - Clears current response text.
   - Sends `interrupt` frame with current turnIndex.
   - Sends new `user_message` with incremented turnIndex.
3. Agent acknowledges interruption in next response (in-character).

---

## Agent Responsibilities

### On `session_start`

1. Create AgentCore session with `actorId` as namespace key.
2. Load visitor memory from AgentCore Memory (`/max-height/{actorId}/`).
3. Initialize system prompt with personality bible context.
4. Set session metadata: caps, rate limits, greeting context.
5. Return `connection_ack` with `agentCoreSessionId`.

### On `user_message`

1. Validate turn count and token budget.
2. If first message after greeting AND `idleNudgeDelivered` is false AND no user input for 4–10s → deliver idle nudge before processing.
3. Process through Strands agent pipeline:
   - System prompt (personality, memory context, editorial guidelines).
   - User message.
   - Tool calls if applicable (news, weather, web search — see spec.md FR-029/FR-030/FR-031). Tools are agent-internal; their results are woven into Max's editorial voice and streamed as regular `agent_token` frames. No new wire-format message types are needed for tool-augmented responses.
4. Stream response tokens via `agent_token` frames.
5. Post-process complete response:
   - Verify personality compliance (stutter count, evasiveness).
   - Inject stutters if below minimum threshold.
   - Apply editorial voice markers.
6. Send `agent_turn_complete` with full processed text and counters.
7. Async: extract memories from conversation for AgentCore Memory.

### On `interrupt`

1. Cancel current generation (if streaming).
2. Note interruption context for next response.
3. Next response may include in-character acknowledgment (e.g., "D-d-don't interrupt me!").

### On session caps

1. When `turnCount` reaches 50 OR `tokenCount` reaches 20,000 OR duration reaches 30 min:
   - Generate in-character sign-off message.
   - Send final `agent_turn_complete` with sign-off.
   - Send `session_state_change` → `ENDED`.
2. When rate limit breached:
   - Send `session_state_change` → `RATE_LIMITED` with in-character refusal.
3. When budget hard-stop:
   - Send `session_state_change` → `BUDGET_CAPPED` with "taking a break" message.

---

## Idle Nudge Protocol

Per spec: if visitor is silent for 4–10 seconds after greeting, Max delivers exactly ONE in-character prod.

```
Greeting playback completes
        │
        ├── Timer starts (random 4–10s)
        │
        ├── If user_message received → cancel timer, process normally
        │
        └── If timer fires → agent sends idle nudge as agent_turn_complete
                              sets idleNudgeDelivered = true
                              no further nudges regardless of silence
```

---

## Voice Input (Speech-to-Text) Protocol

1. User holds mic button → "ON AIR" indicator shown.
2. Web Speech API (`SpeechRecognition`) captures audio.
3. On release: interim results finalized, transcript sent as `user_message` with `inputMethod: "voice"`.
4. If recognition fails: show in-character "bad signal" message, prompt text input.
5. Voice input and text input are mutually exclusive per turn but can alternate between turns.

---

## Error Recovery Matrix

| Error | Frontend Action | Agent Action |
|-------|----------------|--------------|
| Token timeout (3s) | Show "signal weak" indicator | — |
| Token timeout (10s) | Send retry or show SIGNAL_LOST | — |
| Agent processing error | Receive `error` frame, show in-character error | Send `error` frame, log |
| WebSocket disconnect | Reconnect + `session_resume` | Accept resume, replay missed state |
| Polly failure | Play text-only (no audio) | — |
| Rate limit breach | Show in-character refusal | Send `session_state_change` |

---

## State Synchronization

The frontend maintains a shadow of session state in Zustand stores. The agent is the source of truth.

| State | Frontend (Zustand) | Agent (AgentCore) |
|-------|-------------------|-------------------|
| Session ID | `connection.sessionId` | `session.sessionId` |
| Turn count | `conversation.turnCount` | `session.turnCount` |
| Token count | `conversation.tokenCount` | `session.tokenCount` |
| Session state | `connection.state` | `session.state` |
| Rate limits | `visitor.rateLimits` (optimistic) | Authoritative enforcement |
| Memory | Not stored client-side | AgentCore Memory |

On `agent_turn_complete`, frontend syncs counters from the payload. On `session_state_change`, frontend transitions to the new state unconditionally.
