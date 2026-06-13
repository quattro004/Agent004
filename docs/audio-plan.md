# Audio Plan — Max Height Greeting MP3 Generation

## Problem & Approach

The greeting **playback** pipeline is already fully built; it just lacks the 16 MP3 files. We will generate them **once** with Amazon Polly (Matthew / neural) using **hand-tuned per-greeting SSML**, commit them as static assets, auto-calibrate the manifest durations, align the spec to drop/defer video, and finish the few audio-dependent UI refinements.

**Budget reality (shoestring):** generating all 16 via Polly Neural is a **one-time cost of ~1¢** (≈2,600 chars total; free-tier eligible). Because the MP3s are committed static assets, there is **zero ongoing/runtime cost**. The expensive talking-head mp4s are replaced by the existing avatar images — that is the big saving. We may revisit cheap mp4s later (the spec keeps the door open).

## Current State (verified)

| Component                                                        | Status                                                                     | Location                                                      |
| --------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Greeting selector (weighted / no-repeat / time-of-day)          | ✅ Built                                                                    | `src/services/greetingSelector.ts`                           |
| Greeting playback + mouth polling                               | ✅ Built                                                                    | `src/hooks/useGreeting.ts`                                   |
| Audio chain (worklets, analyser, `setVolume`)                   | ✅ Built                                                                    | `src/audio/audioChain.ts`                                    |
| Polly TTS (SSML wrap, neural / Matthew / mp3 / 24k)             | ✅ Built (browser, conversation)                                            | `src/services/pollyTts.ts`                                   |
| Manifest (16 greetings, `audioPath` / `audioDurationMs` / `videoPath`) | ✅ Present                                                            | `public/greetings/manifest.json`                            |
| Volume knob UI → store → `audioChain.setVolume`                 | ✅ **Already wired**                                                        | `components/VolumeKnob.tsx`, `App.tsx:92,161-164,311`        |
| Audio-driven greeting timing                                    | ✅ **Already uses `audioDurationMs`**; `GREETING_DISPLAY_MS` is text-only fallback | `App.tsx:143`, `useGreeting.ts:159`                  |
| **16 greeting MP3 files**                                       | ❌ **Missing**                                                              | `public/greetings/audio/` (does not exist)                  |
| **Generation script**                                           | ❌ **Missing**                                                              | n/a                                                          |
| `@aws-sdk/client-polly` dependency                              | ✅ Present                                                                  | `packages/frontend/package.json`                            |
| `tsx` runner                                                    | ✅ In monorepo (agent pkg)                                                  | `packages/agent`                                            |
| Greeting-manifest file-existence validation                     | ❌ None (only re-engagement, pattern-only)                                  | —                                                            |

**Implication:** committing audio-only assets will NOT break `pnpm run validate`. The spec/contract still _describe_ video as required, so we align them (non-blocking).

## Decisions

