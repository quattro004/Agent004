# Tasks: Architecture Review and First AWS Deployment

**Input**: Design documents from `specs/003-architecture-review/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Constitution P10 and `AGENTS.md` make TDD mandatory. Every behavior task is preceded by a RED test task that must fail **for the intended reason** before the implementation task starts. The test files are those in [quickstart.md § RED tests](./quickstart.md#red-tests-p10) and in each contract's Tests table. Runners: Vitest for `packages/agent` and `packages/frontend`, Jest for `packages/infra`, Playwright for e2e. `pnpm run validate` is the final gate.

**Organization**: Tasks are grouped by user story (spec.md US1–US7). Deployment and the live V-scenarios form their own phase after the stories, because a spend-bearing deploy needs US1–US5 (quickstart prerequisites 2, 3 and 11).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: Which user story the task belongs to (US1–US7)
- Paths are relative to the repository root

## Deviations from plan

Recorded per `AGENTS.md` § Trust, but verify. Add new rows (`C2`, `C3`, …) when drift is found during implementation; split the task rather than silently re-scoping it.

| ID | Finding | Resolution |
| --- | --- | --- |
| C1 | plan.md § Project Structure marks `packages/agent/Dockerfile` **NEW**, but it exists: `node:24-alpine`, port 8080, a `/ping` healthcheck, no platform pin, and `npm install` rather than the pnpm workspace (checked 2026-10-12). | T023 **changes** the existing file to an ARM64 build rather than creating one. |
| C2 | Plan names no file for the app-wide 14-day log-retention Aspect (research § R-obs). | T010 creates `packages/infra/lib/aspects/log-retention.ts`. If review prefers it inline in `bin/app.ts`, update this row. |
| C3 | Plan names no file for the agent's startup configuration loader (runtime-config.md § Rules). | T019 adds `packages/agent/src/config/runtimeConfig.ts`, called from `initialize()` in `src/index.ts`. |
| C4 | Plan § Dependencies says `@aws-sdk/client-polly` is removed from the frontend, but `packages/frontend/scripts/generate-greetings.ts:21` imports it to pre-render greeting clips at build time (checked 2026-10-12). | T081 moves it to `devDependencies` instead of removing it. The browser bundle no longer ships it. |

## Path Conventions

- **Monorepo** (pnpm workspaces): `packages/infra/`, `packages/agent/`, `packages/frontend/`
- Paths follow plan.md § Project Structure. New agent and frontend tests mirror their `src/` path.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Approvals, the cost gate, the lens assessment, the spec patches, and dependency changes that every later phase relies on.

- [ ] T001 Record the gate-3 supply-chain review (constitution) for `@aws-sdk/client-bedrock-agentcore`, `@aws-sdk/client-polly`, `@aws-sdk/client-dynamodb` and `@aws-sdk/client-ssm` in research.md § Dependencies: latest stable version, publish date, maintainer, transitive count and `pnpm audit` result. Prefer latest stable over bleeding edge. Then add them with `pnpm --filter @max-height/agent add <pkg>` in `packages/agent/package.json` and commit `pnpm-lock.yaml`
- [ ] T002 [P] Open amendment PR **A1** (IaC is CDK-only, MINOR bump) against `.specify/memory/constitution.md`, in its own PR per research § Amendments. Builder approval required
- [ ] T003 [P] Open amendment PR **A4** (gate 2 golden set 50 → 65 cases, MINOR bump per P-14) against `.specify/memory/constitution.md`, in its own PR. It must merge **before** S1 runs (T100)
- [ ] T004 [P] Write the cost estimate for spikes S0, S1, S2 and S4 (research § Spikes; FR-003) into research.md § Spikes, and record the builder's approval of each with a date before it runs. S3 is not run
- [ ] T005 Confirm with the builder two open decisions, and record each answer in research.md: (a) the Google client secret lives in SSM `/max-height/google-client-secret` applied by `handlers/idp-secret.ts` rather than in Secrets Manager; (b) the `cdk bootstrap` `AdministratorAccess` default under P11 (research § R-deploy)
- [ ] T005a Complete research.md § R-cost to satisfy the constitution's **gate 1**, which requires a cost estimate *before implementation begins*. The builder reads and dates every human-read price, and the Memory built-in extraction row (research § R-cost) is resolved to a figure rather than left "unknown". The projection must come out at or below $8 gross of credits, or carry a documented mitigation (FR-024, SC-002). The projection uses the most expensive S0-eligible candidate, so adopting a cheaper model in T096 can only improve it. The breaker values (F, `BREAKER_DEGRADE_MICRO_USD` and `BREAKER_TRIP_MICRO_USD`) are **not** set here; T117 computes them once the model is adopted. **This task blocks Phase 2**
- [ ] T005b Assess the codebase and architecture against the Well-Architected Agentic AI Lens and Generative AI Lens, and the AgentCore Runtime, Memory, Identity and Observability guidance (FR-005), and record the result in research.md § R-lens. Cite each source as AWS documentation, and link every finding to the Q0–Q9 decision it bears on. If a finding would change a recorded decision, stop and raise it with the builder, then reconcile the artifacts with `/speckit.converge` rather than editing tasks in place
- [ ] T103 [US6] Apply spec patches **P-01 to P-15** from research.md to `specs/003-architecture-review/spec.md`, one commit per patch, after builder approval. **This task blocks Phase 2**: Phases 2–9 build the patched behavior (memory un-deferred, Google-only sign-in, the SSE transport, strict session continuity, text-only soft-degrade), and spec.md is authoritative while the feature is being implemented (`AGENTS.md` § Source of truth)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Region, tags, log retention, the data layer, identity extraction, usage measurement and the runtime resource. Every user story depends on these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### App, Region, tag and log retention (research § R-deploy, § R-obs)

- [ ] T006 RED: extend `packages/infra/test/app.test.ts`. Every stack except Certificate has `env.region` `us-west-2`. Every taggable resource carries `project=max-height`. Every `AWS::Lambda::Function` in every stack, CDK's own included (`crossRegionReferences` export writer and reader, `BucketDeployment`), has an `AWS::Logs::LogGroup` with `RetentionInDays: 14`. Run it and confirm it fails on Region and retention
- [ ] T007 [P] RED: assert in `packages/infra/test/budget-stack.test.ts` that `AWS::Budgets::Budget` sets `ResourceTags` with `project=max-height` explicitly, because `CfnBudget` is not `ITaggable` in aws-cdk-lib 2.272.0+ (research § R-deploy)
- [ ] T008 Pin `env: { region: 'us-west-2' }` and apply `Tags.of(app).add('project', 'max-height')` in `packages/infra/bin/app.ts`
- [ ] T009 Set `resourceTags` on the `CfnBudget` in `packages/infra/lib/budget-stack.ts` until T007 passes
- [ ] T010 Create the app-wide 14-day log-retention Aspect in `packages/infra/lib/aspects/log-retention.ts` and apply it in `packages/infra/bin/app.ts` until T006 passes (deviation C2)

### Certificate stack (csp-and-hosting.md)

- [ ] T011 [P] RED: create `packages/infra/test/certificate-stack.test.ts`. The stack is in `us-east-1`, it has `crossRegionReferences: true`, and an `AWS::CertificateManager::Certificate` for `max.recipieces.com` uses DNS validation
- [ ] T012 Create `packages/infra/lib/certificate-stack.ts` and add it to `packages/infra/bin/app.ts` until T011 passes

### Data stack (data-model.md; memory-api.md § Resource)

- [ ] T013 RED: create `packages/infra/test/data-stack.test.ts`. The DynamoDB control table has partition key `pk` (string), **provisioned** billing with the read and write capacity recorded in research § R-cost (plan § Storage; data-model.md § Control table: provisioned capacity within the Always Free offer), TTL attribute `ttl`, and `RemovalPolicy.RETAIN`. Assert the capacity values, so a silent change to on-demand billing fails the test and the Always Free assumption cannot drift. A `CfnMemory` has semantic, summary and user-preference strategies whose namespaces are `/max-height/{sub}/facts`, `/max-height/{sub}/preferences` and `/max-height/{sub}/summaries/{sessionId}/`, and `eventExpiryDuration` of 7 days. Assert the outputs consumed by later stacks (table name and ARN, memory ID and ARN)
- [ ] T014 Create `packages/infra/lib/data-stack.ts` (control table and `CfnMemory` only; the pruner is added in T089) and add it to `packages/infra/bin/app.ts` until T013 passes

### Agent: configuration, identity, control table, usage

- [ ] T015 [P] RED: in `packages/agent/tests/index.readiness.test.ts`, each missing required variable from [runtime-config.md § Agent runtime](./contracts/runtime-config.md) (all 29) and each missing SSM parameter fails `initialize()` with a message naming it, and `/ping` stays `503`. No default is substituted for a missing value
- [ ] T016 [P] RED: create `packages/agent/tests/identity/jwtClaims.test.ts`. `sub` and `email` are read only from the token the runtime authorizer validated (the request's `Authorization` header). A missing or malformed token is refused. Body fields `sessionId` and `actorId` are never read (FR-010, #55)
- [ ] T017 [P] RED: create `packages/agent/tests/session/controlTable.test.ts` using `aws-sdk-client-mock`. Cover every item in data-model.md with its attributes verbatim:
  - `ALLOW#<email>`: `provider` (`google`), `addedAt`, `addedBy`
  - `FRIEND#<sub>`: `email`, `provider`, `createdAt`, `lastSeenAt`, `memoryPrunedAt`
  - `SESSION#<sub>`: `sessionId`, `state`, `openedAt`, `turns`, `conversationalTokens`, `ttl`
  - `RATE#<sub>#H#<yyyy-mm-ddThh>` and `RATE#<sub>#D#<yyyy-mm-dd>` (UTC): `count`, `ttl`, atomic `ADD`
  - `SPEND#<yyyy-mm>`: `microUsd` (integer), `updatedAt`, atomic `ADD`
  - `CONTROL#HALT`: `haltedAt`, `reason`

  Also assert these validation rules: "`email` is lowercased and trimmed before any write or lookup"; "`microUsd` is an integer, so repeated `ADD`s never drift"; a `RATE#` `ttl` "is the window end plus one window"; and "`SESSION#<sub>.ttl` is `openedAt` plus spec 001's 30-minute cap plus a grace window", with expiry evaluated in code, not by TTL
