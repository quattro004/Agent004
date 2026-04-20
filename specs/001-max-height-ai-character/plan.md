# Implementation Plan: Max Height AI Character

**Branch**: `001-max-height-ai-character` | **Date**: 2026-04-20 | **Spec**: `specs/001-max-height-ai-character/spec.md`
**Input**: Feature specification from `specs/001-max-height-ai-character/spec.md`

## Summary

Build an interactive AI character web experience ("Max Height") inspired by Max Headroom. A visitor opens a web page, sees a CRT television set, clicks "Turn on the TV," and converses with a stuttering, editorial, ironic AI character via voice and text. The character never gives straight answers, remembers visitors loosely across sessions, and presents inside a glitchy CRT frame with wireframe backdrops.

**MVP**: Text + voice conversation + personality engine + 2D SVG placeholder avatar inside CRT frame. All personality, voice output, degradation, and cost-protection features functional. No 3D avatar, no PWA install, no long-term memory.

**Technical approach**: TypeScript monorepo (npm workspaces) with React+Vite SPA frontend, Strands Agents SDK on Bedrock AgentCore Runtime backend, Claude Haiku 4.5 LLM, Amazon Polly Neural TTS, Web Speech API STT, Cognito guest auth, AWS CDK + AgentCore CLI for deployment.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 LTS
**Runtime**: Vite 8.x (Rolldown bundler) for frontend; AgentCore Runtime (Docker, `LINUX_ARM64`) for agent
**Primary Dependencies**: React 19.x, Zustand 5.x, Three.js (via React Three Fiber 9.x for V1), `@strands-agents/sdk`, `@aws-sdk/client-polly` v3, `@aws-cdk/aws-bedrock-agentcore-alpha`, AWS CDK 2.250+
**Storage**: AgentCore Memory (semantic + summary + user preferences, 30-day rolling), browser localStorage (visitor identity, greeting history, rate limits)
**Testing**: Vitest + React Testing Library (frontend + agent), Jest + CDK assertions (infra), Playwright (E2E), AgentCore Evaluations (personality golden set)
**Target Platform**: Web — Chrome/Edge last 2, Safari 16+, iOS 16+, Firefox last 2, Android Chrome last 2
**Project Type**: Web application — SPA frontend + serverless agent backend
**LLM Model**: Claude Haiku 4.5 (`global.anthropic.claude-haiku-4-5-20251001-v1:0`) — 200K input, 64K output, $1.00/$5.00 per 1M tokens
**TTS Voice**: Amazon Polly Neural — Matthew (en-US), SSML pitch +10%, rate 105%
**Performance Goals**: 1.5s P95 first reply token, 2.5s P95 voice audio start, 2s P95 greeting after TV-on, 5s P95 cold start, 60fps CRT effects (desktop)
**Constraints**: $10/month hard budget cap, $8 soft-degrade (voice off), 50 turns or 20K tokens per session, 60 msg/hr and 500 msg/day per visitor
**Scale/Scope**: Friends-and-family audience (~20–50 messages/day), single AWS region, unlisted URL

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Design Evaluation

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| P1 | Cloud-Only, No On-Device AI | ✅ PASS | LLM on Bedrock, TTS on Polly. Web Speech API for STT is a browser service, not on-device model inference. |
| P2 | Budget Ceiling — $10/Month | ✅ PASS | Cost model: $1.61–$5.53/month projected. Hard-stop at $10 via Lambda+Cognito disable. Alarms at $5/$8. Per-session cap enforced. |
| P3 | Personality-First Build Order | ✅ PASS | MVP ships personality + voice + 2D placeholder. 3D avatar deferred to V1. Golden-set gate required before visual polish. |
| P4 | IP & Legal Posture | ✅ PASS | Name "Max Height" throughout. No voice cloning. Fan-project framing in UI. Non-commercial. |
| P5 | No Real-Time LLM-as-Judge | ✅ PASS | Personality evaluation via offline 50-case golden set + AgentCore Evaluations (async batch). No live LLM scoring in hot path. |
| P6 | Supply-Chain Discipline | ✅ PASS | Exact versions pinned in research.md. `package-lock.json` committed. `npm audit` in CI. `--legacy-peer-deps` for known zod@^4 conflict documented. |
| P7 | Friends-and-Family Audience | ✅ PASS | Cognito guest identity. Unlisted URL with robots disallow. Rate limits (60/hr, 500/day). No public registration or analytics beyond operational metrics. |
| P8 | Graceful Degradation | ✅ PASS | No WebGL → 2D avatar (MVP is 2D). No mic → text input. Cloud unavailable → in-character "signal lost." Budget breach → in-character "taking a break." |
| P9 | Observability Before Features | ✅ PASS | AgentCore Observability auto-collects traces/logs. Trace spans for all latency targets. X-Ray via OpenTelemetry. |
| P10 | Unit Tests Where Possible | ✅ PASS | Vitest for frontend+agent, Jest for CDK, Playwright for E2E. All non-trivial logic tested. |

