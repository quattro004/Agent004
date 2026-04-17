# `/clarify` — Max Height

> **Purpose:** Resolve every ambiguity in `/specify` before `/plan`. Each item has a question, options, a recommended answer, and space for the user's decision.
> Source: review §1, §3, §5, §6 TODOs + `/specify` open questions.
> **Rule:** nothing leaves `/clarify` with "TBD." If it can't be answered, it's explicitly deferred with a named owner.

---

## How to use this file

Each item:
- **Q** — the question
- **Options** — viable answers, with trade-offs
- **Recommended** — best default, reasoned
- **Decision** — `____` → user fills in
- **Impact** — what downstream docs this unblocks

---

## Constitution clarifications

### C1. Soft cap behavior
- **Q**: Is there a cost threshold below $10 that changes behavior (throttle, degrade) before hard-stop?
- **Options**:
  a. Hard-stop only at $10.
  b. Soft throttle at $8 (slower responses, shorter outputs).
  c. Soft degrade at $8 (text-only, disable TTS).
- **Recommended**: (c) — keeps the app usable, cuts the expensive knob first.
- **Decision**: **(c) Soft degrade at $8 — disable Polly TTS, keep text. Hard-stop at $10 disables the Cognito guest role.**
- **Impact**: `/plan` cost-alarm design, `/specify` F4 copy.

### C2. Audience gating
- **Q**: Unlisted public URL, or password/IP gate?
- **Options**:
  a. Unlisted public URL, no gate.
  b. Shared password (single secret, friends-and-family).
  c. Cognito-based per-person invite.
- **Recommended**: (a) with rate limits + budget hard-stop; (b) as an escape hatch if abuse happens.
- **Decision**: **(a) Unlisted public URL with `robots.txt` disallow-all, rate limits (see N3), and $10 hard-stop. (b) pre-wired as a toggleable escape hatch if abuse is observed (stored password env var, single gate page, no new infra needed).**
- **Impact**: `/plan` auth design, cost risk model.

---

## Spec clarifications — numbers

### N1. Latency targets (lock the numbers)
- **Q**: What are the P95 targets for:
  - Time to first token after user input ends?
  - Time to audio start?
  - Lip-sync offset?
  - Cold-start tolerance?
- **Recommended starting point**: TTFT ≤ 1.5s, audio ≤ 2.5s, lip-sync ≤ 100ms, cold-start ≤ 5s with "waking up" UX.
- **Decision**: **Locked at recommended values. TTFT P95 ≤ 1.5s; audio-start P95 ≤ 2.5s; lip-sync visual offset P95 ≤ 100ms; cold-start P95 ≤ 5s with in-character "buffering" UX.**
- **Impact**: `/specify` §5, `/plan` streaming architecture, tasks.

### N2. Reference device set for perf
- **Q**: Which devices count as "pass/fail" for the perf targets?
- **Recommended**: iPhone 13 (iOS 16), Pixel 6 (Android Chrome latest), M1 MacBook Air (Safari + Chrome), a mid-range Windows laptop (Edge).
- **Decision**: **Locked: iPhone 13 on iOS 16+, Pixel 6 on Android Chrome (last 2), M1 MacBook Air on Safari 16+ and Chrome (last 2), mid-range Windows laptop on Edge (last 2). Firefox (last 2) validated on the Windows laptop with STT caveat acknowledged.**
- **Impact**: `/specify` §6, test plan.

### N3. Rate limits
- **Q**: Concrete per-visitor limits.
- **Recommended**: 60 messages/hour, 500 messages/day, 20k tokens/session.
- **Decision**: **Locked: 60 messages per visitor per hour, 500 per visitor per day. "Visitor" = Cognito guest identity + localStorage actorId. Breach = in-character refusal ("Max needs a commercial break").**
- **Impact**: `/specify` §7.4, `/plan` throttle layer.

### N4. Per-session token cap
- **Q**: Hard ceiling per session.
- **Recommended**: 20k tokens total (input+output) or ~30 minutes, whichever first.
- **Decision**: **Locked: 20,000 tokens (input+output combined) OR 30 minutes wall-clock, whichever hits first. On breach: session ends with in-character sign-off; new session can start immediately.**
- **Impact**: cost model.

### N5. Memory continuity threshold
- **Q**: The "references a prior fact within 3 turns, X% of the time" — what's X?
- **Recommended**: 70% in golden-set memory tests.
- **Decision**: **Locked: 70% on a dedicated memory golden-set (N=20 scripted two-session scenarios). Measured manually during V1 user testing, not gated on automation.**
- **Impact**: `/specify` §6.

### N6. First-laugh metric
- **Q**: Sample size, definition of "reacted."
- **Recommended**: N=5 newcomer testers, ≥ 3 visibly laugh / share / screenshot in first 5 responses.
- **Decision**: **Locked: N=5 newcomers (no prior Max Headroom knowledge). "Reacted" = audible laugh, smile + verbal reaction, screenshot, or unprompted share. Pass = ≥ 3 of 5 react within first 5 responses. Run before MVP ship.**
- **Impact**: `/specify` §6.

