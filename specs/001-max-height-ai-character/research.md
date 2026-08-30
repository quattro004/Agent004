# Research: Max Height AI Character

**Feature**: 001-max-height-ai-character
**Date**: 2026-04-20
**Status**: Complete — all NEEDS CLARIFICATION items resolved. Updated 2026-08-30 with a dependency refresh to latest stable and the deliberate deferral of three majors (TypeScript 7, pnpm 12, Node 26) — see `R15`. Previously updated 2026-06-07 with dependency upgrade to latest stable (TS 6.0.3, React 19.2.7, CDK 2.258.0, Strands SDK 1.4.0, Vitest 4.1.8 security fix). Previously updated 2026-04-22 with Node.js 24 LTS upgrade (Node 20 EOL April 30, 2026), TypeScript pinned to 5.8.x for MVP stability, Vite patch bump. Previously updated 2026-04-20 with Claude Haiku 4.5 migration, AgentCore CLI adoption, version refresh, and spec clarification session 2.

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
| React | 19.x (19.2.7) | Latest stable |
| Vite | 8.x (8.0.16) | Rolldown bundler (Rust-based) |
| TypeScript | 6.0.x (6.0.3) | Latest stable — upgrade from 5.8.x (post-MVP adoption) |
| Zustand | 5.x (5.0.14) | Latest stable |
| React Three Fiber | 9.x | R3F v9 = React 19 compatible; used in MVP for CRT shader + wireframe backdrop |
| `@strands-agents/sdk` | 1.4.0 | Latest stable (upgraded from 1.0.0-rc.5) |
| `@aws/agentcore-cli` | 0.9.1 | GA, recommended for new projects |
| AWS CDK | 2.x (2.258.0) | Latest stable (upgraded from 2.250.0) |
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
- ⚠️ **Zod 4 peer dependency conflict** may still apply — `@strands-agents/sdk` and its transitive dependencies may require different Zod major versions (some packages still on Zod 3 vs Zod 4). pnpm strict peer dependency resolution can surface install errors early. **Preferred resolution**: force a single Zod 4 version via an `overrides` block in **`pnpm-workspace.yaml`** (an `overrides:` mapping containing `zod: ^4.4.3`). Note that pnpm reads overrides *only* from `pnpm-workspace.yaml`: a top-level `overrides` key in `package.json` is npm-only, and pnpm 11 also ignores `pnpm.overrides` in `package.json` — either is silently a no-op. Keep the override floor at or above the `zod` version declared by `packages/agent` so it can never resolve below that package's own dependency. Zod 4 ships a `zod/v3` compatibility mode (`z.setCompatMode(true)`) for gradual migration of Zod 3 consumers. Avoid bypassing peer checks in production workflows. Latest stable Zod version at time of research: **4.3.6** (April 2026); the workspace currently resolves **4.4.3**.

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

**Decision**: Primary voice: **Matthew** (Neural, US English) — warmest broadcaster tone. SSML `<prosody rate="105%">` for slight smugness. Raised pitch and nasal quality via client-side DSP (`pitch-processor` and 4–6 kHz EQ boost in AudioWorklet). **Gregory** as alternative if A/B testing reveals better fit.

**Rationale**:
- Matthew best matches "broadcaster cadence + slightly smug" requirement.
- SSML support on Neural is **partial**: `<break>`, `<say-as>`, `<phoneme>` are available, but `<prosody>` accepts only `volume` and `rate` (**no `pitch`**) and `<emphasis>` is **not available**. Unsupported SSML in a neural request is rejected by Polly, so pitch is applied at playback instead (see `contracts/polly-tts.md` §SSML Wrapping). Tags do NOT count toward 3,000-character billing limit.
- Viseme support: 13–14 US English visemes returned via `SpeechMarkTypes: ["viseme"]`. Timing accuracy ±50–100ms (acceptable for 60fps with `VisemeScheduler` compensation).
- Dual-call architecture confirmed: `Promise.all()` for audio MP3 + viseme JSON. Both billed separately on character count.
- Cost: $16.00/1M characters Neural (Standard is $4.00/1M; Generative $30.00/1M). At ~200 chars/response × 2 calls = $0.0064/response. ~$0.20–0.80/month at projected volume — still comfortably inside the $10/month cap.
- Browser direct call: `@aws-sdk/client-polly` v3 is ~85KB tree-shaken. No CORS issues with SigV4 signing via Cognito credentials.

**Alternatives considered**:
- Stephen (Neural): Sharper articulation, less warmth. Better for technical delivery, less for editorial commentary.
- ElevenLabs: 11.25x more expensive, voice cloning raises IP concerns.
- Google Cloud TTS: 4x more expensive than Polly Neural.

