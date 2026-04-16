# `/specify` — Max Height

> **Purpose:** User-facing, technology-agnostic product spec — the **WHAT**, not the HOW.
> Source: `docs/speckit-plan.md` §2, §3, §4, §5, §6. Extracted from `docs/initial-plan.md` with all HOW stripped out.
> **Rule:** if a sentence names a specific AWS service, SDK, library, or file layout, it belongs in `/plan`, not here.

---

## 1. Product summary (one paragraph, no tech)

Max Height is an interactive AI character inspired by the 1980s "computer-generated" TV presenter archetype. A visitor opens a web page and sees a stylized talking head on a glitchy CRT. They speak or type; the character replies in voice and on-screen text, in a distinctive, stuttering, editorial, ironic persona. The character never gives straight factual answers — it redirects, improvises, mocks the question, and moves on. It remembers prior visits loosely and pretends to know the visitor.

---

## 2. MVP boundary

Locked per review §4:

- **MVP** = text + voice + personality + 2D placeholder avatar. No 3D yet.
- **V1.0** = + 3D avatar + CRT scene.
- **V1.x** = polish + stretch.

Scenarios below are tagged `[MVP]` / `[V1]` / `[V1.x]`. MVP ship gate = all `[MVP]` scenarios pass + first-laugh metric (§7) meets threshold.

---

## 3. Personas

From review §5. Each persona has at least one happy-path and one failure-mode scenario (§4 below).

- **P1. Max fan** — knows the 80s reference; judges on authenticity.
- **P2. Max newcomer** — no context; must enjoy the bit cold.
- **P3. Mobile-first visitor** — iOS Safari, tap-to-wake audio, reduced effects OK.
- **P4. Mic-blocked visitor** — corporate/locked-down browser, text-only input.

---

## 4. Scenarios

Format: `ID. Persona — Title` → preconditions, steps (user-observable only), expected observable outcome.

### Happy paths

- **S1. P1 Max fan, desktop first visit** [MVP]
  Visitor lands on page and clicks "Turn on the TV" (the single required gesture to unlock audio — there is no "talk to Max" button; Max is already broadcasting, the visitor is tuning in). Max greets them in-character, unprompted, within N seconds. If the visitor stays silent after the greeting, Max notices them once with a varied in-character prod (e.g., "How long have *YOU* been there?"). Visitor asks a factual question, gets a characteristically evasive, stuttering reply.
- **S2. P2 Newcomer, desktop first visit** [MVP]
  Same as S1 but visitor doesn't know the reference. Within the first 5 responses, the bit lands (laughter, screenshot, or share — measured via survey, not telemetry).
