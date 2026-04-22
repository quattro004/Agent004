# Tasks: Max Height AI Character

**Input**: Design documents from `specs/001-max-height-ai-character/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Per constitution P10 ("PRs that add or modify behavior MUST include corresponding test coverage"), test tasks are embedded within each user story phase. Vitest for frontend + agent, Jest for CDK, Playwright for E2E, AgentCore Evaluations for personality golden set.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Monorepo** (npm workspaces): `packages/frontend/`, `packages/agent/`, `packages/infra/`
- Paths follow `plan.md` §Project Structure

## Coverage Gap Fixes Applied

This regeneration addresses the following coverage gaps from cross-artifact analysis:

| ID | Issue | Fix |
|----|-------|-----|
| C1 | Personality gate evaluation missing (P3) | Added T069–T070 in Phase 3: build + run 50-case golden-set via AgentCore Evaluations |
| C2 | Observability trace spans missing (P9) | Added T017 in Phase 2: wire AgentCore Observability + 5 custom latency spans |
| C3 | WebSocket Lambda handler missing | Added T020 in Phase 2: dedicated handler code; updated plan.md §Project Structure |
| K1 | Tests deferred to Phase 8 (violates P10) | Embedded test tasks within each user story phase |
| I1 | Session cap missing 30-min limit | T041 now enforces all 3 caps: 50 turns, 20K tokens, 30 minutes |
| I2 | SC-008 references undefined scenario codes | Mobile parity task references US1–US3 acceptance scenarios |
| B1 | FR-018 export misleading in MVP | T066 clarifies MVP export is localStorage-only |
| B2 | R3F claimed V1-only but used in MVP | T063/T065 clarify R3F is an MVP dependency for CRT effects |
| I3 | displayAlias collection V1-only | Added T068 note: MVP stores alias in localStorage via session_start payload |

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize the TypeScript monorepo, tooling, and per-package scaffolding.

- [ ] T001 Initialize npm workspaces monorepo with root package.json (workspaces: packages/*), .npmrc, Zod override (overrides: { "zod": "^4.3.6" }), and .nvmrc (Node 24 LTS)
- [ ] T002 Create full directory structure per plan.md §Project Structure (packages/frontend/src/{components,hooks,stores,services,audio,effects,types}, packages/frontend/public/greetings/{audio}, packages/agent/src/{personality,tools,memory,handlers,types}, packages/agent/tests, packages/infra/lib/{handlers}, packages/infra/tests)
- [ ] T003 [P] Configure TypeScript with root tsconfig.json (strict, ESNext module, NodeNext resolution) and per-package tsconfig.json files extending root in packages/frontend/, packages/agent/, packages/infra/
- [ ] T004 [P] Configure ESLint + Prettier for TypeScript monorepo with shared flat config in eslint.config.js and .prettierrc at repo root
- [ ] T005 [P] Initialize React 19 + Vite 8 SPA in packages/frontend/ (package.json with react 19.x, vite 8.x, zustand 5.x, three.js, @react-three/fiber 9.x — R3F is an MVP dependency for CRT effects and wireframe backdrop per research.md R3b/R3e; vite.config.ts with React plugin; index.html entry point; src/main.tsx bootstrap)
- [ ] T006 [P] Scaffold Strands agent project in packages/agent/ (package.json with @strands-agents/sdk, @aws-sdk/client-bedrock-runtime; AgentCore-compatible entry point with /invocations POST and /ping GET endpoints; Dockerfile targeting LINUX_ARM64, port 8080, non-root user, <200MB image)
- [ ] T007 [P] Initialize CDK app in packages/infra/ (package.json with aws-cdk-lib 2.250+, @aws-cdk/aws-bedrock-agentcore-alpha; cdk.json; empty bin/app.ts shell)
- [ ] T008 [P] Configure Vitest workspace for packages/frontend and packages/agent (vitest.workspace.ts at root, per-package vitest.config.ts, shared setup with @testing-library/jest-dom matchers, jsdom environment for frontend)
- [ ] T009 [P] Configure Jest for packages/infra with CDK assertions (jest.config.ts with ts-jest transform, aws-cdk-lib/assertions import)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core types, state management, observability, connection infrastructure, Lambda handler, and CDK stacks that MUST be complete before ANY user story can be implemented.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Types

- [ ] T010 [P] Define WebSocket message types in packages/frontend/src/types/messages.ts (all client→server and server→client message interfaces per websocket-api.md: SessionStartPayload, UserMessagePayload, InterruptPayload, SessionResumePayload, SessionEndPayload, ConnectionAckPayload, AgentTokenPayload, AgentTurnCompletePayload, SessionStateChangePayload, ErrorPayload; union discriminated by type field)
- [ ] T011 [P] Define domain types in packages/frontend/src/types/domain.ts (SessionState enum with 8 values per data-model.md, Greeting interface with id/archetype/text/audioPath/audioDurationMs/weight/tags, GreetingArchetype enum with 8 archetypes, Visitor interface, RateLimitState interface with hourly/daily counters and windows)
- [ ] T012 [P] Define agent types in packages/agent/src/types/index.ts (AgentConfig interface, PersonalityConfig, StutterMarker, Memory interface with memoryId/actorId/type/content/sourceSessionId/extractedAt/expiresAt per data-model.md, MemoryType enum: FACT/PREFERENCE/SUMMARY/TOPIC, SessionMetadata interface)

### Zustand Stores

- [ ] T013 [P] Create Zustand connection store in packages/frontend/src/stores/connectionStore.ts (state: SessionState, sessionId, agentCoreSessionId, WebSocket ready flag, actions: setConnected, setSessionState, reset)
- [ ] T014 [P] Create Zustand conversation store in packages/frontend/src/stores/conversationStore.ts (turnCount, tokenCount, currentResponseText, isStreaming, currentTurnIndex, actions: appendToken, setFullText, incrementTurn, updateCounters, reset)
- [ ] T015 [P] Create Zustand voice store in packages/frontend/src/stores/voiceStore.ts (isSpeaking, audioContextState, isMicActive, isMouthOpen, actions: setSpeaking, setMouthOpen, setMicActive)
- [ ] T016 [P] Create Zustand visitor store in packages/frontend/src/stores/visitorStore.ts (actorId loaded from localStorage or generated UUID, displayAlias, greetingHistory array, rateLimitCounters: RateLimitState, actions: setDisplayAlias, pushGreeting, updateRateLimits, clearAll)

### Observability (Constitution P9)

- [ ] T017 Wire AgentCore Observability and add custom trace spans in packages/agent/src/handlers/observability.ts (enable AgentCore auto-collected traces/logs per research.md R2 — logs to /aws/bedrock-agentcore/runtimes/{name}, X-Ray via OpenTelemetry instrumentation; add custom trace spans for ALL 5 performance targets per constitution P9 MUST language: span "reply.first_token" for 1.5s P95 first reply token, span "voice.audio_start" for 2.5s P95 voice audio start, span "greeting.delivery" for 2s P95 greeting after TV-on, span "session.cold_start" for 5s P95 cold start, span "crt.frame_rate" for 60fps CRT effects on desktop; each span records measured latency as attributes for dashboarding and alerting)

### Connection Infrastructure

- [ ] T018 Implement WebSocket manager service in packages/frontend/src/services/websocketManager.ts (open wss:// via SigV4 presigned URL, message serialize/deserialize per websocket-api.md wire format, reconnection with exponential backoff 1s→2s→4s up to 3 retries, session_resume on reconnect with lastReceivedTurnIndex, pong response to server ping, max 32KB message size, close code handling: 1000/1001/4000/4001/4002/4008/4500)
- [ ] T019 [P] Implement Cognito guest auth service in packages/frontend/src/services/cognitoAuth.ts (CognitoIdentityClient from @aws-sdk/client-cognito-identity, guest identity pool flow, temporary AWS credential retrieval, SigV4 presigned WebSocket URL generation with 5-minute TTL, auto-refresh before expiry)

### WebSocket Lambda Handler (C3 Fix)

- [ ] T020 Implement WebSocket Lambda handler in packages/infra/lib/handlers/websocket-handler.ts ($connect route: validate SigV4 auth from Cognito guest credentials, extract identity from request context, store connectionId in DynamoDB connections table, return 200; $disconnect route: clean up DynamoDB connection mapping, trigger session_end if active session; $default route: parse incoming JSON message per websocket-api.md wire format, route session_start/user_message/interrupt/session_resume/session_end to AgentCore InvokeAgentRuntime via @aws-sdk/client-bedrock-agent-runtime, stream agent response chunks back through API Gateway Management API as agent_token frames, send agent_turn_complete on stream end; error handling: catch and return error frames for rate limits, input validation, and internal errors)

### CDK Infrastructure Stacks

- [ ] T021 Implement CDK CognitoStack in packages/infra/lib/cognito-stack.ts (CfnIdentityPool with unauthenticated access, IAM role with bedrock-agentcore:InvokeAgentRuntime + polly:SynthesizeSpeech scoped to neural engine + Matthew voice via conditions, stack outputs for IdentityPoolId)
- [ ] T022 [P] Implement CDK BudgetStack in packages/infra/lib/budget-stack.ts (CfnBudget $10/month with SNS topic alerts at $5 and $8 thresholds, EventBridge rule + Lambda function for $10 hard-stop that detaches IAM policy from Cognito guest role)
- [ ] T023 [P] Implement CDK AgentStack in packages/infra/lib/agent-stack.ts (AgentCore Memory construct with semantic + summary + userPreferences strategies per research.md R2, WebSocket API Gateway with $connect/$disconnect/$default routes pointing to Lambda handler from T020, stage deployment, stack outputs for WebSocket endpoint URL)
- [ ] T024 [P] Implement CDK FrontendStack in packages/infra/lib/frontend-stack.ts (S3 bucket with OAI, CloudFront distribution with default root index.html, error page routing for SPA, stack outputs for distribution URL and bucket name)

### Phase 2 Tests (P10 Compliance)

- [ ] T025 [P] Write Vitest unit tests for Zustand stores in packages/frontend/tests/stores/ (connectionStore: state transitions for all 8 SessionState values + reset; conversationStore: appendToken + setFullText + counter updates; voiceStore: speaking/mouth/mic toggles; visitorStore: actorId generation + localStorage persistence + rate limit reset logic)
- [ ] T026 [P] Write Vitest unit tests for WebSocket manager in packages/frontend/tests/services/websocketManager.test.ts (message serialization/deserialization, reconnection backoff timing, session_resume payload construction, close code handling, max retries exceeded → SIGNAL_LOST)
- [ ] T027 [P] Write Jest CDK snapshot tests in packages/infra/tests/ (Template.fromStack() assertions for CognitoStack: identity pool + IAM roles, BudgetStack: budget resource + SNS + Lambda, AgentStack: API Gateway WebSocket + Lambda integration + Memory, FrontendStack: S3 + CloudFront + OAI)

**Checkpoint**: Foundation ready — observability wired, trace spans defined, all infrastructure deployed, user story implementation can begin.

---

## Phase 3: User Story 1 — First Visit: "Turn on the TV" (Priority: P1) 🎯 MVP

**Goal**: A visitor opens the page, sees a CRT TV, clicks the knob, hears Max greet in-character within 2s, and has a full stuttering/evasive/editorial text+voice conversation. All session caps (50 turns, 20K tokens, 30 minutes), rate limits, error states, and budget degradation are functional.

**Independent Test**: Open the page, click the TV knob, hear Max's greeting, type a message, and receive an in-character voice+text response with stutters and evasive personality. Verify idle nudge fires on silence. Verify session caps and error states.

### Tests for User Story 1 (P10 Compliance)

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T028 [P] [US1] Write Vitest tests for greeting selector in packages/frontend/tests/services/greetingSelector.test.ts (weighted random selection, no-repeat-within-3-sessions filter, time-of-day tag preference, pool exhaustion fallback to 1-session window, greetingHistory trim to 20 entries)
- [ ] T029 [P] [US1] Write Vitest tests for stutter injection and personality guard in packages/agent/tests/personality/ (stutter count enforcement: inject if below minimum, marker format "M-M-Max", evasiveness check: flag straight factual answers, editorial voice marker verification, prompt-injection deflection stays in character per FR-013)
- [ ] T030 [P] [US1] Write Vitest tests for session manager cap enforcement in packages/agent/tests/handlers/sessionManager.test.ts (session ends at 50 turns OR 20,000 tokens OR 30 minutes — whichever first per data-model.md + NFR §Cost Protection; in-character sign-off generated; session_state_change→ENDED emitted; counter tracking accuracy)
- [ ] T031 [P] [US1] Write Vitest tests for Polly TTS service in packages/frontend/tests/services/pollyTts.test.ts (dual Promise.all call structure, SSML wrapping with pitch +10% rate 105%, retry on 429 after 500ms, text-only fallback on second failure, truncation at 2900 chars)
- [ ] T032 [P] [US1] Write component tests for CRT frame + TV knob + Avatar2D in packages/frontend/tests/components/ (CrtFrame renders bezel + screen slot; TvKnob click triggers session start + AudioContext unlock; Avatar2D toggles mouth-open/mouth-closed SVG paths based on isMouthOpen prop)

### Greeting System

- [ ] T033 [P] [US1] Author 16 greeting texts (2 per archetype × 8 archetypes per personality bible §5) and create greeting manifest in packages/frontend/public/greetings/manifest.json per greeting-manifest.md contract schema (version, voiceConfig with Matthew/neural/+10%/105%, greetings array with id/archetype/text/audioPath/audioDurationMs/weight/tags, minItems: 16)
- [ ] T034 [P] [US1] Synthesize 16 greeting MP3 audio files using Amazon Polly Neural Matthew voice with SSML pitch +10% rate 105% and place in packages/frontend/public/greetings/audio/ (greeting-001.mp3 through greeting-016.mp3, measure actual duration for audioDurationMs field)
- [ ] T035 [US1] Implement greeting selector service in packages/frontend/src/services/greetingSelector.ts (load manifest.json on init, read greetingHistory from visitor store, filter out IDs used in last 3 sessions, prefer time-of-day matching tags, weighted random selection from remaining pool, push selected ID to history and trim to 20 entries, pool exhaustion fallback: reduce no-repeat window to 1 session)

### Agent Personality + Turn Processing

- [ ] T036 [US1] Implement personality system prompt builder in packages/agent/src/personality/systemPrompt.ts (construct system prompt from docs/max-personality-bible.md context: stuttering taxonomy, editorial mode rules, evasive response guidelines, catchphrase triggers, ironic tone directives; inject displayAlias if known from session_start payload; inject visitor memory context placeholder for V1; include two-mode personality directive per FR-007: (1) without tool data — never give straight factual answers, be evasive and editorial; (2) with tool data — report factual content from tools accurately but always in-character with stutters, editorial commentary, and ironic framing; include directive to never fabricate news or weather results; include directive to ask visitor's name within first 3 turns of a new visitor's first session per R6c — response stored client-side as displayAlias in MVP, server-side via AgentCore Memory in V1)
- [ ] T037 [P] [US1] Implement stutter injection post-processor in packages/agent/src/personality/stutterInjection.ts (count stutters in LLM response text, if below minimum threshold inject character-consistent stutters as repeated syllables e.g. "M-M-Max", "th-th-the", mark stutter positions in text for frontend audio processing)
- [ ] T038 [P] [US1] Implement personality guard in packages/agent/src/handlers/personalityCheck.ts (verify response evasiveness — flag if response gives straight factual answer WITHOUT tool data backing it, check stutter count meets minimum, verify editorial voice markers present, verify response contains at least 1 complete sentence per FR-009 minimum length, detect and deflect prompt-injection attempts per FR-013 — stay in character and find it funny; tool-augmented responses: factual content from tools is allowed when presented in-character per FR-007 two-mode rule — flag only if tool data is fabricated or persona is dropped)
- [ ] T039 [US1] Implement Strands agent entry point in packages/agent/src/index.ts (create agent via @strands-agents/sdk agent factory, configure Bedrock model global.anthropic.claude-haiku-4-5-20251001-v1:0, inject system prompt from T036, register tools from T114/T115 via tool bindings so LLM can invoke them autonomously based on user queries, enable streaming via agent.stream() async generator for token-by-token delivery, configure max output tokens to 120 per FR-009, wire observability trace spans from T017; web search tool T116 registered in V1)
- [ ] T040 [US1] Implement turn handler in packages/agent/src/handlers/turnHandler.ts (receive user_message from WebSocket Lambda, validate turnCount ≤ 50 and tokenCount ≤ 20000 and duration ≤ 30 min, invoke Strands agent with user text, stream agent_token frames to client, collect full response, run through personality guard T038 + stutter injection T037, emit agent_turn_complete with fullText and updated counters per message-protocol.md §Agent Responsibilities, start "reply.first_token" trace span on message receipt and end on first token emit)
- [ ] T041 [US1] Implement session manager in packages/agent/src/handlers/sessionManager.ts (session_start: create session with actorId namespace, load greeting context, init caps and start timer; session_resume: restore session from agentCoreSessionId; session_end: cleanup; cap enforcement: emit session_state_change→ENDED when ANY of these triggers: turnCount reaches 50, tokenCount reaches 20,000, or session duration reaches 30 minutes — whichever first, with in-character sign-off per data-model.md + NFR §Cost Protection; state machine transitions per data-model.md SessionState enum; start "session.cold_start" trace span on session_start and end on connection_ack)
- [ ] T042 [P] [US1] Implement idle nudge handler in packages/agent/src/handlers/idleNudge.ts (start random 4–10s timer after greeting completes, if no user_message received within window deliver one in-character prod as agent_turn_complete, set idleNudgeDelivered=true, cancel timer if user_message arrives first, never fire more than once per message-protocol.md §Idle Nudge Protocol)

### Agent Tools (FR-029, FR-030)

- [ ] T114 [P] [US1] Define news tool in packages/agent/src/tools/newsTool.ts using Strands `tool()` factory with Zod schema — accepts optional topic/query parameter, returns structured news data (headlines, summaries, source attribution). Calls external news API (provider selected in research.md §R7). On failure: return structured error that the agent can riff on in-character per tool-failure edge case. Max MUST NOT fabricate news per FR-029.
- [ ] T115 [P] [US1] Define weather tool in packages/agent/src/tools/weatherTool.ts using Strands `tool()` factory with Zod schema — accepts location parameter (city/region), returns structured weather data (temperature, conditions, forecast). Calls external weather API (provider selected in research.md §R7). On failure: return structured error for in-character riffing. Max MUST NOT fabricate weather per FR-030.
- [ ] T117 [US1] Wire news and weather tools into Strands agent entry point in T039 (packages/agent/src/index.ts) — register tools with the agent via tool bindings so the LLM can invoke them autonomously based on user queries per FR-029/FR-030. Depends on T114, T115. (Web search tool T116 wired in V1.)
- [ ] T118 [P] [US1] Write Vitest tests for tool definitions and tool-result personality formatting in packages/agent/tests/tools/ — verify news and weather tool Zod schemas validate correctly, verify tool-failure handling returns structured error for in-character fallback, verify the agent does not fabricate data when tools return empty results per tool-hallucination-guard edge case. (Web search tool tests added when T116 is implemented in V1.)

> **T116 (web search tool)** is deferred to Phase 6 (V1). See §Phase 6 below.

### UI Components

- [ ] T043 [P] [US1] Create CRT TV frame component in packages/frontend/src/components/CrtFrame.tsx (CRT bezel with rounded inner corners, slot for screen content — avatar and broadcast text, retro TV shell styling with period-appropriate colors, container for shader/CSS scanline overlay)
- [ ] T044 [P] [US1] Create TV knob component in packages/frontend/src/components/TvKnob.tsx (rotary knob visual on the CRT bezel, click/tap handler that triggers session start sequence and unlocks AudioContext via user gesture for iOS autoplay compliance, animated rotation on click, disabled/hidden after TV is on)
- [ ] T045 [P] [US1] Create SVG 2D avatar component in packages/frontend/src/components/Avatar2D.tsx (head-and-shoulders wireframe SVG in cyan/magenta on black palette per spec §Visual Presentation, two path elements: mouth-open and mouth-closed toggled via isMouthOpen prop, CSS class toggle at 20Hz update rate driven by audio energy)
- [ ] T046 [P] [US1] Create text input component in packages/frontend/src/components/TextInput.tsx (always visible below TV frame per FR-026, submit on Enter key, maxLength 2000 chars per websocket-api.md rate limits, disabled during ENDED/BUDGET_CAPPED/SIGNAL_LOST states, retro monospace terminal styling)
- [ ] T047 [P] [US1] Create broadcast text display in packages/frontend/src/components/BroadcastText.tsx (progressive token-by-token rendering from agent_token events, replace with canonical fullText on agent_turn_complete, broadcast mode — current response only with no scrollable history per FR-026, visitor's last input shown briefly then replaced)
- [ ] T048 [P] [US1] Create buffering overlay in packages/frontend/src/components/BufferingOverlay.tsx (in-character "tuning in" / "buffering" animation shown during cold start per FR-011 until connection_ack, "Max is thinking" indicator during turn processing, CRT-themed static/noise visuals)
- [ ] T049 [P] [US1] Create session state overlay in packages/frontend/src/components/SessionStateOverlay.tsx (render appropriate in-character message per SessionState: ENDED→sign-off, BUDGET_CAPPED→"Max is taking a break" per FR-015, RATE_LIMITED→in-character refusal per FR-020, SIGNAL_LOST→in-character error per FR-014, ERROR→friendly error)

### Voice Output Pipeline

- [ ] T050 [US1] Implement Polly TTS service in packages/frontend/src/services/pollyTts.ts (dual Promise.all() per polly-tts.md contract: call 1 — SynthesizeSpeech with Engine neural, VoiceId Matthew, OutputFormat mp3, SampleRate 24000, TextType ssml wrapping response in <prosody pitch="+10%" rate="105%">; call 2 — SynthesizeSpeech with OutputFormat json and SpeechMarkTypes ["viseme"] for V1 prep; use @aws-sdk/client-polly v3 with Cognito credentials; error handling: retry once on 429 after 500ms, fallback to text-only on second failure, truncate at 2900 chars if over limit; start "voice.audio_start" trace span on call initiation)
- [ ] T051 [P] [US1] Implement AudioWorklet stutter processor in packages/frontend/src/audio/stutterProcessor.ts (AudioWorkletProcessor subclass, circular ring buffer that replays last ~50ms of audio for segments marked as stutters by the agent, stutter boundaries identified from text markers like "M-M-Max")
- [ ] T052 [P] [US1] Implement AudioWorklet pitch shift processor in packages/frontend/src/audio/pitchProcessor.ts (AudioWorkletProcessor subclass, slight upward pitch shift for "digital" quality characteristic of the character)
- [ ] T053 [P] [US1] Implement AudioWorklet EQ boost processor in packages/frontend/src/audio/eqProcessor.ts (AudioWorkletProcessor subclass, 4–6 kHz band boost for nasal quality per research.md R4, parametric EQ implementation)
- [ ] T054 [P] [US1] Implement AudioWorklet static burst processor in packages/frontend/src/audio/staticProcessor.ts (AudioWorkletProcessor subclass, inject brief white noise burst at stutter boundaries to simulate signal interference)
- [ ] T055 [US1] Create audio chain orchestrator in packages/frontend/src/audio/audioChain.ts (manage AudioContext lifecycle, register and connect AudioWorklet processors in sequence: source → stutter → pitch → EQ → static → analyser → destination, AnalyserNode FFT for low-frequency energy at 20Hz update rate with threshold ~100 in 0–500Hz band → drive isMouthOpen, decode MP3 via decodeAudioData → AudioBufferSourceNode, start/stop/interrupt playback methods)

### Frontend Hooks

- [ ] T056 [US1] Implement useWebSocket hook in packages/frontend/src/hooks/useWebSocket.ts (bridge WebSocket manager to Zustand stores: on connection_ack→update connectionStore, on agent_token→appendToken in conversationStore, on agent_turn_complete→setFullText+updateCounters, on session_state_change→setSessionState, on error→handle per message-protocol.md; expose sendMessage/sendInterrupt/startSession/endSession actions)
- [ ] T057 [P] [US1] Implement useAudio hook in packages/frontend/src/hooks/useAudio.ts (on agent_turn_complete trigger Polly TTS service T050, feed decoded audio into AudioWorklet chain T055, expose isMouthOpen from AnalyserNode energy for Avatar2D, handle playback lifecycle: start on TTS ready, stop on interrupt or session end, update voiceStore.isSpeaking)
- [ ] T058 [P] [US1] Implement useGreeting hook in packages/frontend/src/hooks/useGreeting.ts (on TV-on select greeting via selector service T035, play pre-generated MP3 audio through audio chain, sync greeting audio to mouth animation, coordinate timing: greeting plays while agent boots in background per FR-002, push greeting ID to visitor store history, start "greeting.delivery" trace span on TV-on gesture)

### Interruption + Error Handling

- [ ] T059 [US1] Implement interrupt manager in packages/frontend/src/services/interruptManager.ts (detect new user input while isSpeaking=true, immediately stop audio playback via audioChain.stop(), clear progressive text in conversationStore, send interrupt frame with current turnIndex then new user_message with incremented turnIndex per message-protocol.md §Interruption, agent may acknowledge interruption in-character per FR-027)
- [ ] T060 [P] [US1] Implement client-side rate limiter in packages/frontend/src/services/rateLimiter.ts (check hourlyCount < 60 and dailyCount < 500 before sending user_message, increment counters in visitorStore, persist to localStorage, reset hourly window on each hour and daily window at UTC midnight, return rate-limited flag to block send and show in-character message per FR-020)
- [ ] T061 [US1] Implement error recovery service in packages/frontend/src/services/errorRecovery.ts (on WebSocket message failure: auto-retry once silently within 3s per FR-028, on retry failure: transition to SIGNAL_LOST via connectionStore, on Polly failure: set voiceStore.isSpeaking=false and show text-only response, token timeout: warning at 3s and SIGNAL_LOST at 10s per message-protocol.md §Error Recovery Matrix)
- [ ] T062 [US1] Implement budget degradation handler in packages/frontend/src/services/budgetDegradation.ts (listen for session_state_change events, on BUDGET_CAPPED: show "Max is taking a break" overlay per FR-015, implement $8 soft-degrade path: disable Polly TTS calls + continue text-only conversation per FR-016, $10 hard-stop: disable all interaction)

### Visual Effects

- [ ] T063 [P] [US1] Implement CRT shader effects in packages/frontend/src/effects/crtShader.ts (WebGL fragment shader via Three.js/React Three Fiber 9.x EffectComposer + ShaderPass — NOTE: R3F is an MVP dependency per research.md R3b, not V1-only: scanlines with adjustable frequency, chromatic aberration RGB offset, barrel distortion curve, random glitch tear bands, audio-driven glitch intensity via shader uniforms, constant low-level glitching even when idle per spec §Visual Presentation; record "crt.frame_rate" trace metric at 1Hz sample rate)
- [ ] T064 [P] [US1] Implement CSS CRT fallback in packages/frontend/src/effects/crtFallback.css (repeating-linear-gradient scanline overlay at reduced opacity, subtle CSS animation for flicker, applied when WebGL unavailable or on mobile per research.md R3b)
- [ ] T065 [US1] Implement wireframe backdrop in packages/frontend/src/effects/WireframeBackdrop.tsx (React Three Fiber 9.x component — R3F is an MVP dependency per research.md R3e — with Three.js LineSegments + EdgesGeometry for rotating cubes and pyramids, cyan/magenta glowing line material on black background, continuous slow rotation, reduced object count on mobile viewport)

### Data Management + Accessibility + Assembly

- [ ] T066 [P] [US1] Implement data manager service in packages/frontend/src/services/dataManager.ts (forgetMe(): single-click clear of all localStorage: actorId, displayAlias, greetingHistory, rateLimitCounters per FR-017, reset all Zustand stores; exportData(): in MVP this exports localStorage data ONLY — actorId, displayAlias, greetingHistory, session metadata — as a JSON file download per FR-018; NOTE: no server-side memory exists in MVP so "export what Max remembers" means exporting the client-side visitor profile; V1 upgrade in T091 adds AgentCore Memory data)
- [ ] T067 [US1] Implement keyboard navigation and focus indicators across all interactive components (TV knob, text input, controls: all reachable via Tab, activatable via Enter/Space per R6a; :focus-visible CSS with CRT-themed glowing cyan outline; logical tab order: TV knob → text input → settings/menu items; no keyboard traps; style in packages/frontend/src/index.css or per-component)
- [ ] T068 [US1] Assemble main App page in packages/frontend/src/App.tsx (compose CrtFrame containing Avatar2D + WireframeBackdrop + BroadcastText with CRT effects overlay, TvKnob on bezel, TextInput below TV, BufferingOverlay + SessionStateOverlay as conditional layers, wire all hooks: useWebSocket + useAudio + useGreeting, initialize Cognito auth on mount, gate interaction behind TV-on gesture, environment config from VITE_* env vars; NOTE on displayAlias in MVP: when agent asks "what do they call you?" per R6c system prompt directive T036, the frontend extracts the visitor's response from the conversation and stores it in visitorStore.displayAlias + localStorage; on subsequent sessions the stored displayAlias is sent in the session_start payload per websocket-api.md — full AgentCore Memory-backed extraction deferred to Phase 6/V1)

### Personality Gate Evaluation (Constitution P3 — Hard Gate)

- [ ] T069 [US1] Build 50-case golden-set evaluation configuration for AgentCore Evaluations in packages/agent/tests/evaluations/personality-gate.ts (define 50 test cases from docs/max-personality-bible.md §9 golden set covering all 6 personality dimensions: stuttering fidelity, editorial mode, evasiveness, ironic tone, catchphrase usage, factual deflection; include at least 5 late-conversation coherence cases simulating turns 40–50 to validate SC-005 endurance; include tool-invocation test cases per SC-002 update: verify Max reports news/weather tool results accurately and in-character, verify Max does not fabricate news/weather when no tool data is available, verify tool-failure deflection stays in-character; web search tool-augmented test cases deferred to V1 when T116 is implemented; configure AgentCore Evaluations async batch runner with LLM-as-judge scoring rubric per constitution P5 — offline only, never in hot path; define pass criteria: SC-001 avg ≥ 2.0 across all dimensions on 50 cases, SC-002 zero factual failures on editorial dimension AND zero fabrication failures on tool-augmented cases)
- [ ] T070 [US1] Run personality gate evaluation and validate results (execute AgentCore Evaluations batch against deployed agent, verify SC-001: golden-set average ≥ 2.0 across 6 dimensions, verify SC-002: zero auto-failure triggers on factual prompts, document results in evaluation report; **HARD GATE per constitution P3**: no Phase 6+ visual/audio polish or stretch features may proceed until this gate passes; if gate fails, iterate on system prompt T036 and personality guard T038 until passing)

**Checkpoint**: User Story 1 should be fully functional and independently testable — open page, click TV knob, hear greeting, converse with Max in voice+text. Personality gate passed.

---

## Phase 4: User Story 2 — Mobile Visitor on iOS Safari (Priority: P2) [MVP]

**Goal**: Full functional parity on iOS Safari and mobile browsers — audio plays on tap, effects are reduced, and voice input works via press-and-hold mic.

**Independent Test**: Open on iPhone iOS 16+ Safari, tap TV knob, verify greeting audio plays, verify reduced visual effects, hold mic button and verify "ON AIR" indicator + voice capture, release to submit.

### Tests for User Story 2 (P10 Compliance)

- [ ] T071 [P] [US2] Write Vitest tests for iOS AudioContext unlock and mobile effect detection in packages/frontend/tests/audio/audioChain.test.ts and packages/frontend/tests/effects/ (AudioContext.resume() called inside user gesture handler, visibilitychange handler registered for iOS Safari 16–16.3, matchMedia mobile detection triggers CSS fallback and reduced wireframe objects)
- [ ] T072 [P] [US2] Write component tests for MicButton and SpeechDisclosure in packages/frontend/tests/components/ (MicButton: pointerdown starts capture + shows ON AIR, pointerup stops + submits, disabled when mic unavailable; SpeechDisclosure: shows provider name on first activation, persists dismissal to localStorage)

### Implementation for User Story 2

- [ ] T073 [US2] Implement iOS AudioContext unlock on tap gesture in packages/frontend/src/audio/audioChain.ts (create and resume AudioContext inside TV-knob click/tap handler for iOS Safari autoplay compliance, add visibilitychange handler for iOS Safari 16–16.3 audio routing issues per research.md R3c)
- [ ] T074 [P] [US2] Implement mobile effect reduction in packages/frontend/src/effects/crtShader.ts and packages/frontend/src/effects/WireframeBackdrop.tsx (detect mobile via matchMedia or viewport width, switch from WebGL shader to CSS fallback per T064, reduce wireframe object count, lower constant glitch intensity per spec §Visual Presentation)
- [ ] T075 [US2] Create press-and-hold mic button in packages/frontend/src/components/MicButton.tsx (visible "ON AIR" indicator while held per FR-008, capture audio only while pressed via pointerdown/pointerup, release finalizes and submits transcript, disabled state when mic unavailable, retro styling matching CRT theme)
- [ ] T076 [US2] Implement useSpeech hook in packages/frontend/src/hooks/useSpeech.ts (Web Speech API SpeechRecognition, start on mic hold and stop on release, collect interim + final results, send final transcript as user_message with inputMethod: "voice" via useWebSocket, error handling: in-character "bad signal" message on recognition failure prompting text input per message-protocol.md §Voice Input Protocol)
- [ ] T077 [US2] Create speech disclosure component in packages/frontend/src/components/SpeechDisclosure.tsx (explicit modal on first mic activation naming browser's speech provider — Google on Chrome, Apple on Safari — per FR-019, persistent small-print notice positioned at mic button control, disclosure state tracked in localStorage)
- [ ] T078 [P] [US2] Implement mobile responsive layout in packages/frontend/src/App.tsx and component CSS (responsive CRT frame sizing for portrait/landscape, touch-friendly control sizing ≥44px tap targets, viewport meta tag, safe area insets for iOS notch/dynamic island)
- [ ] T079 [US2] Wire mic button into App page in packages/frontend/src/App.tsx (add MicButton to controls area, connect useSpeech hook → useWebSocket → agent flow, show speech disclosure on first activation, add to tab order after text input per T067; verify all US1 + US2 acceptance scenarios pass on iOS Safari 16+ and Android Chrome per SC-008 mobile parity requirement — NOTE: SC-008 references "S1–S4, F1–F2, F4–F5" which map to US1 scenarios 1–4, US2 scenarios 1–3, and US3 scenarios 1–2)

**Checkpoint**: Full mobile + voice input experience works on iOS Safari and Android Chrome alongside desktop.

---

## Phase 5: User Story 3 — Text-Only Visitor (Mic Blocked) (Priority: P2) [MVP]

**Goal**: Visitors with blocked or unavailable microphones have an identical personality experience via text input, with no prompts to enable mic.

**Independent Test**: Open the page with mic permissions denied, type a message, verify Max responds with voice audio + text, verify no mic-related notifications or nags appear.

### Tests for User Story 3 (P10 Compliance)

- [ ] T080 [P] [US3] Write Vitest tests for mic detection and no-nag fallback in packages/frontend/tests/services/micDetection.test.ts and packages/frontend/tests/components/MicButton.test.ts (mic probe catches NotAllowedError/NotFoundError correctly, isMicAvailable=false hides mic button entirely, no notification/modal/banner rendered when mic blocked, text input remains enabled, devicechange event updates mic availability)

### Implementation for User Story 3

- [ ] T081 [P] [US3] Implement mic availability detection in packages/frontend/src/services/micDetection.ts (probe navigator.mediaDevices.getUserMedia for audio, catch NotAllowedError and NotFoundError, expose isMicAvailable boolean to visitor store, handle mid-session permission revocation via devicechange event)
- [ ] T082 [US3] Implement no-nag mic fallback behavior in packages/frontend/src/components/MicButton.tsx and packages/frontend/src/App.tsx (when isMicAvailable=false: hide mic button entirely or render as inert, never show notification, modal, or banner asking to enable mic per acceptance scenario 2, text input remains always available per FR-012)
- [ ] T083 [US3] Validate text-only conversation path (ensure text input → useWebSocket → agent → streaming text + Polly audio response pipeline works identically without mic, verify Max's personality quality is not degraded in text-only mode, verify FR-012 compliance: text input always functional regardless of mic state)

**Checkpoint**: All MVP user stories (US1 + US2 + US3) work independently and together. **MVP SHIP GATE**: All [MVP] acceptance scenarios pass + first-laugh metric (SC-003).

### SC-003 First-Laugh Ship Gate (Manual)

- [ ] T119 [US1] Execute SC-003 first-laugh metric test: recruit N=5 newcomer testers (no prior Max Headroom knowledge), have each complete the first-visit flow (US1: turn on TV → greeting → 5 exchanges), record observable delight signals (audible laugh, smile + verbal reaction, screenshot, or unprompted share) per tester. Pass criteria: ≥3 of 5 testers produce a delight signal within the first 5 responses. Document results. **HARD GATE**: MVP does not ship until SC-003 passes.

---

## Phase 6: User Story 4 — Returning Visitor Memory (Priority: P3) [V1]

**Goal**: Max remembers visitors across sessions via AgentCore Memory — referencing prior-session facts, collecting displayAlias in-character via server-side extraction, and supporting data export + wipe + per-item deletion.

**Independent Test**: Complete a session discussing a specific topic, close browser, reopen within 30 days, verify Max references the prior topic within 3 turns. Test "Forget me" wipe and verify next visit is treated as new. Test per-item memory deletion.

### Tests for User Story 4 (P10 Compliance)

- [ ] T084 [P] [US4] Write Vitest tests for memory adapter and extraction pipeline in packages/agent/tests/memory/ (memoryAdapter: namespace creation /max-height/{actorId}/, retrieve returns memories within 30-day window, wipe clears all entries, 30-day expiry calculated from lastSeenAt; memoryExtractor: fact extraction from conversation text, preference detection, name-response pattern → displayAlias, summary generation, deduplication)
- [ ] T085 [P] [US4] Write integration tests for displayAlias server-side collection flow in packages/agent/tests/memory/displayAlias.test.ts (agent asks name within 3 turns, visitor response extracted as displayAlias, stored in AgentCore Memory, loaded on subsequent session, null handling when declined)

### Implementation for User Story 4

- [ ] T086 [P] [US4] Implement AgentCore Memory adapter in packages/agent/src/memory/memoryAdapter.ts (connect to AgentCore Memory with namespace /max-height/{actorId}/, semantic + summary + userPreferences strategy access per research.md R2, retrieve memories for system prompt injection, 30-day rolling retention from visitor's lastSeenAt)
- [ ] T087 [P] [US4] Implement memory extraction pipeline in packages/agent/src/memory/memoryExtractor.ts (async post-turn extraction: identify facts, preferences, topics, conversation summaries from turn text, store as Memory entities per data-model.md with sourceSessionId, detect name-response patterns and extract displayAlias per R6c — upgrades MVP localStorage approach to server-side persistence)
- [ ] T088 [US4] Implement server-side displayAlias collection in packages/agent/src/personality/systemPrompt.ts (upgrade from MVP localStorage-only approach: memory extraction pipeline T087 now detects name-response patterns and stores displayAlias in AgentCore Memory, subsequent sessions load displayAlias from memory and inject into system prompt, fallback to session_start payload displayAlias if memory unavailable)
- [ ] T089 [US4] Implement memory-enhanced system prompt in packages/agent/src/personality/systemPrompt.ts (on session_start load visitor memories from AgentCore Memory via T086, inject prior-session facts into system prompt context, enable Max to reference specific prior topics within first 3 turns per FR-021, target ≥70% recall on 20-scenario golden set per SC-007)
- [ ] T090 [P] [US4] Implement server-side "Forget me" wipe in packages/agent/src/memory/memoryAdapter.ts (clear all AgentCore Memory entries for /max-height/{actorId}/ namespace, confirm wipe to frontend, coordinate with frontend localStorage clear from T066)
- [ ] T091 [P] [US4] Upgrade memory export to include AgentCore Memory data in packages/frontend/src/services/dataManager.ts (request full memory listing from agent via WebSocket custom message, merge with localStorage data, download as comprehensive JSON file per FR-018 — this upgrades the MVP localStorage-only export from T066)
- [ ] T092 [US4] Implement per-item memory deletion in packages/frontend/src/components/MemoryManager.tsx and packages/agent/src/memory/memoryAdapter.ts (UI listing stored memories with individual delete buttons per FR-025, agent-side delete by memoryId, real-time UI update on deletion)

### Web Search Tool (FR-031 [V1] — deferred from MVP)

- [ ] T116 [P] [US4] Define web search tool in packages/agent/src/tools/webSearchTool.ts using Strands `tool()` factory with Zod schema — accepts query string, returns search results in a format TBD. Delivery format and provider is an implementation detail to be resolved during V1 development per FR-031 [V1]. Wire into agent entry point (T039/packages/agent/src/index.ts) and add corresponding Vitest tests in packages/agent/tests/tools/. Update T069 golden-set with web search tool-augmented test cases.

### SC-007 Memory Continuity Evaluation (V1 Gate)

- [ ] T120 [P] [US4] Build 20-scenario memory golden-set evaluation configuration in packages/agent/tests/evaluations/memory-gate.ts (define 20 test scenarios covering: diverse topic recall, displayAlias recall, multi-session fact accumulation, 30-day retention edge, wipe-then-return blank slate, preference recall; each scenario = two-session sequence where session 1 establishes facts and session 2 checks recall within first 3 turns; configure AgentCore Evaluations async batch runner with scoring rubric: 1 = correct reference, 0 = missed/fabricated; pass criteria: ≥70% correct references across 20 scenarios per SC-007)
- [ ] T121 [US4] Run SC-007 memory continuity evaluation and validate results (execute AgentCore Evaluations batch against deployed agent with memory enabled, verify ≥14 of 20 scenarios produce correct prior-session references within 3 turns, document results; if gate fails, iterate on memory-enhanced system prompt T089 and memory extraction T087 until passing)

**Checkpoint**: Returning visitors experience personalized memory recall, and all data management controls work.

---

## Phase 7: User Story 5 — Mobile Install and Offline Launch (Priority: P3) [V1]

**Goal**: The site is installable as a PWA with standalone display, loads from cache when offline with in-character "signal lost", and auto-reconnects when connectivity returns.

**Independent Test**: Install to home screen, turn off network, launch app, verify "signal lost" in-character state appears from cache (not browser error). Turn network on and verify conversation re-enables automatically.

### Tests for User Story 5 (P10 Compliance)

- [ ] T093 [P] [US5] Write Vitest tests for service worker registration and offline detection in packages/frontend/tests/services/ (SW registers on load, caches app shell + greeting audio on install, navigator.onLine false → SIGNAL_LOST state, window online event → auto-reconnect triggered)

### Implementation for User Story 5

- [ ] T094 [P] [US5] Create PWA manifest and service worker registration in packages/frontend/public/manifest.json (name: "Max Height", display: standalone, theme_color, icons at required sizes) and packages/frontend/src/registerSW.ts (register service worker on load)
- [ ] T095 [US5] Implement service worker with offline caching strategy in packages/frontend/src/sw.ts (cache app shell HTML/CSS/JS on install, cache greeting audio from public/greetings/, network-first for API calls with cache fallback for static assets, stale-while-revalidate for non-critical resources)
- [ ] T096 [US5] Implement offline "signal lost" UI state in packages/frontend/src/components/SessionStateOverlay.tsx (detect offline via navigator.onLine + window online/offline events, render in-character "signal lost" state from cached assets per FR-023, never show browser error page or blank screen)
- [ ] T097 [US5] Implement auto-reconnect on connectivity return in packages/frontend/src/services/websocketManager.ts (listen for window online event, auto-reconnect WebSocket with exponential backoff, re-enable conversation surface without manual page reload per FR-024, update connectionStore state)
- [ ] T098 [US5] Configure standalone display and install affordance in packages/frontend/public/manifest.json (verify standalone window launch on iOS Safari and Android Chrome per FR-022, create optional in-app install prompt in packages/frontend/src/components/InstallPrompt.tsx using beforeinstallprompt event)

**Checkpoint**: All user stories (US1–US5) are independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: E2E tests, security hardening, CI/CD, performance optimization, and validation that improve all user stories.

### E2E Tests (Playwright)

- [ ] T099 [P] Configure Playwright and write US1 E2E smoke test in packages/frontend/tests/e2e/ (Playwright config with Chromium + Firefox projects and webServer directive per research.md R5, WebSocket interception for agent mock, test: load page → click TV knob → verify greeting audio element plays → type message → verify streaming response text appears → verify AudioWorklet chain active)
- [ ] T100 [P] Write Playwright E2E test for mobile/voice path (US2) in packages/frontend/tests/e2e/mobile.spec.ts (mobile viewport emulation, tap TV knob, Web Speech API mock for voice input, verify ON AIR indicator, verify reduced CRT effects)
- [ ] T101 [P] Write Playwright E2E test for text-only path (US3) in packages/frontend/tests/e2e/text-only.spec.ts (deny mic permissions, verify no mic-related UI, type message, verify full voice+text response)

### Security + Infrastructure

- [ ] T102 [P] Implement Content Security Policy headers in packages/infra/lib/frontend-stack.ts (CloudFront response headers policy: script-src self, connect-src for WebSocket endpoint + Polly + Cognito, img-src self + data:, style-src self unsafe-inline for CRT effects, media-src self for greeting audio)
- [ ] T103 [P] Add robots.txt and meta noindex in packages/frontend/public/robots.txt (Disallow: /) and packages/frontend/index.html (<meta name="robots" content="noindex, nofollow">) for unlisted URL per spec §Security
- [ ] T104 [P] Create CI pipeline in .github/workflows/ci.yml (steps: checkout, Node 24 setup, npm ci, npm run lint, npm run typecheck, npm test for all packages — Vitest frontend+agent, Jest infra, npm run build, greeting manifest validation, npm audit per constitution P6)

### Performance + Validation

- [ ] T105 Optimize frontend bundle performance (lazy-load Three.js and React Three Fiber for wireframe backdrop and CRT shader, code-split CRT effects from core app, tree-shake @aws-sdk/client-polly to ~85KB per research.md R4, target <200KB initial JS bundle, CloudFront caching headers for greeting audio)
- [ ] T106 [P] Validate agent Dockerfile in packages/agent/Dockerfile (verify port 8080 exposure, /invocations POST and /ping GET health check endpoints respond, LINUX_ARM64 platform build, non-root USER directive, image size <200MB per research.md R2)
- [ ] T107 [P] Run greeting manifest build-time validation (verify manifest.json passes JSON Schema from greeting-manifest.md, all 16 audioPath entries resolve to existing MP3 files, all 8 archetypes have ≥2 greetings, no duplicate IDs, audioDurationMs within ±500ms of actual file duration)
- [ ] T108 Validate quickstart.md developer setup instructions (execute all steps from quickstart.md: clone, npm install, configure AWS, bootstrap CDK, local dev for frontend and agent, run tests, deploy, verify accuracy and completeness)
- [ ] T109 Final accessibility audit across all pages (verify logical tab order per R6a: TV knob → text input → mic button → settings/data controls, :focus-visible indicators visible in CRT theme, Enter/Space activation on all interactive elements, no keyboard traps, test with keyboard-only navigation)
- [ ] T110 [P] Add fan-project framing and privacy disclosure to UI per constitution P4 and NFR §Privacy — create a footer or About overlay component in packages/frontend/src/components/AboutFooter.tsx containing: "Max Height is a non-commercial fan project inspired by Max Headroom. Not affiliated with or endorsed by any rights holder." Include privacy disclosures: guest identity method (Cognito guest), local actor ID usage, 30-day memory retention window, and links to "Forget me" and "Export" data controls. Include a visible link/toggle in the page layout (e.g., footer text or ⓘ icon). Write Vitest test verifying the framing text and privacy disclosures render.

### Operational Readiness (NFR §Operational Readiness)

- [ ] T111 [P] Configure CloudWatch alarms for operational health in packages/infra/lib/agent-stack.ts (error rate alarm: ≥5% over any 10-minute window → SNS email, cold-start alarm: P95 > 8s over any 1-hour window → SNS email, WebSocket API 5xx alarm: ≥5% over 10 minutes → SNS email; alarms feed the same SNS topic as budget alerts)
- [ ] T112 [P] Document rollback runbook for personality regressions in docs/runbooks/personality-rollback.md (steps: identify regression via traces/logs, revert agent container to previous image tag via AgentCore CLI, redeploy in <5 minutes per NFR §Operational Readiness, verify via golden-set spot check)
- [ ] T113 [P] Write CDK assertions for operational alarms in packages/infra/tests/agent-stack.test.ts (verify CloudWatch alarm resources exist for error rate, cold-start P95, and 5xx rate; verify SNS topic subscription)

### Deferred Scope

> **FR-006 [V1] (3D avatar + viseme lip-sync ≤100ms P95)** and the V1.0 "3D avatar + CRT scene" milestone from spec.md §MVP Boundary are explicitly deferred beyond the current tasks.md scope. A future tasks.md regeneration will cover 3D avatar work after US4 and US5 are complete.
>
> **FR-031 [V1] (web search tool)** is deferred from MVP to V1. T116 is placed in Phase 6 alongside other V1 agent work. Provider and delivery format are TBD.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — **BLOCKS all user stories**
- **User Story 1 (Phase 3)**: Depends on Phase 2 completion — **BLOCKS US2, US3** (they extend US1 UI)
- **User Story 2 (Phase 4)**: Depends on Phase 3 (US1 provides base UI + agent flow)
- **User Story 3 (Phase 5)**: Depends on Phase 3 (US1 provides base UI + agent flow); can run in parallel with US2
- **User Story 4 (Phase 6)**: Depends on Phase 2 (agent-side memory adapter + extractor) AND partially on Phase 3 (T088/T089 modify systemPrompt.ts from T036, T091 modifies dataManager.ts from T066, T116 web search tool depends on agent entry point from T039). T086/T087 can start after Phase 2; T088/T089/T091/T092/T116 require Phase 3 completion.
- **User Story 5 (Phase 7)**: Depends on Phase 3 (US1 provides the app shell to cache)
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### User Story Dependencies

```
Phase 1 (Setup)
    │
    ▼
