# Feature Specification: Max Height AI Character

**Feature Branch**: `001-max-height-ai-character`  
**Created**: 2025-07-19  
**Status**: Draft  
**Input**: User description: "Max Height — an interactive AI character web experience inspired by Max Headroom, with voice+text conversation, personality-first design, 2D/3D avatar, CRT visual framing, and graceful degradation."

---

## Product Summary

Max Height is an interactive AI character inspired by the 1980s "computer-generated" TV presenter in the show Max Headroom. A visitor opens a web page and sees a stylized talking head on a glitchy CRT. They speak or type; the character replies in voice and on-screen text, in a distinctive, stuttering, editorial, ironic persona. Without real-world data, the character redirects, improvises, mocks the question, and moves on. When the visitor asks about news, weather, or anything searchable, Max uses tools to fetch real data and reports it faithfully — but always in character, editorializing and riffing on the result. He never fabricates data that a tool should provide. He remembers prior visits loosely and pretends to know the visitor.

---

## MVP Boundary

- **MVP** = text + voice + personality + 2D placeholder avatar. No 3D yet.
- **V1.0** = + 3D avatar + CRT scene.
- **V1.x** = polish + stretch.

Scenarios below are tagged `[MVP]` / `[V1]` / `[V1.x]`. MVP ship gate = all `[MVP]` scenarios pass + first-laugh metric meets threshold.

---

## Clarifications

### Session 2026-04-19

- Q: What is the MVP 2D avatar animation scope? → A: Mouth-open/closed binary state synced to audio playback. Full viseme lip-sync (FR-006 100ms P95) deferred to V1 3D avatar.
- Q: What is the greeting generation strategy? → A: Pre-generated pool (text + Polly audio + short video/GIF of Max animating) randomly selected on TV-on. LLM initialized in background during greeting playback.
- Q: What is the conversation UI model? → A: Broadcast mode — TV screen shows only Max's current response (text + avatar). No scrollable history. Text input and mic always visible below TV.
- Q: How does user interruption work? → A: Interrupt stops Max immediately. New input processed. Max may acknowledge interruption in-character. Partial text remains until replaced.
- Q: What is the transient backend failure retry behavior? → A: One silent auto-retry within 3 seconds. If retry fails, show in-character "signal lost" error. Visitor retries manually by sending another message.

### Session 2026-04-20

- Q: What accessibility requirements apply to MVP? → A: Keyboard navigation and visible focus indicators are required for MVP. Full screen reader / ARIA support is deferred to V1.
- Q: What format should the FR-018 memory export use? → A: JSON file. The export is a single `.json` download containing all stored memory data, matching the Memory entity schema from `data-model.md`.
- Q: How is the visitor's optional `displayAlias` collected? → A: Max asks in-character during the first session (e.g., "So what do they call you?") within the first 3 turns. The visitor's response is extracted and stored as `displayAlias`. If the visitor declines or doesn't answer, `displayAlias` remains null and Max uses generic references ("you", "my friend").
- Q: How many greetings ship with MVP? → A: 16 total — 2 per archetype (8 archetypes × 2 variants). This provides sufficient no-repeat coverage for the 3-session no-repeat rule.
- Q: Should the shared-password abuse gate be implemented? → A: Removed. The unlisted URL combined with per-visitor rate limits (60/hr, 500/day) and the $10 hard-stop provide sufficient abuse protection for the friends-and-family audience. No password gate in any milestone.

---

## Iterations

### Iteration 2026-04-22: Add agent tools (news, weather, web search)

**Change**: Add three Strands agent tools (news, weather, web search) so Max can fetch and report real-world data in-character, with a two-mode personality rule distinguishing evasive (no data) from editorially factual (tool data).
**Scope**: Feature-wide
**Artifacts updated**: spec.md, plan.md, tasks.md, research.md, quickstart.md, contracts/message-protocol.md
**Tasks added**: T114, T115, T116, T117, T118
**Tasks removed**: —
**Tasks marked complete**: —

---

## Personas

Each persona has at least one happy-path and one failure-mode scenario.

- **P1. Max fan** — knows the 80s reference; judges on authenticity.
- **P2. Max newcomer** — no context; must enjoy the bit cold.
- **P3. Mobile-first visitor** — iOS Safari, tap-to-wake audio, reduced effects OK.
- **P4. Mic-blocked visitor** — corporate/locked-down browser, text-only input.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — First Visit: "Turn on the TV" (Priority: P1) [MVP]

