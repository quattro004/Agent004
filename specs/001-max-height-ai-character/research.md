# Research: Max Height AI Character

**Feature**: 001-max-height-ai-character
**Date**: 2026-04-20
**Status**: Complete — all NEEDS CLARIFICATION items resolved. Updated 2026-04-22 with Node.js 24 LTS upgrade (Node 20 EOL April 30, 2026), TypeScript pinned to 5.8.x for MVP stability, Vite patch bump. Previously updated 2026-04-20 with Claude Haiku 4.5 migration, AgentCore CLI adoption, version refresh, and spec clarification session 2.

---

## R0. LLM Model Selection (Updated 2026-04-20)

**Decision**: Claude Haiku 4.5 on Amazon Bedrock (replacing Claude 3.5 Haiku)

**Rationale**: The constitution specifies Claude 3.5 Haiku, but AWS has scheduled it as **legacy by June 19, 2026** — unsuitable for a new project starting now. Claude Haiku 4.5 is the direct successor with superior performance, a larger output window (64K vs 8K), and ongoing support through at least October 2026.

**Model details**:
- Model ID: `global.anthropic.claude-haiku-4-5-20251001-v1:0`
- Context: 200K tokens input, 64K tokens max output
- Pricing (global endpoint): $1.00/1M input, $5.00/1M output
- Prompt caching: $0.10/1M reads, $1.25/1M writes

**Alternatives considered**:
- Claude 3.5 Haiku — going legacy June 2026; untenable for new project
- Claude 3.5 Sonnet — better quality but ~3× more expensive; exceeds budget
- Claude Sonnet 4 / 4.5 — premium tier; budget-incompatible

**Action required**: Constitution amendment (MINOR bump → v1.2.0) to update the Technology Stack table from "Claude 3.5 Haiku" to "Claude Haiku 4.5".

### Version Summary (April 2026)

| Package | Version | Notes |
|---------|---------|-------|
| React | 19.x (19.2.5) | Latest stable |
| Vite | 8.x (8.0.9) | Rolldown bundler (Rust-based) |
| TypeScript | 5.8.x (5.8.2) | Latest stable 5.x — TS 6.0 available but deferred to post-MVP for ecosystem maturity |
| Zustand | 5.x (5.0.12) | Latest stable |
| React Three Fiber | 9.x | R3F v9 = React 19 compatible; used in MVP for CRT shader + wireframe backdrop |
| `@strands-agents/sdk` | Latest stable | TypeScript, production-ready |
| `@aws/agentcore-cli` | 0.9.1 | GA, recommended for new projects |
| AWS CDK | 2.x (2.250.0) | Latest stable |
| Node.js | 24 LTS (24.15.0) | Active LTS through April 2028 — Node 20 EOL April 30, 2026. Strands TS SDK requires Node 20+; 22 confirmed, 24 expected compatible. |

### Cost Model (Claude Haiku 4.5 + Polly Neural)

**Per-turn**: ~$0.011 (LLM ~$0.003 + Polly Neural ~$0.008)
**Per full session** (50 turns): ~$0.56
**Per average session** (15 turns): ~$0.17
**Monthly infrastructure**: ~$1.00 (S3, CloudFront, CloudWatch)
**Monthly conversation budget**: ~$9.00 → ~16 full or ~53 average sessions

#### Polly Neural TTS — worst-case detail (constitution P2)

Amazon Polly Neural is billed at **$16 per 1,000,000 characters** synthesized.
Max's responses are capped at ~250 model tokens (~1,000 characters of TTS text)
per turn by the per-reply token limit (`BedrockModel.maxTokens: 250`).

| Scenario | Chars synthesized | Polly cost |
|---|---|---|
| Single average reply (~500 chars) | 500 | $0.008 |
| Single max reply (~1,000 chars) | 1,000 | $0.016 |
| Full session (50 turns × 1,000 chars) | 50,000 | $0.80 |
| 50 full sessions in a month | 2,500,000 | $40.00 ❌ |
| 12 full sessions in a month | 600,000 | $9.60 ⚠️ |
| 53 average sessions in a month | 397,500 | $6.36 ✅ |

**Cap interaction**: TTS spend dominates beyond ~12 full-budget sessions/month;
the $8 soft-degrade (voice off) and per-session 20k-token + 50-turn caps in
`sessionManager.ts` together keep worst-case Polly spend within the $10 ceiling
even under adversarial traffic. The 100% budget threshold detaches the unauth
Cognito role inline policy and shuts off both LLM and Polly access (P2 hard-stop).

