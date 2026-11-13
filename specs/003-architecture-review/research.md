# Research: Architecture Review and First AWS Deployment

**Feature**: `003-architecture-review` | **Date**: 2026-10-11 | **Plan**: [plan.md](./plan.md)

This is the Phase 0 output. It holds:

- the decision register for Q0–Q9 (FR-004), in the spec's order
- the cost model (FR-024), the observability decision (FR-022), and the deploy identity and image build (FR-033, FR-034)
- the spike designs S0–S4 (FR-003)
- the wiki-claim verification record W1–W38 (FR-039) and the D1–D12 verdicts (FR-040)
- issue dispositions (FR-038)
- the spec patches and constitution amendments this plan proposes
- new findings, which become issues only with the builder's permission

**Method.** "Trust but verify": every fact is cited to code (`file:line`), a pinned package's `.d.ts`, AWS documentation, `gh` output, or a human-read pricing page. A fact without a citation is marked **Unverified** and no decision rests on it. AWS pages were read through the `.md` twins of `docs.aws.amazon.com` pages, or rendered text where the page provides it. Model and Polly prices are marked **human-read required**, because those pricing tables render client-side (AGENTS.md).

Paths without a package prefix are in `packages/infra/lib/` (infra), `packages/agent/src/` (agent) or `packages/frontend/src/` (frontend).

## Builder decisions recorded during planning

| Date | Decision | Affects |
| --- | --- | --- |
| 2026-10-11 | S0 becomes a probe matrix of in-Region paths; the Q0 fallback is decided after S0 | Q0, Q2, FR-003 (P-01) |
| 2026-10-11 | Sign-in is Google-first; Microsoft and Login with Amazon are deferred | Q9, FR-044, FR-054, SC-015 (P-02) |
| 2026-10-11 | Subdomain `max.recipieces.com`; sign-in pages on a Cognito prefix domain | Q9, FR-049 |
| 2026-10-11 | One allowlist entry per identity, with no identity linking | Q5, Q9, FR-046 |
| 2026-10-11 | Silent token refresh, with pre token generation re-checking the allowlist | Q9, FR-047 |
| 2026-10-11 | Voice: Polly Neural server-side in the runtime, audio streamed with the reply; no browser AWS credentials; Identity Pool removed; speech marks dropped | Q1, Q4, FR-032 |
| 2026-10-11 | Soft-degrade is text-only (voice off) at $8 ($16 − F since amendment A5), with no P1 amendment; spec 001 FR-016's browser-TTS SHOULD is recorded as unmet | Q1, Q6, FR-023 |
| 2026-10-11 | Transport `jwt-cloudfront`: CloudFront forwards to AgentCore Runtime with inbound JWT auth and SSE; a Lambda streaming proxy is the fallback, gated by a first-deploy probe | Q4 |
| 2026-10-11 | Strict session continuity: the server-counted session continues across a new runtime session ID | Q5, FR-037 (P-05) |
| 2026-10-11 | Hard-stop recovery is manual | Q6, FR-021 |
| 2026-10-11 | IaC is CDK-only | Q8, amendment A1 |
| 2026-10-11 | No Guardrails in the first deployment, but the adopted model must support them | Q0, Q2, Q8 |
| 2026-10-11 | Log retention is 14 days on every log group | FR-022, FR-053 (P-07) |
| 2026-10-11 | The session token cap counts conversational tokens (the friend's message plus Max's reply); billed spend is bounded separately by the in-path breaker | Q5, Q6, spec 001 FR-010 (P-09) |
| 2026-10-11 | In-session history lives in runtime session state (one Strands `Agent` per counted session) | Q8 |
| 2026-10-11 | **Long-term memory is un-deferred** into the first deployment: "seems like long term memory is within budget and I wanted it initially anyway" | Q8, FR-014, FR-030, FR-037, SC-019 (P-03, P-10) |
| 2026-10-29 | S0-1/S0-2's cross-Region success is **recorded only, not adopted**; Nova Lite v1 stays the sole Q2 candidate. The builder confirmed the account is on the Free plan, and noted Haiku 4.5's lifecycle risk: its card (read 2026-10-29) shows Active with no EOL date, but its "EOL no sooner than" floor, 2026-10-16, has passed | Q0, Q2, D1 |
| 2026-10-30 | Any route S0 (or a later approved probe) proves is eligible, in-Region or cross-Region; the Free plan is temporary, so its documented restrictions are not grounds for rejection. S0-8 and S0-9 approved. Supersedes the 2026-10-29 record-only decision (spec.md § Clarifications) | Q0, Q2, D1, FR-028 |
| 2026-11-02 | The first deployment adopts Claude Haiku 4.5, today's model (`index.ts:96`), on the cheaper of its two S0-proven profiles, the global profile `global.anthropic.claude-haiku-4-5-20251001-v1:0`. The builder declined running S1 before deploy. S1, amendment A4 and FR-026's cheapest-model comparison move to a post-upgrade model review (T152); S2 runs after the first deployment; #50 is deferred. Recorded by T144 (spec.md § Clarifications 2026-11-02; deviation C5) | Q2, FR-003, FR-026, FR-038, US5, SC-019 |
| 2026-11-13 | T005b (the FR-005 Well-Architected and AgentCore guidance assessment) is **deferred until after the first deployment**: "it'll be easier that way and also we are running out of time to spend our free credits". It no longer runs before Phase 2. Accepted cost: a finding that changes a recorded decision means rework on deployed resources (tasks.md deviation C8) | FR-005, Q0–Q9, § R-lens |
| 2026-11-13 | T005: (a) the Google client secret lives in SSM SecureString `/max-height/google-client-secret`, applied by `handlers/idp-secret.ts`, not in Secrets Manager: "it's ok as long as we use SecureString"; (b) `cdk bootstrap`'s default `AdministratorAccess` CloudFormation execution role is accepted as a P11 note | Q9, FR-052, § R-deploy, P11 |
| 2026-11-13 | Amendment A5 (the $20 ceiling) lands on this feature branch, not in its own PR: "We don't need a PR - we are doing this work in the current branch". MINOR bump, 1.5.0 → 1.6.0. Waives FR-002's own-PR rule; the constitution's procedure is still met by the branch's PR (deviation C9). The $9.56 conversation estimate is unmeasured; the builder wants real numbers from a deployment as soon as possible | FR-002, P2, gate 1, T153, T157 |
| 2026-11-13 | **Polly Standard, voice Matthew**, replaces Neural for the first deployment: "so we can get to MVP under budget let's go with Matthew standard voice". Amendment A6 (constitution 1.7.0) lands on this branch. Projection falls to about $7.58 average and $9.32 full. Standard Matthew is auditioned at T158; failing by ear reopens it | Q1, § R-cost, A6, T029, T158 |
| 2026-11-13 | T005a approved: the gate 1 projection ($12.35 average case, which passes; $18.92 full case, over $16 with the measure-then-re-project and breaker mitigation) and its F lines, read from AWS's Price List files instead of builder-dated reads. About 10 friends will sign in. The builder asked whether Polly Neural is worth 4× Standard; that question is open in § Q1 | gate 1, FR-024, SC-002, § R-cost, Q1 |

## Decision register (FR-004)

### Q0 — Inference path on the Free plan

- **Decision**: invoke models only through routes in `us-west-2` that S0 (or a later approved probe) proves this account can invoke, in-Region or cross-Region inference profile (clarified 2026-10-30, spec.md § Clarifications; FR-028). Spike S0 (a probe matrix, [contracts/s0-probe-matrix.md](./contracts/s0-probe-matrix.md)) establishes which routes qualify. The text model is then chosen under Q2.
- **Evidence**:
  - The Free plan does not support multi-Region or cross-Region features for any service (AWS "Supported AWS services for Sign up for AWS (new)", read 2026-10-11). **D1 verified** against the documentation. This is recorded, not grounds for rejection: the Free plan is temporary, and S0-1, S0-2 and S0-8 show cross-Region profiles working in this account (clarified 2026-10-30).
  - **Nova 2 Lite is cross-Region-inference only** on `bedrock-runtime`: its bare ID has no on-demand path (S0-5). This **refutes D2** and the repository memory that it has an in-Region ID. Its US profile `us.amazon.nova-2-lite-v1:0` works (S0-8) and, from `us-west-2`, routes to `us-east-1`, `us-east-2` and `us-west-2`. Source: Nova 2 Lite model card, `docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-2-lite.html`, read 2026-10-11 and re-read 2026-11-01.
  - Haiku 4.5's only in-Region path is the `bedrock-mantle` endpoint, which offers no Guardrails. On `bedrock-runtime` it needs a geo or global profile, where the card lists Guardrails (Haiku 4.5 model card, read 2026-10-11 and re-read 2026-11-01).
  - Nova Lite (v1) `amazon.nova-lite-v1:0` is invocable in-Region on `bedrock-runtime` (Nova Lite model card, read 2026-10-11).
  - Nova 2 Sonic is in-Region, with no Guardrails (Nova 2 Sonic model card, read 2026-10-11; W31).
  - **Every other service this design uses is in the Free Tier list**: Bedrock, Bedrock AgentCore, Polly, Cognito, DynamoDB, ECR, EventBridge, Lambda, SNS, S3, CloudFront, ACM, Systems Manager, Budgets, CloudWatch and X-Ray. Two exceptions matter here: **Lambda@Edge is not supported** (so SPA routing uses a CloudFront Function, [contracts/csp-and-hosting.md](./contracts/csp-and-hosting.md)), and AWS Organizations is not supported at all. Source: "Supported AWS services for Sign up for AWS (new)", `docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html`, re-read 2026-10-11. A listing is not proof that a given API call succeeds, so S0 probes the calls that carry spend.
- **S0 results** (run by the builder 2026-10-29, `us-west-2`, IAM user `max-height-gen` with a temporary least-privilege policy and a short-term Bedrock API key; runner `scripts/s0-probe.ts`). Earlier runs on 2026-10-25 and 2026-10-29 were blocked by IAM (`bedrock:InvokeModel`, then `bedrock:CallWithBearerToken`) before any plan check, so only their S0-7 result is evidence. Because `AWS_BEARER_TOKEN_BEDROCK` was set, the SDK sent the Converse probes with bearer auth rather than SigV4.

  | # | Model or voice | Expected | Outcome | First line of error |
  | --- | --- | --- | --- | --- |
  | S0-1 | `global.anthropic.claude-haiku-4-5-20251001-v1:0` | denied | **success** (contradicts D1) | |
  | S0-2 | `us.anthropic.claude-haiku-4-5-20251001-v1:0` | denied | **success** (contradicts D1) | |
  | S0-3 | `anthropic.claude-haiku-4-5` (mantle Messages) | unknown (W28) | HTTP 403 `permission_error` | `anthropic.claude-haiku-4-5 is not available for this account. You can explore other available models on Amazon Bedrock. For additional access options, contact AWS Sales` |
  | S0-4 | `anthropic.claude-haiku-5-5` (thinking off) | unknown (Q2) | `AccessDeniedException` | `anthropic.claude-haiku-5-5 is not available for this account. You can explore other available models on Amazon Bedrock. For additional access options, contact AWS Sales at https://aws.amazon.com/contact-us/sales-support/` |
  | S0-5 | `amazon.nova-2-lite-v1:0` | denied or `ValidationException` | `ValidationException` (as expected) | `Invocation of model ID amazon.nova-2-lite-v1:0 with on-demand throughput isn't supported. Retry your request with the ID or ARN of an inference profile that contains this model.` |
  | S0-6 | `amazon.nova-lite-v1:0` | success | success (as expected) | |
  | S0-7 | Polly `Matthew` / neural / mp3 / 24000 | success | success (as expected; also on 2026-10-25) | |

  - **S0-1 and S0-2 contradict D1.** On 2026-10-29 they were recorded and not adopted (record-only). The 2026-10-30 clarification (spec.md § Clarifications) supersedes that: any route S0 proves is eligible, so **Haiku 4.5 is eligible through its global and US profiles**.
  - S0-5 also settles Nova 2 Lite ("Nova Lite v2"): it has no on-demand in-Region path on this account, as its card says. S0-8 probes its US profile instead.
  - On 2026-10-29, S0-4 failing and S0-6 succeeding left Nova Lite v1 as the only eligible candidate (T096). T139 supersedes that shortlist.