Phase 2 (Foundational) ──── GATE: blocks all stories
    │                        (includes observability wiring per P9)
    ├──────────────────────────────┐
    ▼                              ▼
Phase 3 (US1: First Visit)   Phase 6a (US4: Memory adapters)
    │  ↳ Personality Gate (P3)     │ (T086/T087 can start early)
    │                              │
    ├──────────┐                   │
    ▼          ▼                   │
Phase 4    Phase 5                 │
(US2:iOS)  (US3:NoMic)            │
    │          │                   │
    ▼          ▼                   ▼
              Phase 6b (US4: T088/T089/T091/T092 + T116 web search)
              │ (requires Phase 3 files: systemPrompt.ts, dataManager.ts, index.ts)
              ▼
Phase 7 (US5: PWA/Offline) [V1]
    │
    ▼
Phase 8 (Polish + E2E Tests)
```

### Within Each User Story

- **Tests FIRST** (P10): Write tests, verify they fail, then implement
- Models/types before services
- Services before UI components
- Agent-side before frontend hooks (for message contract alignment)
- Core implementation before error handling
- Assembly (App.tsx wiring) last
- **Personality gate** (P3): Must pass at end of Phase 3 before any V1 work

### Parallel Opportunities

**Phase 1**: T003–T009 (7 tasks) can all run in parallel after T001+T002
**Phase 2**: T010–T016 (types + stores, 7 tasks) can run in parallel; T021–T024 (CDK stacks, 4 tasks) can run in parallel; T018+T019 (connection services) can run in parallel; T025–T027 (tests) can run in parallel
**Phase 3**: AudioWorklet processors T051–T054 (4 tasks) can run in parallel; UI components T043–T049 (7 tasks) can run in parallel; agent personality T037+T038 can run in parallel; agent tools T114+T115 can run in parallel; tests T028–T032 + T118 can run in parallel
**Phase 4+5**: US2 and US3 can run in parallel (different concerns)
**Phase 6**: Memory adapter T086 and extractor T087 can run in parallel

---

## Parallel Example: User Story 1

```text
# After Phase 2 completes, launch test track first (TDD):