- **Provider:** Amazon Polly is the **sole** generation method — Matthew, neural, mp3, 24 kHz (reuse existing config). No other TTS provider (ElevenLabs, manual recording, browser TTS) is in scope.
- **SSML:** Hand-tuned per greeting (breaks, prosody, emphasis, stutter timing), guided by the personality bible. Falls back to the simple wrapper if a line lacks custom SSML.
- **Duration calibration:** Auto-measure each MP3 and rewrite `audioDurationMs` (within the contract's ±500 ms / 1000–15000 ms bounds).
- **Spec:** Update via speckit iterate to make video **optional/deferred** (not deleted) — avatar images are the MVP visual; mp4s are a future "if cheap" add.
- **Extra scope:** mouth-threshold tuning + audio-driven timing refinement (tail buffer); volume knob is already wired → verify only.

## Phases & Tasks

### Phase 0 — Spec alignment (speckit iterate) — _non-blocking, do first for accuracy_

- Run `/speckit.iterate.define` then `/speckit.iterate.apply` to:
  - Make `videoPath` **optional** in `contracts/greeting-manifest.md` schema; change video build-time validation to conditional/deferred.
  - Update `data-model.md` (Greeting.videoPath optional) and `spec.md` FR-002 wording (avatar images as current visual; video deferred).
  - Document the "avatar images now, mp4s later if cost-effective" decision.
  - Note the parallel re-engagement manifest (same videoPath pattern) as a follow-up, not in this change unless trivial.
- Keep existing `videoPath` entries in the manifest as forward-looking placeholders; validation must not require the files to exist.

### Phase 1 — Author hand-tuned SSML (TDD)

- Create `packages/frontend/scripts/greetingSsml.ts` exporting `Record<greetingId, string>` (full `<speak>…</speak>` per greeting), authored from the manifest text + personality bible (stutters already hyphenated, e.g. "L-l-ladies").
- **RED→GREEN:** coverage test — every manifest greeting id has an SSML entry, no orphan keys, each value is a single well-formed `<speak>` root.

### Phase 2 — Generation script (TDD)

- Add dev tooling to `packages/frontend`: `tsx` (run) + `music-metadata` (measure mp3 duration, pure-JS). Add script `"generate:greetings": "tsx scripts/generate-greetings.ts"`. _(Dep additions flagged for constitution review.)_
- Isolate the script from the browser build: own `tsconfig.scripts.json` (Node libs), excluded from the app `tsc -b` project so `validate` stays green.
- **Pure units first (RED→GREEN→REFACTOR):**
  - `buildGreetingSsml(text, customSsml?)` — returns custom SSML or `wrapInSsml(text)` fallback (reuse `pollyTts.wrapInSsml`).
  - `calibrateDurations(manifest, measuredMsById)` — clamp to [1000, 15000], round, return updated manifest; preserve unrelated fields/order.
  - `measureMp3DurationMs(buffer)` — thin wrapper over `music-metadata` (parser injectable for tests).
  - SSML-coverage guard reused from Phase 1.
- **Orchestration:** read manifest → for each greeting synth via Polly (`SynthesizeSpeechCommand`, neural / Matthew / mp3 / 24k, `TextType:'ssml'`; client injectable + mocked in tests like `pollyTts.test.ts`) → write `public/greetings/audio/greeting-NNN.mp3` → measure → rewrite manifest durations. Flags: `--dry-run`, `--only <id>`. No new infra, no deployed resources.
  - **Region:** don't hardcode a region in the `PollyClient` — let it resolve from the environment/profile (`AWS_REGION` or the active profile) so the Phase 3 credential setup drives it.

### Phase 3 — Generate & commit assets

Generation needs **temporary AWS security credentials** (STS `ASIA…` keys with a session token) carrying `polly:SynthesizeSpeech` — **no long-lived IAM user keys (`AKIA…`) on disk, ever**. We use **IAM Identity Center (SSO)**: you log in via the browser, and the AWS SDK derives short-lived `ASIA` credentials from the SSO session — there is no long-lived key to bootstrap from. This is the no-long-lived-key path from the AWS guide [Use temporary credentials with AWS resources](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp_use-resources.html). (The guide's local STS-`AssumeRole` examples quietly bootstrap from an `AKIA` IAM user; SSO avoids that.) Starting state assumed: an AWS account exists, but **nothing is configured locally**.

- **One-time setup in AWS (console)**
  - Enable **IAM Identity Center** (choose a region).
  - Create an Identity Center **user** for yourself.
  - Create a **permission set** (e.g. `MaxHeightPolly`) whose policy grants `polly:SynthesizeSpeech`, scoped to the generation Region for least privilege:
    ```json
    { "Effect": "Allow", "Action": "polly:SynthesizeSpeech", "Resource": "*",
      "Condition": { "StringEquals": { "aws:RequestedRegion": "us-west-2" } } }
    ```
    This is the only permission the script needs. Identity Center materializes the permission set as a managed role, so a separate hand-made role is **not** required.
  - **Assign** your user → your AWS account → the `MaxHeightPolly` permission set.

- **One-time setup on the laptop**
  - Install the **AWS CLI v2** — required here for the browser login (`aws sso login`), not as a runtime dependency of the script.
  - `aws configure sso` — enter the SSO start URL + region, pick the account + `MaxHeightPolly` permission set, set region `us-west-2`, and name the profile `max-height`. This writes only SSO config (no secret keys) to `~/.aws/config`.

- **Each session — get temporary creds and run**
  - `aws sso login --profile max-height` (opens the browser; caches a short-lived SSO token — no `AKIA` key on disk).
  - Point the SDK at the profile and run in the same shell (Windows `cmd`: `SET AWS_PROFILE=max-height`; PowerShell: `$env:AWS_PROFILE="max-height"`):
    `pnpm --filter @max-height/frontend generate:greetings`
  - The SDK derives `ASIA` temporary credentials from the SSO session automatically; the script does not call `AssumeRole` in code.
  - When the SSO session expires, re-run `aws sso login --profile max-height`. The generate script is idempotent, so re-running is safe.

- **Verify**
  - `aws sts get-caller-identity` should show the Identity Center role session (an assumed-role ARN), and the active credentials should be `ASIA…`.

- **Region & STS notes**
  - Keep the profile on an **enabled-by-default** Region (we use `us-west-2`, where Polly is available and STS is always active). With a region set, the SDK uses the **regional STS endpoint** automatically (AWS-recommended over the global endpoint) — no extra config.
  - Only relevant if you ever switch to an **opt-in** Region (e.g. Hong Kong): you must enable that Region (and thus STS) for the account first, or the SSO/STS calls will fail.
  - The SSO permission-set session (default ~1h) easily covers this one-shot generation; if it lapses, just re-run `aws sso login --profile max-height`.

- Verify output: 16 files in `public/greetings/audio/`, each small (~<100 KB; no Git LFS), manifest `audioDurationMs` updated. Listen to each for character/quality.
- **Commit** the 16 generated MP3s in `public/greetings/audio/` together with the updated `public/greetings/manifest.json` (recalibrated `audioDurationMs`) as static assets.

### Phase 4 — Playback verification & audio-dependent tuning (TDD where logic exists)

- **Mouth threshold:** make `MOUTH_THRESHOLD` tunable; QA against real Polly audio and pick a value; add a boundary test for `getIsMouthOpen` with synthetic FFT data.
- **Audio-driven timing refinement:** add a small tail buffer (e.g. +750–1000 ms) after audio completion before `isGreetingDone`, so Max's last word isn't clipped; keep text-only/TTS fallback timing sensible. TDD in `useGreeting.test.ts` / App tests.
- **Volume knob:** already wired — verify it affects greeting audio; _optional_ enhancement: persist volume to `localStorage` (mirror theme persistence) with a test.

### Phase 5 — Validate & finalize

- `pnpm run validate` (lint → format:check → typecheck → build → test) must pass; confirm the generation script is excluded from the app build/typecheck.
- Confirm this document reflects the final reality (video deferred; volume/timing done).

## Cost & Dependency Notes

- **Cost:** ~1¢ one-time, free-tier eligible; zero runtime cost (static assets).
- **Deps:** `tsx` (already in monorepo), `music-metadata` (pure JS, build-time only) — flag for dep-hygiene review.
- **Credentials:** use **IAM Identity Center (SSO)** temporary `ASIA` credentials (`aws sso login`) for generation — no long-lived `AKIA` keys on disk; no CDK/infra changes, nothing deployed.

## Risks / Considerations

- Keep the Node script out of the browser `tsconfig`/Vite build to avoid breaking `validate` (dedicated tsconfig + excluded from app project).
- TDD is mandatory (constitution) for code: write failing tests first for every pure unit and behavior change. Don't need TDD for non-code related items like asset generation, documentation updates, simple UI CSS styling tweaks etc.
- SSML must stay valid Polly SSML; balance theatrical breaks against the 15 s manifest duration ceiling.
- Re-running the script is idempotent and overwrites assets + recalibrates durations.

## Out of Scope (this plan)

- Generating mp4 talking-head videos (deferred; avatar images cover the visual).
- Re-engagement audio assets (separate manifest; parallel future task).
- Conversation/runtime TTS changes (already implemented via `pollyTts.ts`).

## Next Steps (todo list)

1. **spec-video-optional** — Phase 0 spec/contract update (video optional/deferred).
2. **author-ssml** — Phase 1 hand-tuned SSML module + coverage test.
3. **gen-script-pure** — Phase 2 pure units (build SSML, calibrate, measure) via TDD.
4. **gen-script-orchestrate** — Phase 2 Polly synth + manifest rewrite + tooling/deps/tsconfig.
5. **generate-assets** — Phase 3 run script, commit 16 MP3s, QA.
6. **tune-mouth-threshold** — Phase 4 mouth threshold tuning + test.
7. **audio-driven-timing** — Phase 4 tail-buffer timing refinement + tests.
8. **verify-volume** — Phase 4 verify volume knob (optional localStorage persistence).
9. **validate-finalize** — Phase 5 `pnpm run validate` + docs update.
