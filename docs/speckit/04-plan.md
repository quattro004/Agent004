# `/plan` — Max Height

> **Purpose:** The **HOW**. Given the WHAT in `/specify` and the decisions in `/clarify`, pick the technical approach.
> Source: `docs/initial-plan.md` is the technical appendix — this file *references* it, then adds any plan-level decisions or deltas Speckit needs.
> **Rule:** every choice here must trace back to a principle (`/constitution`) or requirement (`/specify`). If it can't, it's a preference, not a plan.

---

## 1. Architecture at a glance

See `docs/initial-plan.md` — Architecture diagram, tech stack table. Summary here:

- **Frontend**: React + Vite SPA, React Three Fiber for 3D, Zustand for UI state.
- **Agent backend**: Strands Agents SDK on Amazon Bedrock AgentCore Runtime (container via ECR).
- **LLM**: Amazon Bedrock, Claude 3.5 Haiku (`us-west-2`).
- **TTS**: Amazon Polly Neural (direct SDK, not via Gateway — streaming performance).
- **STT**: Web Speech API (browser built-in; privacy disclosure per `/clarify` NFR1).
- **Auth**: Cognito Identity Pool, guest/unauthenticated role.
- **Memory**: AgentCore Memory.
- **Tools**: AgentCore Gateway.
- **Observability**: AgentCore Observability.
- **Hosting**: S3 + CloudFront.
- **IaC**: CDK for S3/CloudFront/Cognito; AgentCore CLI for Runtime/Gateway/Memory.

---

## 2. Principle traceability

Each principle → where it's enforced in the plan:

- **P1 Cloud-only** → no ML deps in `apps/web/package.json`; PR denylist.
- **P2 $10 cap** → AWS Budgets + hard-stop Lambda disabling Cognito guest role; per-session token cap enforced in agent wrapper.
- **P3 Personality gate** → Phase 1.5 in `initial-plan.md`; `/tasks` will block Phase 2+ on rubric pass.
- **P4 IP** → asset pipeline excludes Matt-Frewer-derived media; naming convention in copy-deck.
- **P5 No live judge** → eval harness runs offline, golden-set only.
- **P6 Supply chain** → pinned versions; `npm audit` + `npm audit signatures` in CI.
- **P7 FnF** → no SEO, `robots.txt` disallow all, rate limits per `/clarify` N3.
- **P8 Degradation** → three fallback paths tested: no-WebGL, no-mic, cloud-down.
- **P9 Observability** → AgentCore Observability wired before feature #2; trace-span-first PR template.

---

## 3. Streaming / latency plan

Meets `/specify` §5 / `/clarify` N1 targets.

- **Token streaming**: WebSocket via AgentCore Runtime's built-in bidi streaming. No polling. No REST for the hot path.
- **TTS streaming**: Polly `SynthesizeSpeech` streamed chunks; audio starts before full text is generated.
- **Viseme timing**: Polly speech marks (server-side) → client animation driver.
- **Client rendering**: Web Audio API for playback + DSP (stutter/pitch glitch applied client-side); React Three Fiber for avatar. Avatar framing must satisfy `/specify` §6 (head-and-shoulders inside a CRT bezel, wireframe/vector backdrop, continuous low-level glitching). No full-body model, no free-floating head.

Cold-start: AgentCore Runtime warm-up pattern + "Max is waking up" UX for the ≤ 5s cold case.

---

## 4. Data & memory plan

- Conversation history lives in **AgentCore Memory**, not client state.
- A visitor identity = Cognito guest identity + a stable local actor ID; documented to the user per `/specify` §7.2.
- Memory deletion/export surfaced in UI per `/clarify` NFR2.
- Memory window: per `/clarify` S1 decision.

---

## 5. Cost model

Full breakdown in `docs/initial-plan.md`. Plan-level rules:

- **Claude 3.5 Haiku** is the only LLM path. No Sonnet/Opus. Guarded by per-session token cap (`/clarify` N4).
- **Polly Neural**, priced per character; response-length bounds (`/clarify` N7) are also cost controls.
- **AgentCore Runtime**: I/O-wait billing → WebSocket long-holds are effectively free.
- **AWS Budgets** wired at $5 / $8 / $10 per `/clarify` C1.
- Soft-degrade at $8: TTS disabled, text continues (per C1 recommendation).

---

## 6. Security plan