- [ ] T018 [P] RED: create `packages/agent/tests/spend/usage.test.ts`. Usage comes from `result.metrics.accumulatedUsage` (`inputTokens`, `outputTokens`, `totalTokens`, optional cache-read and cache-write counts). A missing metrics object fails loud rather than reading zero (research N1). `estimatedMicroUsd` is the sum of each count times its configured `PRICE_*` rate, as an integer
- [ ] T019 Implement `packages/agent/src/config/runtimeConfig.ts`, which reads the environment and the SSM SecureStrings at startup with `@aws-sdk/client-ssm`, and call it from `initialize()` in `packages/agent/src/index.ts` until T015 passes (deviation C3)
- [ ] T020 [P] Implement `packages/agent/src/identity/jwtClaims.ts` until T016 passes
- [ ] T021 [P] Implement `packages/agent/src/session/controlTable.ts` with `@aws-sdk/client-dynamodb` until T017 passes
- [ ] T022 [P] Implement `packages/agent/src/spend/usage.ts`, remove the broken `extractUsage` from `packages/agent/src/index.ts`, and make T018 pass
- [ ] T023 Change `packages/agent/Dockerfile` (deviation C1) to build `linux/arm64` for the pnpm workspace, listen on 8080 and serve `/ping` and `/invocations`. Verify with `docker buildx build --platform linux/arm64 packages/agent`. There is no behavioral delta to test with RED; the check is that the build succeeds and the image starts and returns `/ping`

### Runtime resource (runtime-config.md § Runtime resource settings, § Execution role)

- [ ] T024 RED: rewrite `packages/infra/test/agent-stack.test.ts`. Cover these:
  - a `DockerImageAsset` for `linux/arm64`, and a `CfnRuntime` with `platformVersion` pinned to V2 (P-04)
  - inbound JWT auth with the Cognito discovery URL and `allowedClients` set to the app client ID
  - a request-header allowlist including `Authorization` and `X-Amzn-Bedrock-AgentCore-Runtime-Session-Id`
  - every runtime environment variable from runtime-config.md
  - an execution role granting exactly the listed actions, `bedrock:ListAsyncInvokes` included (W26)
  - no API Gateway, no WebSocket and no Lambda in this stack
- [ ] T025 Rewrite `packages/infra/lib/agent-stack.ts` to take the Data and Cognito stack outputs, and wire it in `packages/infra/bin/app.ts` until T024 passes
- [ ] T026 Delete `packages/infra/lib/handlers/websocket-handler.ts` and remove `@aws-sdk/client-apigatewaymanagementapi` from `packages/infra/package.json`. No behavioral delta; the check is that `pnpm --filter @max-height/infra run test` and `typecheck` stay green

**Checkpoint**: Foundation ready. The infra tests and agent unit tests pass, and user stories can begin.

---

## Phase 3: User Story 1 - Friend converses on the first real deployment (Priority: P1) 🎯 MVP

**Goal**: A signed-in friend sends a message through CloudFront `/runtimes/*` to the AgentCore runtime and receives an SSE reply with server-side voice ([transport-sse.md](./contracts/transport-sse.md)).

**Independent Test**: Run the agent container locally and `POST /invocations` with a test JWT. The response is `200` and `text/event-stream`, with events in the order `session`, `text`…, `done`, and `audio` interleaved. Locally the frontend renders the reply with `VITE_*` pointed at that container. Live proof is V-02 (Phase 10).