**Open question — `pitchFactor` value**: the `pitch-processor` worklet ships `pitchFactor = 1.05`
(+5%), while this section's intent was +10%. The browser-TTS fallback's `pitch = 1.2` is **not** a
comparable figure (different unit — see `contracts/polly-tts.md` §Browser TTS Fallback). Raising the
worklet toward 1.10 is gated on replacing its naive per-block resampling, which currently discards
the tail of every 128-frame block and would drop proportionally more audio at a higher factor.
Tracked as Phase 4 tuning work alongside `MOUTH_THRESHOLD`.

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

---

## R8. Web Speech API STT Enhancements

**Decision**: Enhance the existing Web Speech API `SpeechRecognition` implementation with two optional features: on-device processing and contextual biasing. Both are progressive enhancements that degrade gracefully on unsupported browsers.

**Date**: 2026-05-22

### R8a. On-Device Speech Recognition

**Decision**: Add `processLocally = true` as an opt-in user preference for privacy-conscious visitors. Default remains server-based (current behavior).

**Rationale**:
- Privacy benefit: audio never leaves the device when enabled.
- Performance benefit: lower latency, works offline after language pack download.
- Constitution P1 compliance: The constitution's evidence column already approves Web Speech API as "not a local model" — on-device processing is an optimization of the same browser-native API, not a custom model weight.
- Progressive: If `SpeechRecognition.available()` returns `"unavailable"`, feature is hidden from UI.

**Browser support (May 2026)**:
- Chrome 128+ (desktop and Android): Full support including `available()`, `install()`, `processLocally`.
- Edge: Follows Chrome (Chromium-based).
- Safari / iOS: Not supported — falls back to server-based recognition silently.
- Firefox: Not supported — falls back to server-based recognition silently.

**Implementation approach**:
1. Feature-detect via `SpeechRecognition.available({ langs: ["en-US"], processLocally: true })`.
2. If `"available"` or `"downloadable"`: expose toggle in settings UI.
3. If user enables: set `recognition.processLocally = true` before `start()`.
4. If language pack needed: trigger `SpeechRecognition.install()` with user-visible progress.
5. Update `SpeechDisclosure.tsx`: when on-device is active, show "processed locally" instead of third-party provider name.

**Alternatives considered**:
- Always-on local: Too aggressive; language pack download is a one-time cost but may confuse users.
- Remove server-based entirely: Would break Safari/Firefox visitors.

### R8b. Contextual Biasing

**Decision**: Use `SpeechRecognitionPhrase` to boost recognition of Max-specific vocabulary.

**Rationale**: Max uses distinctive terms, character names, and retro-tech vocabulary that standard speech recognition may misidentify. Contextual biasing improves accuracy without changing the recognition engine.

**Phrases to boost** (initial set):
| Phrase | Boost | Reason |
|--------|-------|--------|
| "Max Height" | 5.0 | Character name — critical to recognize correctly |
| "signal lost" | 3.0 | Error state terminology |
| "on air" | 3.0 | UI state vocabulary |
| "glitch" | 2.0 | Common in retro-tech context |
| "broadcast" | 2.0 | Character's self-framing |

Additional phrases may be added based on personality bible catchphrases during implementation.

**Browser support (May 2026)**:
- Chrome 128+ with on-device recognition: Full support.
- Other browsers: `SpeechRecognitionPhrase` constructor not available — graceful no-op.

**Implementation approach**:
1. Feature-detect `SpeechRecognitionPhrase` constructor existence.
2. If available: create phrase objects and set `recognition.phrases`.
3. If unavailable: skip silently (no error, no fallback needed).

**Alternatives considered**:
- Server-side post-processing: More complex, adds latency, couples STT to backend.
- Custom vocabulary grammar (`SpeechGrammarList`): Deprecated/limited; contextual biasing supersedes it.

---

## R9. Browser TTS Budget Fallback (SpeechSynthesis)

**Decision**: Use the browser's native `SpeechSynthesis` API as a degraded voice fallback when Amazon Polly is budget-capped at the $8 soft-degrade threshold. Polly remains the primary TTS.

**Date**: 2026-05-22

**Rationale**:
- Currently, hitting the $8 budget threshold completely disables voice — Max goes text-only. This is a UX cliff.
- Browser `SpeechSynthesis` is free (no AWS cost), which is exactly what's needed when budget is the constraint.
- Aligns with P8 (Graceful Degradation): voice quality degrades rather than disappearing entirely.
- No constitution amendment needed: Polly remains the mandated primary TTS; browser TTS is an additive fallback behavior.
- In-character framing makes the transition acceptable: Max can acknowledge the quality shift ("Signal's getting weak... must be the budget cuts").

**Limitations (important — why this is fallback-only, not a Polly replacement)**:
| Factor | Impact |
|--------|--------|
| Voice varies by OS/browser | Cannot guarantee consistent character voice |
| No raw audio buffer access | AudioWorklet chain (stutter, pitch, static, EQ) cannot be applied |
| No SSML support | Cannot apply pitch +10% / rate 105% reliably |
| No viseme data | V1 lip-sync preparation not possible |
| Quality varies | Some platforms (Linux, older Android) have robotic voices |