Track 0 — Tests (all parallel, write first):
  T028: Greeting selector tests
  T029: Stutter injection + personality guard tests
  T030: Session manager cap tests (50 turns, 20K tokens, 30 min)
  T031: Polly TTS service tests
  T032: Component tests (CRT frame, TV knob, Avatar2D)

# Then launch parallel implementation tracks:

Track A — Agent Personality (parallel within track):
  T037: Stutter injection post-processor
  T038: Personality guard
  T042: Idle nudge handler

Track A2 — Agent Tools (all parallel):
  T114: News tool definition
  T115: Weather tool definition
  T118: Tool tests (news + weather; web search deferred to V1)

Track B — UI Components (all parallel):
  T043: CRT TV frame
  T044: TV knob
  T045: SVG 2D avatar
  T046: Text input
  T047: Broadcast text display
  T048: Buffering overlay
  T049: Session state overlay

Track C — AudioWorklet Processors (all parallel):
  T051: Stutter processor
  T052: Pitch shift processor
  T053: EQ boost processor
  T054: Static burst processor

Track D — Greeting Content (parallel):
  T033: Author greetings + manifest
  T034: Synthesize greeting audio

# Then sequential assembly:
  T036 → T039 (+ T117 tool wiring) → T040 → T041  (agent pipeline)
  T050 → T055                 (Polly + audio chain)
  T056, T057, T058            (hooks)
  T059 → T061 → T062          (error handling)
  T063 + T064 → T065          (visual effects)
  T066 + T067 → T068          (assembly)