### Tests for User Story 1 ⚠️ write first, confirm they FAIL

- [ ] T027 [P] [US1] RED: in `packages/agent/tests/index.test.ts`, `POST /invocations` returns `text/event-stream`. Events are `session`, `text`, `audio` (mp3 base64 with `seq`), `done`, `result` and `error`, framed per transport-sse.md § Framing. A body with no `message` or an unknown action is `invalid_request`, and a message over 2,000 characters is `message_too_long` (P-08)
- [ ] T028 [P] [US1] RED: create `packages/agent/tests/session/agentRegistry.test.ts`. One Strands `Agent` per counted session, keyed by runtime session ID (at least 33 characters), using `SlidingWindowConversationManager` with window 40 (N2). The `Agent` is rebuilt when `countedSessionId` changes. Entries record `lastUsedAt` for local eviction
- [ ] T029 [P] [US1] RED: create `packages/agent/tests/voice/pollyStream.test.ts`. Server-side Polly Neural `Matthew` at sample rate `24000`, mp3 segments emitted as `audio` events with increasing `seq`. When voice is off there are no `audio` events, and `pollyCharacters` is 0. There are no speech marks
- [ ] T030 [P] [US1] RED: update `packages/agent/tests/index.cancellation.test.ts`. A client disconnect (`res.on('close')` guarded by `res.writableFinished`) cancels the turn, sets `cancelled` true on the `invocation` span, and the turn's usage is still counted (transport-sse § Cancellation)
- [ ] T031 [P] [US1] RED: create `packages/frontend/tests/hooks/useAgentStream.test.ts`. It sends a fetch `POST` to `/runtimes/<encoded VITE_RUNTIME_ARN>/invocations?qualifier=DEFAULT` with `Authorization: Bearer`, `Accept: text/event-stream` and the session-ID header. It parses SSE framing, maps every status and error code in transport-sse § Response to its UI state, and treats a `5xx`, a network drop or a stream that ends without `done` as signal-lost
- [ ] T032 [P] [US1] RED: replace `packages/frontend/tests/config/wsUrl.test.ts` with `packages/frontend/tests/config/buildConfig.test.ts`. The build fails when any of `VITE_RUNTIME_ARN`, `VITE_COGNITO_DOMAIN`, `VITE_COGNITO_CLIENT_ID`, `VITE_REDIRECT_URI` or `VITE_SIGN_OUT_URI` is missing. `VITE_WS_URL` is no longer read
- [ ] T033 [P] [US1] RED: update `packages/frontend/tests/hooks/useAudio.test.ts`. It plays server `audio` events in `seq` order, and it never falls back to browser speech synthesis
- [ ] T034 [P] [US1] RED: in `packages/infra/test/frontend-stack.test.ts`, the distribution has a `/runtimes/*` behavior whose origin is `bedrock-agentcore.us-west-2.amazonaws.com` over HTTPS only, with `originReadTimeout` 120 and caching disabled. Its origin request policy forwards `Authorization`, `Content-Type`, `Accept` and `X-Amzn-Bedrock-AgentCore-Runtime-Session-Id`, plus the `qualifier` query string. `POST` is allowed

### Implementation for User Story 1

- [ ] T035 [US1] Implement `packages/agent/src/session/agentRegistry.ts` until T028 passes
- [ ] T036 [US1] Implement `packages/agent/src/voice/pollyStream.ts` with `@aws-sdk/client-polly` until T029 passes
- [ ] T037 [US1] Rewrite `/invocations` in `packages/agent/src/index.ts` to stream SSE with identity from `jwtClaims.ts`, the registry, `pollyStream.ts` and `usage.ts`, until T027 and T030 pass
- [ ] T038 [P] [US1] Change `packages/agent/src/tools/weatherTool.ts`, `newsTool.ts` and `webSearchTool.ts` to take their API keys as arguments from `runtimeConfig.ts` rather than reading the environment, keeping `context.cancelSignal` forwarding. Update `packages/agent/tests/tools/tools.test.ts` and `webSearchTool.test.ts` RED first
- [ ] T039 [US1] Implement `packages/frontend/src/hooks/useAgentStream.ts` until T031 passes
- [ ] T040 [US1] Implement the build-time `VITE_*` check in `packages/frontend/vite.config.ts` until T032 passes, The variables are already documented in runtime-config.md § Frontend build and quickstart.md § Deploy order step 8, so no new example file is added
- [ ] T041 [US1] Change `packages/frontend/src/hooks/useAudio.ts` to play server `audio` events until T033 passes
- [ ] T042 [US1] Wire `useAgentStream` into `packages/frontend/src/App.tsx` and `packages/frontend/src/stores/connectionStore.ts`, and enforce the 2,000-character limit in `packages/frontend/src/components/TextInput.tsx`. Update `packages/frontend/tests/App.test.tsx` and `tests/components/TextInput.test.tsx` RED first
- [ ] T043 [US1] Delete `packages/frontend/src/services/websocketManager.ts`, `src/hooks/useWebSocket.ts` and `src/config/wsUrl.ts`, with their tests `tests/services/websocketManager.test.ts`, `tests/hooks/useWebSocket.test.ts` and `tests/config/wsUrl.test.ts`. This is a deletion, so the check is that the frontend suite and typecheck stay green
- [ ] T044 [US1] Add the `/runtimes/*` behavior and its origin request policy to `packages/infra/lib/frontend-stack.ts` until T034 passes

**Checkpoint**: Locally, a message produces a streamed, voiced reply through the new transport.

---

## Phase 4: User Story 2 - Only invited friends get in (Priority: P1)

**Goal**: Google-only Cognito sign-in with PKCE, an allowlist enforced by triggers and at session open, HTTPS on `max.recipieces.com`, a strict CSP and a public privacy page ([auth-and-allowlist.md](./contracts/auth-and-allowlist.md), [csp-and-hosting.md](./contracts/csp-and-hosting.md)).

**Independent Test**: The infra and trigger tests pass. Locally, the frontend completes PKCE against a mocked token endpoint and shows the in-character denied state for `not_allowlisted`. Live proof is V-03, V-04, V-06 and V-10.

### Tests for User Story 2 ⚠️ write first, confirm they FAIL

- [ ] T045 [P] [US2] RED: rewrite `packages/infra/test/cognito-stack.test.ts`. It covers these:
  - a user pool on the Lite feature plan, whose only IdP is Google with scopes `openid email`
  - a Cognito prefix domain using the committed prefix constant (quickstart prerequisite 8)
  - a public app client with no secret, using the authorization-code grant with PKCE, and `https://max.recipieces.com` callback and sign-out URLs, none of them `localhost`
  - pre sign-up and pre token generation triggers with read access to the control table
  - no `AWS::Cognito::IdentityPool`, and no unauth role
