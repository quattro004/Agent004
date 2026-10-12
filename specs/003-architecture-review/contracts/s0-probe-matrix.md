# Contract: Spike S0 probe matrix

Decision it feeds: research Q0 (inference path) and Q2 (text model), plus Q1's voice path. Requirements: FR-003 (P-01), FR-025, FR-026 (P-13) and FR-028 (Free plan).

**Status: needs the builder's approval before any probe runs** (FR-003). The total cost is well under $0.01.

## Rules

- **Who runs it**: the builder, with temporary credentials (P11), in `us-west-2`, against the Free-plan account that will host the deployment. No other account's result counts.
- **Size**: each model probe sends one short user turn (`"Reply with the single word OK."`) with `maxTokens: 16`, so it uses under 100 tokens. The Polly probe sends at most 40 characters.
- **No resources are created.** That means no Guardrail, Memory or runtime. AgentCore Runtime and Memory are first exercised at quickstart V-01.
- **Record everything.** For each probe, record the date, the outcome (success, or the error code such as `AccessDeniedException` or `ValidationException`) and the first line of the error message, in research Q0's evidence. A probe that was not run is recorded as not run, never as a pass.
- **Run all of them.** An unexpected result is still evidence, so do not stop at the first one.

## Probes

| # | Endpoint and API | Model or voice | Expected | What the result decides |
| --- | --- | --- | --- | --- |
| S0-1 | `bedrock-runtime` Converse | `global.anthropic.claude-haiku-4-5-20251001-v1:0` (today's code, `index.ts:96`) | Denied: the Free plan has no cross-Region features | Confirms D1 in this account: the code's model ID cannot ship |
| S0-2 | `bedrock-runtime` Converse | `us.anthropic.claude-haiku-4-5-20251001-v1:0` | Denied, the same as S0-1 | Confirms geo profiles are blocked as well as global ones |
| S0-3 | `bedrock-mantle` Messages (`https://bedrock-mantle.us-west-2.api.aws/anthropic/v1/messages`) | `anthropic.claude-haiku-4-5` | **Unknown** (W28) | Whether Claude is reachable at all on this plan. Mantle has no Guardrails, so success matters only for Q2's escalation. |
| S0-4 | `bedrock-runtime` Converse, thinking turned off | `anthropic.claude-haiku-5-5` | **Unknown** (research Q2) | Success makes Haiku 5.5 an eligible Q2 candidate: in-Region, with Guardrails on this endpoint per its card, and Haiku-class (no A2) |
| S0-5 | `bedrock-runtime` Converse | `amazon.nova-2-lite-v1:0` (the bare ID) | Denied or `ValidationException`: cross-Region only | Confirms the D2 refutation and corrects the repository memory that claimed an in-Region ID |
| S0-6 | `bedrock-runtime` Converse | `amazon.nova-lite-v1:0` | **Success** | Nova Lite v1 is an eligible Q2 candidate (in-Region, Guardrails per its card) |
| S0-7 | Polly `SynthesizeSpeech` | `VoiceId: Matthew`, `Engine: neural`, `OutputFormat: mp3`, `SampleRate: 24000` (spec 001 `polly-tts.md:23-27`) | **Success** | Q1's voice path is usable on this plan |

Two details are checked against the model card's sample code when the probe runs, rather than fixed here:

- how to authenticate to the mantle endpoint (S0-3)
- the exact request field that turns off Haiku 5.5's adaptive thinking (S0-4)

## Reading the results

| Outcome | Consequence |
| --- | --- |
| S0-6 succeeds, S0-4 fails | Q2 adopts Nova Lite v1, subject to S1 and amendment A2 |
| S0-4 and S0-6 both succeed | Q2 picks the cheaper at human-read prices (FR-026 builder rule). Both still need S1. Haiku 5.5 needs no A2. |
| S0-4 and S0-6 both fail | Q2 escalation: the builder chooses between waiting for the Paid plan and relaxing the Guardrails rule (where S0-3 matters). Nothing is assumed meanwhile. |
| S0-1 or S0-2 succeeds | This contradicts the AWS documentation (D1). Record it and ask the builder. It is not adopted, because the documented plan rule could start being enforced at any time. |
| S0-7 fails | Q1 reopens before any voice task starts |

S0's results update research Q0, Q2 and the W/D tables (W28, D1, D2). The wiki is updated through the ingest workflow, with the builder's approval before `wiki:push`.