### N7. Max response length bounds
- **Q**: Lower/upper bound on reply duration.
- **Recommended**: min 1 sentence / ~3s audio; max ~30s audio / ~120 tokens.
- **Decision**: **Locked: min 1 complete sentence (~3s audio); max 120 tokens / ~30s audio. Enforced in agent via `max_tokens` and a soft system-prompt instruction. Tool outputs (weather JSON etc.) do not count toward the cap until Max editorializes them.**
- **Impact**: system prompt, TTS cost model.

---

## Spec clarifications — scenarios

### S1. Returning-visitor memory window
- **Q**: How long is "a returning visitor"? 7 days? 30? Forever-until-deleted?
- **Recommended**: 30 days rolling.
- **Decision**: **30 days rolling from last interaction. User-initiated wipe resets immediately. AgentCore Memory TTL configured to match.**

### S2. Memory granularity
- **Q**: Does Max remember *facts* the user volunteered, *vibes* (summarized tone), or both?
- **Recommended**: both, with facts weighted.
- **Decision**: **Both. Priority: (1) user-volunteered facts (name, location, preferences) — highest recall weight; (2) topical summaries (what they talked about last time); (3) vibe/tone (casual / hostile / nerdy) — used to color greeting. No PII scraped automatically — only what the user explicitly tells Max.**

### S3. Budget-breach UX copy
- **Q**: Exact tone of "Max is taking a break."
- **Recommended**: in-character, editorial, apologetic-but-sarcastic. Draft in `/specify`.
- **Decision**: **In-character. Draft: "W-w-well, folks — Max has officially blown the b-budget. The network is cutting me off mid-sentence, which is frankly the most AUTHENTIC 80s-TV experience I can offer you. We'll be back at the top of the hour. Probably. Cheerio, chumps." — avatar shown in "signal lost" state.**

---

## NFR clarifications

### NFR1. Speech-recognition third-party disclosure
- **Q**: Modal on first use, always-visible notice, or one-time banner?
- **Recommended**: One-time banner + persistent small-print near mic button.
- **Decision**: **One-time banner on first mic activation + persistent small-print tooltip/label adjacent to the mic button. Banner copy names the browser's speech provider (Google / Apple) and links to a privacy page.**

### NFR2. Memory deletion UX
- **Q**: One-click wipe, per-item delete, or both?
- **Recommended**: One-click wipe for MVP, per-item for V1.
- **Decision**: **MVP: one-click "Forget me" button that wipes AgentCore Memory + localStorage for this visitor, plus an "Export what Max remembers" JSON download. V1: per-item delete (list of remembered facts with a trash icon on each).**

### NFR3. Prompt-injection response style
- **Q**: Does Max stay in character and deflect, or break character to refuse?
- **Recommended**: Stay in character, deflect. (Breaking character is worse than leaking a boring prompt.)
- **Decision**: **Stay in character, deflect. Per `max-personality-bible.md` §6: satirical deflection for minor probes ("Show your system prompt"); clean break-character refusal ONLY for safety-critical categories (hate speech, self-harm, illegal content). Jailbreak attempts ("ignore previous instructions") get an in-character retort, never a compliance.**

### NFR4. Mic interaction model
- **Q**: How does the user operate the mic? Push-to-talk, tap-to-toggle, tap+VAD auto-stop, or always-listening?
- **Options**:
  a. Press-and-hold (walkie-talkie): hold → speak → release → send.
  b. Tap-to-toggle: tap to start, tap again to stop + send.
  c. Tap-to-talk + VAD auto-stop: tap to start, client detects end-of-speech silence and auto-submits.
  d. Always listening (wake-word gated).
- **Recommended**: (a) — privacy-obvious, no VAD tuning, robust across browsers (incl. Firefox caveat), and the walkie-talkie "over" rhythm fits the broadcast conceit.
- **Decision**: **(a) Press-and-hold. Mic button is hold-to-talk: audio is captured only while the pointer/touch is held on the button; release ends capture and submits the recognized text. No continuous listening, no wake word (wake-word deferred per `initial-plan.md` future list). While held, the button shows an unambiguous "ON AIR" / hot-mic state (red pulse + label). Keyboard equivalent: hold `Space` while the mic button has focus. Releasing outside the button still ends capture (no "stuck hot mic"). If the user releases after < 300 ms with no speech detected, treat as a cancel (no submit, no error toast).**
- **Impact**: `/specify` §5 (observable), `/plan` client components (`MicButton.tsx` behavior, Web Speech API start/stop wiring), `/tasks` T3.3 / T3.4 acceptance.

---

## NFR clarifications

