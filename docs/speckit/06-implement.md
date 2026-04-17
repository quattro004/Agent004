# `/implement` — Max Height

> **Purpose:** Execution rules for when `/tasks` starts turning into code.
> **Scope of this file right now:** research/design only. No code has been written. This file pre-commits to *how we'll execute*, so the rules are in place before the first line.
> **Rule:** every PR that merges must be traceable to a task in `/tasks` and, transitively, to a requirement in `/specify` or a principle in `/constitution`.

---

## 1. Execution order

Strictly gated:

1. Phase 0 (foundation + cost guardrails + observability + IP guardrails) must finish **before** Phase 1.
2. Phase 1.5 personality gate must pass **before** any Phase 2+ work.
3. MVP ship gate (end of Phase 3) must be met **before** Phase 4.
4. V1 (Phases 4–5) must be complete **before** polish (Phases 6–7).

No skipping. No "observability comes after the fun stuff" — the `/constitution` forbids it.

---

## 2. Per-PR requirements

Every pull request must include:

- **Traceability line**: `Task: TID — /specify §X / /constitution PN`.
- **Acceptance-criteria checkbox list** copied from the task; checked as evidence accumulates.
- **Trace-span evidence** for any user-visible latency or new feature (per P9).
- **Cost delta note** for any new AWS resource (per P2).
- **Supply-chain note** for any new dependency: version pin, last-publish date, maintainer (per P6).
- **`npm audit`** clean (or documented waiver).

---

## 3. Definition of Done

A task is done only when:

- All acceptance criteria checked with linked evidence (trace ID, screenshot, test output).
- Rollback path documented (per `/plan` §8 / `/specify` §7.4).
- Any new user-visible behavior has a fallback for P8 (no-WebGL, no-mic, cloud-down) — or an explicit documented reason it doesn't need one.
- Observability signals wired per P9 before the feature is considered shippable.
- No new TODOs in production paths without an issue link.

---

## 4. Coding conventions (from `copilot-instructions`)

- TypeScript everywhere.
- ES modules.
- Prettier defaults, ESLint + TS rules.
- `@/` path alias for `src/`.
- PascalCase components/types, camelCase fns/vars, kebab-case filenames.
- Zustand for global state — no Redux, no Context.
- React Three Fiber declarative JSX — avoid imperative Three.js.
- Pin exact versions on pre-1.0 deps. Never delete `package-lock.json`.

---

## 5. Prohibitions (restated, for enforcement)

From `copilot-instructions`:

- No Next.js / SSR.
- No Lambda + API Gateway for the agent.
- No Redux / Context for global state.
- No client-side LLM / TTS inference.
- No ElevenLabs.
- No routing TTS through AgentCore Gateway.
- No exact Max Headroom replicas.
- No secrets in code.
- **No service worker that caches LLM responses, Polly audio, Cognito tokens, or AgentCore Memory data.** PWA caching is restricted to the app shell per `/clarify` PWA1 and `/plan` §3a. Any PR that broadens the SW cache list to include per-conversation content is rejected at review without debate.

Any PR proposing one of these is rejected at review without debate.

---

## 6. Testing posture

- **Unit**: vitest for frontend + agent utilities.
- **Golden-set eval**: offline harness from T1.5.1; runs per PR that touches the system prompt.
- **Integration**: one WebSocket round-trip test per critical path (input → agent → TTS → client).
- **Manual**: user-testing session with N=5 newcomers before MVP ship (per /specify §6).

No real-time LLM-as-judge anywhere, ever (P5).

---

## 7. Release + rollback

- Frontend: CloudFront with explicit cache-busting; previous build kept as a one-click rollback target.
- Agent: AgentCore Runtime versioned; rollback to prior image in < 5 min (TX.2).
- System prompt changes: stored in git; rollback = revert + redeploy agent.

---

## 8. On-call / operational

- Audience is friends & family (P7) — "on-call" = email alarm on cost, error-rate, or cold-start spike.
- Incident = any of:
  - $ alarm fires ($5 info / $8 soft-degrade / $10 hard-stop).
  - Error rate > **5%** over **10 min** (per /clarify D4).
  - Cold-start P95 > **8s** over **1 hour** (per /clarify D4).
  - Personality regression confirmed from triage dashboard (per TX.1).
- Response pattern: rollback first, diagnose after.

---

## 9. When things don't fit

If a task arrives that can't meet the rules above without breaking a principle:

1. **Do not** silently relax the rule.
2. File an explicit deferral in `/clarify`'s "Deferred" section with owner + revisit trigger.
3. Only then modify the task.

The `/constitution` is the contract; everything else serves it.

---

## 10. Status

**As of this writing, the `/constitution`, `/specify`, `/clarify`, `/plan`, and `/tasks` passes are drafted and internally consistent. Nothing has been implemented.** The repo contains only `docs/`. This file is the contract for when implementation starts.