Budget is feasible for friends-and-family traffic. The $8 soft-degrade (voice off) provides additional headroom for text-only sessions.

---

## R1. Strands Agents TypeScript SDK

**Decision**: Use `@strands-agents/sdk` (TypeScript, production-ready) with AgentCore CLI (`@aws/agentcore-cli` v0.9.1) for development and deployment. The Python SDK is at v1.36.0 (production since v1.0 in July 2025); the TypeScript SDK reached production-ready status for core features in early 2026.

**Rationale**:
- Full ESM, Node 20+, TypeScript-first. Streaming via `agent.stream()` async generator delivering token-by-token events.
- Tool integration uses `tool()` factory with Zod schemas — type-safe.
- TypeScript chosen over Python because the developer is a TypeScript developer — unified language stack with the React frontend eliminates context-switching and enables shared types across the monorepo.
- Hooks are **observational, not interceptive** — you can observe `afterModelCallEvent` and request retry (`event.retry = true`), but cannot modify response content mid-stream. Stutter injection must be post-processing on the complete response text, not mid-stream interception.
- AgentCore CLI provides project scaffolding, local dev with hot reload, and direct deployment to AgentCore Runtime.
- ⚠️ **Zod 4 peer dependency conflict** may still apply — `@strands-agents/sdk` and its transitive dependencies may require different Zod major versions (some packages still on Zod 3 vs Zod 4). pnpm strict peer dependency resolution can surface install errors early. **Preferred resolution**: use root `package.json` `overrides` to force a single Zod 4 version (e.g., `"overrides": { "zod": "^4.3.6" }`). Zod 4 ships a `zod/v3` compatibility mode (`z.setCompatMode(true)`) for gradual migration of Zod 3 consumers. Avoid bypassing peer checks in production workflows. Latest stable Zod version: **4.3.6** (April 2026).

**SDK status (April 2026)**:
- Python: v1.36.0, production since July 2025, millions of downloads
- TypeScript: `@strands-agents/sdk`, production-ready for core features, TypeScript announced December 2025
- AgentCore CLI: `@aws/agentcore-cli` v0.9.1, GA, supports Strands TS natively

**Alternatives considered**:
- LangChain.js: Heavier, less type-safe, leaky abstractions. Consider only if Strands hits a critical bug.
- Direct Anthropic SDK: Full control but requires manual orchestration, no multi-agent.
- Python Strands SDK: More mature (30+ tools) but incompatible with TypeScript monorepo architecture.

---

## R2. AgentCore Runtime CDK Deployment

**Decision**: Use AgentCore CLI (`@aws/agentcore-cli` v0.9.1) for agent development and deployment. Use `@aws-cdk/aws-bedrock-agentcore-alpha` L2 constructs (CDK v2.250.0+) for infrastructure provisioning (Memory, Observability). WebSocket connections via API Gateway WebSocket API + Lambda integration with SigV4-signed presigned URLs.