### Quality Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Cost model gate | ✅ PASS | research.md §R0 cost model: $1.61–$5.53/month. Per-turn cost ~$0.011. |
| Personality gate | ⏳ PENDING | Golden-set rubric (50 cases, 6 dimensions) defined in personality bible. Gate evaluated at Phase 1.5 (personality-first build order). |
| Dependency gate | ✅ PASS | All dependencies reviewed with versions in research.md §R0. Known zod conflict documented with mitigation. |
| Degradation gate | ⏳ PENDING | Three fallback axes defined. Testing deferred to implementation. |
| Observability gate | ⏳ PENDING | AgentCore Observability wired first. Spans defined per latency target in contracts. |
| Test coverage gate | ⏳ PENDING | Test strategy defined in research.md §R5. Enforced per PR. |

**Result**: All principles pass. No violations to justify. Proceed to Phase 0.

### Post-Design Re-Evaluation

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| P1 | Cloud-Only | ✅ PASS | Design confirms: Bedrock LLM, Polly TTS, AgentCore Runtime. No on-device inference. |
| P2 | Budget Ceiling | ✅ PASS | Data model includes session caps (50 turns, 20K tokens, 30 min). Rate limits enforced server-side. Budget stack deploys hard-stop Lambda. |
| P3 | Personality-First | ✅ PASS | Contracts define agent pipeline with personality post-processing. MVP scope excludes 3D. |
| P4 | IP & Legal | ✅ PASS | All contracts use "Max Height." No voice model references. |
| P5 | No Real-Time Judge | ✅ PASS | Message protocol shows no secondary LLM call. Personality checks are heuristic (stutter count, evasiveness flags). |
| P6 | Supply-Chain | ✅ PASS | Exact versions in research.md. Lock file committed. |
| P7 | Friends-and-Family | ✅ PASS | WebSocket contract scopes auth to Cognito guest. Rate limits in protocol. |
| P8 | Graceful Degradation | ✅ PASS | Message protocol defines SIGNAL_LOST state. Polly fallback to text-only. |
| P9 | Observability | ✅ PASS | AgentCore auto-traces. Turn lifecycle in contracts maps to trace spans. |
| P10 | Unit Tests | ✅ PASS | Research §R5 maps test framework to each package. |

**Post-design result**: All principles pass. Design is constitution-compliant.

## Project Structure

### Documentation (this feature)

```text
specs/001-max-height-ai-character/
├── plan.md              # This file
├── research.md          # Phase 0: resolved technical decisions
├── data-model.md        # Phase 1: entity definitions and relationships
├── quickstart.md        # Phase 1: developer setup guide
├── contracts/           # Phase 1: interface contracts
│   ├── websocket-api.md       # WebSocket connection and framing
│   ├── message-protocol.md    # Application-level message flow
│   ├── polly-tts.md           # Polly TTS integration contract
│   └── greeting-manifest.md   # Pre-generated greeting pool schema
└── tasks.md             # Phase 2: task breakdown (via /speckit.tasks)
```

### Source Code (repository root)

```text
packages/
  frontend/                    # React + Vite SPA
    src/
      components/              # UI: CRT frame, Avatar, Controls, TV knob
      hooks/                   # useWebSocket, useAudio, useSpeech, useGreeting
      stores/                  # Zustand: connection, conversation, voice, visitor
      services/                # Polly client, WebSocket manager, greeting selector
      audio/                   # AudioWorklet processors (stutter, pitch, EQ, static)
      effects/                 # CRT shader (scanlines, glitch, barrel distortion)
      types/                   # Shared TypeScript types
    public/
      greetings/               # manifest.json + audio/*.mp3 (16 pre-generated)
    tests/                     # Vitest + React Testing Library
  agent/                       # Strands agent for AgentCore Runtime
    src/
      personality/             # System prompt, personality guards, stutter injection
      memory/                  # AgentCore Memory adapter (extract, retrieve, wipe)
      handlers/                # Post-processing (editorial sandwich, personality check)
      types/                   # Agent-specific types
    tests/                     # Vitest + aws-sdk-client-mock
  infra/                       # AWS CDK stacks
    lib/
      cognito-stack.ts         # Guest identity pool + scoped IAM roles
      agent-stack.ts           # AgentCore Memory, WebSocket API Gateway + Lambda
      frontend-stack.ts        # S3 + CloudFront distribution
      budget-stack.ts          # Cost alerts ($5/$8) + hard-stop ($10 Lambda)
    tests/                     # Jest + CDK assertions
specs/                         # Feature specifications (source of truth)
docs/                          # Personality bible, initial plan
```

**Structure Decision**: npm workspaces monorepo with three packages (`frontend`, `agent`, `infra`). This structure mirrors the natural deployment boundary: the frontend is a static SPA deployed to S3/CloudFront, the agent is a Docker container deployed to AgentCore Runtime via CLI, and the infrastructure is CDK stacks deployed independently. Shared types live in each package's `types/` directory (no shared package for MVP — add if cross-package types grow beyond a handful).

## Complexity Tracking

> No constitution violations detected. Table intentionally left empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