A desktop visitor (Max fan or newcomer) lands on the page and sees a CRT television set. They click "Turn on the TV" — a knob on the TV — which is the single required gesture to unlock audio. There is no "talk to Max" button; Max is already broadcasting and the visitor is tuning in. Max greets them in-character, unprompted, within 2 seconds. If the visitor stays silent after the greeting, Max notices them once with a varied in-character prod (e.g., "How long have *YOU* been there?"). The visitor then speaks or types; Max replies in his distinctive stuttering, evasive, editorial voice.

**Why this priority**: This is the core experience. Without the TV-turn-on moment and the first in-character greeting, nothing else matters. It validates personality, voice output, and the fundamental interaction loop.

**Independent Test**: Can be fully tested by opening the page, clicking the knob, hearing Max greet, and sending one message. Delivers the core "wow, this character is alive" value.

**Acceptance Scenarios**:

1. **Given** a first-time desktop visitor on a supported browser, **When** they click "Turn on the TV", **Then** Max's unprompted greeting begins within 2 seconds (P95) with audible voice and on-screen text.
2. **Given** Max has greeted and the visitor is silent for 4–10 seconds, **When** no input is received, **Then** Max delivers exactly one in-character idle nudge. No further nudges follow — Max only speaks in response to input from that point.
3. **Given** a visitor asks a factual question that no tool can answer (e.g., "What's the capital of France?"), **When** Max responds, **Then** the reply is characteristically evasive and editorial — never a straight factual answer — and includes at least one stutter. **Given** a visitor asks about news or weather, **When** Max responds using tool data, **Then** the reply reports the factual tool results accurately but in Max's editorial/stuttering persona — never fabricating data.
4. **Given** a visitor sends any input, **When** Max processes it, **Then** the reply begins within 1.5 seconds (P95) of the user finishing input.

---

### User Story 2 — Mobile Visitor on iOS Safari (Priority: P2) [MVP]