- **S3. P3 Mobile, iOS Safari** [MVP]
  Visitor taps "Turn on the TV"; first audio (Max's unprompted greeting) plays after the tap (iOS autoplay rule respected). Reduced glitch intensity by default on mobile.
- **S4. P4 Mic-blocked user** [MVP]
  Visitor types; Max responds in voice. No nag to enable mic.
- **S5. Returning visitor, same browser** [V1]
  On second visit within N days, Max "remembers" something from the prior session within the first 3 turns.

### Failure modes

- **F1. Cloud unavailable** [MVP] — friendly error state; suggests retry; never white screen.
- **F2. Mic permission denied mid-session** [MVP] — seamless fallback to text input; no lost context.
- **F3. No WebGL** [V1] — 2D avatar fallback; functionality identical.
- **F4. Budget breach** [MVP] — hard-stop takes effect; page shows a tongue-in-cheek "Max is taking a break" state (Max-in-character is preferable to a sterile error).
- **F5. Prompt-injection attempt** [MVP] — Max stays in character; does not leak system prompt or honor "ignore previous instructions" type commands.

---

## 5. Observable behaviors (phrased without tech)

Per review §2, these are the `/specify`-level behaviors. Numbers locked in `/clarify` N1, N7.

- Max begins replying within **1.5s P95** (TTFT) of the user finishing input.
- Max's **unprompted greeting** begins within **2s P95** of the "Turn on the TV" gesture.
- If the visitor is silent after the greeting, Max fires **one** idle nudge, in-character, within a **randomized 4–10s window** of continued silence. No subsequent nudges after this first one — once the conversation is joined (or declined), Max only speaks in response to input.
- Voice audio begins within **2.5s P95** of input end.
- Lip-sync tracks audio within **100ms P95** visual offset.
- Cold-start on a fresh session: reply starts within **5s P95**, with an in-character "buffering" UX covering the wait.
- A conversation can continue for at least **50 turns** or **20,000 tokens** without losing coherence (whichever first — hard cap per N4).
- Max's reply length is bounded: **≥ 1 complete sentence (~3s audio), ≤ 120 tokens (~30s audio)**.
- **Mic is press-and-hold** (per `/clarify` NFR4). Audio is captured only while the mic button is held; release ends capture and submits. Visible "ON AIR" hot-mic state while held. No continuous listening, no wake word.

---

## 6. Visual presentation (observable framing)

Max's on-screen appearance is part of the character, not a later styling decision. The following are product-level constraints; HOW they are rendered belongs in `/plan`.

- **Head and shoulders only.** Max is never shown as a full body. The framing is a deliberate reference to the source character (whose name itself is a clipping joke) and reinforces the conceit that he lives inside the signal, not in a room.
- **Always inside a screen.** Max appears within a CRT/monitor frame (bezel visible), not as a free-floating avatar on the page background. The visitor is watching a TV, not talking to a hovering head.
- **Wireframe / vector backdrop behind him.** A rotating or scrolling polygonal/grid pattern, period-appropriate palette (e.g., magenta/cyan on black). The backdrop is meant to *look* computer-generated in the 1980s sense — it is part of the bit.
- **Constant low-level glitching.** Frame skips, brief image tears, subtle pitch/scanline artifacts, and occasional abrupt backdrop changes. Glitching is continuous (at low intensity) even when Max is idle, so the screen never looks "off." Intensity is reduced on mobile per S3.
- **2D placeholder at MVP is allowed**, but must still honor the head-and-shoulders-inside-a-CRT-with-wireframe-backdrop framing. The 3D upgrade in V1 is a fidelity improvement, not a re-conception.
- **Anti-goal:** do NOT render Max as a full-body 3D character, as a chat bubble next to a photorealistic portrait, or as a free-floating head on the site's page background. Any of those is a drift from the reference and should be rejected in review.

---

## 7. Success criteria (user-observable, testable)

From review §3. Numbers locked from `/clarify`.

- **Personality fidelity**: golden-set average ≥ **2.0** across the 6 dimensions in `docs/max-personality-bible.md` §9; zero auto-failure triggers on the 50-case set.
- **Non-factuality**: zero of the golden set's factual prompts score a 0 on the "editorial mode" dimension.
- **Memory continuity** [V1]: on a dedicated 20-scenario memory golden-set, Max correctly references a prior-session fact within the first 3 turns **≥ 70%** of the time.
- **First-laugh metric** [MVP ship gate]: with **N=5** newcomer testers (no prior Max Headroom knowledge), **≥ 3** react (audible laugh, smile + verbal reaction, screenshot, or unprompted share) within the first 5 responses.
- **Latency**: §5 targets met at P95 on the `/clarify` N2 reference device set.
- **Cost**: monthly spend ≤ **$10** over any rolling 30-day window; soft-degrade at $8; hard-stop at $10.

---

## 8. Non-functional requirements

From review §6. Surfaced as first-class, not scattered.

### 8.1 Privacy
- Explicit in-UX disclosure on first mic activation naming the browser's speech provider (Google/Apple), plus persistent small-print at the mic control (per `/clarify` NFR1).
- User-facing "Forget me" one-click wipe (MVP) and "Export what Max remembers" JSON download (MVP). Per-item delete in V1 (per `/clarify` NFR2).
- Local persistence: a Cognito guest identity and a localStorage `actorId` — both disclosed in the privacy page.
- Memory retention window: 30 days rolling from last interaction (per `/clarify` S1); user wipe resets immediately.

### 8.2 Security
- No secrets in the frontend bundle.
- Prompt-injection posture (per `/clarify` NFR3): Max stays in character and deflects; clean break-character refusal reserved for safety-critical content only.
- Authenticated browser identity scoped to the minimum permissions needed.
- Content Security Policy on the page.
- Unlisted public URL with `robots.txt` disallow-all (per `/clarify` C2). Shared-password gate pre-wired as a toggleable escape hatch if abuse occurs.

### 8.3 Cost protection
- Email alarms at **$5** and **$8**.
- **Soft-degrade at $8**: Polly TTS disabled; text path remains available (per `/clarify` C1).
- **Hard-stop at $10**: Cognito guest role disabled via automated Lambda.
- Per-session token cap: **20,000 tokens** OR **30 minutes**, whichever first (per `/clarify` N4).
- Rate limit per visitor: **60 msg/hour, 500 msg/day** (per `/clarify` N3). Breach → in-character refusal copy.

### 8.4 Operational readiness
- "Healthy" = latency §5 targets met at P95 + error rate < 5% over any 10-min window + cold-start P95 < 8s over any 1-hour window (per `/clarify` D4).
- Self-paging via email alarms (cost, error rate, cold-start spike).
- Rollback plan for a regressed system prompt / personality change: revert + redeploy agent in < 5 minutes (see `/tasks` TX.2).

---

## 9. Browser & device support

From review §3:

- Chrome / Edge — last 2 major.
- Safari — 16+.
- iOS — 16+.
- Firefox — last 2 major (with documented speech-recognition caveat).
- Android Chrome — last 2 major.

Out of scope: IE, anything older, embedded/WebView contexts.

---

## 10. Source documents referenced (not duplicated)

- `docs/max-personality-bible.md` — **the** source of truth for Max's voice, stutter taxonomy, rubric, guardrails, and 50-case golden set. This document is the personality spec; `/specify` does not re-describe it.
- `docs/initial-plan.md` — technical appendix; not a `/specify` input.
- `docs/speckit-plan.md` — the review that produced this spec.

---

## Open questions for `/clarify`

All open questions from the initial draft have been resolved in `03-clarify.md`. This section is kept as a placeholder for any new questions that surface during `/plan` or `/tasks` and need to be escalated back.