**Rationale**:
- L2 constructs (`Runtime`, `AgentRuntimeArtifact`) from RFC #785 simplify deployment. `AgentRuntimeArtifact.fromAsset()` handles Docker image building and ECR push.
- Container requirements: port 8080, `/invocations` POST endpoint, `/ping` GET health check, `LINUX_ARM64` platform (cheaper), non-root user, <200MB image target.
- AgentCore Memory (RFC #788): `Memory` construct with `SemanticMemory` (knowledge base), `SummaryMemory` (DynamoDB), and `UserPreferences` strategies.
- Observability: Auto-collected logs to `/aws/bedrock-agentcore/runtimes/{name}`, X-Ray tracing via OpenTelemetry instrumentation.
- Cognito Identity Pool grants guest credentials scoped to `bedrock-agentcore:InvokeAgentRuntime` + `polly:SynthesizeSpeech`. Presigned WebSocket URLs expire in 5 minutes — frontend must implement refresh + reconnection logic.
- Budget enforcement: `CfnBudget` with SNS alerts at $5/$8, EventBridge rule triggers Lambda to detach IAM policy from Cognito guest role at $10.

**Alternatives considered**:
- L1 CfnRuntime constructs: Too verbose, more IAM boilerplate.
- Lambda URL instead of API Gateway WebSocket: No native streaming support.
- HTTP API: Simpler but no bidirectional streaming.

### R2b. AgentCore CLI

**Decision**: Use `@aws/agentcore-cli` (v0.9.1) as the primary agent development and deployment tool.

**Rationale**: The AgentCore CLI is GA (platform GA since October 2025) and the officially recommended tool for new AgentCore projects. It provides project scaffolding with Strands framework support, local dev server with hot reload, built-in evaluation tools, direct deploy to AgentCore Runtime, and gateway management.

**Architecture split**:
- AgentCore CLI: agent project scaffolding, local development, agent deployment to Runtime
- AWS CDK: everything else (S3, CloudFront, Cognito, Budgets, Lambda, Observability dashboards)

**Alternatives considered**:
- Python Starter Toolkit: deprecated in favor of the CLI.
- CDK-only deployment: more complex; CLI handles agent-specific concerns natively.
- Manual deployment: no scaffolding, no hot reload, no built-in evals.

---

## R3. MVP Frontend Implementation

### R3a. 2D Avatar

**Decision**: SVG with CSS + JavaScript animation for binary mouth-state (open/closed). Two `<path>` elements toggled based on audio energy analysis via Web Audio API `AnalyserNode`.

**Rationale**: SVG lines/shapes naturally match the 80s "computer-generated" look. Binary mouth state maps to simple CSS class toggles. Scales perfectly on mobile with zero bitmap memory overhead. Audio sync via `AnalyserNode` FFT low-frequency energy threshold (~100 at 0–500 Hz band) at 20 Hz update rate.

**Alternatives considered**:
- Canvas 2D: More code, less declarative, no performance advantage for single avatar.
- Lottie: Overkill dependency for binary mouth state.
- Pre-rendered video frames: Latency, iOS autoplay issues, doesn't sync reliably.

### R3b. CRT Visual Effects

**Decision**: WebGL fragment shader via Three.js `EffectComposer` + `ShaderPass` for desktop (scanlines, chromatic aberration, barrel distortion, glitch tears). CSS `repeating-linear-gradient` overlay fallback for mobile.

**Rationale**: GPU-accelerated per-pixel operations at 60fps. Glitch intensity can be driven by audio stutter events via shader uniforms. Three.js is already needed for wireframe backdrop. CSS fallback provides retro feel at zero GPU cost on mobile.

**Alternatives considered**:
- CSS-only: Cannot achieve true per-pixel scanlines at 60fps; no barrel distortion.
- Canvas 2D full-scene: Slower than WebGL, adds complexity.

### R3c. Web Audio API AudioWorklet

**Decision**: AudioWorklet with native DSP processors (stutter loop, pitch shift, static burst). ScriptProcessor fallback for iOS Safari <16.

**Rationale**: AudioWorklet supported on all target browsers (Chrome 66+, Safari 14.1+, Firefox 76+). Runs on separate thread — no 60fps rendering impact. Stutter implemented via circular ring buffer repeating last ~50ms of audio. iOS Safari 16–16.3 has intermittent routing issues — mitigate with `visibilitychange` handler.

**Alternatives considered**:
- ScriptProcessor only: Deprecated, runs on main thread, causes jank.
- Tone.js: ~100KB bundle bloat for features we don't need.

### R3d. Pre-Generated Greeting Pool

**Decision**: JSON manifest in `/public/greetings/` with pre-synthesized MP3 audio files. Weighted random selection with no-repeat-within-3-sessions constraint. LLM agent boots in background during greeting playback (~3–4s window).

**Rationale**: Instant playback meets 2s P95 greeting requirement. Static assets deployed atomically with frontend, cached by CloudFront. ~20–40 KB per greeting MP3. Video optional for MVP — use SVG mouth sync instead.

**Alternatives considered**:
- On-the-fly LLM + Polly generation: Adds 2–3s latency, violates P95 requirement.
- S3 bucket separate from public/: Requires signed URLs, more overhead.

### R3e. Wireframe Backdrop

**Decision**: Three.js `LineSegments` + `EdgesGeometry` for rotating cubes/pyramids in cyan/magenta on black. Rendered via React Three Fiber.

**Rationale**: Hardware-accelerated wireframe rendering is cheap (just lines). Glowing 80s vibe via custom line material. Performance: 60fps even on mobile with reduced object count. Consistent architecture since Three.js already powers CRT effects.

**Alternatives considered**:
- CSS 3D transforms: Lack perspective depth and glow effects.
- Canvas 2D path drawing: Tedious, error-prone, slower than WebGL.

---

## R4. Amazon Polly Neural Voice Selection

**Decision**: Primary voice: **Matthew** (Neural, US English) — warmest broadcaster tone. SSML `<prosody pitch="+10%" rate="105%">` for slight smugness. Nasal quality via client-side DSP (4–6 kHz EQ boost in AudioWorklet). **Gregory** as alternative if A/B testing reveals better fit.

**Rationale**:
- Matthew best matches "broadcaster cadence + slightly smug" requirement.
- SSML tags fully supported with Neural voices: `<prosody>`, `<break>`, `<emphasis>`, `<say-as>`, `<phoneme>`. Tags do NOT count toward 3,000-character billing limit.
- Viseme support: 13–14 US English visemes returned via `SpeechMarkTypes: ["viseme"]`. Timing accuracy ±50–100ms (acceptable for 60fps with `VisemeScheduler` compensation).
- Dual-call architecture confirmed: `Promise.all()` for audio MP3 + viseme JSON. Both billed separately on character count.
- Cost: $4.00/1M characters Neural. At ~200 chars/response × 2 calls = $0.0016/response. ~$0.05–0.20/month at projected volume.
- Browser direct call: `@aws-sdk/client-polly` v3 is ~85KB tree-shaken. No CORS issues with SigV4 signing via Cognito credentials.

**Alternatives considered**:
- Stephen (Neural): Sharper articulation, less warmth. Better for technical delivery, less for editorial commentary.
- ElevenLabs: 11.25x more expensive, voice cloning raises IP concerns.
- Google Cloud TTS: 4x more expensive than Polly Neural.

---

## R5. Testing Strategy

**Decision**: Vitest for frontend + agent unit/component tests. Jest for CDK infrastructure tests. Playwright for E2E browser tests. AgentCore Evaluations for async personality golden-set scoring.

**Rationale**:

| Layer | Framework | Why |
|-------|-----------|-----|
| `packages/frontend/` | Vitest + React Testing Library | Native Vite support, 15–20x faster than Jest, ESM-first, `jsdom` environment |
| `packages/agent/` | Vitest + `aws-sdk-client-mock` | Same Vitest pipeline, mock Bedrock API calls, test post-processing handlers |
| `packages/infra/` | Jest + `aws-cdk-lib/assertions` | CDK has first-class Jest support, `Template.fromStack()` assertions |
| E2E browser | Playwright | WebSocket interception, audio element testing, Web Speech API mocking, cross-browser |
| Personality | AgentCore Evaluations | 50-case golden set, 6-dimension rubric, async batch LLM-as-judge |

- Monorepo config: Root `vitest.config.ts` with workspace inheritance. Per-package overrides for special cases (CDK uses Jest separately).
- Vitest globals + `@testing-library/jest-dom` matchers via shared setup file.
- Playwright config: Chromium + Firefox projects, `webServer` directive starts dev server.
- Agent testing: `aws-sdk-client-mock` for mocking `BedrockRuntimeClient`. Test stutter injection, personality guard, catchphrase trigger, and editorial sandwich handlers as pure functions.

**Alternatives considered**:
- Jest for everything: Requires `ts-jest` transpiler, slower feedback loop for Vite projects.
- Vitest for CDK: Not officially supported by AWS, fewer examples.
- Cypress for E2E: No native WebSocket interception.

---

## R6. Spec Clarification Session 2 (2026-04-20)

The following items were resolved during the second clarification session and are incorporated into the plan and sub-artifacts.

### R6a. Accessibility (MVP)

**Decision**: Keyboard navigation and visible focus indicators required for MVP. Full screen reader / ARIA support deferred to V1.

**Rationale**: MVP accessibility scope balances inclusiveness with build velocity. Keyboard nav and focus indicators are achievable with standard HTML semantics and a focused CSS pass. Full ARIA support (live regions for streaming text, role annotations for the CRT frame, screen reader announcements for Max's responses) requires more design work and is deferred.

**Implementation notes**:
- All interactive elements (TV knob, text input, mic button, "Forget me", export) must be keyboard-reachable via `Tab` and activatable via `Enter`/`Space`.
- Visible focus indicators via `:focus-visible` CSS, styled to match the CRT/retro theme (e.g., glowing cyan outline).
- Logical tab order: TV knob → text input → mic button → settings/menu.

### R6b. Greeting Pool Size

**Decision**: 16 greetings total — 2 per archetype (8 archetypes × 2 variants).

**Rationale**: Provides sufficient no-repeat coverage for the 3-session no-repeat rule. With 16 greetings and a 3-session exclusion window, a returning visitor always has ≥10 eligible greetings. Two variants per archetype ensure archetype diversity isn't sacrificed by the exclusion filter.

**Impact**: Greeting manifest `minItems` updated from 8 to 16. Validation rule updated to require ≥2 per archetype.

### R6c. Visitor displayAlias Collection

**Decision**: Max asks in-character during the first session within the first 3 turns (e.g., "So what do they call you?"). Visitor's response is extracted and stored as `displayAlias`. If declined or unanswered, remains null.

**Rationale**: In-character collection preserves immersion. The alias is optional — Max uses generic references ("you", "my friend") when null. No separate form or modal; the conversation IS the collection mechanism.

**Implementation notes**:
- Agent system prompt includes a directive to ask for name within first 3 turns of a new visitor's first session.
- Memory extraction pipeline detects name-response patterns and stores as `displayAlias`.
- Subsequent sessions load `displayAlias` from AgentCore Memory and inject into system prompt context.

### R6d. Abuse Gate Removal

**Decision**: Shared-password abuse gate removed from all milestones.

**Rationale**: The unlisted URL combined with per-visitor rate limits (60/hr, 500/day) and the $10 hard-stop provide sufficient abuse protection for the friends-and-family audience (constitution P7). A password gate would degrade the "turn on the TV" first-impression experience.

**Previous design**: Earlier iterations considered a shared password prompt before the TV-on gesture. This has been explicitly rejected per spec clarification.

---

## R7. Agent Tool API Selection (Added 2026-04-22)

**Decision**: Max's agent has access to tools — news and weather in MVP, web search added in V1 — implemented as Strands `tool()` definitions in `packages/agent/src/tools/`. Specific API providers for news and weather are a Phase 3 implementation decision. Web search (delivery format and provider TBD) is deferred to V1 to reduce MVP scope and eliminate the unresolved format dependency.

**Rationale**: Tools give Max access to real-world data, enabling him to be genuinely useful while staying in character. The two-mode personality rule (FR-007) ensures Max remains evasive/editorial on topics without tool data, but reports factual tool results accurately — always in his stuttering, ironic, editorial voice. This makes Max more engaging without compromising the character.

**Tool categories**:

| Tool | Input | Output | Provider | Milestone |
|------|-------|--------|----------|-----------|
| News | Optional topic/query | Headlines, summaries, source attribution | TBD — evaluate during Phase 3 (e.g., NewsAPI free tier, RSS aggregation) | MVP |
| Weather | Location (city/region) | Temperature, conditions, forecast | TBD — evaluate during Phase 3 (e.g., OpenWeatherMap free tier, wttr.in) | MVP |
| Web Search | Query string | Search results (format TBD) | TBD — delivery format is an implementation detail to be resolved during development | V1 |

**Budget consideration**: External tool API costs must fit within the $10/month ceiling alongside LLM (~$0.003/turn) and Polly Neural (~$0.008/turn) costs. MVP tool cost estimate: **$0/month** — both candidate APIs offer generous free tiers that far exceed projected friends-and-family traffic:
- NewsAPI: 100 requests/day free tier (sufficient for friends-and-family traffic) — projected usage: <20 requests/day = $0
- OpenWeatherMap: 1,000 calls/day free tier (far exceeds projected usage) — projected usage: <20 requests/day = $0
- Web search (V1): Provider TBD; free-tier options exist (e.g., SearXNG self-hosted, DuckDuckGo Instant Answer API). Cost estimate will be documented when provider is selected.

**Implementation approach**: Each tool is defined using the Strands SDK `tool()` factory with Zod input/output schemas. The LLM decides autonomously when to invoke a tool based on the user's query. Tool results are returned to the LLM, which incorporates them into Max's editorial response. Failed tool calls return structured errors that the agent can riff on in-character.

**Alternatives considered**:
- Hardcoded responses: No real-world data; defeats the purpose.
- MCP servers: Heavier infrastructure; overkill for 3 simple HTTP-based tools.
- Frontend-side tool calls: Exposes API keys in client bundle; violates spec §Security ("no secrets in frontend bundle").

**Open items**:
- Specific news and weather providers to be selected during T114/T115 implementation.
- Web search tool format to be determined during T116 implementation.
- API keys (if required) will be injected as environment variables in the agent container.
