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
| 2026-10-11 | Soft-degrade is text-only (voice off) at $8, with no P1 amendment; spec 001 FR-016's browser-TTS SHOULD is recorded as unmet | Q1, Q6, FR-023 |
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

- **Decision**: Polly Neural, synthesized **server-side in the runtime**. The audio streams to the browser on the same SSE response as the text ([contracts/transport-sse.md](./contracts/transport-sse.md)). The browser holds no AWS credentials, so the Identity Pool and its roles are removed. Speech marks are dropped, so there is no dual billing (#47). At the $8 soft-degrade, Max goes text-only.
- **Rationale**:
  - It keeps P1, because TTS stays in the cloud.
  - It removes the browser's need for AWS credentials (FR-032's `new PollyClient({})` gap, `pollyTts.ts:28`) and the CSP gap D9.
  - Polly is billed per character, which bounds cost by the 250-token reply cap (`index.ts:97`).
- **Alternatives**:
  - Nova 2 Sonic or Nova 2.5 Sonic: rejected for the first deployment. There is no Guardrails support (W31). Strands `BidiAgent` is Python-only (W38), so a second service would be needed. And Nova 2.5 Sonic's facts are still unverified (W37). Spike S3 is not run.
  - Browser Polly with Identity Pool credentials: rejected, because it adds a signed-in AWS credential surface and CSP entries for no benefit.
  - Browser TTS: rejected, because it would break P1. Spec 001 FR-016's browser-TTS SHOULD is recorded as unmet.
- **Issues**: #47 (speech marks dropped; free tier not counted, see Q7) and #48 (Nova Sonic hybrid not adopted; the issue stays open for after the first deployment).

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
    - **Limits are derived, not invented**: trip = P2's $10 minus F, and degrade = $8 minus F. F is R-cost's projected fixed monthly cost. Both limits and all rates are deploy-time configuration taken from R-cost ([contracts/runtime-config.md](./contracts/runtime-config.md)).
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
  - **Proposed**: a custom resource (`handlers/idp-secret.ts`) reads the SSM SecureString and calls `UpdateIdentityProvider`, so the secret never enters the template.
  - **Fallback**: a Secrets Manager dynamic reference, at about $0.40 per secret per month (human-read required).
  - **Builder to confirm**, because FR-052 requires a justification for any recurring cost.
- **Google consent screen**: only non-sensitive scopes are requested: `openid email`. `profile` is dropped because no profile field is used, which narrows the FR-053 disclosure. The claim that "Testing" status limits users and tokens is **Unverified**, and is checked at registration (FR-054). Production status is preferred if it needs no verification for these scopes.

## R-cost — projection inputs (FR-024, gate 1)

Prices read 2026-10-11 from `aws.amazon.com/bedrock/agentcore/pricing` (rendered text) are **Verified**. All others are **human-read required** before the projection gates deployment.

| Line item | Unit price | Status | Per-session estimate (method) |
| --- | --- | --- | --- |
| Text model input, output and cache: Nova Lite v1 (`amazon.nova-lite-v1:0`, the only S0-eligible candidate), `us-west-2` on-demand | $0.06 per 1M input, $0.24 per 1M output tokens; cache read $0.015 per 1M, cache write $0 | **Human-read 2026-10-29 by the builder** (`aws.amazon.com/bedrock/pricing`, "On Demand Inference" table, listed as "Amazon Nova Lite"). It matches the AWS Price List offer file for AmazonBedrock `us-west-2`, published 2026-10-29. Whether Nova Lite v1 supports prompt caching on our path is **Unverified**, so the projection uses no cache discount | spec 001 R0 method, with S2 measuring real prompt and tool tokens |
| Polly Neural | $16 per 1M characters | **Human-read 2026-10-29 by the builder** (`aws.amazon.com/polly/pricing`). The free tier of 1M Neural characters a month for the first 12 months is not subtracted, because the projection is gross of credits | at most 1,000 characters per reply × turns |
| Runtime V2 CPU | $0.1276 per vCPU-hour | Verified | active seconds only |
| Runtime V2 memory | $0.0169 per GB-hour | Verified | session lifetime, or until reclaimed (S4) |
| Memory short-term ingestion | $1.00 per GB, each event billed at 12 KB minimum and 64 KB maximum | Verified (price changed 2026-10-06) | about $0.0006 per 50-turn session |
| Memory short-term retrieval | $0.20 per GB, same minimum and maximum | Verified | used only by the S4 fallback |
| Memory short-term storage | $0.10 per GB-month | Verified | 7-day expiry; negligible |
| Memory long-term storage (built-in strategies) | $0.75 per 1,000 records per month | Verified | records per friend × friends |
| Memory long-term retrieval | $0.50 per 1,000 | Verified | one per counted session |
| Memory built-in extraction model cost | unknown | **Unverified**: whether it is included or billed separately | must be resolved before the projection passes |
| AgentCore Web Search | $7 per 1,000 queries | Verified | not adopted; the alternative when Google CSE ends (N4) |
| DynamoDB provisioned (small capacity) | Always Free claim | Human-read required | expected $0 |
| Cognito Lite MAUs | free tier claim | Human-read required | expected $0 |
| CloudFront (including the SPA rewrite Function and site invalidations), S3, the deploy-time `BucketDeployment` Lambda, CloudWatch Logs (14 days) and the four operations alarms, ECR storage | various | Human-read required | spec 001 R0 put infrastructure at about $1 a month; ECR, the Function, the upload Lambda and the alarms are now added |
| Transaction Search spans | per GB ingested | Human-read required | see R-obs |
| Secrets Manager (only if chosen) | about $0.40 per secret per month | Human-read required | fixed |

**Gate rule**: the projection sums F (fixed monthly) and per-session cost × spec 001's session counts (`specs/001-max-height-ai-character/research.md:43-70`). It must be at or below $8, gross of credits. Otherwise a mitigation is documented here before deployment (FR-024, gate 1). The as-built AWS Pricing Calculator estimate follows implementation (SC-019).

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
  - **Proposed**: accept the default and record it as a P11 note. **Builder to confirm.**
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

## R-lens — Well-Architected assessment (FR-005)

FR-005 requires the codebase and architecture to be assessed against current AWS guidance: the Well-Architected Agentic AI Lens and Generative AI Lens, and the AgentCore Runtime, Memory, Identity and Observability guidance. Task T005b fills this table before Phase 2, citing each source the way the rest of this document does.

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
| W27 | Unverified | The lifecycle status of the adopted model is read from its model card before Q2 closes |
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
| A2 | LLM row: "Anthropic Haiku-class" becomes the adopted class | MINOR | Only if Q2 adopts a non-Haiku model |
| A3 | P11 rationale: an Organization "expires all remaining free-tier credits" is corrected to the verified mechanism (D10) | PATCH | Only once D10 is verified |
| A4 | Gate 2: "The golden-set rubric (50 cases)" becomes 65 cases, the set the bible §9 grew to on 2026-04-19 (`3c8a5cb`) and `personality-gate.ts` encodes | MINOR | Before S1 is approved. MINOR, not PATCH: the case count changes what gate 2 checks, so the gate is materially expanded (P-14) |

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