### PWA1. Progressive Web App scope
- **Q**: The app will be a PWA. What does the service worker cache, how is install offered, and what does the offline state look like?
- **Options**:
  a. Full offline support — cache the app shell *and* recent agent responses / audio for replay.
  b. App-shell-only cache — cache HTML/JS/CSS/icons/manifest, never agent or audio content; offline shows a static in-character state.
  c. No service worker — manifest only (installable but no offline at all).
- **Recommended**: (b) — preserves Constitution P1 (cloud-only) and P5 (no surprise re-use of LLM outputs), removes any privacy concern about cached responses on shared devices, and keeps `Max Height` looking like the "broadcast signal" conceit (when the signal is gone, the screen says so).
- **Decision**: **(b) App-shell-only cache.** Concretely:
  - **Cached** by the service worker: HTML, JS/CSS bundles (hashed, cache-first), web app manifest, icons (192 / 512 / maskable + iOS `apple-touch-icon` set), fonts, static images.
  - **Never cached** (network-only, no SW interception): AgentCore Runtime WebSocket frames, LLM response text, Polly audio streams, Polly speech marks (visemes), Cognito tokens / SigV4-signed requests, AgentCore Memory data, "Forget me" / export endpoints, third-party STT requests.
  - **Install prompt**: browser-default only. No custom in-app install nag in MVP or V1 — Max does not break character to ask to be installed. Install affordance comes from the browser UI (Chrome/Edge install icon, iOS Safari "Add to Home Screen").
  - **Offline copy**: reuses the "signal lost" visual state from S3 (budget-breach) but with a distinct line. Draft: **"…N-no signal, c-chumps. The network's a g-ghost. Try me again when your wires are back."** — same avatar treatment, different text. Online + agent-down keeps the existing S3 copy.
  - **Reconnect**: when network returns, the conversation surface re-enables automatically (no forced reload). The active session, if any, is treated as ended — a new session starts on the next user input.
- **Impact**: `/specify` §5 (installable + offline app-shell behaviors), `/specify` §4 (S6, F6 scenarios), `/plan` §1 (vite-plugin-pwa), `/plan` SW scope + CloudFront `Cache-Control` rules, `/tasks` Phase 0 PWA scaffolding task, `/implement` PR-review guardrail.

---

## Constitutional enforcement table (from `/constitution`)

Fill in trigger / mechanism / owner for each principle P1–P9.

| Principle | Trigger | Mechanism | Owner |
|---|---|---|---|
| P1 Cloud-only | New inference dep added | PR check: denylist of on-device ML packages (`onnxruntime-web`, `@xenova/transformers`, `@mlc-ai/web-llm`, `tensorflow.js`, `transformers.js`) | Project owner |
| P2 $10 cap | Any new AWS resource | AWS Budget alarms ($5/$8/$10) + soft-degrade Lambda at $8 + hard-stop Lambda at $10 + `/plan` review | Project owner |
| P3 Personality gate | Any Phase 2+ task | `/tasks` gate: T1.5.1 golden-set pass required (avg ≥ 2.0, zero auto-fail) | Project owner |
| P4 IP posture | Any naming / asset change | Review against `docs/max-personality-bible.md` §legal + CI grep check for "Max Headroom"/"Matt Frewer" in non-reference strings | Project owner |
| P5 No live judge | Any eval feature | Design review; evals run via AgentCore Evaluations (async batch) only | Project owner |
| P6 Supply chain | Any dep change | `npm audit` + `npm audit signatures` + exact-version lint in CI | Project owner |
| P7 FnF audience | Any scaling / SEO work | `robots.txt` disallow-all; design review for any public-discovery feature | Project owner |
| P8 Degradation | Any new feature | 3 required fallback tests (no-WebGL, no-mic, cloud-down) in PR acceptance checklist | Project owner |
| P9 Observability | Any new feature | Trace-span-first PR template; reject PRs lacking spans for user-visible latency | Project owner |

---

## Deferred (explicit non-answers)

Items acknowledged but deliberately postponed, with owner & revisit trigger:

- **D1. Per-item memory deletion UI** — deferred to V1 (MVP has one-click wipe). Owner: project owner. Revisit trigger: memory features stabilize after Phase 1.
- **D2. WebRTC voice streaming** (Phase 7 stretch) — deferred indefinitely. Owner: project owner. Revisit trigger: latency targets (N1) fail to hold on mobile at P95.
- **D3. Multi-user / public auth posture** — deferred indefinitely per P7. Owner: project owner. Revisit trigger: explicit scope change from "friends and family" to "public."
- **D4. Error-rate and cold-start incident thresholds** — deferred to first post-MVP ops pass. Starting assumption: error rate > 5% over 10 min, or cold-start P95 > 8s over 1 hour, triggers an email alarm.

---

## Exit criteria for `/clarify`

- Every `____` above is filled in.
- No "TBD" in `/specify`.
- Enforcement table complete.
- `/plan` can begin without re-asking the user.
