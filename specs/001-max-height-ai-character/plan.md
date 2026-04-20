# Implementation Plan: Max Height AI Character

**Branch**: `001-max-height-ai-character` | **Date**: 2026-04-20 | **Spec**: `specs/001-max-height-ai-character/spec.md`
**Input**: Feature specification from `specs/001-max-height-ai-character/spec.md`

## Summary

Max Height is an interactive AI character web experience: a stylized talking head inside a CRT television that converses with visitors via voice and text in a stuttering, editorial, ironic persona. The MVP delivers text + voice conversation + personality + 2D placeholder avatar. The backend uses a Strands Agents SDK (TypeScript) agent running on Amazon Bedrock AgentCore Runtime, with Claude Haiku 4.5 for inference and Amazon Polly Neural for TTS. The frontend is a React + Vite SPA hosted on S3/CloudFront.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 LTS (frontend + agent + infra)
**Primary Dependencies**: React 19, Vite 8, Zustand 5, `@strands-agents/sdk`, `@aws/agentcore-cli`, `@aws-sdk/client-polly`, Three.js + React Three Fiber 9 [V1], AWS CDK 2.250+
**Storage**: AgentCore Memory (30-day rolling), localStorage (visitor ID, greeting history, rate limits)
**Testing**: Vitest (frontend + agent), Jest (CDK infra), Playwright (E2E), AgentCore Evaluations (personality golden set)
**Target Platform**: Modern browsers (Chrome/Edge last 2, Safari 16+, Firefox last 2, iOS 16+, Android Chrome last 2)
**Project Type**: Web application (SPA frontend + agentic backend + IaC)
**Performance Goals**: 1.5s P95 text response, 2.5s P95 voice audio, 2s P95 greeting, 60fps UI, cold start <5s P95
**Constraints**: $10/month hard budget cap, 50 turns or 20K tokens per session, 60 msg/hr + 500 msg/day rate limits
**Scale/Scope**: Friends-and-family audience (~5–20 visitors/month), single-page experience, ~15 average turns per session

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Principle Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| P1. Cloud-Only | ✅ PASS | All inference (Claude Haiku 4.5) and TTS (Polly Neural) server-side on AWS. No on-device models. |
| P2. Budget Ceiling | ✅ PASS | Cost model in `research.md §R5` shows ~$0.56/full-session, ~18 full or ~55 avg sessions/month within $10. CDK deploys Budget alarms at $5/$8 and hard-stop Lambda at $10. |
| P3. Personality-First | ✅ PASS | Personality gate (50-case golden set) is a hard blocker before visual/audio polish. |
| P4. IP & Legal | ✅ PASS | "Max Height" naming throughout. No voice cloning. Fan-project framing in About/footer. Non-commercial. |
| P5. No RT LLM-as-Judge | ✅ PASS | Personality evaluation via offline golden sets and AgentCore Evaluations. No live LLM scoring in hot path. |
| P6. Supply-Chain | ✅ PASS | Exact version pinning, package-lock committed, npm audit before dep merges, dep review process. |
| P7. Friends-and-Family | ✅ PASS | Cognito guest identity + per-session caps. No registration, no analytics beyond operational. |
| P8. Graceful Degradation | ✅ PASS | Three axes: no WebGL → 2D fallback, no mic → text input, cloud down → in-character "signal lost". |
| P9. Observability | ✅ PASS | AgentCore Observability (traces, metrics, logs) wired before second feature. Trace spans for all latency paths. |
| P10. Unit Tests | ✅ PASS | Vitest for frontend + agent, Jest for CDK. All non-trivial logic tested. |

### Quality Gate Readiness

| Gate | Ready | How |
|------|-------|-----|
| 1. Cost model | ✅ | `research.md §R5` — detailed per-turn, per-session, monthly estimates |
| 2. Personality | ⏳ | Golden set in personality bible; evaluation via AgentCore Evaluations after implementation |
| 3. Dependency | ✅ | All deps reviewed in research.md; versions pinned in plan |
| 4. Degradation | ⏳ | Three fallback axes defined; testing after implementation |
| 5. Observability | ⏳ | AgentCore Observability planned; trace spans defined in contracts |
| 6. Test coverage | ⏳ | Test strategy in `research.md §R5`; execution during implementation |

