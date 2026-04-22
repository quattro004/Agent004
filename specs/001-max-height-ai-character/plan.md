# Implementation Plan: Max Height AI Character

**Branch**: `001-max-height-ai-character` | **Date**: 2026-04-20 | **Spec**: `specs/001-max-height-ai-character/spec.md`
**Input**: Feature specification from `specs/001-max-height-ai-character/spec.md`

---

## Summary

Max Height is an interactive AI character web experience — a stylized talking head on a glitchy CRT that converses with visitors in a stuttering, editorial, ironic persona via voice and text. The agent has access to three tools (news, weather, web search) for fetching real-world data, which Max reports in-character using factual tool results — never fabricating news or weather. The system uses a React + Vite SPA frontend with Three.js/React Three Fiber for CRT visual effects and wireframe backdrop, connected via WebSocket to a Strands Agents TypeScript SDK agent running on Amazon Bedrock AgentCore Runtime. Amazon Polly Neural (Matthew voice) provides TTS, browser Web Speech API handles STT, and Cognito guest identity provides auth-free access scoped to minimum permissions. Cost is hard-capped at $10/month with automated enforcement.

MVP delivers text + voice + personality + 2D placeholder avatar (SVG with binary mouth state). 3D avatar, PWA installability, and cross-session memory recall are V1.

---

## Technical Context

**Language/Version**: TypeScript 5.8.x on Node.js 24 LTS  
**Primary Dependencies**: React 19.x, Vite 8.x, React Three Fiber 9.x, Zustand 5.x, `@strands-agents/sdk` (latest stable), `@aws/agentcore-cli` 0.9.1, AWS CDK 2.250+, `@aws-sdk/client-polly` v3
**Storage**: AgentCore Memory (semantic + summary + user preferences strategies), browser localStorage (visitor state, greeting history, rate limits), S3 + CloudFront (static assets)  
**Testing**: Vitest + React Testing Library (frontend/agent), Jest + CDK assertions (infra), Playwright (E2E), AgentCore Evaluations (personality golden set)  
**Target Platform**: Modern browsers — Chrome/Edge last 2, Safari 16+, iOS 16+, Firefox last 2, Android Chrome last 2  
**Project Type**: Web application (SPA frontend + serverless agent backend + IaC)  
**Performance Goals**: 1.5s P95 first-token response, 2.5s P95 voice playback start, 2s P95 greeting on TV-on, 60fps CRT effects on desktop  
**Constraints**: $10/month hard budget cap, <200MB agent container image, 50 turns / 20K tokens / 30 min per session, 60 msg/hr + 500 msg/day rate limits  
**Scale/Scope**: Friends-and-family audience (~5–10 concurrent visitors max), single AWS region, unlisted URL  
**LLM Model**: Claude Haiku 4.5 on Amazon Bedrock (`global.anthropic.claude-haiku-4-5-20251001-v1:0` — see research.md §R0)

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Research Gate (Phase 0 entry)