**Voice selection strategy**:
1. Call `speechSynthesis.getVoices()`.
2. Prefer: `en-US` locale, name containing "Google" or "Microsoft" (higher quality neural voices on those platforms).
3. Fallback: any `en-US` voice, then any `en` voice, then default voice.
4. Set `pitch = 1.2` and `rate = 1.05` (approximate Max's SSML prosody using SpeechSynthesis params).

**Activation trigger**:
- `budgetDegradation.ts` receives `session_state_change` event with budget soft-degrade ($8 threshold).
- Switch TTS provider from Polly to browser `SpeechSynthesis`.
- On first fallback utterance: prepend in-character signal-degradation message.
- If `speechSynthesis` unavailable: remain text-only (current behavior).

**Cost impact**:
- Polly cost at $8 threshold: $0 (disabled by soft-degrade).
- Browser TTS cost: $0 (free, no AWS calls).
- Effect: Visitors still hear Max's responses (degraded quality) instead of silence.

**Browser support**:
- Chrome/Edge: Excellent — multiple high-quality voices available.
- Safari/iOS: Good — Apple voices are high quality.
- Firefox: Good — uses OS voices.
- Android Chrome: Acceptable — Google voices available.

**Alternatives considered**:
- Keep text-only at $8: Simpler, but violates the spirit of P8 since voice can still be provided at zero cost.
- Pre-generate a limited set of budget-mode audio: Doesn't cover dynamic LLM responses.
- Third-party free TTS (e.g., Coqui): Adds dependency, quality uncertain, may not be truly free long-term.

---

## R15. Dependency Refresh and Deferred Majors (2026-08-30)

**Decision**: Refresh all dependencies to latest stable *within their current
major*. Defer three available majors — TypeScript 7, pnpm 12, and Node.js 26 —
and align `@types/node` to the Node 24 LTS line.

**Adopted**:

| Package | From | To |
|---------|------|-----|
| pnpm | 11.0.8 | 11.24.0 |
| `@strands-agents/sdk` | 1.4.0 | 1.15.0 |
| `zod` | 4.4.3 | 4.5.2 |
| `aws-cdk-lib` | 2.265.0 | 2.267.0 |
| `@aws-cdk/aws-bedrock-agentcore-alpha` | 2.258.0-alpha.0 | 2.267.0-alpha.0 |
| `aws-cdk` | 2.1136.0 | 2.1139.0 |
| all `@aws-sdk/*` | 3.1110.0 | 3.1121.0 |
| `@testing-library/jest-dom` | 6.10.0 | 7.0.1 |
| `jsdom` | 29.1.1 | 30.0.1 |
| `@types/node` | 25.9.x | 24.13.3 |
| `vite` / `vitest` / `eslint` / `jest` / others | — | latest in-major |

**Deferred majors and rationale**:

- **TypeScript 7.0.2 — blocked.** TS 7 is the Go-native port (`tsgo`). It ships
  *without the public compiler API*, which `typescript-eslint` requires; the API
  is not planned until 7.1. Adopting it would break `pnpm run lint`. TS 6.0.3 is
  already the newest 6.x release. Revisit when 7.1 ships and `typescript-eslint`
  declares support.
- **pnpm 12.1.0 — deferred.** Released 2026-08-26 as a Rust rewrite. The npm
  `latest` tag still points at the 11.x line; v12 is opt-in via the `next-12`
  tag. Not appropriate for a project whose onboarding path must be dependable.
  11.24.0 is the newest stable 11.x.
- **Node.js 26 — deferred.** Node 24 is Active LTS as of August 2026; Node 26 is
  Current and does not enter LTS until October 2026. `.nvmrc` stays at 24.

**`@types/node` alignment**: the repo was on the 25.x line while running Node 24
LTS, so it typed against APIs absent from the runtime. Moved to 24.13.3 so types
track the runtime major.

**Supply-chain note**: pnpm 11.24 enforces a `minimumReleaseAge` policy on the
lockfile, which directly implements constitution P6 (review publish date before
adding a dependency). It rejected `zod@4.5.4` and `4.5.3` as published only hours
earlier; `4.5.2` is the newest release that clears the policy. Because the check
verifies the lockfile *before* resolving, a lockfile produced by an older pnpm
may need to be restored from the last committed state and re-resolved under
11.24 rather than patched in place.

**Alternatives considered**:
- Adopt TS 7 for the ~10x faster type check: rejected — breaks lint until 7.1.
- Adopt pnpm 12 now: rejected — not on the `latest` tag; contradicts the goal of
  a dependable fresh-clone setup.