### Pending Constitution Amendment

**Claude Haiku 4.5**: The Technology Stack table specifies "Claude 3.5 Haiku", which AWS has scheduled as legacy by June 19, 2026. This plan uses Claude Haiku 4.5 (`global.anthropic.claude-haiku-4-5-20251001-v1:0`). A constitution amendment (MINOR bump → v1.2.0) is required to update the table. Cost impact: ~25% increase in per-token pricing ($1.00 vs $0.80 input, $5.00 vs $4.00 output) — still within budget.

## Project Structure

### Documentation (this feature)

```text
specs/001-max-height-ai-character/
├── plan.md              # This file
├── research.md          # Phase 0: technology decisions + cost model
├── data-model.md        # Phase 1: entity definitions + state transitions
├── quickstart.md        # Phase 1: developer setup guide
├── contracts/           # Phase 1: API and integration contracts
│   ├── websocket-api.md       # WebSocket connection + message wire format
│   ├── message-protocol.md    # Frontend ↔ Agent application protocol
│   ├── polly-tts.md           # Polly TTS integration contract
│   └── greeting-manifest.md   # Pre-generated greeting pool schema
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
packages/
├── frontend/                    # React + Vite SPA
│   ├── src/
│   │   ├── components/
│   │   │   ├── tv/              # CRT frame, power knob, screen container
│   │   │   ├── avatar/          # 2D SVG avatar (MVP), 3D R3F avatar (V1)
│   │   │   ├── input/           # Text input, mic button, ON AIR indicator
│   │   │   └── effects/         # Glitch, scanlines, wireframe backdrop
│   │   ├── hooks/               # useAgent, useSpeechRecognition, useAudio, useGreeting
│   │   ├── stores/              # Zustand: connection, conversation, voice, visitor
│   │   ├── services/            # AgentClient, PollyService, AudioManager, SpeechService
│   │   ├── assets/              # Static assets
│   │   └── types/               # Frontend-specific types
│   ├── public/
│   │   └── greetings/           # Pre-generated greeting pool (manifest.json + MP3s)
│   └── tests/
│       ├── unit/                # Vitest + React Testing Library
│       └── e2e/                 # Playwright browser tests
│
├── agent/                       # Strands agent (AgentCore project)
│   ├── src/
│   │   ├── index.ts             # AgentCore Runtime entry point
│   │   ├── agent.ts             # Max Height agent definition (Strands SDK)
│   │   ├── tools/               # Agent tools (Polly TTS, memory ops, rate-limit)
│   │   ├── prompts/             # System prompt, personality directives
│   │   ├── handlers/            # Post-processing (stutter injection, personality guard)
│   │   └── types/               # Agent-specific types
│   ├── tests/
│   │   └── unit/                # Vitest + aws-sdk-client-mock
│   └── agentcore.config.ts      # AgentCore CLI configuration
│
├── infra/                       # AWS CDK
│   ├── lib/
│   │   ├── hosting-stack.ts     # S3 + CloudFront
│   │   ├── auth-stack.ts        # Cognito Identity Pool (guest)
│   │   ├── budget-stack.ts      # AWS Budgets + SNS alerts + hard-stop Lambda
│   │   └── observability-stack.ts # CloudWatch dashboards + alarms
│   ├── bin/
│   │   └── app.ts               # CDK app entry
│   └── test/                    # Jest + CDK assertions
│
└── shared/                      # Shared across packages
    ├── types/                   # Visitor, Session, Memory, Greeting types
    └── constants/               # Rate limits, token caps, session caps

docs/
├── max-personality-bible.md     # Character spec (source of truth for personality)
└── initial-plan.md              # Historical planning document

specs/                           # Feature specifications
```

**Structure Decision**: npm workspaces monorepo with 4 packages (`frontend`, `agent`, `infra`, `shared`). The frontend deploys to S3/CloudFront via CDK. The agent deploys to AgentCore Runtime via the AgentCore CLI. Infrastructure provisions via CDK. Shared types eliminate duplication across frontend and agent.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Constitution amendment (Claude 3.5 Haiku → Haiku 4.5) | Claude 3.5 Haiku going legacy June 2026 | Staying on 3.5 Haiku would require migration within 2 months of starting development |
