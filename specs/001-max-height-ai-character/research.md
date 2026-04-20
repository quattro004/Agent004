# Research: Max Height AI Character

**Feature**: 001-max-height-ai-character
**Date**: 2026-04-19
**Status**: Complete — all NEEDS CLARIFICATION items resolved

---

## R1. Strands Agents TypeScript SDK

**Decision**: Use `@strands-agents/sdk` (v0.0.1-dev, pinned exact) with `bedrock-agentcore` (v0.2.2, pinned exact). The SDK is production-adjacent — actively maintained with weekly commits, 577 GitHub stars, comprehensive streaming support, and proven AgentCore deployment patterns.

**Rationale**:
- Full ESM, Node 20+, TypeScript-first. Excellent streaming via `agent.stream()` async generator delivering token-by-token events.
- Tool integration uses `tool()` factory with Zod schemas — type-safe, superior to Python SDK.
- Only 4 vended tools (bash, fileEditor, httpRequest, notebook) vs Python's 30+, but Max's needs (stutter injection, personality guards, editorial enforcement) are custom anyway.
- Hooks are **observational, not interceptive** — you can observe `afterModelCallEvent` and request retry (`event.retry = true`), but cannot modify response content mid-stream. Stutter injection must be post-processing on the complete response text, not mid-stream interception.
- AgentCore Runtime entry point uses `BedrockAgentCoreApp` from `bedrock-agentcore` with async generator yielding `{ event: 'message', data: { text } }` for SSE streaming.
- ⚠️ `zod@^4` peer dependency conflict — resolve with `--legacy-peer-deps` or pin `zod@^4.1.12`.

**Alternatives considered**:
- LangChain.js: Heavier, less type-safe, leaky abstractions. Consider only if Strands hits a critical bug.
- Direct Anthropic SDK: Full control but requires manual orchestration, no multi-agent.
- Python Strands SDK: More mature (30+ tools) but incompatible with TypeScript monorepo architecture.

---

## R2. AgentCore Runtime CDK Deployment

**Decision**: Use `@aws-cdk/aws-bedrock-agentcore-alpha` L2 constructs (CDK v2.250.0+) for Runtime, Memory, and Observability. WebSocket connections via API Gateway WebSocket API + Lambda integration with SigV4-signed presigned URLs.

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
