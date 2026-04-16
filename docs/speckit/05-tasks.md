# `/tasks` — Max Height

> **Purpose:** Break `/plan` into executable, testable units. Each task has an owner, a definition of done, and a traceability link back to a `/specify` requirement or `/constitution` principle.
> **Rule:** no task without acceptance criteria. No acceptance criteria without a measurable signal.
> **Note:** this file is research/design — tasks are scaffolds, not yet estimated or scheduled.

---

## Task format

```
### TID. Title
- Phase: 0 / 1 / 1.5 / 3 / 4 / 5 / 6 / 7
- Traces to: /specify §X, /constitution PN
- Depends on: TID, TID
- Acceptance:
  - [ ] measurable outcome 1
  - [ ] measurable outcome 2
- Out of scope: ...
```

---

## Phase 0 — Foundation

### T0.1. Initialize monorepo
- Phase: 0
- Traces to: /constitution P6 (supply chain)
- Depends on: —
- Acceptance:
  - [ ] npm workspaces configured per `copilot-instructions`.
  - [ ] `package-lock.json` committed.
  - [ ] Prettier + ESLint + TypeScript configured.
  - [ ] `npm audit` clean.

### T0.2. Cost guardrails first
- Phase: 0
- Traces to: /constitution P2, /specify §7.4, /clarify C1
- Depends on: —
- Acceptance:
  - [ ] AWS Budget email alarms at **$5 / $8 / $10**.
  - [ ] **Soft-degrade Lambda at $8**: disables Polly in the Cognito guest IAM policy; text still works.
  - [ ] **Hard-stop Lambda at $10**: disables the Cognito guest role entirely; app shows budget-breach in-character copy (/clarify S3).
  - [ ] End-to-end drill: manually fire each alarm and confirm behavior.

### T0.3. Observability baseline
- Phase: 0
- Traces to: /constitution P9
- Depends on: —
- Acceptance:
  - [ ] AgentCore Observability active before any feature lands.
  - [ ] A trace-span PR template exists.

### T0.4. Legal / IP guardrails
- Phase: 0
- Traces to: /constitution P4
- Depends on: —
- Acceptance:
  - [ ] Naming conventions documented; CI check for "Max Headroom" / "Matt Frewer" in non-reference strings.
  - [ ] About / footer fan-project framing drafted.

---

## Phase 1 — Agent text loop

### T1.1. AgentCore Runtime skeleton
- Phase: 1
- Traces to: /plan §1, /specify §5
- Depends on: T0.1, T0.3
- Acceptance:
  - [ ] WebSocket round-trip from browser → AgentCore → echo response works.
  - [ ] TTFT measurable via traces.
  - [ ] TTFT P95 ≤ **1.5s** on at least one reference device (/clarify N2) with a trivial echo agent (full number validated after T1.2).
  - [ ] Cold-start P95 ≤ **5s** with in-character "buffering" UX covering the wait.

### T1.2. Personality system prompt v0
- Phase: 1
- Traces to: /specify §1, `max-personality-bible.md`
- Depends on: T1.1
- Acceptance:
  - [ ] System prompt sourced directly from the bible; no paraphrase.
  - [ ] Prompt-injection tests per /clarify NFR3 pass.

### T1.3. Rate limit & session cap
- Phase: 1
- Traces to: /specify §7.4, /clarify N3, N4
- Depends on: T1.1
- Acceptance:
  - [ ] Per-visitor rate limit: **60 msg/hour, 500 msg/day** enforced at agent entry point.
  - [ ] Session cap: **20,000 tokens OR 30 minutes**, whichever first.
  - [ ] Response length: `max_tokens` = **120** + soft system-prompt length instruction.
  - [ ] Breach produces in-character refusal copy (stutter + catchphrase; matches bible §3).

### T1.4. Memory wiring
- Phase: 1
- Traces to: /specify §6, §7.2
- Depends on: T1.2
- Acceptance:
  - [ ] AgentCore Memory stores + recalls per /clarify S1 (30-day rolling) and S2 (facts > summaries > vibe).
  - [ ] User-facing "Forget me" one-click wipe clears AgentCore Memory + localStorage `actorId` (MVP).
  - [ ] "Export what Max remembers" produces a JSON download (MVP).
  - [ ] Per-item delete UI — deferred to V1 per /clarify D1.

---

## Phase 1.5 — Personality gate (HARD)

### T1.5.1. Golden-set harness
- Phase: 1.5
- Traces to: /constitution P3, /specify §6, `max-personality-bible.md` §9
- Depends on: T1.2
- Acceptance:
  - [ ] 50-case golden set executable offline.
  - [ ] 6-dimension rubric computed.
  - [ ] Result: avg ≥ 2.0, zero auto-fail triggers.

### T1.5.2. Gate enforcement
- Phase: 1.5
- Traces to: /constitution P3
- Depends on: T1.5.1
- Acceptance:
  - [ ] Phase 2+ tasks blocked in `/tasks` tooling until T1.5.1 passes.