| Principle | Status | Evidence |
|-----------|--------|----------|
| **P1. Cloud-Only, No On-Device AI** | ✅ PASS | All LLM inference via Bedrock AgentCore Runtime. TTS via Amazon Polly. STT via browser Web Speech API (not a local model). No on-device model weights. |
| **P2. Budget Ceiling — $10/Month** | ✅ PASS | Cost model documented in research.md §R0. AWS Budgets $5/$8 alerts, $10 hard-stop via Lambda. Per-session caps enforced. External tool API costs (news, weather, web search) must fit within the same $10/month ceiling — provider selection in research.md §R7 must account for this. |
| **P3. Personality-First Build Order** | ✅ PASS | MVP = personality + text + voice + 2D placeholder avatar. 3D deferred to V1. Golden-set rubric is a ship gate (SC-001, SC-003). |
| **P4. IP & Legal Posture** | ✅ PASS | Name is "Max Height" throughout. No voice cloning. Fan-project framing in spec. Non-commercial. |
| **P5. No Real-Time LLM-as-Judge** | ✅ PASS | Personality evaluation uses offline golden sets via AgentCore Evaluations (research.md §R5). No live LLM scoring in hot path. |
| **P6. Supply-Chain Discipline** | ✅ PASS | Exact versions pinned in research.md §R0 version table. `package-lock.json` required. `npm audit` gate before dependency merges. New deps reviewed per P6 criteria. |
| **P7. Friends-and-Family Audience** | ✅ PASS | Cognito guest identity (no user accounts). Unlisted URL. Minimal moderation. No public registration or analytics beyond operational metrics. |
| **P8. Graceful Degradation** | ✅ PASS | Three fallback axes designed: no WebGL → 2D fallback (V1 concern, MVP is 2D); no mic → text input always available; cloud unavailable → in-character "signal lost" state. |
| **P9. Observability Before Features** | ✅ PASS | AgentCore Observability auto-collected (research.md §R2). Trace spans required per latency target. X-Ray tracing via OpenTelemetry. |
| **P10. Unit Tests Where Possible** | ✅ PASS | Testing strategy defined in research.md §R5 with per-package coverage. Agent handlers tested as pure functions. |

### Quality Gates

| Gate | Status | Evidence |
|------|--------|----------|
| **Cost model gate** | ✅ PASS | research.md §R0: ~$0.17/avg session, ~$0.56/full session, ~$1.00 infra. Budget feasible at ~53 average sessions/month. Tool API costs (news, weather, web search) to be validated in research.md §R7 — must remain within $10/month ceiling. |
| **Personality gate** | ✅ PASS (design) | 50-case golden set defined in personality bible. AgentCore Evaluations used for offline scoring (research.md §R5). Ship gate = SC-001 + SC-003. |
| **Dependency gate** | ✅ PASS | All deps listed with version, maintainer status, and download counts evaluated. research.md §R0 version table is current. |
| **Degradation gate** | ✅ PASS (design) | All three fallback axes designed in spec edge cases + contracts. Implementation testing required before ship. |
| **Observability gate** | ✅ PASS (design) | AgentCore Observability auto-collects logs/traces. X-Ray spans for response latency, Polly synthesis, WebSocket lifecycle. |
| **Test coverage gate** | ✅ PASS (design) | Testing strategy covers all packages. research.md §R5 defines per-package frameworks and coverage expectations. |

**Gate result**: ALL PASS — proceed to Phase 0 research.

---

## Project Structure

### Documentation (this feature)

```text
specs/001-max-height-ai-character/
├── plan.md              # This file
├── research.md          # Phase 0 — resolved technical decisions
├── data-model.md        # Phase 1 — entity definitions and relationships
├── quickstart.md        # Phase 1 — developer setup guide
├── contracts/           # Phase 1 — API and integration contracts
│   ├── websocket-api.md
│   ├── message-protocol.md
│   ├── polly-tts.md
│   └── greeting-manifest.md
├── tasks.md             # Phase 2 — task breakdown (via /speckit.tasks)
└── checklists/          # Quality checklists
```

### Source Code (repository root)

