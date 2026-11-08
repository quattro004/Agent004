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
| **16 greeting MP3 files**                                       | ✅ **Generated & committed** (Phase 3 complete)                              | `public/greetings/audio/greeting-001…016.mp3`               |
| **Generation script**                                           | ✅ **Built** (Phase 2 complete)                                             | `scripts/generate-greetings.ts`, `scripts/greetingGenCore.ts` |
| `@aws-sdk/client-polly` dependency                              | ✅ Present                                                                  | `packages/frontend/package.json`                            |
| `tsx` runner                                                    | ✅ In monorepo (agent + frontend)                                           | `packages/agent`, `packages/frontend`                       |
| Greeting-manifest file-existence validation                     | ❌ None (only re-engagement, pattern-only)                                  | —                                                            |

**Implication:** committing audio-only assets will NOT break `pnpm run validate`. The spec/contract still _describe_ video as required, so we align them (non-blocking).

## Decisions

- **Provider:** Amazon Polly is the **sole** generation method — Matthew, neural, mp3, 24 kHz (reuse existing config). No other TTS provider (ElevenLabs, manual recording, browser TTS) is in scope.
- **SSML:** Hand-tuned per greeting (breaks, prosody `rate`/`volume`, stutter timing), guided by the personality bible. Falls back to the simple wrapper if a line lacks custom SSML. Note the neural engine supports only `volume`/`rate` on `<prosody>` and rejects `<emphasis>`; pitch changes come from the glitch engine at playback (see § Voice glitch episodes), not from SSML.
- **Duration calibration:** Auto-measure each MP3 and rewrite `audioDurationMs` (within the contract's ±500 ms / 1000–15000 ms bounds).
- **Spec:** Update via speckit iterate to make video **optional/deferred** (not deleted) — avatar images are the MVP visual; mp4s are a future "if cheap" add.
- **Extra scope:** mouth-threshold tuning + audio-driven timing refinement (tail buffer); volume knob is already wired → verify only.

## T158 — Phonetic greeting audition and pacing comparison (2026-11-07)

The builder chose exaggerated stuttering while preserving the existing dialogue,
initially deferred AWS generation, then ran the three-pronunciation experiment.
**IPA schwa sounded best**, but both the stutters and overall speech were too
slow. The shipped MP3s and manifest remain unchanged. T158 stays open until
pacing is accepted, all durations are checked and production is regenerated.

### First audition and measurements

The existing pronunciation comparison remains available from the repo root:

```powershell
pnpm --filter @max-height/frontend generate:greetings --experiment --only greeting-015 --dry-run
```

This prints three otherwise identical requests: `ipa-schwa` (`bə`/`mə`),
`ipa-strut` (`bʌ`/`mʌ`) and `alias` (`buh`/`muh`). It makes no AWS calls and
writes nothing. The trial uses the existing 100 ms SSML pause between repeated
onsets; this is a tuning choice, not a new timing requirement.

After approving the spend and supplying temporary, least-privilege credentials
in the same PowerShell session with `AWS_REGION=us-west-2`, omit `--dry-run`:

```powershell
pnpm --filter @max-height/frontend generate:greetings --experiment --only greeting-015
```

The three MP3s go under
`packages/frontend/.greeting-experiment/{ipa-schwa,ipa-strut,alias}/audio/`.
That directory is gitignored and outside `public`; neither production audio nor
`manifest.json` is written. Each variant takes one Neural Matthew request,
with no speech marks. At the [published $16 per million Neural characters](https://aws.amazon.com/polly/pricing/)
(re-read 2026-11-07), counting even all SSML markup gives a conservative bound
of **$0.034 for the three greeting-015 requests**, before allowances. This is
an estimate, not approval to run AWS.

The IAM grant is `polly:SynthesizeSpeech` on `*` with
`aws:RequestedRegion = us-west-2`, as in Phase 3 below. The
[Polly service authorization reference](https://docs.aws.amazon.com/service-authorization/latest/reference/list_polly.html)
(checked 2026-11-07) supports no `polly:Engine` or `polly:VoiceId` condition
keys. Neural and Matthew are request settings, not IAM-enforceable restrictions.

Listen for phonetic sounds rather than letter names, abrupt but intelligible
restarts, and an original retro-TV presenter cadence. Judge the clips through
the existing audio-chain DSP before accepting the client experience; raw MP3s
do not include its pitch/EQ treatment.

Then audition `greeting-005`, the previous near-15-second outlier, and a
non-`b` greeting such as `greeting-001`. All 16 SSML entries have stronger
onset repeats, but the full pool's new durations and naturalness are **not yet verified**.
Experiments retain out-of-range clips with a re-tune warning. Full generation
checks all measured durations before overwriting any production MP3.
Schwa is now the builder's pronunciation choice; its initial pacing is not
approved for rollout.

Measured with `music-metadata` against the actual experiment files and the
matching committed `greeting-015.mp3`, not estimated from SSML:

| Recording | Duration | Bytes | Overall dialogue WPM | Within 15 s |
| --- | ---: | ---: | ---: | --- |
| Alias | 16,992 ms | 101,996 | 78 | No |
| **IPA schwa** | **16,560 ms** | **99,404** | **80** | **No** |
| IPA strut | 16,344 ms | 98,108 | 81 | No |
| Shipped greeting-015 | 12,792 ms | 76,796 | 103 | Yes |

All four files are mono, 24 kHz MPEG-2 Layer III MP3s at approximately 48 kbps.
The shipped duration matches its manifest exactly. Schwa is 1,560 ms over the
ceiling and about 29.5% longer than the shipped clip. WPM uses 22 canonical
dialogue words and includes all pauses and added onsets; it is **not**
articulation-only speech rate.

### Second audition — faster and snappy (completed)

The second audition made two Neural Matthew requests without speech marks.
These are the previous candidates; the command now generates the next pair:

| Profile | Overall rate | Onset gap | Extra onset acceleration |
| --- | --- | --- | --- |
| `pace-faster` | 115% | 50 ms | None |
| `pace-snappy` | 115% | 50 ms | `x-fast` around repeated onsets only, not the full word |

The 115% rate already exists in greeting-005; the 50 ms gap uses the existing
audio chain's nominal replay timing as a trial starting point. These are
audition choices, **not new shipping requirements**. AWS documents Neural
support for prosody `rate`, including percentage and preset speeds; actual
timing is voice-dependent ([voice speed](https://docs.aws.amazon.com/polly/latest/dg/voice-speed-change-vip.html),
[prosody](https://docs.aws.amazon.com/polly/latest/dg/prosody-tag.html)).
The `x-fast` trial addresses the duration of the syllables themselves, not
just the silence between them.

The previous output is under
`packages/frontend/.greeting-experiment/{pace-faster,pace-snappy}/audio/`.
The three original pronunciation clips remain intact for comparison; production
audio and the manifest are untouched. Their SSML requests contain 701 and
767 characters including markup, giving a conservative combined cost bound
of **$0.024**, rounded up from $0.023488, before allowances.

Measured from the builder's actual second-audition files:

| Recording | Duration | Bytes | Overall dialogue WPM | Within 15 s |
| --- | ---: | ---: | ---: | --- |
| `pace-faster` | 15,408 ms | 92,492 | 86 | No |
| **`pace-snappy`** | **14,976 ms** | **89,900** | **88** | **Yes, only 24 ms headroom** |

The builder preferred **snappy** and clarified that normal speech speed is
good: only the stuttering should speed up. These are duration/word-rate
measurements, not a new loudness analysis or automated listening judgment.

### Next generation — faster stutter onsets only

The builder preferred `pace-snappier` and asked for a stutter about 20% faster
with all other speech unchanged. `x-fast` is a Polly preset whose speed AWS
documents only as approximate, so the next pair replaces it with numeric rates
(valid range 20–200%) to find out empirically whether a faster onset is
possible at all:

```powershell
pnpm --filter @max-height/frontend generate:greetings --pace-experiment --only greeting-015 --dry-run
pnpm --filter @max-height/frontend generate:greetings --pace-experiment --only greeting-015
```

Run the live command in the shell with temporary credentials. Both new schwa
trials keep **115% normal speech**, `pace-snappier`'s 20 ms gaps, the same words
and all other pauses; only the repeated-onset `rate` differs:

| Profile | Onset `rate` |
| --- | --- |
| `pace-onset-180` | 180% |
| `pace-onset-200` | 200% (Polly's ceiling) |

Compare each against `pace-snappier` (88,748 bytes). If both
clips match it, `x-fast` is already at the ceiling and the remaining lever is
the 20 ms gap (`pace-rapid` shows the no-gap limit). It is also unverified
whether a nested `prosody` rate is relative to the 115% outer rate or absolute;
the measured durations will show. These are experiment choices, not shipping
timing requirements. Output goes to
`packages/frontend/.greeting-experiment/{pace-onset-180,pace-onset-200}/audio/`;
all seven previous trial clips remain untouched. The two requests contain 763
and 821 characters including markup, giving a conservative combined bound of
**$0.026** before allowances. New audio durations and naturalness still need
the builder's generation and listen. The command prints actual durations and
warns if either clip exceeds 15 seconds; do not assume a faster SSML setting
guarantees a compliant MP3.

Measured from the builder's generated files:

| Recording | Duration | Change vs `pace-snappier` |
| --- | ---: | ---: |
| `pace-snappier` | 14,784 ms | — |
| `pace-onset-180` | 14,544 ms | −240 ms |
| `pace-onset-200` | 14,424 ms | −360 ms |
| `pace-rapid` (no gaps) | 12,288 ms | −2,496 ms |

Raising the onset `rate` from `x-fast` to 200% saves only 2.4% of the clip.
Removing the 20 ms `<break>` tags saves 17%, far more than their nominal
duration, so Polly appears to render each `<break>` between onsets much
longer than its stated time (an inference from durations, not verified by
listening or speech marks). The inserted gaps, not the onset `rate`, are
the dominant stutter-speed lever.

### Decision: `rapid` is final and the production default

The builder listened and chose **`pace-rapid`** ("almost too fast"). A single
gentler trial, `pace-gap-5ms` (`rapid` plus 5 ms gaps), was **not better**, so
`rapid` stays. It is the default `SpeechPacing` in
`packages/agent/src/voice/ssml.ts` and `buildGreetingSsml`, so the full-pool
command uses it; `original` and the other profiles remain selectable
explicitly. The `gap5` profile and `--pace-experiment` harness remain only as
the record of that rejected trial; `pace-gap-5ms` output lives in
`packages/frontend/.greeting-experiment/pace-gap-5ms/audio/`.

**No production audio or manifest duration has been regenerated.** Do that with
the full-pool command, validating each measured duration rather than clamping.

### Playback DSP and signal measurements

> **Superseded 2026-11-07** by § Voice glitch episodes below: the 1.05 pitch
> worklet was removed (base pitch is now 1.0). The EQ figures and loudness
> table still describe the chain; they were measured with the 1.05 shift in
> place.

`createUseGreeting()` already calls `audioChain.play()`. Normal speech uses a
granular **1.05 pitch factor (+5%)** and a fixed EQ boost; pitch shift does not
make the speech faster. The stutter-replay and static-burst nodes are present
but **no application call sites trigger them**, so current greeting stutters
come from SSML. The builder explicitly deferred adding those triggers until
the base pronunciation and pacing are right. No DSP settings were changed.

The EQ comments describe a roughly 5 kHz/+6 dB treatment, but the actual
coefficients plus dry-signal mix peak near **3,340 Hz / +9.54 dB at 44.1 kHz**.
That is the calculated filter response, not the overall speech loudness;
frequency scales with browser sample rate.

The files were also decoded locally using Edge Web Audio at 44.1 kHz and
processed through the current worklet code in 128-frame blocks, with
replay/static bursts inactive:

| Recording | Raw peak dBFS | Raw RMS dBFS | DSP peak at 50% volume | DSP RMS at 50% volume |
| --- | ---: | ---: | ---: | ---: |
| Alias | -7.61 | -25.72 | -13.58 | -33.37 |
| IPA schwa | -7.70 | -26.49 | -13.29 | -34.07 |
| IPA strut | -7.26 | -26.39 | -12.66 | -34.00 |
| Shipped greeting-015 | -8.19 | -26.21 | -14.49 | -33.70 |

No samples exceeded full scale in any recording, before volume or at 50%.
These are sample peak and whole-clip RMS measurements from a reconstruction,
**not LUFS, true peak, hardware-output capture or subjective listening**.
Separate looping TV noise is excluded. A temporary local Vite/Edge check also
served the private schwa clip and initialized, started and stopped playback
through the app's actual native worklet chain; both helpers were stopped.
Final client acceptance still needs human listening through that chain.

The pure helper lives in `packages/agent/src/voice/ssml.ts`, ready for T029 to
reuse. The greeting generator no longer imports the browser `pollyTts.ts` that
T081 will delete. It handles single-consonant prefixes; vowel and multi-letter
syllable glitches are outside this experiment.

### Voice glitch episodes (2026-11-07)

After four offline listening rounds that ran the real worklets in headless
Edge, the builder chose **Take K**. `src/audio/glitchEngine.ts` now glitches
every clip that `audioChain.play()` receives, before playback:

- **Base pitch is 1.0**, which is the Polly voice. The 1.05 worklet is gone.
- An **episode clock** alternates 6–10 s glitch spells with 10–20 s of clean
  voice and starts glitched. It counts played audio, not wall time, and is
  shared by every clip on the page.
- Each spell picks a random non-empty mix of three effects:
  - **pitch jumps**: down to 0.8–0.9 or up to 1.25–1.6, for 120–350 ms;
  - **syllable replays**: the last 60–120 ms plays 2–3 times in all, with a
    static tick on each repeat;
  - **tape wobble**: speed and pitch swell ±12–25 % over 150–300 ms.
- Replays and wobble change the clip's length. `play()` returns the played
  duration, and greeting completion uses it.

`GLITCH_CONFIG` holds the numbers and the wiki's `Component-Audio-Chain`
tells the story; change neither without another listening round. The
`stutter-processor` worklet is still in the graph as a passthrough. Its
replay never worked and nothing triggers it.

**Production builds do not load the worklets.** Vite inlines each
`new URL('./xProcessor.ts', import.meta.url)` as a `data:video/mp2t` URL of
raw TypeScript. Edge rejects it (checked 2026-11-07), so `init()` fails and
greetings are silent outside `pnpm run dev`. The glitch engine runs on the
main thread and is not affected, but nothing plays without the chain.

## Phases & Tasks

### Phase 0 — Spec alignment (speckit iterate) — _non-blocking, do first for accuracy_ ✅ DONE

- Run `/speckit.iterate.define` then `/speckit.iterate.apply` to:
  - Make `videoPath` **optional** in `contracts/greeting-manifest.md` schema; change video build-time validation to conditional/deferred.
  - Update `data-model.md` (Greeting.videoPath optional) and `spec.md` FR-002 wording (avatar images as current visual; video deferred).
  - Document the "avatar images now, mp4s later if cost-effective" decision.
  - Note the parallel re-engagement manifest (same videoPath pattern) as a follow-up, not in this change unless trivial.
- Keep existing `videoPath` entries in the manifest as forward-looking placeholders; validation must not require the files to exist.

### Phase 1 — Author hand-tuned SSML (TDD) ✅ DONE

- Create `packages/frontend/scripts/greetingSsml.ts` exporting `Record<greetingId, string>` (full `<speak>…</speak>` per greeting), authored from the manifest text + personality bible (stutters already hyphenated, e.g. "L-l-ladies").
- **RED→GREEN:** coverage test — every manifest greeting id has an SSML entry, no orphan keys, each value is a single well-formed `<speak>` root.

### Phase 2 — Generation script (TDD) ✅ DONE

- Add dev tooling to `packages/frontend`: `tsx` (run) + `music-metadata` (measure mp3 duration, pure-JS). Add script `"generate:greetings": "tsx scripts/generate-greetings.ts"`. _(Dep additions flagged for constitution review.)_
- Isolate the script from the browser build: own `tsconfig.scripts.json` (Node libs), excluded from the app `tsc -b` project so `validate` stays green.
- **Pure units first (RED→GREEN→REFACTOR):**
  - `buildGreetingSsml(text, customSsml?)` — returns custom SSML or `wrapInSsml(text)` fallback (reuse `pollyTts.wrapInSsml`).
  - `calibrateDurations(manifest, measuredMsById)` — clamp to [1000, 15000], round, return updated manifest; preserve unrelated fields/order.
  - `measureMp3DurationMs(buffer)` — thin wrapper over `music-metadata` (parser injectable for tests).
  - SSML-coverage guard reused from Phase 1.
- **Orchestration:** read manifest → for each greeting synth via Polly (`SynthesizeSpeechCommand`, neural / Matthew / mp3 / 24k, `TextType:'ssml'`; client injectable + mocked in tests like `pollyTts.test.ts`) → write `public/greetings/audio/greeting-NNN.mp3` → measure → rewrite manifest durations. Flags: `--dry-run`, `--only <id>`. No new infra, no deployed resources.
  - **Region:** don't hardcode a region in the `PollyClient` — let it resolve from the environment/profile (`AWS_REGION` or the active profile) so the Phase 3 credential setup drives it.

### Phase 3 — Generate & commit assets ✅ DONE

Generation needs **temporary AWS security credentials** (STS `ASIA…` keys with a session token) carrying `polly:SynthesizeSpeech` — **no long-lived IAM user keys (`AKIA…`) on disk, ever** (constitution P11).

**Why not IAM Identity Center (SSO)?** _Rejected — it costs $100._ SSO can only grant AWS-account access (permission sets) from an **organization instance**; an *account* instance supports neither permission sets nor account assignment, so it cannot issue the access keys we need. Enabling an organization instance creates an AWS Organization, and the console warns that this "automatically upgrades your account from a free plan to a paid plan with pay-as-you-go pricing and your free tier credits expire immediately" — it also forfeits eligibility for future free-tier credits. Spending the account's $100 credit balance to save ~1¢ of Polly is a direct P2 (Budget Ceiling) violation. Constitution P11 was amended (v1.4.0) to allow the org-free path below.

**Chosen path: AWS CloudShell session export.** Sign in to the console as a least-privilege IAM user that has *no access keys at all*, then export that browser session's temporary credentials into the local shell. No long-lived key is ever created, nothing is written to `~/.aws`, and no AWS CLI install is required locally (CloudShell ships with it).

- **One-time setup in AWS (console)**
  - IAM → **Users** → **Create user** `max-height-gen`, with **console access** (password). **Do not create an access key.**
  - Attach an **inline policy** granting only Polly synthesis, region-scoped for least privilege:
    ```json
    {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Action": "polly:SynthesizeSpeech",
          "Resource": "*",
          "Condition": { "StringEquals": { "aws:RequestedRegion": "us-west-2" } }
        }
      ]
    }
    ```
  - Also attach the AWS-managed **`AWSCloudShellFullAccess`** policy so the user can open CloudShell.
  - No role, no permission set, no organization, nothing deployed.

- **Each session — get temporary creds and run**
  - Sign in to the console **as `max-height-gen`** (not root), and switch to the **US West (Oregon) / us-west-2** Region.
  - Open **CloudShell** (the `>_` icon in the top nav) and run:
    ```bash
    aws configure export-credentials --format env-no-export
    ```
    This prints the session's temporary `ASIA…` credentials. _(Fallback if that command is unavailable: `curl -H "Authorization: $AWS_CONTAINER_AUTHORIZATION_TOKEN" $AWS_CONTAINER_CREDENTIALS_FULL_URI`.)_
  - Paste the values into the **local PowerShell session** you will run the script from, as env vars only — never `aws configure`, never a file:
    ```powershell
    $env:AWS_ACCESS_KEY_ID="ASIA..."
    $env:AWS_SECRET_ACCESS_KEY="..."
    $env:AWS_SESSION_TOKEN="..."
    $env:AWS_REGION="us-west-2"
    ```
  - Run in that **same** shell (env vars do not persist across shells):
    `pnpm --filter @max-height/frontend generate:greetings`
  - The credentials expire with the CloudShell session; re-export to refresh. The generate script is idempotent, so re-running is safe.
  - Never paste these values into a chat, issue, or PR transcript (P11).

- **Region & STS notes**
  - Keep `AWS_REGION` on an **enabled-by-default** Region (we use `us-west-2`, where neural Matthew is available and STS is always active). With a region set, the SDK uses the **regional STS endpoint** automatically.
  - The inline policy's `aws:RequestedRegion` condition must match whatever Region you generate in — change both together or synthesis will be denied.

- Verify output: 16 files in `public/greetings/audio/`, each small (~<100 KB; no Git LFS), manifest `audioDurationMs` updated. Listen to each for character/quality.
- **Commit** the 16 generated MP3s in `public/greetings/audio/` together with the updated `public/greetings/manifest.json` (recalibrated `audioDurationMs`) as static assets.

**Outcome (generated 2026-08-16):** all 16 MP3s produced via CloudShell session export as planned — 53–88 KB each, ~1.0 MB total, no Git LFS needed. Measured durations span 8832–14688 ms; every entry is now exactly equal to its measured MP3 duration, satisfying contract rule 6 (±500 ms) and the 1000–15000 ms bounds.

Two corrections surfaced during generation:

- **`calibrateDurations` silently clamped out-of-range measurements.** `greeting-005` measured 16272 ms and was written to the manifest as `15000`. The clamp did not protect the contract — it *manufactured* a 1272 ms violation of rule 6 and hid it, which would also have clipped Max's last words at playback. Fixed via TDD: the function now throws an aggregated, actionable error naming every out-of-range greeting instead of coercing the value. See `docs/tdd-plans/greeting-duration-clamp-TDD-Plan.md`.
- **`greeting-005` re-tuned rather than raising the ceiling.** Decision: keep the 15 s contract ceiling. 15 of 16 greetings land between 8832 and 12792 ms, so raising the contract 33% for a single 8% outlier would have weakened the guardrail for all future greetings and the re-engagement pool. Instead its SSML was trimmed (rate 105%→115%, `<break>` total 2300→1500 ms, **no wording change**, so the manifest `text` is untouched), bringing it to 14688 ms. Note this leaves only ~312 ms of headroom — re-check if that greeting is ever re-tuned.
- Post-generation, run Prettier on `manifest.json`: the script writes it via `JSON.stringify(…, 2)`, which expands `tags` arrays and normalizes `1.0`→`1`.

**Pre-flight status (verified):** the generation script, SSML module, `tsx`/`music-metadata`/`@aws-sdk/client-polly` deps and the `generate:greetings` package script are all in place; `--dry-run` resolves all 16 greetings to `audio/greeting-NNN.mp3` (relative paths, correct). Nothing in `.gitignore` excludes the MP3s. **Credentials are the only blocker.**

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
- **Credentials:** org-free **AWS CloudShell session export** — a least-privilege IAM user with a console password and **no access keys**; temporary `ASIA` credentials pasted as env vars. No long-lived `AKIA` keys, no local AWS CLI install, no CDK/infra changes, nothing deployed. **IAM Identity Center was rejected** because it requires an AWS Organization, which would immediately expire the account's free-tier credits (see Phase 3). Constitution P11 amended to v1.4.0 accordingly.

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

1. ~~**spec-video-optional** — Phase 0 spec/contract update (video optional/deferred).~~ ✅ done
2. ~~**author-ssml** — Phase 1 hand-tuned SSML module + coverage test.~~ ✅ done
3. ~~**gen-script-pure** — Phase 2 pure units (build SSML, calibrate, measure) via TDD.~~ ✅ done
4. ~~**gen-script-orchestrate** — Phase 2 Polly synth + manifest rewrite + tooling/deps/tsconfig.~~ ✅ done
5. ~~**generate-assets** — Phase 3 run script, commit 16 MP3s, QA.~~ ✅ done
6. **tune-mouth-threshold** — Phase 4 mouth threshold tuning + test. ⬅️ **NEXT**
7. **audio-driven-timing** — Phase 4 tail-buffer timing refinement + tests.
8. **verify-volume** — Phase 4 verify volume knob (optional localStorage persistence).
9. **validate-finalize** — Phase 5 `pnpm run validate` + docs update.
