# Pre-Speckit Review — Max Height (`docs/initial-plan.md`)

## Problem statement

The user is about to run the project through **Speckit** (GitHub Spec Kit) to produce formal specs. The current `docs/initial-plan.md` is unusually thorough (architecture, cost, phases, gotchas, version pins), but Speckit's flow — `/constitution` → `/specify` → `/clarify` → `/plan` → `/tasks` → `/implement` — has specific inputs at each stage. Material that is great for a project README can actively *hurt* Speckit if it smuggles HOW into the WHAT.

This document is a focused review of **critical gaps that would block or derail Speckit**, grouped by the Speckit phase where they'd first bite.

---

## 1. Constitution (missing — Speckit's first step)

Speckit `/constitution` wants **non-negotiable principles** that every later decision must respect. The current plan has these implicitly scattered across sections; they need to be lifted out and stated as *rules*, not preferences:

- **Cloud-only, no on-device AI.** (stated — keep)
- **Budget ceiling: $10/month hard cap with automated cost alarms.** (stated as a target; must become a rule with an enforcement mechanism — AWS Budgets alarm + per-session token caps)
- **Personality-first build order.** (stated — keep)
- **IP/legal: "Max Height" naming, no Matt Frewer voice clone, no exact replica, fan-project positioning.** (stated — keep; formalize as a principle, not just a note)
- **Personality gate is a hard gate.** Phase 1.5 cannot be skipped. (stated — keep)
- **No real-time LLM-as-judge.** (stated as a cost decision; promote to principle so it isn't quietly reintroduced later)
- **Pin exact SDK versions; no `^`/`~` on pre-1.0 dependencies.** (stated in "Supply Chain Security" copilot-instructions and the risks section — promote to constitution)
- **Friends-and-family-only audience; not a public product.** (stated — keep; has downstream implications for auth, moderation, scaling)

**Gaps that should also be constitutional:**
- **Accessibility baseline** — reduced-motion support is non-negotiable for a CRT/glitch-heavy UI (WCAG 2.1 `prefers-reduced-motion`). Currently absent from the plan entirely.
- **Graceful degradation is required, not optional.** The plan mentions it; make it a principle (text-only must always work; no-WebGL must work; no-mic must work).
- **Observability before features.** If you can't see it in production, you can't debug the personality. Trace-first.

---

## 2. WHAT vs HOW separation (biggest Speckit-specific risk)

Speckit `/specify` wants a **user-facing, technology-agnostic** spec. `initial-plan.md` mixes the two heavily and will confuse the `/specify` step. Concretely, the following belong in `/plan` (HOW), not `/specify` (WHAT):

- Tech stack table (React, Vite, Zustand, R3F, Strands, AgentCore, Polly, Cognito, S3+CloudFront)
- Version pins and SDK risk notes
- Architecture diagram
- Polly dual-call billing, Cognito 5-minute presigned URL behavior, AudioWorklet vs ScriptProcessorNode
- Project directory structure
- "Why X over Y" decisions

And the following, currently under-developed, belongs in `/specify` (WHAT):

- **User journeys/scenarios** as prose, e.g. "First-time visitor on desktop", "Returning visitor on iOS Safari", "User with reduced-motion preference", "User whose mic is blocked".
- **Observable behaviors** phrased without tech: "Max responds within 2 seconds of the user finishing their message", not "stream tokens over WebSocket from AgentCore Runtime."
- **Success criteria** as user-observable outcomes: "A family member unfamiliar with Max Headroom laughs at least once within the first 5 responses in user testing."

**Recommendation:** Before running `/specify`, produce a clean **`docs/product-spec.md`** extracted from `initial-plan.md` that contains only the WHAT. Keep `initial-plan.md` as the tech/ops appendix. Feed `product-spec.md` into Speckit.

---

## 3. Missing acceptance criteria (will block `/clarify` and `/tasks`)

Speckit generates tasks from testable requirements. Several key requirements in the plan are aspirational rather than testable:

| Current (aspirational) | Needs (testable) |
|---|---|
| "95%+ personality accuracy" | Defined: golden-set avg ≥ 2.0 across 6 dimensions, zero auto-failure triggers (already in Phase 1.5 — **promote this to the spec's acceptance criteria** so Speckit sees it) |
| "Max never gives a straight factual answer" | "Zero factual responses in the golden set's 10 factual prompts score 0 on the 'editorial mode' dimension" |
| "Cross-session memory feels natural" | "In test suite X, Max correctly references a fact from a prior session within 3 turns, N% of the time" |
| "Target 60fps desktop, 30fps mobile" | Named reference devices, measurement method, pass/fail thresholds |
| "Feels like Max" (gut check) | Structured evaluator panel protocol (N reviewers, rubric, quorum) — gut check is fine, but it needs ground rules to be a Speckit acceptance criterion |
| "Light rate limiting" | Concrete numbers (e.g., 60 messages/user/hour, 500 messages/user/day) |
| "Under $10/month" | Alarm threshold, what happens on breach |

**Latency budget is entirely missing.** Speckit will ask. Needs numbers like:
- Time to first token (TTFT): P95 ≤ 1.5s
- Time to audio start: P95 ≤ 2.5s
- Time to lip-sync start after audio: P95 ≤ 100ms
- Cold-start tolerance: P95 ≤ 5s with "Max is waking up" UX

**Browser support matrix is vague** — "modern browsers" won't survive `/clarify`. Pin: Chrome/Edge last 2 major, Safari 16+, iOS 16+, Firefox last 2 (with documented Web Speech caveat), Android Chrome last 2.

---

## 4. Scope boundary / MVP definition (will block `/plan`)

The plan has 7 phases but no clearly labeled **MVP line**. Speckit will ask "what's in v1?" Recommend pre-deciding:

- **MVP = Phase 1 + 1.5 + 3** (text + voice, no 3D yet; 2D placeholder avatar) — shippable to family, proves the core value prop (personality + voice).
- **V1.0 = + Phase 4, 5** (3D avatar, CRT scene).
- **V1.x = Phase 6 polish + Phase 7 stretch.**

Or whatever boundary the user prefers — but pick one before `/specify`, because it changes which scenarios are in-scope.

---

## 5. Personas & scenarios (thin in current plan)

"Friends and family" is one audience string. `/specify` wants concrete personas. Suggest at minimum:

- **Max fan** (knows the 80s show; wants authenticity)
- **Max newcomer** (no context; needs to enjoy the bit without knowing the reference)
- **Mobile-first visitor** (iOS Safari, tap-to-wake, reduced effects)
- **Accessibility-conscious visitor** (reduced-motion, keyboard-only, screen reader — even if SR isn't fully supported, the fallback behavior must be specified)
- **Mic-blocked visitor** (corporate device, strict privacy settings)

Each persona needs a happy-path scenario and at least one failure-mode scenario.

---

## 6. Non-functional requirements not called out as first-class

These are scattered or missing; Speckit will want them as a named section:

- **Accessibility** — reduced-motion, captions/subtitles for Max's speech (huge miss for a voice-primary app), keyboard navigation, color contrast of CRT overlay, focus indicators that survive the glitch shader.
- **Privacy** — Web Speech API sends audio to Google/Apple; needs an explicit in-UX disclosure, not just a "privacy notice" mentioned in passing. Memory deletion/export for users. Local storage policy for actorId.
- **Security** — Cognito IAM scope-down, CSP headers via CloudFront, no secrets in frontend bundle, prompt-injection posture for user input.
- **Cost protection** — AWS Budgets with email alarm at $5 and $8; hard-stop at $10 via Lambda that disables the Cognito guest role. Per-session token cap. Without this, a single prompt-injection loop can blow the budget in hours.
- **Operational readiness** — what "healthy" looks like, who gets paged (even if it's just a self-email), rollback plan when a new system prompt regresses personality.

---

## 7. Personality bible is the spec's real core — leverage it

`docs/max-personality-bible.md` already contains the 6-dimension rubric, stutter taxonomy, guardrails, and 50-case golden set structure. **This is the most valuable input to Speckit.** Make sure:

- `/specify` references the bible as the personality source of truth (not re-describes it).
- The rubric (bible §9) is lifted verbatim into the spec's acceptance criteria.
- The 50-case golden set is framed as the spec's acceptance test suite.

If the bible is still a draft/skeleton, finishing it is the highest-leverage pre-Speckit task.

---

## 8. Recommended pre-Speckit checklist

Before running `/specify`, do these in order:

1. **Finish `docs/max-personality-bible.md`** if it's not fully authored.
2. **Draft `docs/constitution.md`** with the rules from §1 above.
3. **Extract `docs/product-spec.md`** — the WHAT only, from `initial-plan.md`.
4. **Define MVP boundary** (§4) and write it into the product spec.
5. **Write 5 personas and ~10 scenarios** (§5) into the product spec.
6. **Add latency budget, browser matrix, rate-limit numbers, cost alarm thresholds** to the product spec (§3, §6).
7. **Add an explicit accessibility section** (§6) — reduced-motion, captions, keyboard.
8. Keep `initial-plan.md` as the technical appendix; reference it from `/plan` (not `/specify`).

Then run Speckit starting from the constitution.

---

## Notes

- The plan's risk register (Known Risks & Gotchas section) is excellent and should carry into Speckit unchanged.
- The cost analysis is already more rigorous than most Speckit projects ever produce — keep it.
- No code changes or repo scaffolding is proposed by this review. The user has not started implementation; the entire repo is currently just `docs/` and config files.