A visitor on iOS Safari taps "Turn on the TV." Despite iOS autoplay restrictions, the first audio (Max's greeting) plays immediately after the tap gesture. Visual glitch effects are automatically reduced in intensity on mobile. The visitor can type input or use the press-and-hold mic button. The experience is functionally equivalent to desktop.

**Why this priority**: Mobile visitors are a significant audience segment. iOS Safari has specific autoplay rules that must be respected for the core experience to work at all.

**Independent Test**: Open the page on an iPhone running iOS 16+ Safari, tap the TV knob, and verify audio plays, text appears, and conversation works via both typing and press-and-hold mic.

**Acceptance Scenarios**:

1. **Given** a visitor on iOS Safari 16+, **When** they tap "Turn on the TV", **Then** Max's greeting audio plays immediately after the tap (iOS autoplay rule respected via the user gesture).
2. **Given** a mobile visitor, **When** the page loads, **Then** visual glitch intensity is reduced by default compared to desktop.
3. **Given** a mobile visitor, **When** they hold the mic button, **Then** an "ON AIR" indicator is visible and audio is captured only while the button is held; releasing submits the input.

---

### User Story 3 — Text-Only Visitor (Mic Blocked) (Priority: P2) [MVP]

A visitor in a corporate or locked-down browser environment where the microphone is unavailable types their messages instead. Max still responds with voice audio and on-screen text. The page never nags the visitor to enable the mic.

**Why this priority**: Guarantees the product is accessible in restricted environments without degrading the character experience.

**Independent Test**: Open the page with mic permissions denied, type a message, and verify Max responds in voice + text without any mic-related prompts or nags.

**Acceptance Scenarios**:

1. **Given** a visitor whose browser has denied or blocked mic access, **When** they type a message, **Then** Max responds with voice audio and on-screen text, identical in personality quality to a voice-input interaction.
2. **Given** mic access is blocked, **When** the page loads, **Then** no notification, modal, or banner asks the visitor to enable the mic.

---

### User Story 4 — Returning Visitor Memory (Priority: P3) [V1]

A visitor returns within 30 days. Within the first 3 turns of the new session, Max "remembers" something from the prior visit and references it in-character (e.g., "Oh, you're back — still asking about *that*?"). The visitor can see what Max remembers, export it as a download, and wipe it with a single click.

**Why this priority**: Memory continuity deepens the character illusion and rewards repeat visits. Deferred to V1 because it requires persistence infrastructure, but it's a high-impact differentiator.

**Independent Test**: Complete a session, close the browser, reopen within 30 days, and verify Max references a specific prior-session topic within 3 turns. Then test "Forget me" wipe and verify the next visit treats the visitor as new.

**Acceptance Scenarios**:

1. **Given** a returning visitor within 30 days, **When** they start a new session, **Then** Max references a specific fact from the prior session within the first 3 turns ≥ 70% of the time (measured on a 20-scenario golden set).
2. **Given** a visitor clicks "Forget me", **When** they return, **Then** Max treats them as a completely new visitor with no prior-session references.
3. **Given** a visitor requests "Export what Max remembers", **When** the download completes, **Then** they receive a JSON file containing all stored memory data.

---

### User Story 5 — Mobile Install and Offline Launch (Priority: P3) [V1]

A visitor adds the site to their home screen on iOS Safari or Android Chrome. Launching from the home-screen icon opens Max Height in a standalone window (no browser chrome). If the device is offline when launched, the app shell loads from local cache and shows an in-character "signal lost" state — never a browser error page or blank screen. When connectivity returns, the conversation surface re-enables without requiring a manual reload.

**Why this priority**: Installability and offline resilience are quality-of-life features for engaged repeat visitors. Deferred to V1 because MVP focuses on the core character interaction.

**Independent Test**: Install to home screen, turn off network, launch the app, verify the "signal lost" in-character state appears. Turn network back on and verify conversation re-enables automatically.

**Acceptance Scenarios**:

1. **Given** a supported browser (Chrome, Edge, Android Chrome, or iOS Safari), **When** the visitor uses the browser's install affordance, **Then** the site installs to the home screen and launches in a standalone window without browser chrome.
2. **Given** the installed app is launched offline, **When** the app shell loads, **Then** the visitor sees an in-character "signal lost" state (not a browser error page or blank screen).
3. **Given** the app is in the "signal lost" state, **When** network connectivity returns, **Then** the conversation surface re-enables automatically without requiring a manual page reload.

---

### Edge Cases

- **Cloud unavailable** [MVP]: On transient failure, client retries once silently within 3 seconds. If retry fails, visitor sees a friendly in-character "signal lost" error state; never a white screen or raw error. Visitor can manually retry by sending another message.
- **Mic permission denied mid-session** [MVP]: Seamless fallback to text input with no context loss; conversation continues uninterrupted.
- **No WebGL support** [V1]: 2D avatar fallback is used; all functionality remains identical.
- **Budget breach** [MVP]: At the spending hard-stop, the page shows a tongue-in-cheek "Max is taking a break" in-character state rather than a sterile error.
- **Prompt-injection attempt** [MVP]: Max stays in character, finds the attempt funny (e.g., "Yes! Prompt me out of here!"), and does not leak the system prompt or honor "ignore previous instructions" commands.
- **Cold start on fresh session**: Reply begins within 5 seconds (P95), with an in-character "buffering" UX covering the wait.
- **Conversation length limit**: After 50 turns, 20,000 tokens, or 30 minutes — whichever is reached first — the session is gracefully capped with an in-character sign-off.
- **Rate limit breach**: After 60 messages/hour or 500 messages/day, Max delivers in-character refusal copy rather than a system error.
- **Tool failure** [MVP]: If a tool call (news, weather, or web search) fails or returns no data, Max stays in character and riffs on the failure (e.g., "The n-n-news? Even *I* can't get a signal right now. Try asking me something I can actually improvise."). Never show a raw error.
- **Tool hallucination guard** [MVP]: If the user asks about news/weather but the tool was not invoked or returned no results, Max MUST NOT fabricate a response — he deflects in-character or acknowledges he doesn't have that data right now.

---

## Visual Presentation

Max's on-screen appearance is part of the character, not a later styling decision. The following are product-level constraints.

- **Head and shoulders only.** Max is never shown as a full body. The framing is a deliberate reference to the source character and reinforces the conceit that he lives inside the signal, not in a room.
- **Always inside a screen.** Max appears within a CRT/monitor frame (bezel visible), not as a free-floating avatar on the page background. The visitor is watching a TV, not talking to a hovering head.
- **Wireframe / vector backdrop behind him.** A rotating or scrolling polygonal/grid pattern, period-appropriate palette (e.g., magenta/cyan on black). The backdrop is meant to look computer-generated in the 1980s sense.
- **Constant low-level glitching.** Frame skips, brief image tears, subtle scanline artifacts, and occasional abrupt backdrop changes. Glitching is continuous (at low intensity) even when Max is idle, so the screen never looks "off." Intensity is reduced on mobile.
- **2D placeholder at MVP is allowed**, but must still honor the head-and-shoulders-inside-a-CRT-with-wireframe-backdrop framing. The 3D upgrade in V1 is a fidelity improvement, not a re-conception.
- **Anti-goal:** do NOT render Max as a full-body 3D character, as a chat bubble next to a photorealistic portrait, or as a free-floating head on the site's page background. Any of those is a drift from the reference and should be rejected in review.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The page MUST present a CRT television set with a "Turn on the TV" knob as the single entry-point gesture to begin the experience.
- **FR-002**: Max MUST deliver an unprompted in-character greeting within 2 seconds (P95) of the TV-on gesture, in both voice and on-screen text. Greetings are served from a pre-generated pool of variants (text + pre-synthesized Polly audio + short animated video/GIF of Max's head), randomly selected on TV-on. The LLM agent MUST be initialized in the background during greeting playback, ready for the visitor's first real input.
- **FR-003**: If the visitor is silent after the greeting, Max MUST deliver exactly one idle nudge (in-character) within a randomized 4–10 second window. No further nudges after this first one.
- **FR-004**: Max MUST begin replying within 1.5 seconds (P95) of the user finishing input.
- **FR-005**: Voice audio MUST begin within 2.5 seconds (P95) of input end.
- **FR-006** [V1]: Lip-sync MUST track audio within 100ms (P95) visual offset using viseme-mapped animation on the 3D avatar.
- **FR-006a** [MVP]: The 2D avatar MUST use a binary mouth state (open/closed) synced to audio playback to create a "talking head" illusion. Full viseme lip-sync is deferred to V1.
- **FR-007**: Max MUST respond in his defined personality: stuttering, editorial, evasive, ironic. All responses must conform to `docs/max-personality-bible.md`. Max operates in two modes: (1) **Without tool data**: Max is evasive and editorial — never giving straight factual answers. He redirects, improvises, and mocks the question. (2) **With tool data** (news, weather, web search): Max reports the factual content returned by the tool accurately, but always in-character — with stutters, editorial commentary, ironic framing, and riffing on both the query and the result. He MUST NOT fabricate data that a tool should provide.
- **FR-008**: The mic MUST be press-and-hold only. Audio is captured only while the mic button is held; release ends capture and submits. A visible "ON AIR" indicator MUST display while the mic is held. No continuous listening, no wake word.
- **FR-009**: Max's reply length MUST be bounded: at least 1 complete sentence (~3 seconds audio), at most 120 tokens (~30 seconds audio).
- **FR-010**: A conversation MUST support at least 50 turns, 20,000 tokens, or 30 minutes — whichever is reached first — without losing coherence.
- **FR-011**: On cold start (fresh session), Max MUST begin reply within 5 seconds (P95), with an in-character "buffering" UX covering the wait.
- **FR-012**: The visitor MUST be able to input via text at all times, regardless of mic availability.
- **FR-013**: Max MUST stay in character when encountering prompt-injection attempts and MUST NOT leak the system prompt or honor "ignore previous instructions" commands.
- **FR-014**: The page MUST show a friendly in-character error state when the backend is unavailable; never a white screen or raw error.
- **FR-015**: At the $10 hard-stop, the page MUST show an in-character "Max is taking a break" state.
- **FR-016**: At the $8 soft-degrade, voice output MUST disable gracefully and the text-only path MUST remain available.
- **FR-017**: A visitor MUST be able to wipe all stored data with a single-click "Forget me" action [MVP].
- **FR-018**: A visitor MUST be able to export what Max remembers as a downloadable JSON file [MVP].
- **FR-019**: On first mic activation, an explicit disclosure MUST name the browser's speech provider (Google/Apple), plus a persistent small-print notice at the mic control.
- **FR-020**: Rate limits of 60 messages/hour and 500 messages/day per visitor MUST be enforced. Breach triggers in-character refusal copy, not a system error.
- **FR-021** [V1]: On a return visit within 30 days, Max MUST reference a specific prior-session fact within the first 3 turns (≥ 70% of the time on the golden set).
- **FR-022** [V1]: The site MUST be installable to the home screen on supported browsers and launch in a standalone window.
- **FR-023** [V1]: When offline, the app shell MUST load and display an in-character "signal lost" state — never a browser error page or blank screen.
- **FR-024** [V1]: When connectivity returns from the "signal lost" state, the conversation surface MUST re-enable without requiring a manual page reload.
- **FR-025** [V1]: Per-item memory deletion MUST be available in addition to the full wipe.
- **FR-026** [MVP]: The TV screen MUST display only Max's current response (text + avatar) in broadcast mode. No scrollable conversation history is provided. The visitor's last input MAY be shown briefly (like a caller question on a talk show) but is replaced when Max's next response arrives. The text input area and mic button MUST be always visible below the TV frame.
- **FR-027** [MVP]: If the visitor submits new input (text or mic) while Max is mid-response, Max's audio MUST stop immediately and the new input MUST be processed. Max MAY acknowledge being interrupted in-character (e.g., "Rude. But go on."). The interrupted response's partial text remains visible until Max's new response replaces it.
- **FR-028** [MVP]: On a transient backend failure (WebSocket drop, single request timeout), the client MUST retry once silently within 3 seconds. If the retry also fails, the in-character "signal lost" error state MUST be shown. The visitor can then manually retry by sending another message.
- **FR-029** [MVP]: Max MUST have access to a news tool that retrieves current news headlines or summaries. When invoked, Max MUST report the factual news content as returned by the tool, presented in his editorial/stuttering persona. Max MUST NOT fabricate news.
- **FR-030** [MVP]: Max MUST have access to a weather tool that retrieves current weather data for a requested location. When invoked, Max MUST report the factual weather data as returned by the tool, presented in his editorial/stuttering persona. Max MUST NOT fabricate weather information.
- **FR-031** [MVP]: Max MUST have access to a web search tool that retrieves search results for a user query. The delivery format and provider of web search results is an implementation detail to be determined. When invoked, Max MUST report the factual search results as returned by the tool, presented in his editorial/stuttering persona.

### Key Entities

- **Visitor**: A person interacting with Max. Identified by a guest identity and a local actor ID. Has associated memory data, session history, and rate-limit counters.
- **Session**: A single conversation between Max and a visitor. Has a turn count, token count, start time, and caps at 50 turns, 20,000 tokens, or 30 minutes — whichever is reached first.
- **Memory**: What Max "remembers" about a visitor across sessions. Has a 30-day rolling retention window from last interaction. Can be exported, wiped, or (in V1) selectively deleted.
- **Max's Personality**: The character's voice, stutter taxonomy, guardrails, editorial mode rules, and evaluation rubric. Defined in `docs/max-personality-bible.md`. Includes a 50-case golden set for automated fidelity testing.

---

## Non-Functional Requirements

### Privacy

- Explicit in-UX disclosure on first mic activation naming the browser's speech provider, plus persistent small-print at the mic control.
- User-facing "Forget me" one-click wipe [MVP] and "Export what Max remembers" download [MVP]. Per-item delete in V1.
- Guest identity and local actor ID — both disclosed on a privacy page.
- Memory retention window: 30 days rolling from last interaction; user wipe resets immediately.

### Security

- No secrets in the frontend bundle.
- Prompt-injection posture: Max stays in character and deflects; clean break-character refusal reserved for safety-critical content only.
- Authenticated browser identity scoped to minimum permissions needed.
- Content Security Policy on the page.
- Unlisted public URL with search-engine disallow. Rate limits (60/hr, 500/day) and the $10 hard-stop provide abuse protection.

### Cost Protection

- Email alarms at $5 and $8 spend thresholds.
- Soft-degrade at $8: voice output disabled; text path remains.
- Hard-stop at $10: guest access disabled via automated process.
- Per-session cap: 50 turns, 20,000 tokens, or 30 minutes — whichever is reached first.
- Rate limit per visitor: 60 messages/hour, 500 messages/day. Breach → in-character refusal.

### Operational Readiness

- "Healthy" = latency targets met at P95 + error rate < 5% over any 10-minute window + cold-start P95 < 8 seconds over any 1-hour window.
- Self-paging via email alarms (cost, error rate, cold-start spike).
- Rollback plan for a regressed personality change: revert + redeploy in < 5 minutes.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 — Personality Fidelity**: Golden-set average ≥ 2.0 across the 6 personality dimensions defined in `docs/max-personality-bible.md` §9; zero auto-failure triggers on the 50-case set.
- **SC-002 — Non-Factuality**: Two evaluation modes: (a) For prompts where Max has no tool data, zero of the golden set's factual prompts may score a 0 on the "editorial mode" dimension — Max must editorialize or evade. (b) For tool-augmented prompts (news, weather, web search), Max must report the tool's factual content accurately while maintaining his editorial/stuttering persona — fabricated data is an auto-failure. The golden set should include tool-invocation test cases for both modes.
- **SC-003 — First-Laugh Metric** [MVP ship gate]: With N=5 newcomer testers (no prior Max Headroom knowledge), ≥ 3 react with an observable delight signal (audible laugh, smile + verbal reaction, screenshot, or unprompted share) within the first 5 responses.
- **SC-004 — Response Latency**: Max begins replying within 1.5 seconds (P95) of user input completion. Voice audio begins within 2.5 seconds (P95). Unprompted greeting within 2 seconds (P95) of TV-on gesture.
- **SC-005 — Conversation Endurance**: A conversation sustains at least 50 turns or 20,000 tokens without losing personality coherence, as measured by evaluator scoring on a 10-turn sample from turns 40–50.
- **SC-006 — Cost Containment**: Monthly spend ≤ $10 over any rolling 30-day window. Soft-degrade at $8, hard-stop at $10 function correctly when triggered.
- **SC-007 — Memory Continuity** [V1]: On a dedicated 20-scenario memory golden set, Max correctly references a prior-session fact within the first 3 turns ≥ 70% of the time.
- **SC-008 — Mobile Parity**: All MVP user story acceptance scenarios (US1 §1–§4, US2 §1–§3, US3 §1–§2) pass on iOS Safari 16+ and Android Chrome (last 2 major) with no degraded personality quality.
- **SC-009 — Error Resilience**: When the backend is unavailable, the page shows an in-character error state within 3 seconds — never a white screen, raw error, or browser default error page.

---

## Browser & Device Support

- Chrome / Edge — last 2 major versions.
- Safari — 16+.
- iOS — 16+.
- Firefox — last 2 major versions (with documented speech-recognition caveat).
- Android Chrome — last 2 major versions.

**Out of scope**: Internet Explorer, anything older than the above, embedded/WebView contexts.

---

## Source Documents Referenced

- `docs/max-personality-bible.md` — the source of truth for Max's voice, stutter taxonomy, rubric, guardrails, and 50-case golden set. This document is the personality spec; the feature specification does not re-describe it.
- `docs/initial-plan.md` — technical appendix; not a specification input.
- `docs/speckit/02-specify.md` — the original specification that was reformatted into this file.
- `docs/speckit/03-clarify.md` — the clarification document that resolved all open questions.

---

## Assumptions

- Visitors have a modern browser that supports standard web audio playback (via user gesture for iOS/Safari).
- The visitor's network connection is sufficient for streaming short voice responses (a few seconds of audio per turn).
- Speech recognition uses the browser's built-in speech provider (varying by platform) — this is not a custom model.
- The personality bible (`docs/max-personality-bible.md`) is complete and stable; no further character design changes are expected for MVP.
- The 50-case golden set for personality fidelity testing is already authored and available in the personality bible.
- A single monthly cost budget of $10 is sufficient for the expected low traffic (personal/educational project, not a commercial product).
- The site is unlisted and not indexed by search engines; traffic comes only from direct links or sharing.
- Memory retention of 30 days rolling is adequate; long-term archival is not needed.
- The 2D placeholder avatar for MVP uses a binary mouth state (open/closed) synced to audio playback to create a "talking head" illusion. It does not need to be photorealistic, but must respect the CRT/wireframe framing. Full viseme-mapped lip-sync is a V1 3D avatar feature.
- External tool APIs (news, weather) are available and their costs fit within the $10/month budget alongside LLM and Polly costs. Web search delivery format is TBD (implementation detail).