- **S0-8 and S0-9 results** (T136; run by the builder 2026-11-01, `us-west-2`, IAM user `max-height-gen` with a temporary inline policy granting `bedrock:InvokeModel` on the two US profiles and on their foundation models in `us-*` conditioned on `bedrock:InferenceProfileArn`, plus `bedrock:CallWithBearerToken`; short-term Bedrock API key, so bearer auth as on 2026-10-29; runner `scripts/s0-probe.ts S0-8 S0-9`; thinking-off field `{"thinking":{"type":"disabled"}}`):

  | # | Model or voice | Expected | Outcome | First line of error |
  | --- | --- | --- | --- | --- |
  | S0-8 | `us.amazon.nova-2-lite-v1:0` | unknown (Q2) | **success** | |
  | S0-9 | `us.anthropic.claude-haiku-5-5` (thinking off) | unknown (Q2) | `AccessDeniedException` | `anthropic.claude-haiku-5-5 is not available for this account. You can explore other available models on Amazon Bedrock. For additional access options, contact AWS Sales at https://aws.amazon.com/contact-us/sales-support/` |

  - **S0-8 makes Nova 2 Lite an eligible Q2 candidate** through its US profile.
  - **S0-9 is refused with the same message as S0-4**, so Haiku 5.5 is not available to this account through either route. The refusal comes before Bedrock validates the request, so the thinking-off field is still untested. The Free plan is the suspected cause; T143 probes again after the Paid upgrade, and that gates nothing in this feature.
- **Alternatives**:
  - Upgrade to the Paid plan before the first deployment: not needed, because S0 proved cross-Region profiles work on this account (clarified 2026-10-30). The Free plan ends in December 2026 regardless (FR-028).
  - Move Region: rejected; nothing found makes another Region better for the candidates, and `us-west-2` hosts Runtime V2.
- **Constitution**: may trigger amendment A2 (LLM row) through Q2.

### Q1 — Voice

- **Decision**: Polly **Standard**, voice Matthew (Neural until 2026-11-13; see the engine bullet below), synthesized **server-side in the runtime**. The audio streams to the browser on the same SSE response as the text ([contracts/transport-sse.md](./contracts/transport-sse.md)). The browser holds no AWS credentials, so the Identity Pool and its roles are removed. Speech marks are dropped, so there is no dual billing (#47). At the soft-degrade threshold ($16 − F since A5; $8 when decided), Max goes text-only.
- **Rationale**:
  - It keeps P1, because TTS stays in the cloud.
  - It removes the browser's need for AWS credentials (FR-032's `new PollyClient({})` gap, `pollyTts.ts:28`) and the CSP gap D9.
  - Polly is billed per character, which bounds cost by the 250-token reply cap (`index.ts:97`).
- **Alternatives**:
  - Nova 2 Sonic or Nova 2.5 Sonic: rejected for the first deployment. There is no Guardrails support (W31). Strands `BidiAgent` is Python-only (W38), so a second service would be needed. And Nova 2.5 Sonic's facts are still unverified (W37). Spike S3 is not run.
  - Browser Polly with Identity Pool credentials: rejected, because it adds a signed-in AWS credential surface and CSP entries for no benefit.
  - Browser TTS: rejected, because it would break P1. Spec 001 FR-016's browser-TTS SHOULD is recorded as unmet.
- **Issues**: #47 (speech marks dropped; free tier not counted, see Q7) and #48 (Nova Sonic hybrid not adopted; the issue stays open for after the first deployment).
- **Engine: Standard, decided by the builder 2026-11-13** ("so we can get to MVP under budget let's go with Matthew standard voice"). Q1 had never compared engines; Neural was inherited from spec 001 R4 and the constitution's tech table, which amendment A6 changes. Facts, read 2026-11-13:
  - **Price**: Standard is $4 per 1M characters, Neural $16 (Price List, AmazonPolly `us-west-2`, published 2026-10-22). Standard would cut Polly from $6.36 to $1.59 (average case) and from $12.80 to $3.20 (full case). The full case would then fall to about $9.32, under the gate with no mitigation.
  - **Voice**: **Matthew has a Standard voice**, per AWS's available-voices table (`docs.aws.amazon.com/polly/latest/dg/available-voices.html`, read 2026-11-13). The Standard voices page omits him, so the two AWS pages disagree (wiki `Source-Amazon-Polly` § Voices by engine). `DescribeVoices` has not been run, so a Standard Matthew has not been heard yet; AWS's 2021 demo failed for lack of credentials. If he works, switching engines keeps the voice. It still needs a DSP audition and regenerated greetings so replies and greetings match. Switching means a new voice, re-auditioned through the DSP, and regenerated greetings so replies and greetings match (`AGENTS.md` § Product and legal guardrails).
  - **SSML**: Standard supports every tag except the news style, including `<prosody pitch>`, `<emphasis>` and `<amazon:effect vocal-tract-length>` (`docs.aws.amazon.com/polly/latest/dg/supportedtags.html`). Neural has none of those. Matthew's newscaster style is Neural-only, and we don't use it. Concatenative Standard sounds less natural, which may suit a glitchy TV character.
  - **Sample rate**: T029's `24000` is valid on Standard (whose default is `22050`): the SynthesizeSpeech reference lists 8000, 16000, 22050, 24000, 44100 and 48000 for mp3.
  - **What the switch costs**: amendment A6 (applied, constitution 1.7.0), `Engine: 'standard'` in T029's server path and the greeting generator (T158), and an audition through the DSP when T158 regenerates the greetings. If Standard Matthew fails by ear, the builder re-decides.

### Q2 — Text model

- **Decision rule**:
  - **Eligible**: S0 (or a later approved probe) proves the account can invoke the candidate from `us-west-2`, in-Region or through a cross-Region profile (clarified 2026-10-30); it supports Guardrails on that route (builder rule); and it passes the S1 golden set if it is not Haiku 4.5 (P3, gate 2).
  - **Choice**: among eligible candidates, the cheapest at re-verified prices wins (builder rule, FR-026).
- **Expected outcome** (written 2026-10-11, before S0; see the eligibility table below for the results):
  - **Haiku 4.5** was expected to fail the Guardrails gate on the Free plan, because its only in-Region path is mantle. S0-1 and S0-2 then proved its cross-Region profiles, where its card lists Guardrails on `bedrock-runtime`.
  - **Nova 2 Lite** was expected to fail S0, because it is cross-Region only. S0-8 proved its US profile.
  - **Nova Lite v1** passes the documented gates. Its card lists Guardrails on `bedrock-runtime`, an in-Region endpoint, and lifecycle Active (Nova Lite model card, read 2026-10-11). Adopting it requires amendment A2 and passing S1.
  - **Claude Haiku 5.5** (launched 2026-10-07; found during planning) is a **new candidate**. Its card lists Guardrails on `bedrock-runtime` and a bare `bedrock-runtime` model ID, `anthropic.claude-haiku-5-5`, whereas Haiku 4.5's is N/A. The card's in-Region column renders as images and its in-Region URL reads N/A, so **in-Region availability is unverified**. Probe S0-4 settles it. If eligible, it is Haiku-class, so A2 is not triggered. Adaptive thinking is on by default and its tokens bill as output, so it would be turned off. Its price is human-read (billed through AWS Marketplace). It is added to FR-026's comparison by P-13.
- **Escalation**: if no candidate passes, the builder chooses between waiting for the Paid plan and relaxing the Guardrails rule. That choice is recorded here, and nothing is assumed meanwhile.
- **Shortlist and provisional adoption (T096, 2026-10-29)**:

  | Candidate | S0 | Price, `us-west-2` on-demand, per 1M tokens (R-cost) | Status |
  | --- | --- | --- | --- |
  | Nova Lite v1 `amazon.nova-lite-v1:0` | S0-6 succeeded | $0.06 input, $0.24 output (human-read 2026-10-29) | **Provisionally adopted** |
  | Claude Haiku 5.5 | S0-4 "not available for this account" | not read | Ineligible |
  | Haiku 4.5 | S0-1/S0-2 cross-Region only (record-only, D1); S0-3 mantle 403 | not read | Ineligible |
  | Nova 2 Lite | S0-5 needs an inference profile | not read | Ineligible |

  Nova Lite v1 was then the only S0-eligible candidate, so it was the cheapest by default. **Superseded** by the 2026-10-30 clarification and S0-8/S0-9; T139 records the new shortlist.
- **Eligibility after the clarification and S0-8/S0-9 (T137, 2026-11-01)**:

  | Candidate and route | S0 | Guardrails on the route | Lifecycle (model card) | Status |
  | --- | --- | --- | --- | --- |
  | Nova Lite v1 `amazon.nova-lite-v1:0` (in-Region) | S0-6 succeeded | Yes (card) | Active (read 2026-10-11) | **Eligible**; needs S1 and A2 |
  | Haiku 4.5 `global.anthropic.claude-haiku-4-5-20251001-v1:0` | S0-1 succeeded | Yes, `bedrock-runtime` (card) | Active, no EOL date; "EOL no sooner than" 2026-10-16 has passed (read 2026-11-01) | **Eligible**; today's model, so no S1 or A2 |
  | Haiku 4.5 `us.anthropic.claude-haiku-4-5-20251001-v1:0` | S0-2 succeeded | Yes, `bedrock-runtime` (card) | as above | **Eligible**; as above |
  | Nova 2 Lite `us.amazon.nova-2-lite-v1:0` | S0-8 succeeded | Yes, `bedrock-runtime` (card) | Active, no EOL date; "EOL no sooner than" 2026-12-02 (read 2026-11-01) | **Eligible**; needs S1 and A2 |
  | Claude Haiku 5.5 (bare ID and `us.` profile) | S0-4 and S0-9 "not available for this account" | Yes (card) | not re-read | Not available to this account; re-probed after the Paid upgrade (T143) |

  Prices for the three newly eligible routes are human-read before T138's projection and T139's choice. Both Haiku 4.5 and Nova 2 Lite have passed or near "EOL no sooner than" floors, which FR-007's lifecycle check weighs at T139.

  Haiku 5.5, though unavailable to this account, lists at $0.10 per 1M input and $0.50 per 1M output (Global) and $0.11 and $0.55 (Geo) in `us-west-2` (human-read 2026-11-01 by the builder, same page as Haiku 4.5). That is a tenth of Haiku 4.5's price, so T143's post-upgrade re-probe feeds a later model review.