- [ ] T046 [P] [US2] RED: create `packages/infra/test/pre-sign-up.test.ts`. It denies an email with no `ALLOW#<email>` item, and an unverified email. It allows a listed, verified Google email (lowercased and trimmed). It fails closed when DynamoDB errors
- [ ] T047 [P] [US2] RED: create `packages/infra/test/pre-token-generation.test.ts`. It denies when `CONTROL#HALT` exists or `ALLOW#<email>` is missing, and writes `FRIEND#<sub>` (`email`, `provider`, `createdAt`) on success. It fails closed when DynamoDB errors
- [ ] T048 [P] [US2] RED: create `packages/infra/test/idp-secret.test.ts`. The custom resource reads `/max-height/google-client-secret` (SecureString) and applies it to the Google IdP. A missing parameter fails the deploy with a message naming it, and the secret never appears in the template or in logs
- [ ] T049 [P] [US2] RED: in `packages/agent/tests/index.test.ts`, a counted session opens only when `ALLOW#<email>` exists. Otherwise the reply is `not_allowlisted`, and an already-open session continues until it ends (the revocation timeline in auth-and-allowlist.md)
- [ ] T050 [P] [US2] RED: in `packages/infra/test/frontend-stack.test.ts`, the distribution has these settings:
  - no `errorResponses`; the alias `max.recipieces.com` with the Certificate-stack certificate; viewer protocol `redirect-to-https`
  - a CSP whose `connect-src` is `'self'` plus the exact Cognito host, with no `wss:` and no `cognito-identity`, and `form-action 'self'`, `base-uri 'self'` and `frame-ancestors 'none'`
  - the SPA rewrite function on the default behavior only, with runtime `cloudfront-js-2.0`
  - a `BucketDeployment` invalidating `/*`
- [ ] T051 [P] [US2] RED: create `packages/infra/test/spa-rewrite.test.ts`. `/`, `/privacy` and `/auth/callback` are rewritten to `/index.html`; a path with a file extension is not rewritten
- [ ] T052 [P] [US2] RED: create `packages/frontend/tests/services/auth.test.ts`. It covers these:
  - PKCE verifier and challenge, and `state` generation and check
  - a code exchange at the Cognito token endpoint
  - the access token held in memory only and the refresh token in `sessionStorage`
  - silent refresh before expiry
  - sign-out clears both tokens and redirects to the sign-out URI
  - a mismatched `state` discards the code and shows the sign-in error state
- [ ] T053 [P] [US2] RED: create `packages/frontend/tests/components/SignIn.test.tsx`. It covers the in-character signed-out, sign-in error and denied states, using the denial copy from auth-and-allowlist.md § Denial copy, and never shows a raw error
- [ ] T054 [P] [US2] RED: create `packages/frontend/tests/components/PrivacyPage.test.tsx`. `/privacy` renders while signed out (FR-053) and states what is stored, for how long, and how to request deletion

### Implementation for User Story 2

