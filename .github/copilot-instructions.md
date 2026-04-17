# Copilot Instructions — Agent004 (Max Height)

> This file is a **small, stable steering layer** for Copilot. It does **not** restate the project's design.
> The authoritative source-of-truth for *what* this project is and *how* it's built lives in `docs/`.
> If anything here ever conflicts with `docs/speckit/`, the speckit docs win.

---

## 1. Read these before generating code

This project uses spec-driven development (GitHub Spec Kit). Do not infer requirements, architecture, or tech choices — read them.

Source-of-truth order (highest authority first):

1. `docs/speckit/01-constitution.md` — non-negotiable principles (P1–P9).
2. `docs/speckit/02-specify.md` — the **WHAT** (user-observable behavior, scenarios, acceptance criteria).
3. `docs/speckit/03-clarify.md` — locked decisions on ambiguous points (cost tiers, rate limits, latency budgets, reference devices, memory window, privacy surfaces, etc.). All hard numbers live here.
4. `docs/speckit/04-plan.md` — the **HOW** (architecture, tech stack, deltas from `initial-plan.md`).
5. `docs/speckit/05-tasks.md` — the ordered task list.
6. `docs/max-personality-bible.md` — the **personality source of truth**: 6-dimension rubric, stutter taxonomy, guardrails, 50-case golden set. Never re-derive personality rules inline.
7. `docs/initial-plan.md` — technical appendix and risk register. Useful background; superseded by speckit docs where they overlap.

If a user request references a number, behavior, or component you can't find in those docs, **ask** rather than invent. Do not guess at latency targets, cost thresholds, rate limits, or browser support.

---

## 2. Project identity

- **Name in code, copy, UI, and commits: "Max Height".** Never "Max Headroom" in any user-facing or repo-visible string. ("Inspired by Max Headroom" is acceptable in the README/About only.)
- Non-commercial fan project, friends-and-family audience. Do not add SEO, analytics SDKs, public-scale auth flows, or "growth" features.
- IP guardrails: no Matt Frewer voice cloning, no exact visual replica.

---

## 3. Constitution — quick reference

Full text in `docs/speckit/01-constitution.md`. These are **rules**, not preferences. Reject any change (yours or the user's) that violates one without first updating the constitution.

- **P1 Cloud-only** — no on-device AI inference (no WebGPU/WebLLM/transformers.js, no ML deps in `apps/web`).
- **P2 $10/month hard cap** — Budgets alarms + soft-degrade + hard-stop + per-session caps. Every new AWS resource must have a documented cost story.
- **P3 Personality-first** — Phase 1.5 personality gate is a hard gate. Do not scaffold 3D, CRT scene, or polish work until the golden-set rubric passes.
- **P4 IP & legal** — see §2.
- **P5 No real-time LLM-as-judge** — evaluation is offline, golden-set only. Never wire a live LLM scoring live outputs.
- **P6 Supply-chain discipline** — see §6.
- **P7 Friends-and-family only** — no public scale assumptions.
- **P8 Graceful degradation is required** — no-WebGL → 2D avatar; no-mic → text input fallback (voice remains primary); cloud-down → in-character "signal lost" state, never a white screen.
- **P9 Observability before features** — AgentCore Observability is wired before feature #2. Every user-visible latency target has a corresponding trace span. PRs that add behavior without traces are incomplete.

---

## 4. Repo layout (locked)

```
apps/web/               # React + Vite SPA
packages/agent/         # Agent backend (AgentCore Runtime) + Dockerfile
infrastructure/cdk/     # All AWS resources via CDK — including AgentCore
docs/                   # Specs, bible, speckit/, plans
```

- **CDK is the only IaC.** Includes AgentCore Runtime/Gateway/Memory/Identity. No AgentCore CLI in the deploy path. (See `04-plan.md` §1 for the alpha-module policy.)
- Do not add a top-level `infrastructure/agentcore/` directory.
- Do not introduce additional packages without an explicit ask.

---

## 5. Coding conventions

- **TypeScript everywhere** — frontend and backend. Strict mode on. ES modules (`import`/`export`).
- **Naming** — PascalCase for components/types, camelCase for functions/variables, kebab-case for file names.
- **State (web)** — Zustand for global UI state. No Redux, no Context-as-store, no Recoil/Jotai. Conversation history is **server-side** in AgentCore Memory, not client state.
- **3D (web)** — React Three Fiber, declarative JSX. Avoid imperative Three.js where R3F has an idiom.
- **Imports** — `@/` resolves to `src/` within a workspace package. Cross-package imports use the workspace package name, never relative paths across workspaces.
- **Comments** — only where intent isn't obvious from the code. No banner comments, no commented-out code.
- **Lint/format** — use whatever is configured in the repo. Do not invent your own ESLint/Prettier configs; if none exists yet, ask before adding.

---

## 6. Supply-chain rules (P6)

- Pin exact versions in `package.json` (no `^`, no `~`) for runtime deps; dev deps may use `^` only with explicit justification.
- `package-lock.json` is committed and never deleted.
- New dependency = one extra question: is this worth the maintenance and audit cost? A few lines of code beats a package most of the time.
- For each new dep: check maintainer, last publish, weekly downloads, and that it's signed (`npm audit signatures`) when possible. Prefer pmndrs / AWS / Vercel / well-known orgs.
- Never commit secrets. Third-party API keys live in AgentCore Identity. AWS region/config live in env vars and CDK context.

---

## 7. Hard "don'ts"

These exist because each one has been considered and rejected. Don't reopen them without an explicit user request.

- ❌ Next.js or any SSR. This is a pure SPA.
- ❌ Lambda + API Gateway for the agent. Use AgentCore Runtime.
- ❌ Redux / Context-as-global-store. Use Zustand.
- ❌ Storing conversation history client-side. Use AgentCore Memory.
- ❌ Any client-side AI inference (P1).
- ❌ ElevenLabs / third-party TTS. Use Polly Neural via direct SDK (not via AgentCore Gateway).
- ❌ Live LLM-as-judge in the hot path (P5).
- ❌ A second state library, a UI framework (Tailwind/MUI/Chakra), or an analytics SDK without an explicit ask.
- ❌ A service worker / PWA cache that includes LLM responses, Polly audio, Cognito tokens, AgentCore Memory data, or any per-conversation content. PWA caching is **app-shell only** per `docs/speckit/03-clarify.md` PWA1 and `docs/speckit/04-plan.md` §3a.
- ❌ Re-deriving Max's personality rules inline. Reference `docs/max-personality-bible.md`.
- ❌ Hard-coding cost thresholds, rate limits, latency budgets, or browser-support claims. Read `03-clarify.md`.

---

## 8. When generating code, verify

- Does this respect P1–P9? If not, stop.
- Is there a number involved (limit, threshold, timeout, version)? If yes, did it come from `03-clarify.md` / `04-plan.md`, or did I invent it?
- Does this introduce a new AWS resource or dependency? If yes, has it been costed and justified?
- Does this touch a user-visible behavior? If yes, is there a trace span and a fallback path (P8/P9)?
- Am I about to write "Max Headroom" anywhere a user could see it? Use "Max Height" (§2).

---

## 9. When in doubt

- Prefer asking the user a focused question over guessing.
- Prefer linking to a section of `docs/speckit/*` over restating it.
- If `docs/speckit/` is silent on something material, propose adding a clarification entry in `03-clarify.md` rather than making the call inline.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->
