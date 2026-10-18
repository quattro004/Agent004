# Implementation Plan: Architecture Review and First AWS Deployment

**Branch**: `003-architecture-review` | **Date**: 2026-10-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-architecture-review/spec.md`

## Summary

This feature reviews the architecture against the constitution (v1.5.0) and current AWS guidance, records a decision for each of Q0–Q9, and takes Max Height to its first real deployment on the AWS Free plan in `us-west-2`. Invited friends sign in on `max.recipieces.com`.

The review's decisions ([research.md](./research.md)) set the technical approach:

- **Transport (Q4).** The browser streams over Server-Sent Events (SSE) through a CloudFront `/runtimes/*` path behavior straight to AgentCore Runtime V2. The runtime authorizes the friend's Cognito user-pool JWT on the way in. The API Gateway WebSocket path and its stub handler are removed. A Lambda streaming proxy is the fallback, used only if a first-deploy probe fails.
- **Identity (Q5, Q9).** Sign-in is Google-first, with Microsoft and Login with Amazon deferred. Access is invite-only, with one allowlist entry per identity. A pre token generation trigger re-checks the allowlist at every sign-in and silent refresh. The server keys every cap, rate limit, session and memory namespace to the verified JWT `sub`, never to a client field (#55).
- **Voice (Q1).** Polly Neural runs server-side in the runtime, and its audio streams alongside the reply text. The browser holds no AWS credentials, so the Identity Pool is removed. Speech marks are dropped.
- **Spend (Q6, Q7).** Three layers protect the budget:
  - Budgets measures gross spend, with credits excluded.
  - An in-path circuit breaker tallies real model usage from `result.metrics.accumulatedUsage`. The current `extractUsage` reads a field that does not exist.
  - A redesigned hard stop fails loudly if its target is missing, and a person recovers it manually.

  Soft-degrade turns voice off at $8, leaving text only.
- **Conversation state (Q8, builder 2026-10-11).**
  - **In-session history.** One Strands `Agent` lives per counted session inside the runtime session's microVM, using the SDK's default 40-message sliding window.
  - **Long-term memory is un-deferred.** AgentCore Memory, with a 30-day rolling window that a scheduled pruner enforces, ships in the first deployment. This reverses the 2026-10-03 clarification and FR-014 (spec patch P-03).
- **IaC (Q8).** CDK owns everything, which needs a constitution amendment to the IaC row.
- **Text model (Q0, Q2).** The model is chosen after spike S0, a probe matrix of in-Region inference paths ([contracts/s0-probe-matrix.md](./contracts/s0-probe-matrix.md)). The Free plan forbids cross-Region inference, so the code's global Haiku 4.5 profile cannot ship. The eligible candidates are Claude Haiku 5.5, whose in-Region availability S0 must confirm, and Nova Lite v1, which needs amendment A2.

## Technical Context

**Language/Version**: TypeScript ^6.0.3. The agent targets Node.js >=24 in an ARM64 container; Lambda handlers run on the Node.js 22 managed runtime; pnpm 11.24.0.

**Primary Dependencies**:

- **Agent**: `@strands-agents/sdk` 1.20.0 (exact) and `@aws-sdk/client-bedrock-runtime`.
  - **New (gate 3 review required)**: `@aws-sdk/client-bedrock-agentcore` (Memory data plane), `@aws-sdk/client-polly` (server-side voice), `@aws-sdk/client-dynamodb` (control table) and `@aws-sdk/client-ssm` (tool API keys read from SecureString at startup, so no secret enters the runtime's environment or the template; [contracts/runtime-config.md](./contracts/runtime-config.md)).
- **Infra**: `aws-cdk-lib` 2.272.0, using the L1 `CfnRuntime` and `CfnMemory` from `aws-bedrockagentcore`.
- **Frontend**: React 19, Vite 8 and Zustand 5.
  - Sign-in uses the OAuth 2.0 authorization-code flow with PKCE, built on `fetch` and WebCrypto, with no new auth library.
  - `@aws-sdk/client-polly` is removed from the browser.

**Storage**:

- **DynamoDB control table**: provisioned capacity within the Always Free offer (verify, R-cost). It holds the allowlist, the counted sessions, the rate-limit windows, the breaker tally, the halt flag, and each friend's `lastSeenAt` ([data-model.md](./data-model.md)).
- **AgentCore Memory**: built-in long-term strategies. Short-term events expire after 7 days; long-term records are pruned 30 days after `lastSeenAt` (constitution `:236`).
- **Cognito User Pool**: Lite feature plan.
- **S3**: the static site and greeting audio, as today.
- **CloudWatch Logs**: 14-day retention on every log group.

**Testing**: Vitest for the agent, frontend and repo-tools; Jest for infra (CDK assertions); Playwright for frontend end-to-end. Every behavior change is RED → GREEN → REFACTOR. The review itself has no RED test; its checks are `speckit.analyze` and `wiki:lint`.

**Target Platform**: AWS account on the Free plan, Region `us-west-2`, with the ACM certificate in `us-east-1`. Evergreen desktop and mobile browsers.

**Project Type**: Web application in a pnpm workspace: `packages/frontend`, `packages/agent` and `packages/infra`.

**Performance Goals**: Spec 001's targets, unchanged:

- FR-004: first audible response within 1.5 s at P95, now measured on `first_token` (SC-012).
- FR-011: cold start within 5 s.

**Constraints**:

- P2 caps spend at $10 a month, with email alerts at $5 and $8. The cost gate is $8 projected.
- Free plan: in-Region inference only, Always Free offers only, and no AWS Organization (FR-028).
- Spec 001's per-session caps: 20,000 conversational tokens, 50 turns, 30 minutes.
- Messages are limited to 2,000 characters on the client, the server and in the contract (spec patch P-08).
- No signed-out path to any spend-bearing action (SC-017).
- Logs are retained for 14 days.

**Scale/Scope**: Invited friends only, at spec 001's usage assumptions (`specs/001-max-height-ai-character/research.md:43-70`, corrected under Q7). The deployment runs for one month of operation before the Free plan ends in December 2026 (SC-019).

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

Checked against constitution v1.5.0 (`.specify/memory/constitution.md`).

| Principle / gate | Pre-research status | Post-design status (Phase 1) | Evidence / action |
| --- | --- | --- | --- |
| **P1** Cloud-only (`:47-56`) | Pass | Pass | Polly runs in the runtime; there is no browser inference or browser TTS on the deployed path. Spec 001 FR-016's browser-TTS SHOULD is recorded as unmet rather than amended, because browser TTS would itself break P1 (research Q1). |
| **P2** Budget ceiling (`:58-71`) | Pass, with conditions | Pass, pending S0 and a human price read | Alerts at $5 and $8 go by email (Plan 1, #62). The $10 hard stop is redesigned (Q6). The session cap is enforced server-side on the verified `sub`. The cost model is research R-cost, and its pass depends on the model chosen after S0 and on human-read prices (FR-007). |
| **P3** Personality first (`:73-82`) | Pass | Pass, pending S1 | No visual or audio polish is in scope. Haiku 4.5 cannot ship (D1), so the S1 golden set must pass for whichever model Q2 adopts before it serves friends. |
| **P4** IP and legal (`:84-94`) | Pass | Pass | The product is named Max Height everywhere, the fan framing stays in the footer and About, and the privacy page is new (FR-053). |
| **P5** No LLM-as-judge (`:96-104`) | Pass | Pass | Built-in Memory extraction runs asynchronously and never scores live outputs. |
| **P6** Supply chain (`:106-116`) | Pass, with conditions | Pass, pending gate 3 | Four AWS SDK v3 clients are added to the agent, from the same publisher as the existing `client-bedrock-runtime`; no auth library is added. Each is reviewed before it is added. |
| **P7** Invited friends only (`:118-134`) | Pass | Pass | Google-first invite-only sign-in, an allowlist on provider-verified email, the pre token generation re-check, no signed-out path, and a privacy page covering sign-in data and memory (contracts `auth-and-allowlist.md`, `memory-api.md`). |
| **P8** Graceful degradation (`:136-149`) | Pass | Pass | The 2D avatar, text input, signal-lost flow and in-character sign-in failures are all covered. Voice-off soft-degrade uses an in-character state (contract `transport-sse.md`). |
| **P9** Observability first (`:151-164`) | Pass, with conditions | Pass, pending the R-obs cost read | AgentCore Observability has spans for `first_token`, the full reply, the first audio chunk and the memory retrieve. Log retention is 14 days. Transaction Search is on by recorded decision, with its cost read by a human. Model-invocation logging is off. |
| **P10** Unit tests (`:166-177`) | Pass | Pass | Every implementation task follows TDD, and the design names the RED test for each behavior (quickstart). |
| **P11** Credentials (`:179-224`) | Pass | Pass, pending builder confirmation of the bootstrap policy | The deploy identity uses CloudShell session export (P11 preference 1) and may only assume the CDK bootstrap roles (research R-deploy). CDK bootstrap's default `AdministratorAccess` execution role is proposed as a recorded P11 note. Runtime roles are least-privilege, scoped by Region, and conditioned on `polly:Engine` and `polly:VoiceId`. The browser holds no AWS credentials. Secrets live in SSM SecureString. |
| Tech table (`:226-246`) | Conflicts recorded | Amendments A1–A3 | **A1**: the IaC row becomes CDK-only (builder decision). **A2**: the LLM row is amended only if Q2 leaves the Haiku class. **A3**: P11's claim that an Organization expires credits is corrected to the verified fact (D10). The Memory row (`:236`) now conforms. |
| Gate 1 Cost model | Pending | Pending S0 and the human price read | R-cost projection, gross of credits and including Memory. Above $8, a mitigation is required (FR-024). |
| Gate 2 Personality | Pass | Pending S1 | S1 runs for every S0-eligible candidate against the 65-case set ([contracts/s1-golden-set.md](./contracts/s1-golden-set.md)); every eligible candidate is a model change. Amendment A4 corrects the gate's "50 cases" to 65. |
| Gate 3 Dependency | Pending | Pending | Review of the four SDK clients, recorded in their PR. |
| Gate 4 Degradation | Pass | Pass | Quickstart scenarios V-08 to V-10. |
| Gate 5 Observability | Pass | Pass | Spans are listed in contract `transport-sse.md`. |
| Gate 6 Test coverage | Pass | Pass | TDD throughout. |
| Gate 7 Credentials | Pass | Pass | As P11. |

**Result**: no unjustified violation. The amendments A1–A4 each land in their own PR before the tasks that depend on them (FR-002). The deviations accepted for this design are listed under [Complexity Tracking](#complexity-tracking).

## Project Structure

### Documentation (this feature)

```text
specs/003-architecture-review/
├── plan.md              # This file
├── research.md          # Phase 0: decision register Q0–Q9, verification record, spikes, cost model
├── data-model.md        # Phase 1: entities, keys, state transitions
├── quickstart.md        # Phase 1: validation scenarios mapped to SC-001–SC-019
├── contracts/           # Phase 1: interface contracts
│   ├── transport-sse.md
│   ├── runtime-config.md
│   ├── auth-and-allowlist.md
│   ├── memory-api.md
│   ├── spend-control.md
│   ├── csp-and-hosting.md
│   ├── s0-probe-matrix.md
│   └── s1-golden-set.md
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit.tasks), not created here
```

### Source Code (repository root)

```text
packages/infra/
├── bin/app.ts                      # CHANGE: pin env Region us-west-2; add Certificate, Data and Ops stacks;
│                                   #   Budget takes no cross-stack props, so it deploys first (FR-033);
│                                   #   app-wide cost-allocation tag project=max-height (research R-deploy)
├── lib/
│   ├── certificate-stack.ts        # NEW: ACM cert in us-east-1 (crossRegionReferences)
│   ├── cognito-stack.ts            # REWRITE: User Pool (Lite), Google IdP, prefix domain,
│   │                               #   PreSignUp and PreTokenGen triggers; Identity Pool removed
│   ├── data-stack.ts               # NEW: DynamoDB control table, CfnMemory, memory pruner schedule
│   ├── agent-stack.ts              # REWRITE: ECR image, CfnRuntime V2 (JWT authorizer,
│   │                               #   platformVersion), execution role; API Gateway WebSocket removed
│   ├── budget-stack.ts             # CHANGE: CostTypes (credits excluded); hard-stop topic only, Lambda moves out
│   ├── ops-stack.ts                # NEW: hard-stop Lambda (fail-loud), OpsAlarmTopic, the four operations alarms
│   ├── frontend-stack.ts           # CHANGE: custom domain, /runtimes/* runtime origin, CSP, Authorization
│   │                               #   forwarding; errorResponses replaced by the SPA rewrite function;
│   │                               #   BucketDeployment of the built site (research R-deploy)
│   ├── functions/spa-rewrite.js    # NEW: CloudFront Function (JS 2.0), viewer-request, default behavior only
│   └── handlers/
│       ├── pre-sign-up.ts          # NEW
│       ├── pre-token-generation.ts # NEW
│       ├── hard-stop.ts            # NEW (replaces inline code in budget-stack.ts; deployed by ops-stack.ts)
│       ├── memory-pruner.ts        # NEW
│       ├── idp-secret.ts           # NEW: custom resource, Google client secret from SSM SecureString
│       └── websocket-handler.ts    # DELETE
└── test/                           # Jest: CDK assertions per stack (budget-stack, ops-stack, frontend-stack, ...);
                                    #   handler tests (hard-stop, memory-pruner, triggers); spa-rewrite.test.ts

packages/agent/
├── Dockerfile                      # NEW: ARM64, port 8080
├── src/
│   ├── index.ts                    # CHANGE: /ping and /invocations, SSE streaming, identity from JWT
│   ├── identity/jwtClaims.ts       # NEW: sub and email from the runtime-validated token
│   ├── session/
│   │   ├── controlTable.ts         # NEW: DynamoDB access (sessions, rate limits, flags)
│   │   └── agentRegistry.ts        # NEW: one Strands Agent per counted session
│   ├── spend/
│   │   ├── usage.ts                # NEW: reads result.metrics.accumulatedUsage (replaces extractUsage)
│   │   └── breaker.ts              # NEW: in-path tally, degrade and trip thresholds
│   ├── voice/pollyStream.ts        # NEW: server-side Polly Neural synthesis
│   ├── memory/                     # CHANGE: real AgentCore client; ownership-checked handlers
│   ├── handlers/sessionManager.ts  # CHANGE: caps on conversational tokens, keyed to sub
│   └── tools/                      # unchanged
└── tests/                          # Vitest, including breaker.test.ts and memory ownership checks

packages/frontend/
├── src/
│   ├── services/auth.ts            # NEW: Cognito authorization code + PKCE, silent refresh
│   ├── hooks/useAgentStream.ts     # NEW: fetch-based SSE client (replaces useWebSocket.ts)
│   ├── components/SignIn*.tsx      # NEW: sign-in, signed-out and denied states (in character)
│   ├── components/PrivacyPage.tsx  # NEW (FR-053)
│   ├── services/pollyTts.ts        # DELETE (voice is server-side)
│   ├── services/browserTts.ts      # DELETE (P1; soft-degrade is text-only, research Q1)
│   ├── services/budgetDegradation.ts # CHANGE: `degraded` means text-only; browser_tts mode removed
│   ├── hooks/useAudio.ts           # CHANGE: play server `audio` events; no browser TTS fallback
│   ├── hooks/useGreeting.ts        # CHANGE: pre-rendered clip or text only; no browser TTS fallback
│   ├── services/cognitoAuth.ts     # DELETE (Identity Pool removed)
│   └── services/websocketManager.ts, hooks/useWebSocket.ts, config/wsUrl.ts  # DELETE
└── tests/
```

**Structure Decision**: keep the existing three-package web-application layout. Infra gains three stacks: Certificate in `us-east-1`, and Data and Ops in `us-west-2`. Its Lambda handlers move into `lib/handlers/` files and the CloudFront Function into `lib/functions/`, so each can be unit-tested. The agent gains `identity/`, `session/`, `spend/` and `voice/` modules beside the existing ones. The frontend swaps its WebSocket and browser-Polly services for an SSE client and server-delivered audio.

## Complexity Tracking

| Deviation | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| A second stack in `us-east-1` for the certificate (`crossRegionReferences`) | CloudFront accepts only `us-east-1` ACM certificates; the app is pinned to `us-west-2` (FR-031, FR-049). | A console-created certificate passed in by ARN breaks the CDK-only IaC decision (A1) and leaves an unrecorded manual resource. |
| Custom resource to load the Google client secret from SSM SecureString | CloudFormation does not resolve `ssm-secure` in Cognito `ProviderDetails` (research Q9). FR-052 forbids unjustified recurring cost. | Secrets Manager costs about $0.40 a month per secret (human-read required). That is small, but it is recurring spend under a $10 cap. **Builder to confirm**; Secrets Manager is the drop-in fallback. |
| DynamoDB control table (new resource) | Caps, rate limits, the breaker tally and the halt flag must survive runtime restarts and be shared across microVMs (FR-011, FR-020). | Runtime memory alone resets on every dropout, which would let a reconnect reset a cap. |
| Memory pruner (scheduled Lambda) | AgentCore long-term records have no built-in expiry, and the constitution requires a 30-day rolling window (`:236`). | Deleting on next access leaves data indefinitely for a friend who never returns, which breaks the window and FR-053. |
| Stateful runtime (in-process `Agent` per counted session) | Spec 001 expects a multi-turn conversation; today every request builds a fresh `Agent` with no history. | Short-term Memory events as the history store add per-turn cost and latency. They remain the fallback if the V2 idle reclaim (120 s) is found to drop in-process state (spike S4). |
| Lambda streaming proxy (fallback only) | Built only if the first-deploy probe shows CloudFront cannot stream SSE from the runtime with the Authorization header intact. | No simpler path remains if direct origin streaming fails. |
| Pre sign-up and pre token generation triggers | The allowlist must block first sign-in and revoke access at refresh (FR-042, FR-047). | A check only at session open leaves an unlisted person holding valid tokens; a check only at sign-up cannot revoke. |
| A separate ops stack for the hard-stop Lambda and the operations alarms | FR-033 requires the budget stack to deploy first, but the hard stop needs the runtime role and control table, and the alarms need the pruner and runtime ([contracts/spend-control.md](./contracts/spend-control.md) § Stack split). | One budget stack holding everything would depend on the Data and Agent stacks, so it could not deploy first. |
