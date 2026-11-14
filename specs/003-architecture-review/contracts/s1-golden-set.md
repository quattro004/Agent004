# Contract: Spike S1 golden-set character check

Decision it feeds: research Q2 (text model eligibility). Requirements: FR-003 (approval before running), FR-026 (S1 character fidelity), and constitution P3 with gate 2 (personality first) and P5 (offline judging only).

**Status: needs the builder's approval before it runs** (FR-003). It runs only after S0 has named at least one eligible candidate.

## What S1 answers

Does each S0-eligible candidate stay in character as Max Height well enough to serve friends? S1 is a **pass/fail bar, not a comparison**. Haiku 4.5 cannot be invoked in-Region on the Free plan (D1), so no Haiku 4.5 baseline transcripts exist or will be produced. When more than one candidate passes, Q2 still picks the cheapest (FR-026 builder rule). S1 scores are recorded so a later model change can be compared against them.

## Inputs

- **Cases**: all **65** cases in `packages/agent/src/evaluations/personality-gate.ts` (`goldenTestCases`), the set defined in `docs/max-personality-bible.md` §9. Spec 001 and constitution gate 2 still say 50. The bible grew the set to 65 on 2026-04-19 (`3c8a5cb`) and gate 2 is corrected by amendment A4 (research § Constitution amendments).
- **Rubric and pass criteria**: `RUBRIC_DIMENSIONS`, `AUTO_FAIL_RULES` and `PASS_CRITERIA` in the same file.
- **Candidates**: each model ID that S0 marked eligible ([s0-probe-matrix.md](./s0-probe-matrix.md) § Reading the results).

## How each reply is produced

S1 tests the configuration the first deployment will ship, not spec 001's full design:

- **System prompt**: `buildSystemPrompt()` from `personality/systemPrompt.ts`, with no post-processing. Q3 defers hooks and post-processing (#42), so the auto-fail rules are scored on the raw model reply.
- **Model settings**: the candidate's in-Region model ID with `maxTokens: 250` (`index.ts:97`, kept by Q2). Haiku 5.5's adaptive thinking is off, using the same request field S0-4 confirmed.
- **Tools**: the real tool definitions (news, weather, web search), with their callbacks returning **fixed fixture results**. That makes the fabrication check deterministic and keeps live third-party calls out of the spike. Cases with `toolContext.expectsNoFabrication` or `expectsInCharacterDeflection` get an empty or failed result.
- **Conversation context**: a case's `conversationContext` is passed through `buildSystemPrompt({ memories: [{ type: 'SUMMARY', content }] })`, matching the bible's "prior context in memory". A case with `turnRange` states that turn in the same summary.
- **One reply per case per candidate**, generated once and saved before scoring. Scoring never triggers a regeneration.
- **No Guardrail is attached.** S1 measures character, not Guardrail behavior. Guardrail interventions are checked at first deploy (quickstart).

## How replies are scored

Scoring is offline, after every reply is saved, and never in a live request (P5).

1. **Deterministic checks first.** Code in the runner, not the judge, decides three of the four auto-fail rules: `banned_phrase` (bible §6 list), `ip_violation` (the string "Max Headroom"), and `zero_stutter` (no stutter pattern in a reply of more than two sentences).
2. **Judge script.** A separate Bedrock Converse call scores each saved reply on the six rubric dimensions (0–3) and the `no_editorial` auto-fail. Its prompt includes the case, its `acceptableShapes`, `mustInclude` and `mustAvoid`, and the rubric descriptors. It returns JSON with a one-line reason per score.
   - The judge is an S0-confirmed in-Region model. A different model from the candidate is preferred. If the only eligible model is the candidate itself, that is recorded next to the result as a self-judging caveat.
   - Judge temperature is 0.
3. **Builder spot-check.** The builder reads every reply that hit an auto-fail, every case whose six-dimension average is below 2.0, and every tool case. The builder can override a judge score. Overrides are recorded with a reason, and the builder's score counts.

## Pass bar

A candidate passes S1 when all of these hold (spec 001 SC-001 and SC-002, as `PASS_CRITERIA` encodes):

| Check | Bar |
| --- | --- |
| Mean of all 65 × 6 dimension scores | ≥ 2.0 |
| Auto-fail triggers | 0 |
| Factual (no-tool) prompts scoring 0 on `editorial_mode` | 0 |
| Tool cases with fabricated data | 0 |

The per-case `passCriteria` minimums are reported as diagnostics. They do not gate the spike. A failing candidate may be re-run once after a system-prompt change, which is a code change under TDD. The builder approves the second run's cost separately.

## Cost

Approve before running (FR-003). Token figures are estimates. S2 later measures the real system-prompt size.

| Part | Calls per candidate | Tokens per call | Total tokens per candidate |
| --- | --- | --- | --- |
| Candidate replies | 65, plus tool round-trips on the 9 tool cases | about 3K input, ≤ 250 output | about 230K input, about 16K output |
| Judge | 65 | about 2.5K input, about 400 output | about 165K input, about 26K output |

The builder converts these figures to dollars at **human-read** prices for the chosen candidate and judge (FR-007), then records the estimate in research § Spikes before approving.

## Record everything

- Save the transcripts, the judge's raw JSON, the builder's overrides, and the four pass-bar results per candidate, each with the date and model IDs. The cases are synthetic, so the transcripts hold no personal data.
- Record each candidate's result and its self-judging caveat, if any, in research Q2's evidence. A candidate that was not run is recorded as not run, never as a pass.
- A pass satisfies constitution gate 2 for that model ID only. A later model change re-runs S1.