```text
packages/
  frontend/              # React 19 + Vite 8 SPA
  ├── src/
  │   ├── components/    # React components (CRT, Avatar, MicButton, TextInput, TVKnob)
  │   ├── hooks/         # Custom hooks (useWebSocket, useAudio, useSpeechRecognition)
  │   ├── stores/        # Zustand stores (connection, conversation, voice, visitor)
  │   ├── services/      # Polly TTS client, greeting selector, rate limiter
  │   ├── effects/       # CRT shaders, CSS fallback, wireframe backdrop
  │   ├── audio/         # AudioWorklet processors (stutter, pitch, static, EQ)
  │   └── types/         # Shared TypeScript types
  ├── public/
  │   └── greetings/     # manifest.json + audio/*.mp3 (pre-generated)
  └── tests/             # Vitest + React Testing Library

  agent/                 # Strands agent for AgentCore Runtime
  ├── src/
  │   ├── index.ts       # Main agent entry point (AgentCore-compatible, system prompt, tool bindings)
  │   ├── personality/   # Stutter injection, editorial voice, guardrails
  │   ├── tools/         # Agent tools (newsTool.ts, weatherTool.ts, webSearchTool.ts)
  │   ├── handlers/      # Post-processing handlers (stutter, catchphrase, compliance)
  │   └── types/         # Agent-specific types
  ├── evals/             # AgentCore Evaluations (golden-set configs)
  └── tests/             # Vitest + aws-sdk-client-mock

  infra/                 # AWS CDK stacks
  ├── lib/
  │   ├── handlers/             # Lambda handlers (WebSocket $connect/$disconnect/$default)
  │   ├── cognito-stack.ts      # Guest identity pool + IAM roles
  │   ├── agent-stack.ts        # AgentCore Memory, WebSocket API + Lambda
  │   ├── frontend-stack.ts     # S3 + CloudFront distribution
  │   └── budget-stack.ts       # Cost alerts ($5/$8 SNS) + hard-stop ($10 Lambda)
  └── test/              # Jest + CDK assertions

docs/                    # Supporting design documents
├── max-personality-bible.md    # Character voice, stutter taxonomy, golden set
└── initial-plan.md             # Original technical appendix (superseded by specs)

specs/                   # Feature specifications (source of truth)
```

**Structure Decision**: Monorepo with `packages/` directory containing three workspaces: `frontend` (React SPA), `agent` (Strands agent), and `infra` (CDK stacks). This mirrors the "web application" pattern with a clear separation between the client, the AI agent backend, and infrastructure-as-code. The agent includes a `tools/` directory for Strands tool definitions (news, weather, web search) using the `tool()` factory with Zod schemas. The agent is deployed separately via AgentCore CLI; the infrastructure via CDK. The frontend is built and synced to S3.

---

### Post-Design Constitution Re-Check

| Principle | Post-Design Status | Notes |
|-----------|-------------------|-------|
| **P1. Cloud-Only** | ✅ PASS | No on-device AI in any design artifact. WebGL shader effects are visual only, not inference. |
| **P2. Budget Ceiling** | ✅ PASS | Cost model validated in research.md §R0. BudgetStack (infra) implements automated alerts and hard-stop. External tool API costs accounted for in research.md §R7. |
| **P3. Personality-First** | ✅ PASS | Agent handlers, golden-set evals, and personality bible integration are core MVP tasks. 3D deferred. |
| **P4. IP & Legal** | ✅ PASS | "Max Height" naming enforced in copilot-instructions.md §3. No voice cloning in Polly contract. |
| **P5. No Live Judge** | ✅ PASS | AgentCore Evaluations are async batch. No real-time scoring in message-protocol.md flow. |
| **P6. Supply-Chain** | ✅ PASS | Version table current. `overrides` strategy for Zod conflicts (updated research.md §R1). Lock file committed. |
| **P7. Friends-and-Family** | ✅ PASS | Cognito guest identity in cognito-stack. No user accounts. Rate limits in websocket-api.md contract. |
| **P8. Graceful Degradation** | ✅ PASS | Error recovery matrix in message-protocol.md. SIGNAL_LOST state in data-model.md. Budget/rate states designed. |
| **P9. Observability** | ✅ PASS | AgentCore auto-collection in agent-stack. Trace spans for all latency targets. |
| **P10. Unit Tests** | ✅ PASS | Per-package testing strategy in research.md §R5. Agent handlers tested as pure functions. |

**Post-design gate result**: ALL PASS — no violations.

---

## Complexity Tracking

> No violations detected. All design decisions align with constitutional principles.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| *(none)* | — | — |
