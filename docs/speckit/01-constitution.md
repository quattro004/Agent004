# `/constitution` — Max Height

> **Purpose:** Non-negotiable principles every later Speckit decision must respect.
> Source: `docs/speckit-plan.md` §1, promoted from implicit rules in `docs/initial-plan.md`.
> **Rule of thumb:** if it's a principle, any later `/plan` or `/tasks` decision that violates it is rejected — not re-debated.

---

## Core principles (carry over from initial-plan)

### P1. Cloud-only, no on-device AI
All LLM inference and TTS runs server-side on AWS. No on-device model weights, no WebGPU inference, no browser-side LLMs. Rationale: cost control, consistency, simplicity.

### P2. Budget ceiling — $10/month hard cap
Not a target; a rule with enforcement:
- AWS Budgets email alarm at $5 and $8.
- Hard-stop mechanism at $10 (e.g., Lambda disables Cognito guest role).
- Per-session token cap.
- No feature ships without a documented cost model.

### P3. Personality-first build order
The personality gate (Phase 1.5 in `initial-plan.md`) is a **hard gate**, not a checkpoint. No 3D, no polish, no stretch work until the golden-set rubric passes.

### P4. IP & legal posture
- Naming: **"Max Height"**, not "Max Headroom".
- No Matt Frewer voice clone or voice-model training on his likeness.
- Fan-project framing stated in the UI (About/footer).
- Non-commercial.

### P5. No real-time LLM-as-judge
Evaluation of personality uses offline golden sets and rubrics. Never a live LLM scoring live outputs in the hot path. (Cost + latency + feedback-loop hazard.)

### P6. Supply-chain discipline
- Pin exact SDK versions; no `^` / `~` on pre-1.0 dependencies.
- `package-lock.json` committed, never deleted.
- `npm audit` clean before merging dependency changes.
- New dependencies reviewed (maintainer, publish date, downloads) before adding.

### P7. Friends-and-family audience only
Not a public product. Has downstream implications:
- Auth posture: Cognito guest identity + per-session caps, not full user accounts.
- Moderation posture: minimal, because audience is trusted.

---

## Principles to add (gaps from review §1)

### P8. Graceful degradation is required, not optional
Three fallback axes, all must work end-to-end:
- **No WebGL** → 2D avatar fallback.
- **No microphone / permission denied** → text input surfaces as a fallback (not a permanent first-class surface — voice remains the primary UX).
- **Cloud unavailable** → friendly error state, never a white screen or silent failure.

### P9. Observability before features
If a behavior can't be seen in production traces, it doesn't ship. Trace-first:
- AgentCore Observability wired before the second feature.
- Every user-visible latency target (see `/specify`) has a corresponding trace span.
- Personality regressions must be diagnosable from traces + logs without a repro.

---

## Constitutional enforcement

Each principle must name:
- **Trigger** — what condition invokes it (e.g., "any new AWS resource" for P2).
- **Mechanism** — how it's enforced (automated alarm, lint rule, PR check, review gate).
- **Owner** — who signs off when the rule is the deciding factor.

The enforcement table is in [`03-clarify.md`](./03-clarify.md) — the "Constitutional enforcement table" section. All nine principles have trigger / mechanism / owner assigned.

---

## Open questions for `/clarify`

All resolved. See [`03-clarify.md`](./03-clarify.md):
- C1 → soft-degrade at $8, hard-stop at $10.
- C2 → unlisted public URL + `robots.txt` disallow + rate limits; shared-password escape hatch pre-wired but off.