- **Secrets**: none in frontend bundle; any third-party API key held in AgentCore Identity.
- **Cognito**: guest role scoped to only the AgentCore Runtime WebSocket endpoint.
- **CSP**: strict CSP headers from CloudFront (script-src self + hashed inline only).
- **Prompt-injection posture**: system-prompt guardrails from `docs/max-personality-bible.md`; Max stays in character per `/clarify` NFR3.
- **Rate limits**: enforced in the agent entry-point per `/clarify` N3.

---

## 7. Observability plan

- **Traces** (AgentCore Observability) span: user input → agent → LLM → Polly → WebSocket emit. Correlated with a session ID.
- **Metrics**: TTFT, audio-start, cold-start count, rate-limit hits, per-session token use, $-spend.
- **Logs**: personality regression triage — every response stored with rubric-relevant signals (stutter density, editorial score, factuality triggers) for offline eval.

---

## 8. Repo structure

Per `copilot-instructions`:

```
apps/web/               # React + Vite SPA
packages/agent/         # Strands agent (AgentCore Runtime)
infrastructure/cdk/     # S3 / CloudFront / Cognito
infrastructure/agentcore/ # AgentCore CLI config
docs/                   # Specs, bible, this plan
```

No code is being written yet — structure is locked for when implementation starts.

---

## 9. Phasing (plan-level, not task-level)

From `initial-plan.md`, filtered by MVP boundary from `/specify` §2:

- **Phase 0** — repo scaffolding, CDK skeleton, observability baseline.
- **Phase 1** — agent backend, personality system prompt, text-only loop.
- **Phase 1.5 (gate)** — golden-set rubric pass per `max-personality-bible.md`.
- **Phase 3** — voice (Polly + Web Audio DSP).
- → **MVP ships to friends/family.**
- Phase 4/5 — 3D avatar + CRT scene.
- Phase 6/7 — polish / stretch.

Phase 2 (extra agent tools) is deferred until MVP data shows it's needed.

---

## 10. Deltas from `initial-plan.md`

Decisions from `/clarify` that override or tighten the initial plan:

- **Cost guardrails** — `initial-plan.md` names a $10 target. `/clarify` C1 adds a soft-degrade tier at $8 (disable Polly TTS; keep text), and a hard-stop at $10 (disable Cognito guest role). Both implemented in Phase 0.
- **Rate limits** — `initial-plan.md` says "light rate limiting." `/clarify` N3 locks 60 msg/visitor/hour, 500 msg/visitor/day, enforced at the agent entry point (not via Cognito IAM alone, since IAM rate-limiting is coarse).
- **Per-session cap** — new: 20,000 tokens OR 30 minutes per session (`/clarify` N4). Not in `initial-plan.md`.
- **Response length** — `max_tokens` = 120 per response, with a soft system-prompt instruction for length (`/clarify` N7). Tool outputs excluded from the cap.
- **Latency** — `initial-plan.md` mentions latency qualitatively. `/clarify` N1 locks P95 numbers: TTFT 1.5s, audio 2.5s, lip-sync 100ms, cold-start 5s.
- **Reference devices** — `/clarify` N2 locks iPhone 13 (iOS 16), Pixel 6 (Android Chrome), M1 MacBook Air (Safari+Chrome), mid-range Windows laptop (Edge+Firefox).
- **Memory window** — 30 days rolling (`/clarify` S1). AgentCore Memory TTL configured accordingly.
- **Privacy surfaces** — "Forget me" button + memory export (MVP); per-item delete (V1); STT third-party disclosure banner + persistent small-print. Not in `initial-plan.md`.
- **Prompt-injection posture** — stay in character and deflect for minor probes; clean refusal only for safety-critical content (`/clarify` NFR3).
- **Audience gating** — `/clarify` C2: unlisted URL + `robots.txt` disallow-all + rate limits, with a shared-password escape hatch pre-wired but off.
- **Budget-breach UX copy** — in-character "signal lost" state with draft copy in `/clarify` S3. Supersedes any sterile error state implied by `initial-plan.md`.

---

## 11. Out of scope at plan level

- Next.js / SSR.
- Lambda + API Gateway for the agent (AgentCore Runtime instead).
- Redux / Context for global state (Zustand).
- ElevenLabs / third-party TTS (Polly).
- On-device inference.
- Public-scale auth (friends & family only).

---

## Open questions for `/tasks`

- Which AgentCore Runtime container base image + Node version?
- CDK vs AgentCore CLI ownership boundary — who owns the Cognito Identity Pool?
- Golden-set harness: bespoke script or adopt an existing eval tool?