- **First-deployment decision (T144, 2026-11-02; builder, spec.md § Clarifications 2026-11-02)**:
  - **Decision**: the first deployment uses **Claude Haiku 4.5, today's model (`index.ts:96`)**, on the cheaper of its two S0-proven profiles: the **global** profile `global.anthropic.claude-haiku-4-5-20251001-v1:0` (S0-1). The US profile `us.anthropic.claude-haiku-4-5-20251001-v1:0` (S0-2) is the fallback, not adopted. This closes Q2 **for the first deployment**. It supersedes T096's provisional Nova Lite v1 adoption and T139's shortlist (FR-026; US5/AC1, partial). Whether a cheaper candidate replaces it is deferred to the post-upgrade model review (T152).
  - **Prices** (`us-west-2` source, on-demand Standard, per 1M tokens; R-cost):

    | Route | Input | Output | Verified against the AWS Price List (2026-11-02) |
    | --- | --- | --- | --- |
    | Global (adopted) | $1.00 | $5.00 | `USW2-MP:USW2_InputTokenCount_Global-Units` and `USW2-MP:USW2_OutputTokenCount_Global-Units` |
    | US (fallback) | $1.10 | $5.50 | `USW2-MP:USW2_InputTokenCount-Units` and `USW2-MP:USW2_OutputTokenCount-Units` |

    Source: AmazonBedrockFoundationModels offer, `us-west-2` version `20261012084008` (published 2026-10-12, rates effective 2026-09-01; fetched 2026-11-02 from `pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrockFoundationModels/current/region_index.json`). It matches the builder's 2026-11-01 human-read prices. The global route is 10% cheaper on both, as AWS documents ("Global cross-Region inference", read 2026-11-02). The same file lists cache read at $0.10 (global) and $0.11 (US), not the $0.20 the wiki records for `us-west-2` (Gotchas; Decision-LLM-Model-Selection, 2026-09-29). Cache read is not used (FR-029), so nothing here depends on it.
  - **The builder's four reasons** (spec.md § Clarifications 2026-11-02):
    1. Deploy and test for real before the Free plan's credits run out, in about a month.
    2. S1 is a cost optimization, not a deploy blocker. As today's model, Haiku 4.5 already satisfies P3 and gate 2.
    3. Haiku 5.5 is unavailable until the Paid upgrade, so running S1 now would likely be repeated next month.
    4. The model is not the dominant variable cost. The builder's illustrative per-turn estimate: Polly at about 1,000 characters × $16 per 1M ≈ $0.016, against about $0.005 for Haiku 4.5 (about 3K input tokens and the 250-token reply cap). T145 shows Polly at about two thirds of the conversation cost.
  - **Comparison deferred**: Nova Lite v1, Nova 2 Lite and Haiku 5.5 (once T143's re-probe makes it available) are compared at the post-upgrade model review (T152) on FR-026's four criteria, after A4 (T003) and S1 (T100). Haiku 4.5 needs no S1 run.
  - **Lifecycle, re-read 2026-11-02** (W27, FR-007; Haiku 4.5 model card, `docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-4-5.html`, and the legacy lifecycle policy page, `.../model-lifecycle-legacy.html`): model lifecycle **Active**; model EOL date **N/A**; launched 2025-10-16; "EOL no sooner than" Oct 16, 2026 (**passed**); legacy period at least 6 months; policy "Model lifecycle (for models launched prior to Sept 7 2026)". Haiku 4.5 is **absent** from the policy's "Models with a scheduled EOL date" table and its "reached EOL" table. **No EOL date is announced, so none falls in the month of operation (SC-019).** Because the floor is a floor, not a schedule (Gotchas), a Legacy announcement can still come at any time. The policy then sets at least 6 months to EOL (the earliest from 2026-11-02 is 2027-05-02) and at least 3 months to public extended access, where the provider may raise the price (earliest 2027-02-02). Neither lands in the first month, and either would go to the builder. `GetFoundationModel`'s `modelLifecycle` field was **not** read, because this session had no AWS credentials. Read it at first deploy (quickstart V-01) and at T152.
  - **IAM for T140: can the adopted profile's documented pattern be region-scoped (constitution P11)?** Only partly (AWS, "Global cross-Region inference", IAM policy requirements, read 2026-11-02). The documented pattern has three statements, and AWS says to include all three:
    1. The profile ARN, `arn:aws:bedrock:us-west-2:<account>:inference-profile/global.anthropic.claude-haiku-4-5-20251001-v1:0`: **can** carry `aws:RequestedRegion = us-west-2`.
    2. The source-Region foundation model, `arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0`, with `bedrock:InferenceProfileArn` set to that profile: **can** carry `aws:RequestedRegion = us-west-2`.
    3. The Region-less global foundation model, `arn:aws:bedrock:::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0`: **cannot** be limited to a named Region. AWS evaluates it with `aws:RequestedRegion = "unspecified"` and says the ARN has "no AWS Region or account specified, which is intentional and required". It is narrowed by `bedrock:InferenceProfileArn` instead, and the profile can still route to any commercial Region.

    So P11's "where supported" holds for statements 1 and 2 only. T140 should state that exception in `runtime-config.md` § Execution role (`:72`, which today says "`us-west-2` only. No inference-profile ARN"; that line is wrong for either profile) and pin all three RED then GREEN. The US profile is more scopable: AWS's geographic pattern lists the foundation-model ARNs of its destination Regions (us-east-1, us-east-2, us-west-2 from `us-west-2`) with the same `bedrock:InferenceProfileArn` condition, and has no `unspecified` leg. It still is not `us-west-2` only. It costs 10% more, about $0.32 across the 795-turn average case (T145). The builder's rule picks the cheaper route, so the global profile stands unless the builder says otherwise. The model card adds that geo and global profiles "don't provide single-Region data residency". T140 verifies the policy against the service authorization reference at the point of use, and includes `bedrock:InvokeModelWithResponseStream` for the streaming call.
  - **Amendment**: A2 is **not triggered for the first deployment** (§ Constitution amendments). The constitution's LLM row pins the tier ("Haiku-class"), not the version.
- **Kept**: the 250-token reply cap (`index.ts:97`).
- **Issue**: #50 is resolved by this record. Nova 2 Lite is eligible through its US profile (S0-8) and is compared with the other eligible candidates under Q2 and S1.

### Q3 — Personality placement

- **Decision**: deferred with #42. The first deployment uses the system prompt alone (`personality/systemPrompt.ts`). Hooks and post-processing are decided after the first deployment.
- **Rationale**: FR-038 defers #42, and no first-deploy requirement depends on it.

### Q4 — Streaming and transport

- **Decision**:
  - The browser sends `fetch` POSTs to a CloudFront path behavior, `/runtimes/*`.
  - CloudFront forwards them to the AgentCore Runtime data-plane origin (`bedrock-agentcore.us-west-2.amazonaws.com`), passing the `Authorization` and session-ID headers through.
  - The runtime's inbound JWT authorizer validates the Cognito access token.
  - The reply streams back as SSE with incremental `text` events, `audio` events, and a final `done` or `error` ([contracts/transport-sse.md](./contracts/transport-sse.md)).
  - The API Gateway WebSocket API, `websocket-handler.ts` and the browser WebSocket client are removed.
- **Fallback**: a Lambda response-streaming proxy, built only if the first-deploy probe (quickstart V-02) fails.
- **Evidence**:
  - The AgentCore Runtime JWT authorizer takes `discoveryUrl`, `allowedAudience`, `allowedClients` and `customClaims`. The request header allowlist must include `Authorization` for the container to see it. A session ID header must be at least 33 characters. Source: AgentCore Runtime documentation, read in earlier plan research on 2026-10-11.
  - CloudFront does not forward `Authorization` unless it is configured to, which the probe confirms.
- **Rationale**:
  - It removes the stub (W4), the unsigned socket (W5) and the payload mismatch (W6) together.
  - There is no Lambda in the hot path, so no extra cost or latency.
  - It is same-origin, so the CSP needs no extra API host.
  - It fixes #45, because `first_token` becomes a real span.
- **Alternatives**:
  - Fixing the API Gateway WebSocket path: rejected; it has more parts and still needs runtime invocation.
  - Native AgentCore WebSocket from the browser (W36): not needed for typed input; it is the path for later bidirectional voice.
  - Direct browser-to-runtime without CloudFront: rejected; it needs a cross-origin CSP entry and CORS on the runtime.

### Q5 — Session identity, caps and rate limits

- **Decision**:
  - Identity is the access token's `sub`, read from the token that the runtime authorizer has already validated (`identity/jwtClaims.ts`). The server ignores client `sessionId` and `actorId` (#55; `index.ts:152,156` today).
  - The server opens and counts sessions in the DynamoDB control table, keyed by `sub` ([data-model.md](./data-model.md)). Only one counted session per `sub` is active at a time.
  - **Strict continuity (P-05).** A new runtime session ID from the same `sub` continues the active counted session rather than opening a new one. A fresh cap starts only after the in-character sign-off, or after the 30-minute cap expires.
  - The token cap counts **conversational** tokens: reply `outputTokens` measured from `result.metrics.accumulatedUsage`, plus the friend's message estimated at chars/4.
  - Rate limits (spec 001 FR-020) are keyed by `sub`, with windows stored in the control table.
  - Edge rate limiting is CloudFront's own protection only. AWS WAF is not adopted, because of its fixed monthly cost.
- **Evidence**:
  - **New finding N1.** `extractUsage` (`index.ts:44-52`) reads `result.usage`, which does not exist on Strands 1.20.0's `AgentResult` (`node_modules/@strands-agents/sdk/dist/src/types/agent.d.ts:353-410`). Usage is at `result.metrics.accumulatedUsage` (`telemetry/meter.d.ts:141,149`; `Usage` at `models/streaming.d.ts:379-401`). Today every count falls back to chars/4 (`index.ts:38-41,219-220`) and ignores the system prompt of about 11 KB (`personality/systemPrompt.ts`).
- **Residual risk (FR-046)**: one person signing in through two providers gets two sets of caps. This is moot while Google is the only provider; it is recorded for when providers are added.
- **Issue**: #55 is resolved.

### Q6 — Hard stop, recovery and in-path breaker

- **Decision** ([contracts/spend-control.md](./contracts/spend-control.md)):
  - **Gross measurement**: `CfnBudget` sets `CostTypes.IncludeCredit: false` and the related refund and discount flags. Today none are set (`budget-stack.ts:108-117`), and `IncludeCredit` defaults to true (D6 verified).
  - **Hard stop** (100% ACTUAL notification → hard-stop topic → `handlers/hard-stop.ts`). It does two things, and both must succeed:
    1. It writes `HALT` to the control table, which the runtime and pre token generation check before any spend-bearing step.
    2. It attaches a deny-all-spend inline policy to the runtime execution role. The policy and role names come from CDK through environment variables, never from a literal (the #61 trap: CDK appends a hash suffix).

    A missing variable, a missing role or a failed write **throws**. A Lambda `Errors` alarm then emails the builder through the operations topic, which is separate from budget alerts (FR-019, FR-022).
  - **Recovery**: manual, and by default only at the start of the next budget period. The runbook (quickstart V-12) removes the deny policy, clears `HALT`, and confirms a probe invocation succeeds. Budgets sends an ACTUAL alert only once per budget per period (verified, [AWS Budgets best practices](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-best-practices.html)). A mid-month recovery therefore leaves the rest of the month with no hard stop, so it is a P2 exception recorded with a reason ([contracts/spend-control.md](./contracts/spend-control.md) § Recovery).
  - **In-path breaker**:
    - After each turn, the runtime adds the turn's estimated cost to `SPEND#<yyyy-mm>` in the control table with an atomic `ADD`. The estimate is billed usage times the configured rates: model tokens, Polly characters, Memory events and retrievals.
    - Before each turn, it refuses when the tally reaches the trip limit, and turns voice off when it reaches the degrade limit.
    - **Limits are derived, not invented**: trip = P2's $20 minus F, and degrade = $16 minus F (amendment A5). F is R-cost's projected fixed monthly cost. Both limits and all rates are deploy-time configuration taken from R-cost ([contracts/runtime-config.md](./contracts/runtime-config.md)).
- **Evidence**:
  - Budgets data refreshes up to three times a day (D7 verified).
  - The SNS topic policy is fixed by #62 (`budget-stack.ts:85-99`).
  - The inline hard-stop code silently returns when its environment is missing (`budget-stack.ts:44-49`), the same class of bug as #61.
- **Alternatives**:
  - A Budgets action that applies an IAM policy natively: not adopted. Its Free-plan pricing and behavior are unverified, and it cannot set the in-character halt flag.
  - Automatic recovery at the start of the period: rejected by the builder.
- **Issue**: #61 is resolved when the hard stop ships with a test that fails when its target is missing.

### Q7 — Cost-model corrections

- **Decision**:
  - The projection is gross of credits and counts only Always Free offers. Polly's 12-month free tier is **not** counted, which is the conservative reading of D5 and W30.
  - Speech marks are dropped, so Polly bills once (#47).
  - Prompt caching stays out of the model until S2 shows the adopted model's cache minimum is reached (FR-029, #49).
  - Memory, Runtime V2 compute, ECR storage, sign-in, logs and spans are included (R-cost below).
  - Spec 001 `research.md` R0 and R4 receive dated correction annotations at close-out (FR-009). R0's "detaches unauth role" line is obsolete.
- **Issues**: #47 and #49 are resolved by this record.

### Q8 — Platform, IaC, memory, harness, Guardrails, observability

- **IaC**: CDK owns everything, including the runtime (`CfnRuntime`) and Memory (`CfnMemory`) as L1 constructs in 2.272.0 (`bedrockagentcore.generated.d.ts:6640` for CfnMemory, `:11006-11007` and `:11773` for runtime `platformVersion`). The AgentCore CLI is not used, which needs amendment A1 (W18). Because `platformVersion` is now typed, FR-035's override is replaced by the typed property and a test assertion pins it (P-04; **W17 refuted** for 2.272.0).
- **Harness**: Strands `Agent` 1.20.0. Each counted session gets one `Agent` in the runtime microVM with the default `SlidingWindowConversationManager` (window 40; `agent.d.ts:113`, `agent.js:58`). Today a fresh `Agent` is built per request (`index.ts:90-108,182`), so there is no in-session history (**new finding N2**).
- **In-session history**: runtime session state ("context is preserved between invocations to the same session", AgentCore Runtime sessions documentation). The idle timeout stays at 1800 s, against a service default of 15 minutes (**W25 verified**), and the maximum lifetime is 8 hours.
  - **Risk**: the Runtime V2 pricing page says "Idle memory is reclaimed automatically in Runtime v2 after 120 seconds", which may drop in-process state. Spike S4 tests it at first deploy.
  - **Fallback**: write turns as AgentCore Memory short-term events and rehydrate from them, at about $0.001 per 50-turn session.
- **Long-term memory: AgentCore Memory, un-deferred (W35 resolved)** ([contracts/memory-api.md](./contracts/memory-api.md)):
  - **Strategies**: one `CfnMemory` with the built-in semantic, summary and user-preference strategies, matching spec 001 `data-model.md:73-89`.
  - **Short-term events**: they expire after **7 days**, the service minimum (`eventExpiryDuration`, `generated.d.ts:6274`). They only need to live until extraction runs; the 30-day window governs long-term records.
  - **Namespace**: `/max-height/{actorId}/…`, where `actorId` is the verified `sub`. The memory adapter's existing prefix (`memory/memoryAdapter.ts:57-59`) is kept.
  - **Write path**: after each turn, the runtime calls `CreateEvent` with a conversational payload. Only conversational payloads feed long-term extraction.
  - **Read path**: at counted-session open, the runtime calls `RetrieveMemoryRecords` (top-k 10, from `memoryAdapter.ts`). The results go into that session's `Agent` context.
  - **Retrieval failure**: it degrades to "no memories" (P8), but loudly: a structured warning log, a metric and a span attribute. It is never silent. This reconciles today's catch-all (`memoryAdapter.ts`) with AGENTS.md's no-silent-fallback rule.
  - **30-day rolling window**: long-term records have no built-in expiry. A daily pruner wipes the namespace of any friend whose `lastSeenAt` is more than 30 days old (spec 001 `data-model.md:165`; constitution `:236`).
  - **Forget-me, export, list and delete** act only on the requester's namespace (FR-013). **New finding N3**: `handleDeleteMemory` (`memory/memoryHandlers.ts`) takes a `memoryRecordId` with no ownership check.
  - **Extraction**: the regex `memoryExtractor.ts` is superseded by the built-in strategies. Its display-alias helper is kept only if a caller remains, which is checked at task time.
  - **Fine-grained access control**: the claim that AgentCore Memory access keys on the JWT `sub` (FR-010) is **not relied on**. The runtime is the only Memory caller, using its execution role scoped to the one memory ARN, and it derives the namespace server-side.
  - **Strands**: the TypeScript SDK has no AgentCore Memory integration. Its vended memory stores are `bedrock-knowledge-base`, `file-memory-store` and `test-memory-store`. Strands `S3Storage` (`storage/s3-storage.d.ts:29`) is an alternative for history only, and is not chosen.
- **Guardrails**: none in the first deployment; the adopted model must support them (builder).
- **Observability**: see R-obs.

### Q9 — Access and sign-in details

- **Providers**: Google only for the first deployment (P-02). Microsoft and Login with Amazon are deferred, so the Microsoft email-claim and issuer questions (FR-043, FR-044) are moot until they are added.
- **Feature plan**: Cognito user pool **Lite**. A V1 pre token generation trigger, which fires on sign-in and on refresh, is enough for the allowlist re-check. Access-token customization (Essentials) is not needed. The Lite MAU free tier being Always Free is **human-read required** (FR-051).
- **Domains**:
  - The site is at `max.recipieces.com`, a CNAME at GoDaddy to the CloudFront distribution.
  - Sign-in pages are on a Cognito prefix domain (`<prefix>.auth.us-west-2.amazoncognito.com`).
  - The certificate is ACM in `us-east-1`, DNS-validated by a CNAME at GoDaddy.
  - DNS stays at GoDaddy, with no Route 53 zone.
- **Allowlist**: control-table items `ALLOW#<email>`, one per identity (provider plus verified email).
  - **Pre sign-up** denies when the email is unlisted or `email_verified` is not true. Google's `email_verified` must be mapped as a user-pool attribute.
  - **Pre token generation** denies when unlisted or halted. It writes `FRIEND#<sub>` (email and provider) so the runtime can check the allowlist at session open from `sub` alone (FR-042). The runtime sets `lastSeenAt` when a counted session opens, so the 30-day window tracks real use rather than token refreshes.
  - The denial copy reveals nothing (FR-043).
- **Revocation**:
  - No new session opens after removal (runtime check).
  - No token refresh succeeds after removal (pre token generation).
  - An open session runs out within its 30-minute cap (SC-016).
- **Tokens**: the browser uses the authorization-code flow with PKCE. The access token is the bearer, validated with `allowedClients` set to the app client ID. Tokens are kept in memory, and the refresh token in `sessionStorage`. Refresh is silent ([contracts/auth-and-allowlist.md](./contracts/auth-and-allowlist.md)).
- **Google client secret**:
  - CloudFormation cannot resolve `ssm-secure` in Cognito `ProviderDetails`.
  - **Decided (builder, 2026-11-13, T005 (a))**: a custom resource (`handlers/idp-secret.ts`) reads the SSM **SecureString** and calls `UpdateIdentityProvider`, so the secret never enters the template. The builder's condition is that the parameter is a SecureString, never a plain String.
  - **Rejected**: a Secrets Manager dynamic reference, at about $0.40 per secret per month, which FR-052 would need to justify as a recurring cost.
- **Google consent screen**: only non-sensitive scopes are requested: `openid email`. `profile` is dropped because no profile field is used, which narrows the FR-053 disclosure. The claim that "Testing" status limits users and tokens is **Unverified**, and is checked at registration (FR-054). Production status is preferred if it needs no verification for these scopes.

## R-cost — projection inputs (FR-024, gate 1)

Prices read 2026-10-11 from `aws.amazon.com/bedrock/agentcore/pricing` (rendered text) are **Verified**. That page was re-read 2026-11-13 for T005a. Rows marked **Price List 2026-11-13** were read that day from AWS's public regional Price List offer files (`pricing.us-east-1.amazonaws.com/offers/v1.0/aws/<service>/current/us-west-2/index.json`; CloudFront from its global file). Each row gives the file's publication date. No free tier is subtracted from any row, so a free-tier claim no longer gates the projection.

| Line item | Unit price | Status | Per-session estimate (method) |
| --- | --- | --- | --- |
| Text model input, output and cache: Nova Lite v1 (`amazon.nova-lite-v1:0`, in-Region), `us-west-2` on-demand | $0.06 per 1M input, $0.24 per 1M output tokens; cache read $0.015 per 1M, cache write $0 | **Human-read 2026-10-29 by the builder** (`aws.amazon.com/bedrock/pricing`, "On Demand Inference" table, listed as "Amazon Nova Lite"). It matches the AWS Price List offer file for AmazonBedrock `us-west-2`, published 2026-10-29. Whether Nova Lite v1 supports prompt caching on our path is **Unverified**, so the projection uses no cache discount | spec 001 R0 method, with S2 measuring real prompt and tool tokens |
| Text model: Haiku 4.5 Global profile (`global.anthropic.claude-haiku-4-5-20251001-v1:0`), source `us-west-2`, on-demand Standard | $1.00 per 1M input, $5.00 per 1M output; cache write $1.25 (5 min) or $2.00 (1 h); cache read $0.10 | **Human-read 2026-11-01 by the builder** (`aws.amazon.com/bedrock/pricing`, "On-Demand and Batch pricing", "Global Cross-region Inference" table, Region US West (Oregon), listed as "Claude Haiku 4.5"). Billed through AWS Marketplace (card). **Verified 2026-11-02 against the AWS Price List** (AmazonBedrockFoundationModels, `us-west-2`, version `20261012084008`, rates effective 2026-09-01; cache read $0.10 and write $1.25 and $2.00 match). **The adopted route** for the first deployment (T144) | as above, on estimated tokens (§ Gate 1 projection below) |
| Text model: Haiku 4.5 US profile (`us.anthropic.claude-haiku-4-5-20251001-v1:0`), source `us-west-2`, on-demand Standard | $1.10 per 1M input, $5.50 per 1M output; cache write $1.375 (5 min) or $2.20 (1 h); cache read $0.11 | **Human-read 2026-11-01 by the builder** (same page, "Geo and In-region Cross-region Inference" table, Region US West (Oregon), listed as "Claude 4.5 Haiku"). 10% above Global. **The most expensive eligible route**, so gate 1's projection used it before T144 (T005a, T138). Verified against the AWS Price List file on 2026-11-02 (§ Q2). Now the fallback, not the adopted route | as above |
| Text model: Nova 2 Lite US profile (`us.amazon.nova-2-lite-v1:0`), source `us-west-2`, on-demand Standard | $0.33 per 1M input, $2.75 per 1M output; cache read $0.0825 (75% below input), cache write $0. For reference, the **Global** profile (not S0-proven) is $0.30 and $2.50 | **Human-read 2026-11-01 by the builder** (`aws.amazon.com/bedrock/pricing`, "Amazon Nova", "Geo Cross-region inference and in-region", Standard Tier, Region US West (Oregon)). It matches the AWS Price List offer file for AmazonBedrock `us-west-2`, published 2026-10-30, where Geo and in-Region share one usage type (`USW2-Nova2.0Lite-input-tokens`). 10% above Global, about 5.5× Nova Lite v1 input and 11× its output | as above |
| Polly Standard (adopted 2026-11-13, § Q1) | $4 per 1M characters | **Price List 2026-11-13** (AmazonPolly `us-west-2`, published 2026-10-22, `USW2-SynthesizeSpeech-Characters`). No free tier subtracted | at most 1,000 characters per reply × turns |
| Polly Neural (superseded) | $16 per 1M characters | **Human-read 2026-10-29 by the builder** (`aws.amazon.com/polly/pricing`); the same Price List file agrees. The free tier of 1M Neural characters a month for the first 12 months is not subtracted, because the projection is gross of credits | as above |
| Runtime V2 CPU | $0.1276 per vCPU-hour | Verified | active seconds only |
| Runtime V2 memory | $0.0169 per GB-hour | Verified | session lifetime, or until reclaimed (S4) |
| Memory short-term ingestion | $1.00 per GB, each event billed at 12 KB minimum and 64 KB maximum | Verified (price changed 2026-10-06) | about $0.0006 per 50-turn session |
| Memory short-term retrieval | $0.20 per GB, same minimum and maximum | Verified | used only by the S4 fallback |
| Memory short-term storage | $0.10 per GB-month | Verified | 7-day expiry; negligible |
| Memory long-term storage (built-in strategies) | $0.75 per 1,000 records per month | Verified | records per friend × friends |
| Memory long-term retrieval | $0.50 per 1,000 | Verified | one per counted session |
| Memory built-in extraction model cost | **$0, included** for built-in strategies | **Resolved 2026-11-13** (`aws.amazon.com/bedrock/agentcore/pricing`). The page describes "built-in memory strategies, which include automatic processing". The pricing-table footnote says only built-in-with-override and self-managed strategies "may incur additional charges for the model usage in your account". We use built-in strategies with no override (memory-api.md `:11`) | none; no `PRICE_MEMORY_EXTRACTION_*` (runtime-config.md) |
| AgentCore Web Search | $7 per 1,000 queries | Verified | not adopted; the alternative when Google CSE ends (N4) |
| DynamoDB on-demand | $0.625 per 1M write, $0.125 per 1M read request units; storage $0.25 per GB-month beyond 25 GB | **Price List 2026-11-13** (AmazonDynamoDB, published 2026-11-11) | a few writes per turn; about $0.01 a month |
| Cognito Lite MAUs | $0.0055 per MAU (first tier) | **Price List 2026-11-13** (AmazonCognito, published 2026-10-20, `USW2-CognitoLiteMAU`). The free tier is not subtracted | friends × $0.0055 |
| CloudFront | $0.085 per GB out (US, first 10 TB); $0.01 per 10,000 HTTPS requests; first 1,000 invalidation paths free | **Price List 2026-11-13** (AmazonCloudFront, published 2026-10-19) | about 1 GB a month: SPA, greetings, streamed reply audio |
| Lambda (BucketDeployment, pre token trigger, pruner, hard stop) | $0.20 per 1M requests; $0.0000166667 per GB-second | **Price List 2026-11-13** (AWSLambda, published 2026-11-11) | under $0.01 |
| CloudWatch Logs | $0.50 per GB ingested (Standard); $0.03 per GB-month stored | **Price List 2026-11-13** (AmazonCloudWatch, published 2026-11-04) | includes the `aws/spans` log group that Transaction Search writes |
| CloudWatch alarms | $0.10 per standard alarm metric per month | Same file | four operations alarms |
| Transaction Search span indexing | $0.75 per 1M spans indexed | Same file (`USW2-XRay-Spans-Indexed`) | under $0.02 |
| ECR storage | $0.10 per GB-month | **Price List 2026-11-13** (AmazonECR, published 2026-11-13) | images kept × image size |
| SSM Parameter Store, standard SecureString | $0 (standard tier, standard throughput, `aws/ssm` key) | T005 chose SSM over Secrets Manager. The standard-tier $0 is from the Parameter Store pricing page and is not re-read here | $0 |
| Route 53 | none | No hosted zone; DNS stays at GoDaddy (spec.md § Assumptions) | $0 |

**Gate rule**: the projection sums F (fixed monthly) and per-session cost × spec 001's session counts (`specs/001-max-height-ai-character/research.md:43-70`). It must be at or below $16 (gate 1, constitution 1.6.0), gross of credits. Otherwise a mitigation is documented here before deployment (FR-024, gate 1). The as-built AWS Pricing Calculator estimate follows implementation (SC-019).

### Gate 1 projection on the adopted route (T145, T146; 2026-11-02)

**Scope.** T145 narrows T138's candidate set to Haiku 4.5's adopted route, the global profile at $1.00 input and $5.00 output per 1M tokens (§ Q2, T144). Nova 2 Lite and Haiku 5.5 leave the set. Nova Lite v1 is not projected either, because T152 re-projects any cheaper model before it is adopted. T146 runs the projection on **estimated** token counts, because S2 (T101) now runs after the first deployment. **This is a floor, not the finished gate 1 projection**: T005a and T138 stay open, and the lines marked "not sized" below are not in it. (F was sized later under T005a; see § F and the full gate 1 projection.)

**Inputs.** Every token figure is an **ESTIMATE pending S2 (T101)**. The method is spec 001 R0's: about 3K input tokens per turn and the 250-token reply cap.

| Input | Value | Basis |
| --- | --- | --- |
| System prompt | about 3,000 tokens (**estimate**) | `personality/systemPrompt.ts` is 11,062 characters. The wiki's 2026-09-29 estimate is about 2,990 tokens, and it counted the TypeScript around the string, so the real prompt is smaller |
| Tool definitions | about 400 tokens (**estimate**) | `get_news`, `get_weather` and `web_search` (`index.ts:55-95`), sized by hand from their descriptions and schemas. Excludes the model's own tool-use preamble, which S2 will include |
| Input per model call | about 3,400 tokens (**estimate**) | System prompt plus tools. **Excludes** conversation history, Memory records, tool results and any second model call after a tool call, so it understates input |
| Reply | 125 output tokens on average (500 characters ÷ 4); 250 at the cap | Spec 001 R0's 500-character average reply; `index.ts:97` |
| Polly | 500 characters on average; 1,000 at the cap; one call per reply | Q1, Q7 (speech marks dropped, #47). $16 per 1M characters (R-cost) |
| Volume, average case | 53 sessions × 15 turns = 795 turns | Spec 001 R0 ("~53 average sessions/month") |
| Volume, full case | 16 sessions × 50 turns = 800 turns | Spec 001 R0 ("~16 full sessions/month"), at maximum-length replies |

**Result (2026-11-02, against the then-$8 gate): the conversation lines alone exceed $8 gross of credits.** Against A5's $16 gate (2026-11-13), the average case's $9.56 is under it before F, and the full case's $16.52 is over it.

| Line (monthly, gross) | Average case: 795 turns, 500-character replies | Full case: 800 turns, maximum replies |
| --- | --- | --- |
| Haiku 4.5, global route ($1.00 / $5.00), estimated tokens | $3.20 | $3.72 |
| Polly Neural ($16 per 1M characters) | $6.36 | $12.80 |
| **Conversation subtotal** | **$9.56** (about $0.180 per 15-turn session) | **$16.52** (about $1.03 per 50-turn session) |
| For reference, US fallback route ($1.10 / $5.50) | $9.88 | $16.89 |
| F: Runtime V2 compute, Memory, CloudFront, S3, Lambda, logs, spans, alarms, ECR, DynamoDB, Cognito, SSM | about $2.79, sized under T005a (§ F and the full projection, below) | about $2.40 |

- **The projection exceeds the $8 gate before any F line is counted** (constitution gate 1; FR-024; SC-002). It would still exceed it with the LLM on the system prompt alone (about $2.88) and no tools. The figures are a floor: history, Memory context and tool-result tokens only add to the LLM line.
- **Polly is about 66% of the conversation subtotal** (average case). Polly alone is $6.36, so F plus the LLM line must fit in $1.64 for any model. Haiku 5.5's listed rates (a tenth of Haiku 4.5's) would cut the LLM line to about $0.32, which leaves $6.68 before F. Spec 001's own $1 infrastructure figure is already stale (R-cost's additions are not in it).
- **Raised with the builder (FR-024; T145).** No mitigation is chosen here. Options for the builder:
  1. Accept the in-path breaker as the mitigation. It soft-degrades (voice off) at $8 − F and trips at $10 − F (Q6; $16 − F and $20 − F since A5), so spend is bounded even though the projection at 53 average sessions is not. This means capacity, not the projection, is what the gate then limits.
  2. Plan for fewer sessions. With a placeholder F of spec 001's $1 (not a figure from this research), $7 buys about 580 turns on the global route, about 39 average sessions.
  3. Reduce Polly's share: a lower reply-character cap, or a shorter average reply, since Polly bills per character (Q1).
  4. A cheaper model after T152 helps only the LLM line (about $3.20 here).
  5. Re-state spec 001's usage assumption of 53 average sessions, which was sized to the $9 conversation allowance, not the $8 gate.

**T146 outputs.**

- **T117 and T082 are not complete.** T117 needs T005a's dated F inputs to compute F, `BREAKER_DEGRADE_MICRO_USD` and `BREAKER_TRIP_MICRO_USD`, and no number is invented for them. T082 has no target yet: no `BREAKER_*` or `PRICE_*` value exists in `packages/` (the breaker code, T077, and the Phase 10 stack work are unbuilt). See deviation C6.
- **Derived `PRICE_*` values, for T082 when it runs**, in micro-USD per 1M units (1 micro-USD = $0.000001): `PRICE_MODEL_INPUT_PER_MTOK_MICRO_USD` = 1,000,000 ($1.00); `PRICE_MODEL_OUTPUT_PER_MTOK_MICRO_USD` = 5,000,000 ($5.00); `PRICE_POLLY_PER_MCHAR_MICRO_USD` = 4,000,000 ($4, Polly Standard since 2026-11-13; was 16,000,000 for Neural). If T152 or a re-pin changes the route, these are re-derived.
- **`PRICE_MODEL_CACHE_READ_PER_MTOK_MICRO_USD` stays `0`** until S2 shows caching is reachable (FR-029; [runtime-config.md](./contracts/runtime-config.md) `:37`). The projection takes no cache discount.
- **After T101 (post-deploy)**, re-run this per-session projection with the measured system-prompt and tool token counts and record it beside this one. Above $16 gross of credits (gate 1 since A5), raise it with the builder (FR-024). Not yet run: **pending S2**.

### F and the full gate 1 projection (T005a; 2026-11-13)

**Every usage figure here is an estimate**, pending measurement after the first deployment (S2/T101, S4, T146). Rates come from the R-cost table. No free tier or credit is subtracted. Where usage is unknown, the assumption leans high.

| F line (monthly, gross) | Average case: 53 sessions × 15 turns | Full case: 16 sessions × 50 turns | Assumption |
| --- | --- | --- | --- |
| Runtime V2 CPU | $0.06 | $0.06 | 2 active vCPU-seconds per turn. CPU is not billed during I/O wait, which is most of a turn (model and Polly streaming) |
| Runtime V2 memory | $0.60 | $0.27 | 1 GB billed for the whole session plus the 1,800 s idle timeout (research `:239`): 10-minute average sessions and 30-minute full sessions (the cap). AWS reclaims idle memory sooner, so this is high |
| Memory short-term | $0.03 | $0.03 | Two events per turn at the 12 KB billing minimum, plus retrieval if the S4 fallback runs |
| Memory long-term storage | $0.75 | $0.75 | **Planning figure of 1,000 records.** About 8 records per session (1 summary, ~5 facts, ~2 preferences), so about 420 new records a month at average use. The 30-day pruner only removes inactive friends' records, so storage **grows** while friends stay active: about $0.32 in month 1, about $3.80 if 12 months accumulate unconsolidated |
| Memory long-term retrieval | $0.08 | $0.02 | Three per session (one per strategy namespace, memory-api.md `:50`) |
| CloudFront | $0.10 | $0.10 | About 1 GB out and under 10,000 requests |
| S3 | $0.01 | $0.01 | Under 1 GB stored. The rate was not re-read, and the cost is under $0.01 at any published rate |
| Lambda | $0.01 | $0.01 | Deploy uploads, sign-in triggers, the daily pruner and the hard stop |
| CloudWatch Logs and spans | $0.53 | $0.53 | 1 GB ingested (runtime logs plus `aws/spans`), 14-day retention, span indexing |
| CloudWatch alarms | $0.40 | $0.40 | Four standard alarms |
| ECR | $0.15 | $0.15 | About 1.5 GB (a few ARM64 images retained) |
| DynamoDB | $0.01 | $0.01 | On-demand control-table traffic |
| Cognito Lite | $0.06 | $0.06 | 10 friends (builder, 2026-11-13) |
| SSM, Route 53, Budgets | $0 | $0 | Standard parameters, no hosted zone, one budget |
| **F** | **$2.79** | **$2.40** | |

**Result against gate 1 ($16, constitution 1.6.0), gross of credits:**

| | Average case | Full case |
| --- | --- | --- |
| Conversation (§ above) | $9.56 | $16.52 |
| F | $2.79 | $2.40 |
| **Projected month** | **$12.35: passes**, with $3.65 headroom | **$18.92: over $16**, under the $20 hard stop |

- **The average case passes gate 1.** F is about $2.79, and Polly is still the largest single line.
- **The full case is over the gate, so it carries a mitigation (FR-024, gate 1), approved by the builder on 2026-11-13 (T005a):**
  1. **The projection is an estimate. Measure, then re-project.** Deploy, run S2 (T101) and T146's re-projection on measured tokens, Runtime seconds, Memory records and log volume, and record the result beside this one. T117 then sets F from measured figures.
  2. **The in-path breaker bounds spend before the bill does.** It soft-degrades to text only at $16 − F and trips at $20 − F (Q6, A5). Polly is about 67% of the full case, so voice-off removes most of the overshoot. The $20 hard stop (P2) is the backstop.
  3. **Watch Memory long-term storage.** It is the one F line that compounds. If T146 shows records growing past the planning figure, the options are a shorter retention window or dropping a strategy, decided then.
- **For T117, not set here:** a planning F of about $2.79 gives breaker limits of about $13.21 (degrade) and $17.21 (trip). These are **not** `BREAKER_*` values; T117 computes those from measured inputs (deviation C6).
- **With Polly Standard (§ Q1, 2026-11-13), both cases pass with no mitigation.** Polly falls to $1.59 (average) and $3.20 (full), so the month is about **$7.58** average and **$9.32** full against $16. The measure-then-re-project step above still stands, because every input is an estimate. A planning F of about $2.79 still gives about $13.21 and $17.21 for T117.
- **Human reads.** T005a asked the builder to read and date every human-read price. The F lines here were instead read from AWS's Price List files (`AGENTS.md` § External facts go stale), and together they total under $3. The builder approved T005a as presented, substitution included, on 2026-11-13 (§ Builder decisions).

## R-obs — observability (FR-022, P9)

- **Spans**: `invocation`, `first_token` (fixes #45), `reply.complete`, `audio.first_chunk`, `memory.retrieve`, `memory.create_event`, `breaker.check` and `session.open`. Contract: [transport-sse.md](./contracts/transport-sse.md).
- **Logs**: 14-day retention on every log group, set explicitly in CDK, including the runtime's log group and the Lambda log groups. The default is never-expire. Level: `INFO`, with friends' message text never logged.
- **CDK's own Lambdas need it too (SC-011).** Lambda creates a missing `/aws/lambda/<name>` group on first invoke, and that group never expires.
  - `crossRegionReferences` runs on `Custom::CrossRegionExportWriter` and its reader. Both are backed by `CustomResourceProvider`, which emits a bare `AWS::Lambda::Function` with no log group and no `LoggingConfig` (`core/lib/custom-resource-provider/custom-resource-provider-base.js`, `cross-region-export-providers/export-writer-provider.js`, `aws-cdk-lib` 2.272.0).
  - `BucketDeployment` takes a `logGroup` prop (`aws-s3-deployment/lib/bucket-deployment.d.ts:123`). So does `cr.Provider`'s framework Lambda (`custom-resources/lib/provider-framework/provider.d.ts:75`), if `idp-secret` is built on it.
  - **Design**: pass a 14-day log group wherever a prop exists. For the rest, an app-wide Aspect gives every `AWS::Lambda::Function` without a `LoggingConfig.LogGroup` its own 14-day `AWS::Logs::LogGroup` and sets that property to it, so the group exists before the first invoke.
  - **RED test**: in `app.test.ts`, every `AWS::Lambda::Function` in every synthesized template names a log group with `RetentionInDays: 14`. Whether an Aspect reaches the provider's function is proven by that test, not assumed. Quickstart V-16 checks the deployed account in both Regions.
- **Transaction Search**: enabled by recorded decision, because P9 requires traces. Indexing stays at its default, and the `aws/spans` log group also gets 14-day retention. Its cost is human-read before deployment.
- **Model-invocation logging**: **off**. Friends' messages are personal data (P7, FR-053).
- **Operations alarms**: hard-stop Lambda errors, pruner errors, breaker write failures and runtime 5xx go to an **operations topic** with an email subscription, separate from the budget topics (FR-022, deviation C8). The topic, the alarms and the hard-stop Lambda live in a new ops stack, so the budget stack can deploy first with no cross-stack props (FR-033; [contracts/spend-control.md](./contracts/spend-control.md) § Stack split).

## R-deploy — deploy identity and image build (FR-033, FR-034, P11)

- **Deploy identity (FR-034): a manual session, not GitHub OIDC.**
  - The builder signs in to the console as a least-privilege IAM user with a password and no access keys, then exports the CloudShell session's temporary credentials into the local shell as environment variables (P11 preference 1, `.specify/memory/constitution.md:190-194`).
  - The user's deploy policy grants only `sts:AssumeRole` on the CDK bootstrap roles (`cdk-hnb659fds-*`) in `us-west-2` and `us-east-1`.
  - A separate operator policy grants exactly the runbook calls ([quickstart.md](./quickstart.md) § Operator permissions).
  - **Rejected**: GitHub OIDC. It adds an IAM OIDC provider and a deploy role, and a pipeline that this deployment does not need. Revisit it when deploys become routine.
- **Bootstrap**: `us-west-2` and `us-east-1`, because the certificate stack and `crossRegionReferences` need both (plan, Complexity Tracking). Bootstrap needs IAM write, so it runs once, in CloudShell, as an administrator.
  - CDK's default gives the CloudFormation execution role **`AdministratorAccess`** ([`cdk bootstrap` reference](https://docs.aws.amazon.com/cdk/v2/guide/ref-cli-cmd-bootstrap.html), `--cloudformation-execution-policies`).
  - Scoping it is possible, but the scope must cover every resource type the stacks create, including IAM roles, so the gain is small. The deploy identity itself holds no direct permissions, its credentials are temporary, and no `--trust` account is added.
  - **Decided (builder, 2026-11-13, T005 (b))**: accept the default and record it as a P11 note.
- **ARM64 image build**: local Docker Desktop. CDK's `DockerImageAsset` with `platform: Platform.LINUX_ARM64` (`aws-ecr-assets/lib/image-asset.d.ts:53,252`, `aws-cdk-lib` 2.272.0) builds at `cdk deploy` and pushes to the bootstrap ECR repository.
  - The builder's machine is x86-64 (`PROCESSOR_ARCHITECTURE=AMD64`) with the Docker 29.5.2 client installed (checked 2026-10-11), so the ARM64 build runs under emulation: slower, but it needs no AWS resource.
  - **Fallback**: an AWS CodeBuild ARM build. It is a new AWS resource with its own cost line, so it is costed and approved before adoption.
  - Every changed image adds an ECR image, which R-cost counts.
- **Site upload: CDK `BucketDeployment`** in `frontend-stack.ts`, from `packages/frontend/dist`, with `distribution` and `distributionPaths: ['/*']` so CloudFront is invalidated in the same deploy (`aws-s3-deployment/lib/bucket-deployment.d.ts:16,20,89,95`, `aws-cdk-lib` 2.272.0).
  - **Why**: the deploy identity holds no direct S3 or CloudFront permissions, only the bootstrap roles, and CDK is the only writer (A1; [runtime-config.md](./contracts/runtime-config.md) § Rules). Today the site has no upload path at all (`frontend-stack.ts` has no `BucketDeployment`).
  - **Order**: the frontend is built with its `VITE_*` values from the Cognito and Agent stack outputs before `MaxHeight-Frontend` deploys ([quickstart.md](./quickstart.md) § Deploy order).
  - **Cost**: a custom-resource Lambda that runs only during deploys, plus invalidation paths. Both are human-read in R-cost.
  - **Rejected**: an operator `aws s3 sync` and `create-invalidation`. They widen the operator policy and leave a manual write outside CDK.
- **Cost-allocation tag (FR-033, P-06)**: one user-defined tag, `project` = `max-height`, applied app-wide with `Tags.of(app)` in `bin/app.ts` and asserted in each stack's test.
  - A user-defined key appears on the Billing "Cost allocation tags" page only after a resource carries it, which takes up to 24 hours. Activation then takes up to another 24 hours ([AWS re:Post: cost allocation tags](https://repost.aws/knowledge-center/organizations-no-cost-allocation-tags), read 2026-10-11).
  - The budget stack deploys first, so its hard-stop topic is the first resource to carry the key (the hard-stop Lambda is in the ops stack). The spend-bearing stacks wait until the key shows as active ([quickstart.md](./quickstart.md) § Deploy order).
  - `Tags.of` does not reach the budget itself. In `aws-cdk-lib` 2.272.0, `CfnBudget` is not `ITaggable` (`aws-budgets/lib/budgets.generated.d.ts:14`). Its own `resourceTags` would have to be set explicitly, and nothing here needs that.
  - Whether model-invocation costs carry the tag is **unverified** and not relied on. SC-019 groups spend by service, which needs no tag, and the account hosts only this project.
- **Quotas (FR-033)**: before the first deploy, the builder reads the adopted model's Bedrock on-demand quotas for `us-west-2` in Service Quotas. The requests-per-minute and tokens-per-minute quotas are compared with spec 001's peak (60 messages per friend per hour × invited friends), and the result is recorded here.

## Dependencies — gate 3 supply-chain review (P6, T001)

Constitution P6 (`.specify/memory/constitution.md:106-114`) and gate 3 (`:261`) require each new dependency's maintainer, publish date and downloads to be reviewed before it is added. Plan § Dependencies (`plan.md:35`) names four new `packages/agent` dependencies. Registry facts were read with `npm view` and the npm downloads API on 2026-11-13. **Approved by the builder on 2026-11-13.**

| Package | Purpose (plan.md:35) | Version added | Published | Latest on 2026-11-13 | Maintainer | Downloads/week | License |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `@aws-sdk/client-bedrock-agentcore` | Memory data plane | 3.1162.0 | 2026-11-04 | 3.1169.0 | AWS (`amzn-oss`, `aws-sdk-bot`; `aws/aws-sdk-js-v3`) | 1.5M | Apache-2.0 |
| `@aws-sdk/client-polly` | Server-side voice | 3.1162.0 | 2026-11-04 | 3.1169.0 | AWS, as above | 0.95M | Apache-2.0 |
| `@aws-sdk/client-dynamodb` | Control table | 3.1162.0 | 2026-11-04 | 3.1169.0 | AWS, as above | 18.4M | Apache-2.0 |
| `@aws-sdk/client-ssm` | Tool API keys from SecureString | 3.1162.0 | 2026-11-04 | 3.1169.0 | AWS, as above | 13.3M | Apache-2.0 |

- **Version: 3.1162.0, not the latest.** It is the version the lockfile already resolves for every existing `@aws-sdk/client-*` (`client-bedrock-runtime`, `client-polly`, `client-cognito-identity`, `client-apigatewaymanagementapi`), so the new clients share their `@aws-sdk/core` and Smithy packages. The AWS SDK publishes daily: 3.1169.0 was minutes old at the review, and a plain `pnpm add` resolved 3.1168.0, which pulled a second `@aws-sdk/core` into the agent. Specifiers use the existing `^3.1162.0` convention, so the Dependabot `dependencies` group moves all clients together. P6's ban on `^` applies to pre-1.0 packages only.
- **Transitive additions (12 lockfile packages, one removed).** The three clients not already present; `@aws-sdk/core@3.981.0`, required only by `@aws-sdk/dynamodb-codec`'s own range (`pnpm why`); `dynamodb-codec`, `endpoint-cache`, `middleware-endpoint-discovery`, `types@3.975.1`, `xml-builder@3.972.43` and `@smithy/core@3.40.0`, all AWS; and two non-AWS packages through DynamoDB's endpoint discovery (`client-dynamodb` → `middleware-endpoint-discovery` → `endpoint-cache`):
  - `mnemonist@0.38.3` (published 2021-03-01, latest 0.40.8) and `obliterator@1.6.1` (2020-02-12, latest 2.0.5). Both are MIT-licensed, from a single maintainer (`yomguithereal`), at about 23.5M downloads a week each. AWS pins `mnemonist` exactly, so no pre-1.0 range enters our graph. They are old but stable, and every DynamoDB v3 client carries them. Accepted.
- **Removed**: `@smithy/core@3.37.0`, previously used only by `@smithy/fetch-http-handler@5.8.0`. AWS deprecated it for a custom-logger redaction bug ([aws/aws-sdk-js-v3#8393](https://github.com/aws/aws-sdk-js-v3/issues/8393)). The re-resolution moved `fetch-http-handler` to 5.8.1 on a non-deprecated core. No other existing package's resolved version changed.
- **`pnpm audit`**: unchanged by this addition. Before and after: one `low`, `deepmerge` [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4), reached only through `packages/infra`'s jest devDependencies, with no patched version. `pnpm audit --audit-level=moderate` (the CI gate) passes.

## R-lens — Well-Architected assessment (FR-005)

> **Deferred until after the first deployment (builder decision 2026-11-13; tasks.md deviation C8).** The assessment is easier against deployed resources, and the AWS credits are time-limited. Accepted cost: a finding that changes a Q0–Q9 decision now means rework on deployed resources, not on paper.

FR-005 requires the codebase and architecture to be assessed against current AWS guidance: the Well-Architected Agentic AI Lens and Generative AI Lens, and the AgentCore Runtime, Memory, Identity and Observability guidance. Task T005b fills this table after the first deployment (see the note above), citing each source the way the rest of this document does.

A finding that only confirms a decision already recorded above is noted here and needs no further action. A finding that would **change** a Q0–Q9 decision stops the work: it goes to the builder, and the artifacts are reconciled with `/speckit.converge` rather than edited task by task.

| Lens / guidance | Best practice | Current state (`file:line` or decision) | Bears on | Finding |
| --- | --- | --- | --- | --- |
| _(to be completed by T005b)_ | | | | |

## Spikes (FR-003): each needs a cost estimate and builder approval before it runs

| Spike | Objective | Cost estimate | Approval |
| --- | --- | --- | --- |
| **S0** | Probe matrix: which candidate model IDs, and Polly, this Free-plan account can invoke in `us-west-2` ([contracts/s0-probe-matrix.md](./contracts/s0-probe-matrix.md)) | 7 calls of under 100 tokens or 40 characters each; well under $0.01. S0-8 and S0-9: one Converse call each, `maxTokens: 16`, under 100 tokens; well under $0.01 | S0-1 to S0-7: **Approved by the builder, 2026-10-25** (runner: `scripts/s0-probe.ts`). **Run 2026-10-29**; results in Q0 § S0 results. S0-8 (`us.amazon.nova-2-lite-v1:0`) and S0-9 (`us.anthropic.claude-haiku-5-5`): **Approved by the builder, 2026-10-30** (spec.md § Clarifications); run alone with `s0-probe.ts S0-8 S0-9`. **Run 2026-11-01**; results in Q0 § S0-8 and S0-9 results |
| **S1** | Golden-set character check: each S0-eligible candidate against the absolute rubric bar on the 65-case set, scored offline by a judge script with builder spot-checks ([contracts/s1-golden-set.md](./contracts/s1-golden-set.md)). Haiku 4.5 is today's model, so it needs no S1 run; a baseline is optional and is costed and approved separately if wanted | Per candidate: about 230K input and 16K output tokens for replies, plus about 165K input and 26K output for the judge; costed at human-read prices before approval | Pending; runs for every S0-eligible candidate other than Haiku 4.5, since each is a model change |
| **S2** | Real system-prompt and tool-definition tokens from reported usage (`metrics.accumulatedUsage`); the cache checkpoint minimum for the adopted model | A few calls; under $0.05 at any candidate's price | Pending |
| **S3** | Nova Sonic audio tokens per second and whether silence is billed | n/a | **Not run**: Q1 did not adopt Nova Sonic |
| **S4** (new) | Whether in-process runtime state (the session `Agent`) survives more than 120 s idle on Runtime V2 | A few invocations at first deploy; under $0.01 | Pending |

## Verification record (FR-039): W1–W38

Checked 2026-10-11 unless noted. "Not relied on" means no decision rests on the claim, so SC-013 does not require it to be resolved.

| # | Status | Evidence / note |
| --- | --- | --- |
| W1 | Verified (spec) | Resolved by design: `bin/app.ts` pins the Region; the Identity Pool grant is removed |
| W2 | Verified (spec) | Runtime and Memory constructs are added in `agent-stack.ts` and `data-stack.ts` |
| W3 | Verified (spec) | The real client is wired in (Q8) |
| W4–W6 | Verified (spec) | Superseded by the Q4 SSE transport; the WebSocket path is deleted |
| W7 | Verified (spec) | Decided: 2,000 characters everywhere (P-08); at most about 500 input tokens per message |
| W8 | Verified | The CDK hash-suffixed inline policy name is confirmed in the synthesized CognitoStack template (`CognitoUnauthRoleDefaultPolicy4E16848D`); moot after the redesign |
| W9 | Verified (spec) | Notifications at 50%, 80% and 100% are kept |
| W10 | Refuted (D3, corrected `78d29ac`) | The redesign makes the hard stop enforceable |
| W11 | No cache config: Verified. Token count: Unverified | S2 |
| W12 | Verified | Q0 removes the global profile |
| W13 | Verified (spec) | Q3 deferred |
| W14 | Verified (spec) | Q4 fixes it |
| W15 | Verified (spec) | Kept; cancellation also aborts Polly synthesis |
| W16 | Updated | The pin is now 1.20.0 exact (`packages/agent/package.json`); FR-035's 1.19.0 text is stale (P-04) |
| W17 | **Refuted for 2.272.0** | `platformVersion` is typed (`bedrockagentcore.generated.d.ts:11006-11007,11773`) (P-04) |
| W18 | Verified | Amendment A1 (IaC row) |
| W19 | Verified (spec) | First deployment is text input only |
| W20, W21 | Verified (spec) | Superseded: Polly moves server-side |
| W22 | Verified (spec) | The CSP is rewritten ([csp-and-hosting.md](./contracts/csp-and-hosting.md)) |
| W23 | Verified against the constitution | Mechanism: D10 (Unverified, not relied on: nothing creates an Organization) |
| W24 | Verified | ARM64 image, port 8080, `/ping` and `/invocations`, 2 GB image limit, 120 s initialization, environment variables of at most 2,048 characters per value and 50 variables (AgentCore Runtime documentation). The V2 Region list was checked for `us-west-2` only |
| W25 | Verified | The default idle timeout is 15 minutes, shorter than the decided 1800 s; the maximum lifetime is 8 hours |
| W26 | Code verified; IAM and deploy behavior unverified | The warm-up error stops initialization (`warmup.ts`; `index.ts:282-312`), so the design grants `bedrock:ListAsyncInvokes` ([runtime-config.md](./contracts/runtime-config.md) § Execution role). Readiness and `platformVersion` are confirmed at first deploy (quickstart V-01). |
| W27 | Verified for Haiku 4.5 (model card and legacy lifecycle policy, re-read 2026-11-02, T144) | Active, model EOL date N/A, absent from the scheduled-EOL table; the "EOL no sooner than" floor (Oct 16, 2026) has passed, so a Legacy announcement can come at any time. `modelLifecycle` via `GetFoundationModel` not yet read (Q2). Other candidates' lifecycles are re-read at T152 |
| W28 | Verified (S0-3, 2026-10-29) | Not invocable: mantle returns HTTP 403 "`anthropic.claude-haiku-4-5` is not available for this account" |
| W29 | Partly verified | AgentCore Runtime, Memory and Web Search prices are verified (R-cost). The Nova Lite v1 and Polly Neural prices were human-read 2026-10-29 |
| W30 / D5 | Conflict stands | The projection assumes no Polly free tier (conservative); no decision depends on resolving it |
| W31 | Verified (in-Region; no Guardrails) | Nova 2 Sonic model card; the other parts are not relied on |
| W32 | Not relied on | Nova 2 Lite is eligible only through its US profile (S0-8, Q0) |
| W33 | **Refuted** | The Haiku 4.5 model card (read 2026-10-11) contradicts the Gotchas claim; S2 relies on reported usage regardless |
| W34 | Unverified, not relied on | Caching is decided by S2 against the 1.20.0 `.d.ts` |
| W35 | Resolved | AgentCore Memory for long-term; runtime state for in-session history; Strands S3 session storage not chosen (Q8) |
| W36 | Verified for HTTP inbound JWT; WebSocket part not relied on | AgentCore Runtime JWT authorizer documentation |
| W37 | Not relied on | Nova Sonic is not adopted |
| W38 | Verified (2026-10-09) | Unchanged |

## Wiki discrepancies (FR-040): D1–D12 verdicts

Each push needs builder approval. The research batch below is staged, **not pushed**.

| # | Verdict | Wiki action (pending approval) |
| --- | --- | --- |
| D1 | **Verified** against the documentation: the Free plan supports no cross-Region features. **Contradicted in this account** by S0-1, S0-2 (2026-10-29) and S0-8 (2026-11-01): cross-Region profiles succeeded. Recorded only on 2026-10-29; since the 2026-10-30 clarification, S0-proven cross-Region routes are eligible | Gap: add to Decision-LLM-Model-Selection, Component-Agent-Runtime and Gotchas |
| D2 | **Refuted in part**: Nova 2 Lite has no in-Region on-demand path, but its US profile works (S0-8); Haiku 4.5 is in-Region only via mantle, with no Guardrails, and works through its cross-Region profiles (S0-1, S0-2) | Gap and correction: Source-Amazon-Nova-Lite, Decision-LLM-Model-Selection, plus a Gotchas row |
| D3, D4, D8, D9, D12 | Resolved earlier | None |
| D5 | Conflict stands; resolved conservatively | Source-Amazon-Polly: add the Free-plan caveat |
| D6 | **Verified**: `IncludeCredit` defaults to true | Concept-Budget-Ceiling |
| D7 | **Verified**: refresh up to 3 times a day | Concept-Budget-Ceiling |
| D10 | Unverified, not relied on | Verify before amendment A3 |
| D11 | Unverified | Verify the Free plan lifecycle (6 months or credits exhausted, then 90 days) before stating it on the wiki |
| **New** | Gaps found in plan research | Cost-allocation tags take up to 48 hours to activate; logs never expire by default; Polly speech marks are billed like speech; the Google Custom Search JSON API ends on 2027-01-01; the AgentCore pricing page renders as text; Memory short-term ingestion pricing changed on 2026-10-06; Strands usage lives at `metrics.accumulatedUsage` |

## Issue dispositions (FR-038)

| Issue | Disposition | Resolution |
| --- | --- | --- |
| #43, #44, #46, #51, #52, #53, #54, #57, #59, #60 | Done | No action |
| #56 | Prerequisite, merged (#62) | No action |
| #45 | In scope | Q4: incremental SSE `text` events and a real `first_token` span |
| #47 | In scope | Q1 and Q7: speech marks dropped; Polly free tier not counted |
| #48 | In scope; idea deferred | Q1: Polly adopted; a Nova Sonic hybrid is revisited after the first deployment (BidiAgent is Python-only) |
| #49 | In scope | Q7 and S2: caching stays in the model only if reachable |
| #50 | In scope | Q0 and Q2: Nova 2 Lite is eligible through its US profile (S0-8) and competes under Q2 and S1 |
| #55 | In scope | Q5: identity from the verified `sub` |
| #61 | In scope | Q6: fail-loud hard-stop redesign; closes when it ships with its test |
| #42 | Deferred | Q3 |
| #58 | Out of scope | No action |

The resolution comments are posted at close-out, linking each issue's decision page (FR-038, FR-008).

## Spec patches proposed by this plan

Spec 003 is in flight, so these are applied to `spec.md` with the builder's approval. Spec 001 is frozen, so its patches are recorded on the wiki and here, never as edits to it.

| ID | Target | Change |
| --- | --- | --- |
| P-01 | FR-003 (S0) | S0 becomes the probe matrix; Nova 2 Lite is not in-Region (D2 refuted) |
| P-02 | FR-044, FR-054, SC-015 | Google-first; Microsoft and Login with Amazon deferred |
| P-03 | FR-014, the 2026-10-03 memory clarification, the 2026-10-04 dropout clarification, FR-030 (T023b/c), FR-037's third bullet, and Assumptions "Out of scope" | **Long-term memory un-deferred**: AgentCore Memory ships in the first deployment. After a dropout, Max loses verbatim in-session history but recalls extracted memories |
| P-04 | FR-035 | Use the typed `platformVersion` with a pinning test; Strands 1.20.0 |
| P-05 | FR-037 and the 2026-10-04 dropout clarification | Strict continuity: the counted session continues across a new runtime session ID; a fresh cap only after sign-off or expiry |
| P-06 | FR-033 | Cost-allocation tags take up to 48 hours to activate, not about 24 |
| P-07 | FR-022, FR-053 | 14-day log retention; sign-in records kept until deletion is requested or the friend is removed; memory follows the 30-day window |
| P-08 | FR-036 | The server enforces the contract's 2,000 characters |
| P-09 | spec 001 FR-010 (recorded, not edited) | The 20,000-token session cap counts conversational tokens |
| P-10 | FR-024, SC-019 | The projection and the month of operation include Memory cost |
| P-11 | FR-032 | The WebSocket gap bullets are superseded by the Q4 SSE transport |
| P-12 | FR-018 | The hard-stop targets are the runtime execution role and the halt flag; there is no authenticated role, because the Identity Pool is removed |
| P-13 | FR-026 | The text-model comparison adds Claude Haiku 5.5 (launched 2026-10-07) and Nova Lite v1 as candidates, alongside Haiku 4.5 and Nova 2 Lite |
| P-14 | FR-002 | An amendment that changes a principle, a quality gate or a technology-table row is MINOR; correcting a factual claim in a rationale is PATCH. FR-002's blanket "MINOR version bump" is narrowed accordingly (A3 stays PATCH, A4 becomes MINOR) |
| P-15 | US3 scenario 6 | Soft-degrade is text-only. Spec 001 FR-016's browser-TTS fallback is recorded as unmet rather than amended, because browser TTS would itself breach P1 (Q1) |

## Constitution amendments (FR-002): each in its own PR before the tasks that depend on it

| ID | Text | Bump | Trigger |
| --- | --- | --- | --- |
| A1 | Tech table IaC row: "AWS CDK (infrastructure) + AgentCore CLI (agent deployment)" becomes CDK-only | MINOR | Builder decision (Q8) |
| A2 | LLM row: "Anthropic Haiku-class" becomes the adopted class | MINOR | Only if Q2 adopts a non-Haiku model. **A2 is not triggered for the first deployment: Haiku 4.5 is today's model** (T144, 2026-11-02; the LLM row pins the tier, not the version). It is resolved at the post-upgrade model review (T152) only if a non-Haiku candidate replaces Haiku 4.5 |
| A3 | P11 rationale: an Organization "expires all remaining free-tier credits" is corrected to the verified mechanism (D10) | PATCH | Only once D10 is verified |
| A4 | Gate 2: "The golden-set rubric (50 cases)" becomes 65 cases, the set the bible §9 grew to on 2026-04-19 (`3c8a5cb`) and `personality-gate.ts` encodes | MINOR | Before S1 is approved. MINOR, not PATCH: the case count changes what gate 2 checks, so the gate is materially expanded (P-14) |
| A5 | P2: $10/month hard cap becomes $20; alerts $5/$8 become $10/$16; hard stop $10 becomes $20. Gate 1: $8 becomes $16 | MINOR | **Applied 2026-11-13, constitution 1.5.0 → 1.6.0** (T153). Builder chose MINOR, and chose to land it on the `003-architecture-review` branch rather than in its own PR (deviation C9). Provisional: T156 |
| A6 | Tech table TTS row: "Amazon Polly Neural" becomes "Amazon Polly Standard, voice Matthew" | MINOR | **Applied 2026-11-13, constitution 1.6.0 → 1.7.0.** Builder decision (§ Q1); landed on this branch like A5 (deviation C10) |

## New findings (proposed issues; filed only with the builder's permission)

| ID | Finding | Evidence | Covered by |
| --- | --- | --- | --- |
| N1 | `extractUsage` reads a nonexistent `result.usage`, so token caps and any breaker are blind to real usage | `index.ts:44-52`; `agent.d.ts:353-410`; `meter.d.ts:141,149` | Q5 and Q6 tasks |
| N2 | The agent keeps no in-session history: a fresh `Agent` is built per request | `index.ts:90-108,182` | Q8 |
| N3 | `handleDeleteMemory` has no ownership check | `memory/memoryHandlers.ts` | Q8, FR-013 |
| N4 | The Google Custom Search JSON API ends on 2027-01-01, so `webSearchTool` will break after the month of operation | `tools/webSearchTool.ts:40`; Google's deprecation notice | Not in scope; AgentCore Web Search ($7 per 1,000) is the candidate |
| N5 | AgentCore Memory long-term records have no TTL, so the constitution's 30-day window needs a pruner | AgentCore Memory API documentation | Q8 |
| N6 | The distribution's `errorResponses` (403 and 404 → `/index.html`, status 200) are distribution-wide, so they would turn the runtime authorizer's 403 into an HTML 200 and defeat silent refresh | `frontend-stack.ts:51-62`; [CloudFront API: CustomErrorResponse](https://docs.aws.amazon.com/cloudfront/latest/APIReference/API_CustomErrorResponse.html) (a `DistributionConfig` member with no per-behavior form) | Q4; [contracts/csp-and-hosting.md](./contracts/csp-and-hosting.md) § SPA routing |
| N7 | Budgets sends an ACTUAL alert once per budget per period, so after a mid-month recovery the hard stop cannot fire again that month | [AWS Budgets best practices](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-best-practices.html) | Q6; [contracts/spend-control.md](./contracts/spend-control.md) § Recovery |