---

## Phase 3 — Voice (MVP completion)

### T3.1. Polly streaming TTS
- Phase: 3
- Traces to: /specify §5, /clarify N1
- Depends on: T1.5.2
- Acceptance:
  - [ ] Audio-start P95 ≤ **2.5s** on reference devices.
  - [ ] Speech marks captured (one Polly call for audio, one for visemes — cost noted in /plan §5).
  - [ ] Browser calls Polly directly via Cognito SigV4 (not through WebSocket).
  - [ ] Soft-degrade path: when $8 alarm fires, Polly IAM removed; client falls back to text gracefully.

### T3.2. Web Audio glitch DSP
- Phase: 3
- Traces to: /specify §1, `max-personality-bible.md` §2.1 stutter taxonomy
- Depends on: T3.1
- Acceptance:
  - [ ] All 6 stutter types from bible §2.1 implementable as audio effects.
  - [ ] Stutter/pitch glitch applied client-side via AudioWorklet.

### T3.3. Fallback paths
- Phase: 3
- Traces to: /constitution P8, /specify F1/F2/F4/F5
- Depends on: T3.1
- Acceptance:
  - [ ] No-mic path (F2): text input works; no repeated nag to enable mic.
  - [ ] Cloud-down path (F1): friendly retry state; no white screen.
  - [ ] Budget-breach (F4): in-character "signal lost" state using /clarify S3 draft copy.
  - [ ] Prompt-injection (F5): stays in character per /clarify NFR3; verified against 10 canned injection prompts.

### T3.4. STT disclosure and mic interaction
- Phase: 3
- Traces to: /specify §8.1, /clarify NFR1, NFR4
- Depends on: —
- Acceptance:
  - [ ] One-time banner on first mic activation names the browser's speech provider (Google / Apple) + links to privacy page.
  - [ ] Persistent small-print label adjacent to the mic control.
  - [ ] Banner dismissal persisted per-visitor.
  - [ ] Mic is press-and-hold (per NFR4): capture starts on pointerdown/keydown-Space, ends on pointerup/keyup or pointer leaving the button; no toggle mode, no continuous listening.
  - [ ] Hot-mic state is visually unambiguous while held ("ON AIR" / red pulse) and cleared immediately on release.
  - [ ] Release under 300 ms with no speech detected = cancel (no submit, no error toast).
  - [ ] Releasing outside the button ends capture (no stuck hot mic).

### **MVP SHIP GATE**
- All of Phase 0, 1, 1.5, 3 acceptance criteria met.
- Latency §5 targets met at P95 on the /clarify N2 reference device set.
- First-laugh metric pass: **N=5** newcomers, **≥ 3** react within first 5 responses (/clarify N6).
- Cost-alarm drill complete: $5/$8/$10 behaviors verified live.

---

## Phase 4 — 3D avatar (V1)

### T4.1. R3F avatar + lip-sync
- Phase: 4
- Traces to: /specify §5, `initial-plan.md` Phase 4
- Acceptance:
  - [ ] Viseme-driven lip-sync; visual offset P95 ≤ **100ms**.
  - [ ] 60fps on desktop reference devices; 30fps on mobile (/clarify N2).

### T4.2. No-WebGL fallback
- Phase: 4
- Traces to: /constitution P8, /specify F3
- Acceptance:
  - [ ] 2D avatar (Canvas/CSS) path auto-activates when WebGL is unavailable.
  - [ ] Lip-sync still works in 2D mode.
  - [ ] Tested with WebGL explicitly disabled in browser flags.

---

## Phase 5 — CRT scene (V1)

### T5.1. CRT shader + glitch system
- Phase: 5
- Traces to: /specify §1
- Acceptance:
  - [ ] Shader + glitch system runs at target framerate on /clarify N2 reference devices.

---

## Phase 6/7 — Polish / stretch

Scaffold — populated after MVP + V1 land. Candidates drawn from `initial-plan.md` Phase 6–7:

- Polish pass on personality regressions surfaced in production traces (P9).
- Responsive design verification across the /clarify N2 reference device set.
- Memory per-item delete UI (lifts /clarify D1).
- WebRTC voice streaming (lifts /clarify D2) — only if latency targets fail to hold.

---

## Cross-cutting tasks

### TX.1. Personality regression triage dashboard
- Traces to: /constitution P9
- Acceptance:
  - [ ] Per-response stutter / editorial / factuality signals persisted.
  - [ ] Regression diagnosable without local repro.

### TX.2. Rollback drill
- Traces to: /constitution P9, /specify §7.4
- Acceptance:
  - [ ] Can roll back a bad system-prompt change in < 5 minutes.

---

## Exit criteria for `/tasks`

- Every task has acceptance + traceability.
- Every /specify success criterion has ≥ 1 task producing a measurable signal for it.
- Every /constitution principle has ≥ 1 enforcement task.