- [ ] T055 [P] [US2] Implement `packages/infra/lib/handlers/pre-sign-up.ts` until T046 passes
- [ ] T056 [P] [US2] Implement `packages/infra/lib/handlers/pre-token-generation.ts` until T047 passes
- [ ] T057 [P] [US2] Implement `packages/infra/lib/handlers/idp-secret.ts` until T048 passes (subject to T005's answer)
- [ ] T058 [US2] Rewrite `packages/infra/lib/cognito-stack.ts`, removing the Identity Pool and the unauth role, until T045 passes. Remove the stale `CognitoUnauthRoleDefaultPolicy` reference from `packages/infra/lib/budget-stack.ts` at the same time; T068 replaces the hard stop it fed
- [ ] T059 [US2] Add the session-open allowlist check to `packages/agent/src/index.ts` until T049 passes
- [ ] T060 [P] [US2] Create `packages/infra/lib/functions/spa-rewrite.js` until T051 passes
- [ ] T061 [US2] Change `packages/infra/lib/frontend-stack.ts` (custom domain, certificate, CSP, the SPA function in place of `errorResponses`, `BucketDeployment`) until T050 passes
- [ ] T062 [US2] Implement `packages/frontend/src/services/auth.ts` with no third-party auth library, until T052 passes
- [ ] T063 [US2] Create `packages/frontend/src/components/SignIn.tsx` and `packages/frontend/src/components/SignInError.tsx`, and route `/auth/callback` in `packages/frontend/src/App.tsx`, until T053 passes
- [ ] T064 [US2] Create `packages/frontend/src/components/PrivacyPage.tsx` and route `/privacy` in `packages/frontend/src/App.tsx` until T054 passes
- [ ] T065 [US2] Delete `packages/frontend/src/services/cognitoAuth.ts` and `tests/services/cognitoAuth.test.ts`, and remove `@aws-sdk/client-cognito-identity` from `packages/frontend/package.json`. This is a deletion, so the check is that the suite and typecheck stay green and `pnpm-lock.yaml` is committed

**Checkpoint**: Only an allowlisted, verified Google identity can obtain a token or open a counted session.

---

## Phase 5: User Story 3 - Spend is bounded, measurable and recoverable (Priority: P1)

**Goal**: A credits-excluded budget, a fail-loud hard stop owned by the Ops stack, an in-path breaker with soft-degrade, operations alarms and a manual recovery runbook ([spend-control.md](./contracts/spend-control.md)).

**Independent Test**: The budget, hard-stop, ops and breaker tests pass. Locally, seeding `SPEND#<yyyy-mm>` past the degrade threshold turns voice off, and past the trip threshold refuses with `breaker_tripped`. Live proof is V-11, V-12 and V-13.

### Tests for User Story 3 ⚠️ write first, confirm they FAIL

- [ ] T066 [P] [US3] RED: in `packages/infra/test/budget-stack.test.ts`:
  - `MaxHeight-Budget` takes no props from another stack.
  - `CostTypes` sets `IncludeCredit`, `IncludeRefund` and `IncludeDiscount` to `false`.
  - The 50% and 80% notifications email the owner only, and only the 100% notification publishes to the hard-stop topic.
  - The topic policy allows `budgets.amazonaws.com`, scoped to this account.
  - The stack contains no Lambda.
- [ ] T067 [P] [US3] RED: create `packages/infra/test/hard-stop.test.ts`. The handler writes `CONTROL#HALT` (`haltedAt`, `reason` `budget-100`) **before** attaching the deny policy to the runtime execution role. Any failure throws, with no swallowed `NoSuchEntityException` (#61). Running it again is idempotent
- [ ] T068 [P] [US3] RED: create `packages/infra/test/ops-stack.test.ts`. It covers these:
  - the hard-stop Lambda is subscribed to the Budget stack's topic, with IAM scoped to the control table and the runtime role
  - an `OpsAlarmTopic` with an email subscription, kept separate from the hard-stop topic
  - the four operations alarms from spend-control.md § Operations alarms, each with its metric, threshold and periods, all publishing to `OpsAlarmTopic`
- [ ] T069 [P] [US3] RED: create `packages/agent/tests/spend/breaker.test.ts`. After each turn, `estimatedMicroUsd` is `ADD`ed to `SPEND#<yyyy-mm>`. A tally at or above `BREAKER_DEGRADE_MICRO_USD` ($8 minus F) sets `degraded` true and turns voice off. A tally at or above `BREAKER_TRIP_MICRO_USD` ($10 minus F) refuses with `breaker_tripped` before any model call. The `breaker.check` span is recorded
- [ ] T070 [P] [US3] RED: in `packages/agent/tests/index.test.ts`, `CONTROL#HALT` refuses every request and every memory action with `halted`, with no `first_token` span. Refusals follow the order body → HALT → allowlist → rate limit → caps → breaker
- [ ] T071 [P] [US3] RED: update `packages/frontend/tests/services/budgetDegradation.test.ts`. `degraded` means text-only, and there is no `browser_tts` mode (research Q1). The change is announced once, in character
- [ ] T072 [P] [US3] RED: update `packages/frontend/tests/components/SessionStateOverlay.test.tsx` with the in-character hard-stop state for `halted` and `breaker_tripped`
- [ ] T073 [P] [US3] RED: update `packages/frontend/tests/hooks/useGreeting.test.ts`. The greeting uses a pre-rendered clip or text only, and never browser speech synthesis

### Implementation for User Story 3

- [ ] T074 [US3] Change `packages/infra/lib/budget-stack.ts` (cost types, topic only, the inline Lambda removed) until T066 passes
- [ ] T075 [US3] Implement `packages/infra/lib/handlers/hard-stop.ts` until T067 passes
- [ ] T076 [US3] Create `packages/infra/lib/ops-stack.ts` and add it after Data and Agent in `packages/infra/bin/app.ts` until T068 passes
- [ ] T077 [US3] Implement `packages/agent/src/spend/breaker.ts` and wire it, with the HALT check, into `packages/agent/src/index.ts` until T069 and T070 pass
- [ ] T078 [P] [US3] Change `packages/frontend/src/services/budgetDegradation.ts` until T071 passes
- [ ] T079 [P] [US3] Change `packages/frontend/src/components/SessionStateOverlay.tsx` until T072 passes
- [ ] T080 [P] [US3] Change `packages/frontend/src/hooks/useGreeting.ts` until T073 passes
- [ ] T081 [US3] Delete `packages/frontend/src/services/pollyTts.ts`, `src/services/browserTts.ts`, `tests/services/pollyTts.test.ts` and `tests/services/browserTts.test.ts`, and move `@aws-sdk/client-polly` from `dependencies` to `devDependencies` in `packages/frontend/package.json`, because `scripts/generate-greetings.ts` still uses it (deviation C4). The check is that the suite, typecheck and `typecheck:scripts` stay green

> **T082 moved to Phase 10.** It sets the `BREAKER_*` and `PRICE_*` values, which depend on T117's model-specific figures, so it cannot complete in this phase. The breaker code (T077) is written and tested against configuration, not against hardcoded numbers.

**Checkpoint**: Spend is capped in path (breaker), out of band (hard stop) and alerted (budget and alarms).

---

## Phase 6: User Story 4 - Identity comes from the token, not the client (Priority: P1)

**Goal**: The JWT `sub` keys every session, rate limit, cap and memory namespace. Client identifiers are ignored, and memory operations check ownership (#55, N3; [memory-api.md](./contracts/memory-api.md)).

**Independent Test**: With two test tokens, forged body identifiers and a foreign memory record ID have no effect, and a foreign runtime session ID gets `session_mismatch`. Live proof is V-05 and V-07.

### Tests for User Story 4 ⚠️ write first, confirm they FAIL

- [ ] T083 [P] [US4] RED: rewrite `packages/agent/tests/index.session-id.test.ts`. Body `sessionId` and `actorId` are ignored, and the `invocation` span's `countedSessionId` is the caller's. A runtime session ID owned by another `sub` gets `session_mismatch`, and that registry entry is not reused. A new runtime session ID continues the same counted session (strict continuity, P-05)
- [ ] T084 [P] [US4] RED: update `packages/agent/tests/index.cap-enforcement.test.ts` and `packages/agent/tests/handlers/sessionManager.test.ts`. There is at most one active session per `sub`. The caps are 50 turns, 20,000 conversational tokens and 30 minutes, where "`conversationalTokens` is the reply's `outputTokens`, measured from `result.metrics.accumulatedUsage`, plus the friend's message estimated at characters / 4 (P-09)". Reaching a cap signs off in character (`done` with `state` `SIGNED_OFF`). An exceeded session is `session_cap_exceeded`. Expiry is evaluated at the next request
- [ ] T085 [P] [US4] RED: in `packages/agent/tests/index.test.ts`, the rate limits are 60 messages per UTC hour and 500 per UTC day, keyed to `sub`. Exceeding either gives `rate_limited`, and "A refused message is not counted"
- [ ] T086 [P] [US4] RED: update `packages/agent/tests/memory/memoryHandlers.test.ts` and `memoryAdapter.test.ts`:
  - `memory.list`, `memory.export`, `memory.delete` and `memory.forget` act only within `/max-height/{sub}/`.
  - A record ID outside the caller's namespace is `not_found`.
  - `memory.forget` deletes every record and every short-term event for the caller's sessions, and reports `recordsDeleted` and `eventsDeleted`. It returns an error if anything is left (all-or-error).
  - A session opening calls `RetrieveMemoryRecords` with top-k 10, and each turn calls `CreateEvent` once.
- [ ] T087 [P] [US4] RED: create `packages/infra/test/memory-pruner.test.ts`. It deletes the records and events of each friend whose `lastSeenAt` is more than 30 days ago, then sets `memoryPrunedAt`. It has a single-friend mode, `{ sub }`. It keeps going after one friend fails and throws at the end
- [ ] T088 [P] [US4] RED: in `packages/infra/test/data-stack.test.ts`, assert the pruner Lambda, its daily EventBridge schedule, and IAM scoped to the memory and the control table
- [ ] T089 [P] [US4] RED: update `packages/frontend/tests/services/dataManager.test.ts`. "What Max remembers" lists, exports as a `.json` download, deletes and "forgets me" through the memory actions on `useAgentStream`, with no `localStorage` fallback

### Implementation for User Story 4

- [ ] T090 [US4] Key session lookup and caps to `sub` in `packages/agent/src/handlers/sessionManager.ts`, using `controlTable.ts`, until T084 passes
- [ ] T091 [US4] Add rate limiting, the `session_mismatch` check and the `lastSeenAt` update at session open to `packages/agent/src/index.ts` until T083 and T085 pass
- [ ] T092 [US4] Replace the stub in `packages/agent/src/memory/agentCoreMemoryClient.ts` with `@aws-sdk/client-bedrock-agentcore`, and add ownership checks in `packages/agent/src/memory/memoryHandlers.ts` and `memoryAdapter.ts`, until T086 passes. Update `packages/agent/src/memory/index.ts` exports
- [ ] T093 [US4] Implement `packages/infra/lib/handlers/memory-pruner.ts` and add it with its schedule to `packages/infra/lib/data-stack.ts` until T087 and T088 pass
- [ ] T094 [US4] Change `packages/frontend/src/services/dataManager.ts` until T089 passes

**Checkpoint**: No request can act on another friend's session, quota or memory.

---

## Phase 7: User Story 5 - Cheapest model that keeps character (Priority: P2)

**Goal**: Adopt the cheapest model that passes S0 and S1, measured against the cost model ([s0-probe-matrix.md](./contracts/s0-probe-matrix.md), [s1-golden-set.md](./contracts/s1-golden-set.md); research Q2).

**Independent Test**: S0 is recorded probe by probe, the S1 judge run passes (mean ≥ 2.0, 0 auto-fails), and `MODEL_ID` in the runtime configuration is the adopted model, pinned by `agent-stack.test.ts`.

- [x] T095 [US5] Run S0 probes S0-1 to S0-7 per s0-probe-matrix.md against `anthropic.claude-haiku-5-5` and `amazon.nova-lite-v1:0` in `us-west-2`, after the T004 approval. Record each probe's outcome, date and evidence in research.md § Spikes
- [x] T096 [US5] From S0's results, **provisionally** adopt the cheapest eligible candidate at the T005a prices, and record the shortlist in research.md § Q2. Q2 does not close here: FR-026 makes S1 character fidelity an input to the choice, so the decision closes in T100 when the provisional candidate passes S1. If it fails, the next-cheapest eligible candidate becomes provisional and S1 runs again
- [ ] T097 [US5] Once Q2 has closed (T100), if the adopted model is not Haiku-class, open amendment PR **A2** (the LLM row, MINOR) against `.specify/memory/constitution.md`; otherwise record "A2 not triggered" in research.md § Amendments. A2 must merge before T102 sets `MODEL_ID`
- [ ] T098 [P] [US5] RED: create `packages/agent/tests/evaluations/s1-golden-set.test.ts`. The golden set has exactly 65 cases with the categories and counts in s1-golden-set.md. The judge script scores 0–3, flags auto-fails, and computes pass as mean ≥ 2.0 with 0 auto-fails
- [ ] T099 [US5] Create the 65-case set in `packages/agent/src/evaluations/s1-golden-set.json` and the judge in `packages/agent/src/evaluations/s1-judge.ts`, updating `packages/agent/src/evaluations/personality-gate.ts` to use them, until T098 passes. A4 (T003) must be merged
- [ ] T100 [US5] Run S1 against the provisional candidate after approval, and record the per-case scores, the mean, the auto-fail count and the date in research.md § Spikes. A pass **closes Q2**: record the decision and its evidence in research.md § Q2, then run T097. A failure returns to T096 with the next candidate
- [ ] T101 [US5] Run S2 after approval: measure the system prompt and tool-schema token counts and whether the model's prompt-cache minimum is met. Record the result in research.md § Spikes and feed it to R-cost
- [ ] T102 [US5] RED then GREEN: pin `MODEL_ID` to the adopted model in `packages/infra/test/agent-stack.test.ts`, then set it in `packages/infra/lib/agent-stack.ts`

**Checkpoint**: The model is chosen on evidence, and the cost projection can be completed.

---

## Phase 8: User Story 6 - Decisions recorded and evidenced (Priority: P2)

**Goal**: Every decision, verification and issue disposition from this review is recorded where it lives: the wiki, the constitution, issues and spec 001 (FR-009; SC-007, SC-008, SC-009, SC-013).

**Independent Test**: Every row in research.md § Decision register has a wiki `Decision-*` page or a recorded reason for not having one. Every in-scope issue has a resolution comment, and `pnpm run wiki:lint` passes.

- [ ] T104 [P] [US6] Add dated annotations to `specs/001-max-height-ai-character/research.md` § R0 and § R4 pointing at this spec's superseding decisions (FR-009). Do not rewrite the frozen text
- [ ] T105 [P] [US6] Add a `C9` row to the deviations table of `specs/001-max-height-ai-character/tasks.md` recording that spec 003 supersedes the WebSocket transport, the Identity Pool, browser TTS and the budget-stack hard stop
- [ ] T106 [US6] `pnpm run wiki:pull`, then write or refresh the wiki `Decision-*` pages for Q0–Q9 in `wiki/`, update the `Component-*` and `Contract-*` pages the decisions change, and update `Index`. Append to `Log`
- [ ] T107 [US6] Apply the D-items batch from research.md § Wiki discrepancies to the owning pages in `wiki/`, append each disagreement to `Log`, and add `Gotchas` rows for new traps (for example the CfnBudget tagging gap and the hard-stop policy-name hash)
- [ ] T108 [US6] Run `pnpm run wiki:lint`, show the builder the diff, and run `pnpm run wiki:push -- "<message>"` only after approval
- [ ] T109 [P] [US6] Draft the resolution comments for #45, #47, #48, #49, #50, #55 and #61 from research.md § Issue dispositions in `specs/003-architecture-review/research.md`. Post each with `gh issue comment` only after builder approval, and file no new issues without asking
- [ ] T110 [US6] Open amendment PR **A3** (PATCH) against `.specify/memory/constitution.md` only after D10 is verified (research § Amendments); otherwise record it as pending
- [ ] T111 [US6] Update `AGENTS.md` and `specs/001-max-height-ai-character/quickstart.md` § MCP or setup sections only where this feature changed a durable convention: the `VITE_*` variables, the deploy context, the stack list and the SSM parameters. Per `AGENTS.md` § Keep this file current

**Checkpoint**: The review's outcomes are durable and public with approval.

---

## Phase 9: User Story 7 - Progressive replies and a true first token (Priority: P3)

**Goal**: Text renders as `text` deltas arrive, and the `first_token` span measures the first model token rather than reply completion (#45, SC-012).

**Independent Test**: In a local streamed reply with several `text` events, the UI updates before `done`, and the `first_token` span ends before `reply.complete`.

- [ ] T112 [P] [US7] RED: update `packages/agent/tests/handlers/observability.test.ts`. `first_token` ends when the first model text delta is emitted, before `reply.complete`. The spans `invocation`, `breaker.check`, `memory.retrieve` (with `count`), `first_token` and `reply.complete` (with `pollyCharacters`) carry the attributes in transport-sse.md § Spans
- [ ] T113 [P] [US7] RED: update `packages/frontend/tests/components/BroadcastText.test.tsx` and `packages/frontend/tests/stores/conversationStore.test.ts`. Text deltas append progressively, and `done` finalizes the turn
- [ ] T114 [US7] Change `packages/agent/src/handlers/observability.ts` and the stream loop in `packages/agent/src/index.ts` until T112 passes
- [ ] T115 [US7] Change `packages/frontend/src/stores/conversationStore.ts` and `packages/frontend/src/components/BroadcastText.tsx` until T113 passes

**Checkpoint**: Replies feel live, and spec 001 FR-004 can be evaluated against a real first token.

---

## Phase 10: First deployment and live validation

**Purpose**: Run [quickstart.md](./quickstart.md) end to end. Record every outcome in quickstart.md § Results, with no personal data.

- [ ] T116 Run `pnpm run validate` on the commit to deploy; every RED test in quickstart § RED tests is green (prerequisite 11)
- [ ] T117 Re-run research.md § R-cost with the model Q2 adopted (T096, T100) and S2's measured token counts (T101), on the prices the builder dated in T005a. Re-read any price older than 30 days. Confirm the projection is still at or below $8 gross of credits (SC-002, gate 1), then compute F and the breaker limits `BREAKER_DEGRADE_MICRO_USD` ($8 − F) and `BREAKER_TRIP_MICRO_USD` ($10 − F)
- [ ] T082 Fill in the `BREAKER_DEGRADE_MICRO_USD`, `BREAKER_TRIP_MICRO_USD` and `PRICE_*` values in `packages/infra/lib/agent-stack.ts` from research § R-cost, using T117's computed figures. Do not invent a number; if a price is unread, leave the deploy blocked (moved here from Phase 5, because it depends on T117)
- [ ] T118 Record quickstart prerequisites 1–10 in quickstart.md § Results: the Free plan end date, model quotas, one-time admin setup, ARM64 build path, SSM parameters, Cognito prefix, Google OAuth client and the second account
- [ ] T119 Deploy steps 1–2: `MaxHeight-Budget`, then activate the `project` cost-allocation tag (prerequisite 12)
- [ ] T120 Deploy steps 3–5: `MaxHeight-Certificate` (add ACM's validation CNAME at GoDaddy), `MaxHeight-Data` and `MaxHeight-Cognito`
- [ ] T121 Deploy step 6: `MaxHeight-Agent`, then run V-01 and record W26 in research.md § Verification record
- [ ] T122 Deploy step 7: `MaxHeight-Ops`; confirm the alarm-topic subscription and that the four alarms exist
- [ ] T123 Deploy steps 8–11: build the frontend from `packages/frontend/.env.production.local`, deploy `MaxHeight-Frontend`, add the GoDaddy `max` CNAME, run V-06, then allowlist the builder only
- [ ] T124 Run V-02 and V-15. If V-02 fails, stop: the Lambda streaming proxy fallback is a new resource and needs costing and approval first (plan § Complexity Tracking)
- [ ] T125 Run V-03, then V-13 before any friend is allowlisted
- [ ] T126 Run V-14 (spike S4, after approval). If in-process state does not survive, cost the short-term Memory history fallback in R-cost before adopting it
- [ ] T127 Run V-07, V-05 and V-04 with the second account, and record the Q8 extraction time
- [ ] T128 Run V-08, V-09, V-10 and V-16
- [ ] T129 Run V-11, then V-12 including recovery. SC-005 requires recovery to succeed on the first attempt; if it does not, fix the runbook in spend-control.md and repeat
- [ ] T130 Invite friends: one `put-item` per friend, recorded only in the operator's log
- [ ] T131 Run V-17 after the first full month and before the Free plan ends. Record Cost Explorer by service, `MaxHeight-Monthly` actuals, the R-cost projection and a Pricing Calculator estimate side by side under Q7 (SC-010, SC-019)

---

## Phase 11: Polish & Cross-Cutting Concerns

- [ ] T132 [P] Update the Playwright specs in `packages/frontend/tests/e2e/` for the sign-in gate and the SSE transport, with network mocks only and no live AWS
- [ ] T133 [P] Record any trap hit during implementation on its owning wiki page with a `Gotchas` row, in the same change (approval before `wiki:push`)
- [ ] T134 Run `pnpm audit` and `pnpm run validate` as the final gate

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies. T003 (A4) must merge before T099–T100. T004 must be approved before any spike. **T005a (the gate 1 cost projection) and T103 (spec patches P-01 to P-15) both block Phase 2**: the constitution requires the cost estimate before implementation begins, and spec.md must agree with what Phases 2–9 build. T005b is recorded before Phase 2 so a lens finding can be raised before code depends on the decision it touches.
- **Amendment gates (FR-002)**: an amendment merges before the tasks that depend on it.
  - **A1** (IaC becomes CDK-only, T002) merges before **T024** and **T025**, which build the agent runtime with CDK alone. Until it does, the tech table still reads "AWS CDK + AgentCore CLI" (`constitution.md:237`) and those tasks would deviate from it.
  - **A4** (T003) merges before **T099** and **T100**.
  - **A2** (T097) is resolved, either merged or recorded as "not triggered", before **T102** pins `MODEL_ID`.
  - **A3** (T110) waits on D10 and gates nothing.
- **Foundational (Phase 2)**: Depends on T001 (dependencies installed), T005a and T103. It blocks every story.
- **US1, US2, US3, US4 (Phases 3–6)**: Each depends on Phase 2. They touch shared files (`packages/agent/src/index.ts`, `packages/infra/lib/frontend-stack.ts`, `packages/frontend/src/App.tsx`), so run them in order when working alone: US1 → US2 → US3 → US4.
- **US5 (Phase 7)**: Depends on T004, T003 and T005a (the price baseline its candidate comparison uses). Its spike runs can proceed in parallel with Phases 2–6; T102 needs T025 and T097.
- **US6 (Phase 8)**: T104–T105 and T109 can start at any time; T103 has moved to Phase 1. T106–T108 should follow Phase 10 so the wiki records the as-built and verified state. T110 waits on D10.
- **US7 (Phase 9)**: Depends on US1 (T037, T039).
- **Deploy (Phase 10)**: Depends on US1–US5 and T005. T117 precedes T082, and both precede the first spend-bearing deploy. US7 is recommended but not required.
- **Polish (Phase 11)**: Depends on all desired stories.

### Within Each User Story

- RED tests are written and seen to fail for the intended reason before their implementation.
- Infra handlers come before the stacks that deploy them; agent modules come before `index.ts` wiring; hooks and services come before `App.tsx`.
- A deletion task follows the task that removes its last importer.

### Parallel Opportunities

- Phase 1: T002, T003 and T004.
- Phase 2: T011, T015, T016, T017 and T018 together; then T020, T021 and T022 together.
- Every story's RED tests marked [P] can be written together, because each is in its own file. The exception is `packages/agent/tests/index.test.ts`, which several stories edit, so serialize those edits.
- US5's spike runs (T095–T101) proceed alongside the code phases.

---

## Parallel Example: User Story 1

```text
# RED tests together:
T028 agentRegistry.test.ts   T029 pollyStream.test.ts   T031 useAgentStream.test.ts
T032 buildConfig.test.ts     T033 useAudio.test.ts      T034 frontend-stack.test.ts

# Then independent implementations together:
T035 agentRegistry.ts   T036 pollyStream.ts   T038 tools/*   T039 useAgentStream.ts
```

## Parallel Example: User Story 2

```text
# RED tests together:
T046 pre-sign-up.test.ts   T047 pre-token-generation.test.ts   T048 idp-secret.test.ts
T051 spa-rewrite.test.ts   T052 auth.test.ts                   T054 PrivacyPage.test.tsx

# Handlers together:
T055 pre-sign-up.ts   T056 pre-token-generation.ts   T057 idp-secret.ts   T060 spa-rewrite.js
```

## Parallel Example: User Story 3

```text
T066 budget-stack.test.ts   T067 hard-stop.test.ts   T068 ops-stack.test.ts   T069 breaker.test.ts
T078 budgetDegradation.ts   T079 SessionStateOverlay.tsx   T080 useGreeting.ts
```

## Parallel Example: User Story 4

```text
T083 index.session-id.test.ts   T086 memoryHandlers.test.ts   T087 memory-pruner.test.ts   T089 dataManager.test.ts
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup, then Phase 2 Foundational.
2. Phase 3 (US1). **Stop and validate** locally: a streamed, voiced reply through `/invocations`.
3. The MVP is demonstrable locally but **not deployable to friends**. A real deployment also needs US2 (access control), US3 (spend bounds), US4 (identity) and US5 (model and cost projection), per quickstart prerequisites 2, 3 and 11.

### Incremental Delivery

1. Setup + Foundational → foundation green.
2. US1 → local conversation.
3. US2 → gated access (V-03, V-06 become possible).
4. US3 → bounded spend (V-11 to V-13).
5. US4 → identity integrity (V-05, V-07).
6. US5, run in parallel from the start → model adopted and costed.
7. Phase 10 → first deployment and validation; then invite friends.
8. US7 → progressive replies; US6 → decisions published.

### Parallel Team Strategy

- Developer A: US1 then US7 (agent and frontend transport).
- Developer B: US2 then US3 infra (Cognito, triggers, CloudFront, budget, ops).
- Developer C: US5 spikes, then US4 memory.
- The builder: approvals (T004, T005, amendments, wiki pushes, issue comments) and US6.

---

## Notes

- [P] tasks touch different files and have no dependency on an incomplete task.
- Never invent a hard number. Every threshold here comes from spec.md, data-model.md, a contract or research.md, and the breaker and price values wait on T117.
- Every spend-bearing action (spikes, deploys) needs a dated builder approval (FR-003).
- Wiki pushes and issue comments are public; get approval before each.
- Use "Max Height", never "Max Headroom", in any user-visible string.
- Commit after each task or logical group, using Conventional Commits.

---

## Phase 12: Convergence

Scoped to the 2026-10-30 clarification session (spec.md § Clarifications): cross-Region inference profiles are eligible when S0 proves them, S0 gains S0-8 and S0-9, and the cost-measurement month may straddle the Paid upgrade. Existing tasks are not edited; T096 stays checked and T139 supersedes its shortlist.

- [x] T135 Add S0-8 (`us.amazon.nova-2-lite-v1:0`) and S0-9 (`us.anthropic.claude-haiku-5-5`, thinking off as in S0-4) to `specs/003-architecture-review/contracts/s0-probe-matrix.md` and to `specs/003-architecture-review/scripts/s0-probe.ts`, each one Converse call with `maxTokens: 16`. Correct S0-1, S0-2 and S0-5's "Denied … cannot ship" wording to the recorded results per FR-003 and spec.md § Clarifications 2026-10-30 (missing)
- [x] T136 Record the builder's 2026-10-30 approval of S0-8 and S0-9 in research.md § Spikes (T004), run both probes in `us-west-2` with the builder's temporary credentials, and record each outcome, date and evidence in research.md § Spikes per FR-003 (missing)
- [x] T137 Reconcile research.md with the clarification: Q0 (`:47`, `:49`) records the Free plan's documented lack of cross-Region support as recorded, not as a rejection; the Q2 table (`:102-104`) and `:108` re-rate Haiku 4.5 as eligible via S0-1 and S0-2, and Nova 2 Lite and Haiku 5.5 by T136's results; S1 (`:311`), W32 (`:350`), D1 (`:364`) and #50 (`:384`) drop "cannot ship" and "ineligible on the Free plan". Hand-edit plan.md `:26`, `:63` and `:81` to match, and do not run `/speckit.plan` (it regenerates destructively) per FR-025 and FR-028 (contradicts)
- [ ] T138 Re-run research.md § R-cost's gate 1 projection (T005a) on the clarified candidate set, which now includes Haiku 4.5 and any of Nova 2 Lite or Haiku 5.5 that T136 proves. If the most expensive candidate's projection exceeds $8 gross of credits, record it and raise it with the builder (mitigation under FR-024, or bounding the candidate set) rather than inventing a figure per FR-024, SC-002 and constitution gate 1 (partial)
- [ ] T139 After T136 and T138, redo T096's provisional adoption over every S0-eligible candidate at the T005a prices, record the new shortlist in research.md § Q2, and continue to S1 (T100) with the cheapest per FR-026 (partial)
- [ ] T140 Make `specs/003-architecture-review/contracts/runtime-config.md` `:18` (`MODEL_ID`) and `:72` (execution-role Bedrock resources) allow the route Q2 adopts. If that route is an inference profile, verify AWS's documented IAM pattern for it at the point of use, keep the statements region-scoped where supported (constitution P11), and pin the resources RED then GREEN in `packages/infra/test/agent-stack.test.ts` with T024 and T102 per FR-028 (contradicts)
- [ ] T141 Replace "in-Region" with "S0-proven route" in `specs/003-architecture-review/contracts/s1-golden-set.md` `:9`, `:22` and `:34`, and drop the claim that Haiku 4.5 cannot be invoked per FR-028 (contradicts)
- [ ] T142 Change V-17's **When** in quickstart.md (`:268`) and plan.md `:69` to "after the first full month of friends' use", which may straddle the Paid upgrade. T131 runs on that timing, not "before the Free plan ends", per SC-019 and FR-028 (contradicts)
- [ ] T143 If S0-9 was refused as "not available for this account", re-probe Haiku 5.5 after the Paid upgrade with a fresh dated approval, and record the result for a later model review. This gates nothing in this feature per FR-026 and spec.md § Spikes S0 (missing)
