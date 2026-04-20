# Implementation Plan: Max Height AI Character

**Branch**: `001-max-height-ai-character` | **Date**: 2026-04-19 | **Spec**: `specs/001-max-height-ai-character/spec.md`
**Input**: Feature specification from `/specs/001-max-height-ai-character/spec.md`

## Summary

Build an interactive AI character web experience — **Max Height** — inspired by Max Headroom. A visitor opens a web page, sees a CRT television set, clicks "Turn on the TV," and converses with a stuttering, editorial, ironic AI personality via voice and text. The MVP delivers text + voice + personality + 2D placeholder avatar in a broadcast-mode UI. The backend is a Strands Agents TypeScript agent hosted on Amazon Bedrock AgentCore Runtime, using Claude 3.5 Haiku for personality generation, Amazon Polly Neural for TTS, and Web Speech API for STT. The frontend is a React + Vite SPA with CRT visual effects, Web Audio API DSP for glitch audio, and Zustand for state management. All infrastructure is deployed via AWS CDK.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), Node.js 20 LTS (backend), ES2022+ (frontend)
**Primary Dependencies**: React 18+, Vite 5+, React Three Fiber (V1 3D), Zustand, Strands Agents SDK (TypeScript, v0.0.1-dev — pin exact), bedrock-agentcore (v0.2.2 — pin exact), @aws-sdk/client-polly, @aws-sdk/client-bedrock-agentcore, AWS CDK v2
**Storage**: Amazon Bedrock AgentCore Memory (short-term session context + long-term semantic recall, 30-day rolling window)
**Testing**: Vitest (unit + integration), Playwright (E2E browser), AgentCore Evaluations (personality golden-set scoring — async batch)
**Target Platform**: Modern browsers — Chrome/Edge last 2 major, Safari 16+, iOS 16+, Firefox last 2 major, Android Chrome last 2 major
**Project Type**: Web application (React SPA frontend + serverless Strands agent backend on AgentCore Runtime)
**Performance Goals**: 1.5s P95 reply start, 2.5s P95 voice start, 2s P95 greeting delivery, 5s P95 cold start, 60fps CRT visual effects
**Constraints**: $10/month hard budget cap, 50 turns or 20K tokens per session, 60 msgs/hr + 500 msgs/day per visitor rate limits, <200MB container image for cold-start optimization
**Scale/Scope**: Friends-and-family audience (~20–50 messages/day), single-page application, ~4 major subsystems (agent, voice, avatar, CRT effects)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| **P1. Cloud-Only** | ✅ PASS | LLM (Bedrock Claude Haiku) and TTS (Polly) are server-side. STT uses browser built-in Web Speech API (not on-device LLM). |
| **P2. Budget Cap $10/mo** | ✅ PASS | Cost model estimates $1.61–5.53/mo. Alarms at $5/$8, soft-degrade at $8, hard-stop at $10 all specified. |
| **P3. Personality-First** | ✅ PASS | Build order: personality (Phase 1) → voice (Phase 3) → visuals (Phase 4). Personality gate (Phase 1.5) is a hard gate before visual work. |
| **P4. IP/Legal** | ✅ PASS | Named "Max Height" throughout. No voice cloning. Fan-project framing in UI. Non-commercial. |
| **P5. No RT LLM-as-Judge** | ✅ PASS | Heuristic guards at runtime. LLM-as-judge only in async batch evaluation via AgentCore Evaluations. |
| **P6. Supply-Chain** | ✅ PASS | Pre-1.0 deps (Strands SDK, bedrock-agentcore) pinned to exact versions. package-lock.json committed. npm audit clean required. |
| **P7. Friends-and-Family** | ✅ PASS | Cognito guest identity. Rate limiting. No public registration or marketing. |
| **P8. Graceful Degradation** | ✅ PASS | Text fallback (no mic), 2D avatar fallback (no WebGL — V1), in-character error states ("signal lost", "taking a break"). |
| **P9. Observability Before Features** | ✅ PASS | AgentCore Observability wired before second feature. Trace spans for all latency paths. |
| **P10. Unit Tests** | ✅ PASS | Vitest for all non-trivial logic. Golden-set evaluation for personality. Playwright for E2E. |

**Quality Gates:**