# Then personality gate (HARD GATE):
  T069 → T070                 (build eval → run eval → must pass)
```

---

## Implementation Strategy

### MVP First (User Stories 1–3)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational — including observability wiring (P9) and trace spans (**CRITICAL** — blocks all stories)
3. Complete Phase 3: User Story 1 — "Turn on the TV" (tests first per P10)
4. **PERSONALITY GATE** (P3): Run 50-case golden-set evaluation — must pass SC-001 + SC-002
5. Complete Phase 4: User Story 2 — iOS/Mobile (tests first per P10)
6. Complete Phase 5: User Story 3 — Text-Only (can run in parallel with US2, tests first per P10)
7. **MVP SHIP GATE**: All [MVP] acceptance scenarios pass + first-laugh metric (SC-003)

### Incremental Delivery

1. Phase 1 + 2 → Foundation ready (observability active, traces flowing)
2. + US1 → Core character experience → **Personality gate** → (**MVP candidate**)
3. + US2 + US3 → Full MVP with mobile + text-only parity
4. + US4 → Memory continuity (V1)
5. + US5 → PWA/offline (V1)
6. + Phase 8 → Production-hardened with E2E coverage

### Suggested MVP Scope

**User Story 1 alone** delivers the core "wow" experience:
- Turn on the TV → hear Max greet → converse in voice+text
- Full personality: stuttering, evasive, editorial, ironic
- CRT effects (R3F), wireframe backdrop (R3F), 2D avatar
- Session caps (50 turns, 20K tokens, 30 min), rate limits, error states, budget protection
- News and weather tools (web search deferred to V1)
- Accessibility (keyboard nav + focus indicators)
- Observability traces for all 5 latency targets
- Personality gate passed (SC-001, SC-002)

US2 (mobile) and US3 (text-only) add platform parity but US1 is independently demoable.

---

## Summary

| Metric | Value |
|--------|-------|
| **Total tasks** | 121 |
| **Phase 1 — Setup** | 9 tasks |
| **Phase 2 — Foundational** | 18 tasks (incl. observability, Lambda handler, tests) |
| **Phase 3 — US1: First Visit (P1 MVP)** | 47 tasks (incl. 5 test tasks + personality gate + 4 tool tasks; web search T116 deferred to V1) |
| **Phase 4 — US2: iOS/Mobile (P2 MVP)** | 9 tasks (incl. 2 test tasks) |
| **Phase 5 — US3: Text-Only (P2 MVP)** | 4 tasks (incl. 1 test task) |
| **SC-003 First-Laugh Gate** | 1 task (manual, after Phase 5) |
| **Phase 6 — US4: Memory (P3 V1)** | 12 tasks (incl. 2 test tasks + SC-007 eval + web search T116) |
| **Phase 7 — US5: PWA/Offline (P3 V1)** | 6 tasks (incl. 1 test task) |
| **Phase 8 — Polish** | 15 tasks (incl. 3 E2E Playwright, 3 operational readiness) |
| **Test tasks embedded in phases** | 22 total (15 Vitest/Jest + 3 Playwright + 1 CDK alarm test + 2 eval gates + 1 manual) |
| **MVP tasks (Phases 1–5 + SC-003)** | 89 tasks |
| **V1 additional (Phases 6–8)** | 32 tasks |
| **Max parallel tasks (Phase 3)** | ~20 simultaneous |

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks in same phase
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable at its checkpoint
- All file paths follow plan.md §Project Structure (npm workspaces monorepo)
- **Tests per phase** (P10): Each user story phase includes test tasks written FIRST (TDD)
- **Observability** (P9): Trace spans wired in Phase 2, referenced in implementation tasks
- **Personality gate** (P3): Hard gate at end of Phase 3 — blocks V1 features
- **Session caps** (I1): All 3 limits enforced — 50 turns, 20K tokens, 30 minutes
- **R3F in MVP** (B2): React Three Fiber 9.x is an MVP dependency for CRT effects + wireframe backdrop
- **displayAlias in MVP** (I3): Stored in localStorage via session_start; server-side via AgentCore Memory in V1
- **FR-018 export in MVP** (B1): Exports localStorage data only; V1 adds AgentCore Memory data
- Greeting pool: 16 greetings (2 per archetype × 8 archetypes) per spec clarification session 2
- Accessibility: keyboard nav + focus indicators in MVP per R6a; full ARIA in V1
- Abuse gate: removed per R6d; unlisted URL + rate limits + hard-stop sufficient
- Commit after each task or logical group
- **Agent tools** (iteration 2026-04-22): T114–T115 add news and weather tools for MVP; T116 (web search) deferred to V1 per analysis remediation. T036/T038/T039/T069 updated for two-mode personality (evasive without tools, editorially factual with tools); tool API providers selected in research.md §R7
- **Web search V1 deferral**: T116 moved from Phase 3 (MVP) to Phase 6 (V1) — provider/format TBD; reduces MVP scope and eliminates unresolved format dependency
- **SC-003 gate** (T119): Manual first-laugh test added after Phase 5 checkpoint per analysis remediation C1
- **SC-007 gate** (T120/T121): Memory golden-set evaluation added in Phase 6 per analysis remediation C2
- Stop at any checkpoint to validate story independently