| Gate | Status | Evidence |
|------|--------|----------|
| 1. Cost model | ✅ PASS | Detailed cost analysis in `docs/initial-plan.md` §Cost Analysis: $1.61–5.53/mo estimated. |
| 2. Personality gate | ✅ PASS | 50-case golden set defined in spec. 6-dimension rubric in personality bible §9. Hard gate at Phase 1.5. |
| 3. Dependency gate | ⚠️ MONITOR | Strands SDK v0.0.1-dev and bedrock-agentcore v0.2.2 are pre-1.0. Pinned exact per P6. Must monitor for breaking changes. |
| 4. Degradation gate | ✅ PASS | Three fallback axes defined: no mic → text, no WebGL → 2D, cloud down → "signal lost". |
| 5. Observability gate | ✅ PASS | AgentCore Observability planned for Phase 1. Trace spans for greeting, reply, voice, cold-start latency paths. |
| 6. Test coverage gate | ✅ PASS | Unit tests via Vitest. Personality evaluation via golden set. E2E via Playwright. |

**Constitution Check Result: PASS** — No gate failures. Dependency gate flagged for monitoring (pre-1.0 SDKs) but compliant with P6 pinning requirements.

## Project Structure

### Documentation (this feature)

```text
specs/001-max-height-ai-character/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
packages/
├── frontend/                    # React + Vite SPA
│   ├── src/
│   │   ├── components/
│   │   │   ├── tv/              # CRT frame, knob, screen container
│   │   │   ├── avatar/          # 2D placeholder (MVP), 3D avatar (V1)
│   │   │   ├── chat/            # Text input, mic button, broadcast display
│   │   │   └── effects/         # CRT shader, glitch overlay, scanlines
│   │   ├── hooks/               # Custom React hooks (useAudio, useWebSocket, useSpeech)
│   │   ├── services/
│   │   │   ├── polly.ts         # Direct Polly TTS client
│   │   │   ├── websocket.ts     # SigV4 WebSocket to AgentCore Runtime
│   │   │   ├── cognito.ts       # Guest identity + credential management
│   │   │   └── audio-dsp/       # AudioWorklet processors (stutter, pitch, static)
│   │   ├── stores/              # Zustand state stores
│   │   │   ├── connection.ts    # WebSocket status, reconnection
│   │   │   ├── audio.ts         # Playback state, DSP effects, volume
│   │   │   ├── avatar.ts        # Mouth state, expressions, glitch triggers
│   │   │   └── ui.ts            # Mode (text/voice), loading, errors
│   │   ├── types/               # Shared TypeScript interfaces
│   │   └── App.tsx
│   ├── public/
│   │   └── greetings/           # Pre-generated greeting pool (audio + animation)
│   └── tests/
│       ├── unit/
│       └── e2e/                 # Playwright browser tests
│
├── agent/                       # Strands Agent backend
│   ├── src/
│   │   ├── agent.ts             # Strands agent definition + tool registration
│   │   ├── runtime.ts           # AgentCore Runtime entry point (port 8080)
│   │   ├── prompts/
│   │   │   └── max-persona.ts   # System prompt derived from personality bible
│   │   ├── tools/               # Native Strands tools (weather, news, search)
│   │   ├── steering/            # Post-processing handlers
│   │   │   ├── stutter.ts       # Stutter injection (6 types from bible §2.1)
│   │   │   ├── personality.ts   # Heuristic personality guard
│   │   │   ├── catchphrase.ts   # Catchphrase probabilistic injection
│   │   │   └── editorial.ts     # Editorial sandwich enforcement
│   │   ├── memory/              # AgentCore Memory adapter
│   │   └── types/
│   ├── evals/
│   │   ├── golden-set.ts        # 50-case personality test corpus
│   │   └── rubric.ts            # 6-dimension scoring rubric
│   ├── Dockerfile               # Multi-stage, Alpine, <200MB target
│   └── tests/
│       └── unit/
│
└── infra/                       # AWS CDK infrastructure
    ├── lib/
    │   ├── agentcore-stack.ts   # AgentCore Runtime, Memory, Observability
    │   ├── auth-stack.ts        # Cognito Identity Pool + IAM policies
    │   ├── hosting-stack.ts     # S3 + CloudFront
    │   └── budget-stack.ts      # AWS Budgets alarms + hard-stop Lambda
    └── tests/
        └── unit/
```

**Structure Decision**: Monorepo with `packages/` layout (frontend, agent, infra). This separates concerns cleanly: the SPA frontend, the Strands agent backend (containerized for AgentCore Runtime), and CDK infrastructure. Each package has its own `tests/` directory. Shared types can be extracted to a `packages/shared/` package if needed.

## Complexity Tracking

> No constitutional violations requiring justification. Pre-1.0 dependency risk (Strands SDK, bedrock-agentcore) is managed via P6 exact pinning and documented in Dependency gate monitoring above.
