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
| C5 | spec.md § Clarifications 2026-11-02 re-scopes US5 for the first deployment. Haiku 4.5, today's model (`index.ts:96`), is adopted on the cheaper of its S0-proven profiles. S1, amendment A4 and FR-026's comparison move to a post-upgrade model review. S2 runs after the first deployment, and #50 is deferred (FR-038). Phase 7's Goal and Independent Test (an S1 pass) now apply at that review (checked 2026-11-02). | **Deferred to the post-upgrade model review (T152)**: T003 (A4), T097 (A2 for a non-Haiku winner), T098, T099, T100, T139's continuation to S1, T141, and T004's S1 estimate and approval. T096's provisional Nova Lite v1 adoption is superseded by T144 and stays checked. **Re-timed**: T101 (S2) runs after T121 deploys the agent. **Split**: T144 records Q2 and "A2 not triggered" for the first deployment, so T102 waits on T144 instead of T097. T145 narrows T138's candidate set. T146 runs T117 and T082 on estimated tokens instead of T101's. |
| C7 | spec.md § Clarifications 2026-11-02 raises the monthly ceiling from $10 to $20 (hard cap $20, owner emails at $10 and $16, soft-degrade at $16 − F, breaker trips at $20 − F, gate 1 at $16; the builder stays on the classic AWS account in `us-west-2`, and AWS's new account experience is not adopted). The constitution (v1.5.0) still says $10, $5/$8 and an $8 gate, and it is supreme, so these figures take effect only when amendment A5 merges (checked 2026-11-02). **Unedited tasks that still hard-code the old figures**, to be read as the A5 values once it merges: T005a, T069, T117, T138, T146 (unchecked) and T145 (checked, left as is). F is still unsized (T005a, T138). | **Added**: T153 (A5), T154 (#47 before first deployment), T155 (BudgetStack amounts, hard stop and tests), T156 (post-measurement ceiling review), T157 (hand-edit the artifacts that hard-code $10). T153 blocks any task that sets an amount (T066, T069, T074, T155, T082, T117's limits). Nothing is marked done. |
| C8 | Builder decision 2026-11-13 (research.md § Builder decisions): T005b, the FR-005 lens assessment, is deferred until after the first deployment, because the assessment is easier against deployed resources and the AWS credits are time-limited. Phase Dependencies still says it is recorded before Phase 2. | **Re-timed**: T005b runs after T121 deploys the agent and before Phase 11. A finding that would change a Q0–Q9 decision still stops and goes to the builder, and is reconciled with `/speckit.converge`. FR-005 is unmet until then. Nothing is marked done. |
| C9 | Builder decision 2026-11-13: amendment A5 lands on this feature branch, not in its own PR as FR-002 and T153 required ("We don't need a PR - we are doing this work in the current branch"). The constitution's procedure (a PR modifying the file) is met by this branch's PR into `main`. The cost: the $20 ceiling is reviewed inside one large PR instead of on its own. | **Applied**: constitution 1.5.0 → 1.6.0 (MINOR, the builder's choice), T153 and T157 done in the same commit; FR-002 records the exception. From 2026-11-13, A5 counts as merged for every "until A5 merges" condition on this branch, which unblocks T066, T069, T074, T155, T117 and T082 as far as A5 is concerned. `budget-stack.ts` still encodes $10 until T155. |
| C10 | Builder decision 2026-11-13 (spec.md § Clarifications 2026-11-13, research.md § Q1): the voice engine changes from Polly Neural to **Polly Standard, voice Matthew**, to bring the gate 1 projection under budget without mitigation. The constitution's tech table named Neural, so amendment **A6** is applied on this branch on the C9 route (MINOR, 1.6.0 → 1.7.0). Neural-specific text remains in frozen spec 001, the S0-7 probe record (what was run), and code (`greetingGenCore.ts`, `pollyTts.ts`). | **Edited**: T029 (Standard engine) and T158 (probe and regeneration on Standard, and the first listen to Standard Matthew). T081 deletes `pollyTts.ts` unchanged. If Standard Matthew fails by ear at T158, the builder re-decides and A6 may be reverted. |
| C11 | 2026-11-13: amendment **A1** (IaC becomes CDK-only) lands on this branch on the C9 route (MINOR, 1.7.0 → 1.8.0), not in its own PR as FR-002 and T002 required. The decision itself is the builder's, 2026-10-11 (research.md § Builder decisions, Q8); the builder's 2026-11-13 direction to do this work on the current branch covers the route. | **Edited**: T002 (checked). T024 and T025 now build the runtime with CDK alone in agreement with the tech table. |
| C12 | 2026-11-15, T006/T010. (a) T006 asserts on the whole app, but `bin/app.ts` synthesizes at import. (b) In `aws-cdk-lib` 2.276.0, `synthesize()` runs Aspects **before** `prepareApp`, and `prepareApp` creates the `crossRegionReferences` export writer and reader Lambdas (`core/lib/private/synthesis.js`), so an Aspect's `visit` never sees them — the case research § R-obs said must be proven, not assumed. | (a) The app composition moved to `packages/infra/lib/max-height-app.ts` (`buildMaxHeightApp`); `bin/app.ts` calls it and synthesizes. Stack wiring that tasks place "in `bin/app.ts`" goes there. (b) The Aspect (C2's file) registers a stack validation hook, which runs after `prepareApp`, and copies the stack's tags onto each group it adds, because `Tags.of` has already run. `test/log-retention.test.ts` proves the writer and reader are reached, and fails if the work moves into `visit`. |
| C13 | 2026-11-15, T007/T009: research § R-deploy said `CfnBudget` is not `ITaggable` (2.272.0). In 2.276.0 (Dependabot) it implements `ITaggableV2`, and `Tags.of(app)` sets the budget's `ResourceTags` (synth probe). T006's app-wide tag test already covers it: `MaxHeight-Budget/MonthlyBudget` was in its RED list. | T007 and T009 are **satisfied by T006**; no explicit `resourceTags` was added, since it would duplicate the app-wide tag. research § R-deploy carries a superseded note. |
| C14 | 2026-11-15, T013. (a) T013 asks to assert the **provisioned** capacity "recorded in research § R-cost", but R-cost records none. Its builder-approved F line (T005a, 2026-11-13) prices the table **on demand** at about $0.01 a month, and plan § Storage and data-model.md said "provisioned within Always Free" without a number. No RCU or WCU was invented. (b) T013's namespaces say `{sub}`; memory-api.md § Resource uses AgentCore's `{actorId}` placeholder (always the verified `sub`) with a trailing slash, and `{sub}` is not a placeholder the service substitutes. | (a) The table is `PAY_PER_REQUEST`, as the approved F prices it. The test asserts that and the absence of `ProvisionedThroughput`, so a billing-mode change still fails it. plan.md and data-model.md now say on demand. **Builder decision 2026-11-15: keep on demand.** Always Free provisioned capacity would save about $0.01 a month but throttle bursts (transactional rate-counter writes cost double), and the rate limits and breaker already cap spend. (b) Built to memory-api.md. |
| C15 | 2026-11-15, T024/T025. (a) T024's allowlist names `X-Amzn-Bedrock-AgentCore-Runtime-Session-Id`, but AgentCore restricts every `x-amzn-` header except the `X-Amzn-Bedrock-AgentCore-Runtime-Custom-` prefix ([runtime-header-allowlist](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-header-allowlist.html), read 2026-11-15); runtime-config.md already says `Authorization` only. (b) T025 says wire the stack in `bin/app.ts`, but its JWT authorizer needs the user pool and app client, which arrive with T058. (c) Four runtime variables have no derived value yet: `BREAKER_DEGRADE_MICRO_USD`, `BREAKER_TRIP_MICRO_USD` (T117), `PRICE_MEMORY_EVENT_MICRO_USD`, `PRICE_RUNTIME_PER_TURN_MICRO_USD` (T082). (d) runtime-config.md names no search parameters. | (a) The allowlist is `['Authorization']`. The session ID header is part of the runtime's own invocation contract, not a forwarded custom header; **verify at V-01** that the container receives it. (b) `AgentStack` takes the table, memory, user pool and client as props, and `max-height-app.ts` no longer instantiates the old WebSocket stack. **T058 wires it.** (c) No values were invented: each missing one is left out and adds a CDK **error annotation** naming its task, so `cdk synth` of the Agent stack fails until T082 and T117 land. (d) `/max-height/search-api-key` and `/max-height/search-engine-id` were chosen and written into the contract. **Unverified until V-01**: whether AgentCore reserves `AWS_REGION`, whether `bedrock:ListAsyncInvokes` takes a resource type (`*` used), and that no `GetWorkloadAccessToken*` grant is needed (omitted: no outbound Identity use). |
| C16 | 2026-11-15, T016: `sub` and `email` are to come from the token, but the bearer is a Cognito **access** token (auth-and-allowlist.md:57), which carries no `email` claim. | `jwtClaims.ts` requires `sub` and treats `email` as optional. The allowlist check (T049, T059) must read the email from `FRIEND#<sub>` (auth-and-allowlist.md:99), not the token. |
| C17 | 2026-11-15, T015/T023. (a) T023 says build with `docker buildx build --platform linux/arm64 packages/agent`, but the workspace lockfile is at the repo root, and pnpm 11 `deploy` does not fit. (b) T015 says `/ping` stays `503` while configuration is missing, but `src/index.ts` listens only after `initialize()` succeeds, so a misconfigured container exits 1 naming the missing values and `/ping` never answers. (c) `data-model.md` gives no grace window for `SESSION#<sub>.ttl`. | (a) The image builds from the root with `-f packages/agent/Dockerfile`, filtered by `packages/agent/Dockerfile.dockerignore`; CDK reads only a root `.dockerignore`, so `AgentStack` passes that file's patterns as `exclude`. (b) **Fixed 2026-11-15 (builder decision)**: `start()` in `src/index.ts` listens first and answers `/ping` with `503` while `initialize()` runs; if initialization fails it logs the cause, closes the listener and exits 1. `tests/index.readiness.test.ts` § startup sequence pins both. (c) The grace window is a required injected option with no default. **Open**: T049–T059 must pick the number, and record it in data-model.md. |
| C6 | Checked 2026-11-02 while running T144–T146. (a) **T138 and T005a are still open**, so T145 had no existing projection to narrow. T145 computed the Haiku 4.5 route's conversation lines (LLM plus Polly) itself, as a **floor** in research.md § R-cost "Gate 1 projection on the adopted route". F (Runtime V2, Memory, infrastructure, logs, spans) is not sized and stays with T005a and T138. (b) **The floor already exceeds $8 gross**: about $9.56 for 795 average turns on the global route, before F. T145 records it and raises it with the builder (FR-024, SC-002, gate 1) rather than choosing a mitigation. (c) **T146 is split**: its estimate marking, the route's derived `PRICE_*` values and the `CACHE_READ = 0` rule are recorded in § R-cost, but T117's F and breaker limits need T005a, and T082 has no target (no `BREAKER_*` or `PRICE_*` value exists in `packages/`; T077 and T025 are unbuilt). T146 stays open for those, and for the post-T101 re-projection. (d) The T144 and T145 insertions shift the research.md line numbers that T147 and T148 cite (`:131`, `:337`, `:338`, `:410`, `:447`); locate those by heading. (e) runtime-config.md `:72` ("`us-west-2` only. No inference-profile ARN") is wrong for either profile: AWS's documented pattern needs the profile ARN, and for the global profile a Region-less foundation-model ARN that cannot be limited to `us-west-2` (research.md § Q2, "IAM for T140"). | T144 records the finding for T140; T146 stays unchecked with the open parts named here. |
| C18 | 2026-11-15 deployment review: T017/T021 covered item shapes but left control reads eventually consistent and session writes unconditional. Strong reads alone cannot prevent concurrent lost updates or stale state replacement. | T159/T160 add strong reads and create-if-absent / expected-snapshot session writes. Conflicts propagate; the new runtime's identity, concurrency, reservation and finalization wiring is still pending. |
| C19 | 2026-11-15 deployment review: T018/T022 fixed the nonexistent `result.usage` path, but the replacement `metrics.accumulatedUsage` is Agent-lifetime usage. T035 reuse would double-count earlier calls. | T161/T162 move the reader and dependent handler fixtures to request-scoped `invocationContext.usage`, with a real-SDK/mocked-transport regression. No lifetime fallback. Cancelled/error settlement and admission remain T030/T166/T167. |
| C20 | 2026-11-15 builder approval resolves C17(c)'s cleanup number to 15 minutes and approves the safety profile in spec.md's Session 2026-11-15. The $5 non-chat allocation / $11-$15 application thresholds change P2's guarantee, while the old F-only target and inactivity-only pruning appear throughout earlier artifacts. | T163-T174 track the remaining work. The P2 amendment is authorized but unapplied, and no deploy is authorized. T173 reconciles the older target text without destructive regeneration. Existing T059/T090/T091 wire the session grace and verified identity; T172 verifies true 30-day retention. |
| C21 | Phase 15 cites `docs/reviews/2026-11-15-agent-infra-deployment-review.md` as its source, but that file was never committed and the directory is empty. The review's findings survive only as T159-T174, so a reader cannot check a task against what the review actually said. | The tasks are the record; they are not re-derived from the lost document. Transient review documents are deliberately not checked in (AGENTS.md § Code reviews are not artifacts) — a review that matters is converted into tasks, issues or a wiki page in the same session, and spec artifacts cite those instead of a review file. |
| C22 | T164 says "bound and reserve the final call". The bounding half (limits module, runtime config, CDK variables) has no dependencies; the reservation half needs the control table's conditional admission, which is T167's subject. | T164 is complete for the bounding half only: `packages/agent/src/limits/turnLimits.ts`, the eight `TURN_*`/`*_MAX_BYTES` variables in `runtime-config.md` and `agent-stack.ts`, and handler wiring. Conservative pre-spend reservation stays in T167 and is not claimed here. The between-call overshoot is documented in `turnLimits.ts` and `runtime-config.md` rather than papered over. |
| C23 | T117 as written computes the breaker limits as $16 − F and $20 − F from a measured F (C6(c), C7). Constitution 1.9.0 P2's application layer (amendment **A7**, applied 2026-11-16 under T165) instead fixes them at **$11 and $15** and reserves a flat $5 for the lines the application never meters, plus pricing uncertainty. A limit derived from F moves every time the projection is re-run, so no one can state today's ceiling without re-deriving it. | T117 is closed on the A7 basis, not the F basis, and T082 sets 11,000,000 / 15,000,000 in `agent-stack.ts`. The F-derived formulas are marked superseded in `research.md` § Q6 and § F and in `contracts/runtime-config.md`. The $5 is a budget allocation, not a verified price; S2 (T101) still re-projects gate 1 on measured tokens, and that re-projection no longer changes the limits. The two outstanding `PRICE_*` values were derived the same day: 13 µUSD per Memory event (the 12 KiB billing minimum, which `MESSAGE_MAX_CHARS` and `MAX_OUTPUT_TOKENS` keep every event under) and 831 µUSD per turn of Runtime V2 (§ F's average case, the dearer of the two per turn). |
| C24 | T083/T091 pair a RED test with its implementation, but the identity half of T091 was needed before anything else could be trusted to spend money, while the counted-session registry T083 also covers is a larger change tied to T090. Building both together would have left the handler taking its actor from the request body for several more commits. | The identity half was split out and built on its own against a new file, `packages/agent/tests/index.identity.test.ts` (6 tests), rather than the rewrite of `index.session-id.test.ts` that T083 specifies. T091 is annotated with what is built and what is not; T083 stays open and its rewrite must still happen. Four handler test files moved to a shared `tests/fixtures/http.ts` so every request they send carries a token — a test that omits one is now testing the refusal. |
| C25 | T034 and transport-sse.md § CloudFront behavior specify a **custom** origin request policy naming exactly `Authorization`, `Content-Type`, `Accept` and the runtime session-ID header, with no cookies and only the `qualifier` query string. That is not buildable: CloudFront rejects `Authorization` in an origin request policy's header allow-list, and CDK 2.275.0 fails synthesis with `CannotPassAuthorizationOrAcceptEncodingHeaders`. AWS's documented answer, when caching is off, is a managed policy. | The behavior uses the managed **`AllViewerExceptHostHeader`** policy (`b689b0a8-53d0-40ab-baf2-68738e2966ac`). Every header the contract listed still reaches the origin, and `Host` still does not — the property that actually matters, since `max.recipieces.com` does not resolve at `bedrock-agentcore`. The cost is that other viewer headers and cookies are forwarded too; the app sets no cookies on its own domain, and the runtime ignores unknown headers. The test asserts the managed policy ID **and** that no custom origin request policy exists, so a Host-forwarding policy cannot be slipped back in. transport-sse.md § CloudFront behavior is corrected with the evidence. |
| C26 | T037's SSE rewrite changed three things the contract did not yet say, and one it said in the wrong place. (a) transport-sse.md § Events lists a `voice` field on the `session` event but § Body had no way for the browser to ask for it, so a muted friend could not stop us paying Polly. (b) The contract has no `unauthenticated` error code, yet a request can reach the container with no usable `sub`. (c) T027 names `index.test.ts`, which is the module's own unit-test file; the transport is an integration-level contract. (d) Voice is synthesized after the reply text completes rather than "as reply text completes". | (a) § Body gains an optional `voice: "on" \| "off"`, defaulting to `"on"`, and the browser is told to read the `session` event's `voice` rather than assume its request was honoured. (b) That case is `internal`, and the error table now says so: the platform's JWT authorizer should already have refused it, so it is a misconfiguration, not a friend error. (c) The tests live in a new `packages/agent/tests/index.transport.test.ts`, with shared doubles in `tests/fixtures/sse.ts` and `tests/fixtures/strands.ts` that the four converted handler test files now use instead of five copies of `makeRes`. (d) Audio still precedes `done`, so playback is not blocked on the whole turn, but time-to-first-audio is worse than the contract's intent; interleaved per-sentence synthesis is deliberately deferred and not claimed. Every refusal in the handler is now an SSE `error` event on a 200 response — the five converted test files previously asserted HTTP 400/413/429, which the contract forbids. |
| C27 | T032 and runtime-config.md § Frontend build say a **production** build fails when any `VITE_*` value is missing. Taken literally that breaks `pnpm run build`, and therefore `pnpm run validate` and the required `CI` check, for every contributor and for CI itself: `vite build` defaults to production mode, and no one holds the deployment values — they come from stack outputs that do not exist yet. A gate that cannot pass is not a gate. | The check applies to a **deploy build**: a production build that either sets `MAX_HEIGHT_DEPLOY=1` or carries some of the five values but not all of them. A half-written `.env.production.local` is always a mistake and still fails. A production build carrying none of them deploys nothing, so it compiles and ships to no one. `isDeployBuild` is tested alongside `assertBuildConfig`, both triggers were exercised against a real `vite build`, and runtime-config.md § Frontend build and quickstart step 8 record the flag. T031's `not_allowlisted` → denied mapping also required a `DENIED` session state, which spec 001's `SessionState` lacked; it carries the single constant FR-043 line from auth-and-allowlist.md § Denial copy. |
| C28 | T072 and T079 ask for the in-character hard-stop overlay state for `halted` and `breaker_tripped`. Both codes already map to `BUDGET_CAPPED` (`useAgentStream.ts` `ERROR_OUTCOMES`, pinned at `tests/hooks/useAgentStream.test.ts`), and `SessionStateOverlay` already renders the in-character break line for that state, pinned by `renders budget message for BUDGET_CAPPED state`. | **No behavioral delta**, so no RED test was written: the work was already done by T031's error mapping and spec 001's overlay. The check is that both existing tests stay green. T072/T079 are marked done on that evidence rather than on new code. |
| C29 | T065 deletes `cognitoAuth.ts` and its `@aws-sdk/client-cognito-identity` dependency, and is listed under US2's infra work, but nothing in the browser imported it once T062's `auth.ts` landed. | Done in the same commit as T081, which performs the identical move for `@aws-sdk/client-polly`. Neither deletion has a behavioral delta; the check is that the suite, `typecheck` and `typecheck:scripts` stay green, and that the browser bundle ships neither SDK. |
| C30 | spend-control.md § Operations alarms leaves the AgentCore Runtime server-error metric as "exact name checked at task time". AWS documents the metric only by its console display name, "System Errors", in the `AWS/Bedrock-AgentCore` namespace, and documents dimensions for the resource-usage metrics only ([observability-runtime-metrics](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability-runtime-metrics.html), read 2026-11-17). | The alarm uses `SystemErrors` in `AWS/Bedrock-AgentCore` with **no dimensions**, which is the account-wide aggregate. The account runs one runtime, so the aggregate is the runtime. Guessing an undocumented dimension name would produce an alarm that silently never fires. The name and the data must be confirmed against a live account during deployment validation, and the alarm treated as unproven until then. |
| C31 | spend-control.md names a `BreakerWriteFailures` runtime custom metric but no namespace, and the agent has no metrics client. | The breaker emits CloudWatch **embedded metric format** on stdout under namespace `MaxHeight`, which AgentCore's log pipeline turns into a metric without any new dependency. `ops-stack.ts` exports `RUNTIME_METRIC_NAMESPACE` and alarms on the same pair, and `breaker.test.ts` pins the emitted envelope. |
| C32 | T076 says to add the ops stack to the app "after Data and Agent". It could not be wired at the time: it needs the runtime execution role from `AgentStack` and the pruner function from `DataStack`, which arrived with T093. | **Closed.** `OpsStack` is now the last stack in `max-height-app.ts`, taking `budget.hardStopTopic`, `data.controlTable`, `agent.executionRole` and the new `data.prunerFunction`. `app.test.ts` asserts the seven-stack list and that Ops depends on Agent, Budget and Data. |
| C33 | `auth-and-allowlist.md` § Cognito resources and quickstart rows 8–9 treat the Cognito domain prefix and the Google OAuth client ID as constants committed to `cognito-stack.ts` once the builder chooses and registers them. Neither value exists, and the builder was unavailable for the whole of this session. | Both arrive as CDK context (`-c cognitoDomainPrefix=… -c googleClientId=…`), matching the existing `budgetAlertEmail` pattern. A missing one throws from the `CognitoStack` constructor, naming the context key and the quickstart row. Committing invented values was rejected: a domain prefix is globally visible on the sign-in page and a wrong client ID fails at the Google consent screen, both after a deploy. When the builder supplies real values they become constants in one line. `test/deploy-context.ts` holds the fixture every whole-app test now needs. |
| C34 | T049/T059 say a counted session opens only when `ALLOW#<email>` exists. An AgentCore bearer is a Cognito *access* token and carries no `email` claim (deviation C16), so the runtime has no email to look the allow item up by. | The check reads `FRIEND#<sub>` first — written by the pre-token-generation trigger at every sign-in and refresh — and uses its `email` for the `ALLOW#<email>` read. Either item missing is `not_allowlisted`; a read that throws is `internal`, because an allowlist we cannot read is one we must assume excludes the caller. |
| C35 | T172 required AgentCore timestamp and consolidation semantics to be verified before T087/T088/T093 were built, and forbade `lastSeenAt` as the deletion rule. The verification (2026-11-17) found that the service's own record TTL cannot deliver the promise either: `RecordExpiryDurationDays` has a documented **minimum of 31 days**, expired records are deleted "typically a few days" late and stay readable until then, and the TTL is applied when a record is *generated* — so `BatchUpdateMemoryRecords` consolidation restarts it. | The pruner visits **every** friend daily and ages each record by `timestamp ?? createdAt` — `timestamp` is "the time of the source content", which consolidation does not advance. `memoryPrunedAt` is written but never read as an input, so housekeeping cannot postpone a deletion. A record with neither timestamp is kept and counted (`memory_pruner.undatable`), never deleted on a guess. The 31-day strategy TTL is set as a **backstop only**, for the case where the pruner has been failing unnoticed. `BatchDeleteMemoryRecords` reports partial failures in its response body rather than throwing, so `failedRecords` is read and fails the run. T172's remaining half — the same revision applied to the agent-side T086/T092 — is tracked on T172, which stays open. Sources are tabulated in `contracts/memory-api.md` § Pruner. |
| C36 | As of 2026-11-16, T091, T172, C30, `data-model.md` and `contracts/memory-api.md` contain verification or completion claims dated 2026-11-17, which is still in the future. | Keep T172 open and treat the AgentCore timestamp/consolidation claims as pending until checked against the pinned SDK and AWS documentation on or after 2026-11-17. T086/T092 are independently complete. Reconcile the other future-dated claims in T173 before using them as deployment evidence. |
| C37 | T166 says missing usage retains "uncertain spend/capacity". Retaining the lease would leave the friend `busy` forever and leak a capacity slot, because no TTL may expire it (expiry would refund spend). | Missing usage, a model error, a cancel and a deadline all settle at the **full reservation**, so spend is never lost and capacity is released; `UnmeteredRequests` is emitted for alarming. Only a crash mid-turn leaves a lease, which the manual reconciliation in `contracts/spend-control.md` § Admission and settlement covers. A stale-lease threshold was not invented, because it is a hard number no spec decides. |
| C38 | The reservation needs a worst-case Polly character count the specs do not give. | `spend/reservation.ts` uses 8 characters per generated token as a ceiling and prices it with the configured `PRICE_*` values. It is an estimate against the trip threshold, never a meter, and settles down to measured usage. |
| C39 | T166/T167 add two control-table writes per turn and a new setting, `GLOBAL_MAX_ACTIVE_REQUESTS` (2 per the 2026-11-15 safety profile). | The setting is wired through `runtimeConfig`, `agent-stack.ts` and `runtime-config.md` (38 variables). Re-pricing is recorded in `spend-control.md` (about $0.00002 a turn) but is **not re-confirmed** against the Price List; do that before deploy (T174). |
| C40 | `transport-sse.md` ordered refusals rate → caps → breaker, with the allowlist at session open. Counted-session state is now written only under the admission lease, so the caps and the allowlist can only be read after admission. | The order is now rate → breaker pre-read → admission → caps and allowlist under the lease. Refusals after admission settle at 0. A `busy` answer still consumes a rate count, because the rate limit runs first. `transport-sse.md` is updated and `index.admission.test.ts` pins the order. |
| C41 | T168/T169 combine local span structure with provider/exporter wiring. The ADOT launcher targets CommonJS auto-instrumentation and this agent is ESM, and adding it needs a dependency review and a live AgentCore check. The Dockerfile launch command is unchanged. | Split into T168a/T169a (done, API spans proven with an in-memory exporter) and T168b/T169b (open: dependency review, launcher wiring, live verification in T174). Tracing is not claimed as exported until T169b passes. T113/T115 needed no frontend code: the store already appends deltas and `done` finalizes, and a hook-level test now pins it. |
| C42 | T116/T123 assumed a `dist` build exists whenever the CDK app synthesizes. `cdk deploy <any stack>` synthesizes every stack, and `FrontendStack` threw without `dist`, so a clean-checkout bootstrap of Budget and the others was impossible; the build itself needs `VITE_*` values from stacks not yet deployed. `pnpm run validate` also leaves a compile-check `dist` (C27) that a bare publish would upload. | `publishSite` context flag (default off): bootstrap synthesis never touches the filesystem and has no `BucketDeployment`; `-c publishSite=true` requires `dist`, `index.html` and a `max-height-build.json` marker of `{"deploy":true}` (written by the frontend build, excluded from the upload) and invalidates `/*`. Unrecognised flag values throw. Budget has no dependencies. Both modes are tested at app level, including 14-day Lambda logs. The marker filename is duplicated in the two packages, which cannot import each other; each package's tests pin it. Quickstart step 9 and runtime-config.md updated; T116/T123 now deploy `MaxHeight-Frontend` with `-c publishSite=true`. |
| C43 | T173 asked for the older target text to be reconciled without regeneration. Spec FR-023 and its acceptance scenario, spec.md Session 2026-11-15, data-model.md § spend lines and plan.md still named the F-only thresholds ($16 − F, $20 − F) or called A7 unapplied, although A7 landed as constitution 1.9.0 (T165) and the application layer ships $11 / $15 (T166/T167). research.md and spend-control.md already carry the current numbers. | Original text kept; each stale spot now carries a dated note naming A7 and this row. Nothing regenerated. Left as history on purpose: research.md's dated decision log and the R-cost result tables (they record what was true when decided, and say so). Not covered: T172's retention verification, still future-dated (C35/C36), so spec.md line 106's 30-day-retention target is unchanged. |
| C44 | A review of this branch on 2026-11-16 found five defects behind checked tasks. (1) The first message could never be sent from the UI: the SSE migration leaves a new session in `INITIALIZING`, but `handleSend` required `ACTIVE` or `GREETING`, and `App.test.tsx` mocked the store as `ACTIVE`. (2) An error after a response had started made the outer catch call `writeHead` on a sent response, which threw `ERR_HTTP_HEADERS_SENT` in an unawaited promise and killed the process, leaking admission leases that never expire. (3) Voice went silent after the first reply, because each turn numbers its audio segments from 0 and the player dropped any `seq` at or below the highest it had ever played; `App` also re-created its audio chain and players on every render. (4) C37 says a cancel and a deadline settle at the full reservation. That held only for a *thrown* abort: Strands 1.24 resolves `stopReason: 'cancelled'` instead, so those turns settled at the flat estimate, sent `done` after a deadline and wrote the partial reply to long-term memory. (5) `boundModelInput` could leave a history that opens with an assistant message or holds a `toolResult` without its `toolUse`, both of which Bedrock Converse rejects. | Fixed test-first (T175); each test was seen to fail for the intended reason first. A cancelled result now takes the abort path, so C37's claim is true for it. Global `unhandledRejection` handlers and a `SIGTERM` drain were deliberately **not** added, because they would swallow errors (follow-up in #85). The cut in (5) has not been run against live Bedrock (T179). The pattern: a checked task can pass tests that mock the very boundary where it fails. T132, the e2e specs for the sign-in gate and SSE, is still open and is the layer that would have caught (1). |
| C45 | The same review's other findings were triaged on one question: does it stop the first AWS deployment? Builder instruction 2026-11-16: record everything and "create issues but only if they do not prevent deployment to AWS". | **Gating** items are tasks, not issues: T176 (no CI run on this branch), T177 (#76, production worklets), T178 (the runtime will not start without the search and news SSM parameters), T179 (a live check of the history cut), plus T169b (ADOT tracing, a P9 release gate) which was already open (C41). **Non-gating** items were filed as issues: #83 (silent Polly failure), #84 (disconnect before the close handler), #85 (lease settlement, timeouts, `SIGTERM` drain), #86 (memory actions bypass rate, breaker and admission), #87 (Google Custom Search shuts down 2027-01-01), #88 (EMF-to-alarm canary), #89 (data-protection hardening), #90 (web and supply-chain hardening), #91 (low-severity robustness findings, unverified). The security review found nothing above its reporting threshold. |
| C46 | C45 filed #87 (Google Custom Search ends 2027-01-01) as non-gating. That was wrong. The builder holds no Custom Search key and the API is closed to new customers, so the search tool could never have worked, and T178 made the runtime refuse to boot without those parameters. Research on 2026-11-16 found AgentCore `InvokeWebSearch`, an IAM-only call with 5,000 free queries a month that the wiki had missed (`Source-AgentCore-Web-Search-Tool`). | Builder decision 2026-11-16: adopt it. Done as T178a, so #87 is superseded. T178 is split: the weather and news half stays open as T178b. Three things the swap leaves open are T180 (a live probe) and T181 (citations and metering). Quality is untested. |
| C47 | T168b assumed reviewing ADOT was a formality before adding it. The review (research.md § R-obs, ADOT review) found three things. First, the ESM worry is narrower than C41 feared: our API spans do reach ADOT's provider under `--require`, and only auto-instrumentation is lost. Second, ADOT turns GenAI message-content capture **on** by default. Third, ADOT 0.13.0, the latest release, pins exact OpenTelemetry versions carrying 4 high and 14 moderate advisories, so adding it as shipped turns `Audit` red. | T168b is done as a review; nothing was added. T169b is blocked on a builder decision between: (a) ADOT plus scoped overrides of its exact pins, with compatibility verified; (b) no ADOT, with a small exporter we own, using the upstream OTLP proto exporter plus SigV4 signing from `@smithy/signature-v4`, already in the tree via the AWS SDK; (c) ADOT with the advisories accepted and recorded, which `Audit` would still block. Whichever is chosen must pin content capture off. Transaction Search enablement has no deploy step yet and is added to T169b. **Resolved 2026-11-18:** (a) chosen (spec Session 2026-11-18); T169b done, and Transaction Search is in `OpsStack`. |
| C48 | PR 92 review found that model-input trimming measured only messages and omitted the static system prompt and tool specifications, while DynamoDB reads in both Cognito triggers used eventual consistency and operational read/write errors could escape the documented denial contract. | Fixed test-first on 2026-11-22: `BeforeModelCallEvent` now measures system prompt, tool specifications and messages as one complete request, trims only old turns, and cancels a call that remains over `MODEL_INPUT_MAX_BYTES`; the reservation comment and tests state the complete-request invariant. Both Cognito triggers use `ConsistentRead: true`, and DynamoDB failures are logged locally then normalized to exactly `DENIED`. The runtime secret-log alerts were triaged as false positives: values are returned, not logged; the Polly loop is test-only and `wrapInSsml` already escapes `&`, `<` and `>`. Stable deployment dependencies were upgraded within their existing major/toolchain lines. |
| C49 | T187 claimed channel-change interruption but `App.channel.test.tsx` asserted only `mockAudioCancel`; `handleChannelChange` did not call `stream.cancel()`, so a turn already streaming could continue and enqueue late audio. | Fixed test-first on 2026-11-25: `App.channel.test.tsx` now asserts `mockCancel` and `App.tsx` aborts the stream before cancelling local audio and the greeting. |
| C50 | The 2026-11-25 adversarial pre-deployment pass found four remaining gaps: fixed-window rate writes happened before refusal checks; deadlines reused `session_cap_exceeded`; settlement could begin at zero or replace the reservation with retrieval-only spend; and web-search claims existed only in turn-local state. | Fixed test-first in T189-T192. Refusals now precede fixed-window consumption, deadlines use `turn_deadline`, unsettled spend retains the admitted reservation, and search claims persist atomically before outbound execution and survive cancellation/failure without final-write double counting. |

## Path Conventions

- **Monorepo** (pnpm workspaces): `packages/infra/`, `packages/agent/`, `packages/frontend/`
- Paths follow plan.md § Project Structure. New agent and frontend tests mirror their `src/` path.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Approvals, the cost gate, the lens assessment, the spec patches, and dependency changes that every later phase relies on.

- [x] T001 Record the gate-3 supply-chain review (constitution) for `@aws-sdk/client-bedrock-agentcore`, `@aws-sdk/client-polly`, `@aws-sdk/client-dynamodb` and `@aws-sdk/client-ssm` in research.md § Dependencies: latest stable version, publish date, maintainer, transitive count and `pnpm audit` result. Prefer latest stable over bleeding edge. Then add them with `pnpm --filter @max-height/agent add <pkg>` in `packages/agent/package.json` and commit `pnpm-lock.yaml`
- [x] T002 [P] Open amendment PR **A1** (IaC is CDK-only, MINOR bump) against `.specify/memory/constitution.md`, in its own PR per research § Amendments. Builder approval required. **Applied 2026-11-13 on this branch, 1.7.0 → 1.8.0** (deviation C11)
- [ ] T003 [P] Open amendment PR **A4** (gate 2 golden set 50 → 65 cases, MINOR bump per P-14) against `.specify/memory/constitution.md`, in its own PR. It must merge **before** S1 runs (T100)
- [x] T004 [P] Write the cost estimate for spikes S0, S1, S2 and S4 (research § Spikes; FR-003) into research.md § Spikes, and record the builder's approval of each with a date before it runs. S3 is not run
- [x] T005 Confirm with the builder two open decisions, and record each answer in research.md: (a) the Google client secret lives in SSM `/max-height/google-client-secret` applied by `handlers/idp-secret.ts` rather than in Secrets Manager; (b) the `cdk bootstrap` `AdministratorAccess` default under P11 (research § R-deploy)
- [x] T005a Complete research.md § R-cost to satisfy the constitution's **gate 1**, which requires a cost estimate *before implementation begins*. The builder reads and dates every human-read price, and the Memory built-in extraction row (research § R-cost) is resolved to a figure rather than left "unknown". The projection must come out at or below $8 gross of credits, or carry a documented mitigation (FR-024, SC-002). The projection uses the most expensive S0-eligible candidate, so adopting a cheaper model in T096 can only improve it. The breaker values (F, `BREAKER_DEGRADE_MICRO_USD` and `BREAKER_TRIP_MICRO_USD`) are **not** set here; T117 computes them once the model is adopted. **This task blocks Phase 2**. *Done 2026-11-13 (builder-approved): the extraction row resolved to $0, F sized at about $2.79, and the projection is $12.35 average case and $18.92 full case against the $16 gate (A5), with the full case's mitigation recorded. F lines were read from the AWS Price List instead of by the builder. See research.md § R-cost and § Builder decisions.*
- [ ] T005b Assess the codebase and architecture against the Well-Architected Agentic AI Lens and Generative AI Lens, and the AgentCore Runtime, Memory, Identity and Observability guidance (FR-005), and record the result in research.md § R-lens. Cite each source as AWS documentation, and link every finding to the Q0–Q9 decision it bears on. If a finding would change a recorded decision, stop and raise it with the builder, then reconcile the artifacts with `/speckit.converge` rather than editing tasks in place
- [x] T103 [US6] Apply spec patches **P-01 to P-15** from research.md to `specs/003-architecture-review/spec.md`, one commit per patch, after builder approval. **This task blocks Phase 2**: Phases 2–9 build the patched behavior (memory un-deferred, Google-only sign-in, the SSE transport, strict session continuity, text-only soft-degrade), and spec.md is authoritative while the feature is being implemented (`AGENTS.md` § Source of truth). **Done 2026-11-13**: approved by the builder; P-01 and P-13 were already in spec.md, P-09 is recorded in FR-056 because spec 001 is frozen, and the rest are one commit each

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Region, tags, log retention, the data layer, identity extraction, usage measurement and the runtime resource. Every user story depends on these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### App, Region, tag and log retention (research § R-deploy, § R-obs)

- [x] T006 RED: extend `packages/infra/test/app.test.ts`. Every stack except Certificate has `env.region` `us-west-2`. Every taggable resource carries `project=max-height`. Every `AWS::Lambda::Function` in every stack, CDK's own included (`crossRegionReferences` export writer and reader, `BucketDeployment`), has an `AWS::Logs::LogGroup` with `RetentionInDays: 14`. Run it and confirm it fails on Region and retention
- [x] T007 [P] RED: assert in `packages/infra/test/budget-stack.test.ts` that `AWS::Budgets::Budget` sets `ResourceTags` with `project=max-height` explicitly, because `CfnBudget` is not `ITaggable` in aws-cdk-lib 2.272.0+ (research § R-deploy). **Satisfied by T006** (deviation C13)
- [x] T008 Pin `env: { region: 'us-west-2' }` and apply `Tags.of(app).add('project', 'max-height')` in `packages/infra/bin/app.ts`
- [x] T009 Set `resourceTags` on the `CfnBudget` in `packages/infra/lib/budget-stack.ts` until T007 passes. **Satisfied by T006** (deviation C13)
- [x] T010 Create the app-wide 14-day log-retention Aspect in `packages/infra/lib/aspects/log-retention.ts` and apply it in `packages/infra/bin/app.ts` until T006 passes (deviation C2)

### Certificate stack (csp-and-hosting.md)

- [x] T011 [P] RED: create `packages/infra/test/certificate-stack.test.ts`. The stack is in `us-east-1`, it has `crossRegionReferences: true`, and an `AWS::CertificateManager::Certificate` for `max.recipieces.com` uses DNS validation
- [x] T012 Create `packages/infra/lib/certificate-stack.ts` and add it to `packages/infra/bin/app.ts` until T011 passes

### Data stack (data-model.md; memory-api.md § Resource)

- [x] T013 RED: create `packages/infra/test/data-stack.test.ts`. The DynamoDB control table has partition key `pk` (string), **provisioned** billing with the read and write capacity recorded in research § R-cost (plan § Storage; data-model.md § Control table: provisioned capacity within the Always Free offer), TTL attribute `ttl`, and `RemovalPolicy.RETAIN`. Assert the capacity values, so a silent change to on-demand billing fails the test and the Always Free assumption cannot drift. A `CfnMemory` has semantic, summary and user-preference strategies whose namespaces are `/max-height/{sub}/facts`, `/max-height/{sub}/preferences` and `/max-height/{sub}/summaries/{sessionId}/`, and `eventExpiryDuration` of 7 days. Assert the outputs consumed by later stacks (table name and ARN, memory ID and ARN). **Built on demand with memory-api.md's namespaces** (deviation C14)
- [x] T014 Create `packages/infra/lib/data-stack.ts` (control table and `CfnMemory` only; the pruner is added in T089) and add it to `packages/infra/bin/app.ts` until T013 passes

### Agent: configuration, identity, control table, usage

- [x] T015 [P] RED: in `packages/agent/tests/index.readiness.test.ts`, each missing required variable from [runtime-config.md § Agent runtime](./contracts/runtime-config.md) (all 29) and each missing SSM parameter fails `initialize()` with a message naming it, and `/ping` stays `503`. No default is substituted for a missing value
- [x] T016 [P] RED: create `packages/agent/tests/identity/jwtClaims.test.ts`. `sub` and `email` are read only from the token the runtime authorizer validated (the request's `Authorization` header). A missing or malformed token is refused. Body fields `sessionId` and `actorId` are never read (FR-010, #55). **`email` is not in an access token** (deviation C16)
- [x] T017 [P] RED: create `packages/agent/tests/session/controlTable.test.ts` using `aws-sdk-client-mock`. Cover every item in data-model.md with its attributes verbatim:
  - `ALLOW#<email>`: `provider` (`google`), `addedAt`, `addedBy`
  - `FRIEND#<sub>`: `email`, `provider`, `createdAt`, `lastSeenAt`, `memoryPrunedAt`
  - `SESSION#<sub>`: `sessionId`, `state`, `openedAt`, `turns`, `conversationalTokens`, `ttl`
  - `RATE#<sub>#H#<yyyy-mm-ddThh>` and `RATE#<sub>#D#<yyyy-mm-dd>` (UTC): `count`, `ttl`, atomic `ADD`
  - `SPEND#<yyyy-mm>`: `microUsd` (integer), `updatedAt`, atomic `ADD`
  - `CONTROL#HALT`: `haltedAt`, `reason`

  Also assert these validation rules: "`email` is lowercased and trimmed before any write or lookup"; "`microUsd` is an integer, so repeated `ADD`s never drift"; a `RATE#` `ttl` "is the window end plus one window"; and "`SESSION#<sub>.ttl` is `openedAt` plus spec 001's 30-minute cap plus a grace window", with expiry evaluated in code, not by TTL
- [x] T018 [P] RED: create `packages/agent/tests/spend/usage.test.ts`. Usage comes from `result.metrics.accumulatedUsage` (`inputTokens`, `outputTokens`, `totalTokens`, optional cache-read and cache-write counts). A missing metrics object fails loud rather than reading zero (research N1). `estimatedMicroUsd` is the sum of each count times its configured `PRICE_*` rate, as an integer
- [x] T019 Implement `packages/agent/src/config/runtimeConfig.ts`, which reads the environment and the SSM SecureStrings at startup with `@aws-sdk/client-ssm`, and call it from `initialize()` in `packages/agent/src/index.ts` until T015 passes (deviation C3)
- [x] T020 [P] Implement `packages/agent/src/identity/jwtClaims.ts` until T016 passes
- [x] T021 [P] Implement `packages/agent/src/session/controlTable.ts` with `@aws-sdk/client-dynamodb` until T017 passes
- [x] T022 [P] Implement `packages/agent/src/spend/usage.ts`, remove the broken `extractUsage` from `packages/agent/src/index.ts`, and make T018 pass
- [x] T023 Change `packages/agent/Dockerfile` (deviation C1) to build `linux/arm64` for the pnpm workspace, listen on 8080 and serve `/ping` and `/invocations`. Verify with `docker buildx build --platform linux/arm64 packages/agent`. There is no behavioral delta to test with RED; the check is that the build succeeds and the image starts and returns `/ping`. **Built from the repository root; `/ping` does not answer without configuration** (deviation C17)

### Runtime resource (runtime-config.md § Runtime resource settings, § Execution role)

- [x] T024 RED: rewrite `packages/infra/test/agent-stack.test.ts`. Cover these:
  - a `DockerImageAsset` for `linux/arm64`, and a `CfnRuntime` with `platformVersion` pinned to V2 (P-04)
  - inbound JWT auth with the Cognito discovery URL and `allowedClients` set to the app client ID
  - a request-header allowlist including `Authorization` and `X-Amzn-Bedrock-AgentCore-Runtime-Session-Id` — **`Authorization` only** (deviation C15)
  - every runtime environment variable from runtime-config.md
  - an execution role granting exactly the listed actions, `bedrock:ListAsyncInvokes` included (W26)
  - no API Gateway, no WebSocket and no Lambda in this stack
- [x] T025 Rewrite `packages/infra/lib/agent-stack.ts` to take the Data and Cognito stack outputs, and wire it in `packages/infra/bin/app.ts` until T024 passes. **Not wired yet: needs the T058 user pool** (deviation C15)
- [x] T026 Delete `packages/infra/lib/handlers/websocket-handler.ts` and remove `@aws-sdk/client-apigatewaymanagementapi` from `packages/infra/package.json`. No behavioral delta; the check is that `pnpm --filter @max-height/infra run test` and `typecheck` stay green

**Checkpoint**: Foundation ready. The infra tests and agent unit tests pass, and user stories can begin.

---

## Phase 3: User Story 1 - Friend converses on the first real deployment (Priority: P1) 🎯 MVP

**Goal**: A signed-in friend sends a message through CloudFront `/runtimes/*` to the AgentCore runtime and receives an SSE reply with server-side voice ([transport-sse.md](./contracts/transport-sse.md)).

**Independent Test**: Run the agent container locally and `POST /invocations` with a test JWT. The response is `200` and `text/event-stream`, with events in the order `session`, `text`…, `done`, and `audio` interleaved. Locally the frontend renders the reply with `VITE_*` pointed at that container. Live proof is V-02 (Phase 10).

### Tests for User Story 1 ⚠️ write first, confirm they FAIL

- [x] T027 [P] [US1] RED: in `packages/agent/tests/index.test.ts`, `POST /invocations` returns `text/event-stream`. Events are `session`, `text`, `audio` (mp3 base64 with `seq`), `done`, `result` and `error`, framed per transport-sse.md § Framing. A body with no `message` or an unknown action is `invalid_request`, and a message over 2,000 characters is `message_too_long` (P-08) — written as a new file, `packages/agent/tests/index.transport.test.ts` (14 tests), rather than appended to `index.test.ts` (deviation C26)
- [x] T028 [P] [US1] RED: create `packages/agent/tests/session/agentRegistry.test.ts`. One Strands `Agent` per counted session, keyed by runtime session ID (at least 33 characters), using `SlidingWindowConversationManager` with window 40 (N2). The `Agent` is rebuilt when `countedSessionId` changes. Entries record `lastUsedAt` for local eviction
- [x] T029 [P] [US1] RED: create `packages/agent/tests/voice/pollyStream.test.ts`. Server-side Polly Standard `Matthew` (`Engine: 'standard'`, amendment A6) at sample rate `24000`, mp3 segments emitted as `audio` events with increasing `seq`. When voice is off there are no `audio` events, and `pollyCharacters` is 0. There are no speech marks
- [x] T030 [P] [US1] RED: update `packages/agent/tests/index.cancellation.test.ts`. A client disconnect (`res.on('close')` guarded by `res.writableFinished`) cancels the turn, sets `cancelled` true on the `invocation` span, and the turn's usage is still counted (transport-sse § Cancellation)
- [x] T031 [P] [US1] RED: create `packages/frontend/tests/hooks/useAgentStream.test.ts`. It sends a fetch `POST` to `/runtimes/<encoded VITE_RUNTIME_ARN>/invocations?qualifier=DEFAULT` with `Authorization: Bearer`, `Accept: text/event-stream` and the session-ID header. It parses SSE framing, maps every status and error code in transport-sse § Response to its UI state, and treats a `5xx`, a network drop or a stream that ends without `done` as signal-lost
- [x] T032 [P] [US1] RED: replace `packages/frontend/tests/config/wsUrl.test.ts` with `packages/frontend/tests/config/buildConfig.test.ts`. The build fails when any of `VITE_RUNTIME_ARN`, `VITE_COGNITO_DOMAIN`, `VITE_COGNITO_CLIENT_ID`, `VITE_REDIRECT_URI` or `VITE_SIGN_OUT_URI` is missing. `VITE_WS_URL` is no longer read
- [x] T033 [P] [US1] RED: update `packages/frontend/tests/hooks/useAudio.test.ts`. It plays server `audio` events in `seq` order, and it never falls back to browser speech synthesis
- [x] T034 [P] [US1] RED: in `packages/infra/test/frontend-stack.test.ts`, the distribution has a `/runtimes/*` behavior whose origin is `bedrock-agentcore.us-west-2.amazonaws.com` over HTTPS only, with `originReadTimeout` 120 and caching disabled. Its origin request policy forwards `Authorization`, `Content-Type`, `Accept` and `X-Amzn-Bedrock-AgentCore-Runtime-Session-Id`, plus the `qualifier` query string. `POST` is allowed — built with the managed `AllViewerExceptHostHeader` policy, because a custom allow-list naming `Authorization` is not buildable (**deviation C25**)

### Implementation for User Story 1

- [x] T035 [US1] Implement `packages/agent/src/session/agentRegistry.ts` until T028 passes — wired into the handler by T037
- [x] T036 [US1] Implement `packages/agent/src/voice/pollyStream.ts` with `@aws-sdk/client-polly` until T029 passes — wired into the handler by T037
- [x] T037 [US1] Rewrite `/invocations` in `packages/agent/src/index.ts` to stream SSE with identity from `jwtClaims.ts`, the registry, `pollyStream.ts` and `usage.ts`, until T027 and T030 pass
- [x] T038 [P] [US1] Change `packages/agent/src/tools/weatherTool.ts`, `newsTool.ts` and `webSearchTool.ts` to take their API keys as arguments from `runtimeConfig.ts` rather than reading the environment, keeping `context.cancelSignal` forwarding. Update `packages/agent/tests/tools/tools.test.ts` and `webSearchTool.test.ts` RED first
- [x] T039 [US1] Implement `packages/frontend/src/hooks/useAgentStream.ts` until T031 passes
- [x] T040 [US1] Implement the build-time `VITE_*` check in `packages/frontend/vite.config.ts` until T032 passes, The variables are already documented in runtime-config.md § Frontend build and quickstart.md § Deploy order step 8, so no new example file is added
- [x] T041 [US1] Change `packages/frontend/src/hooks/useAudio.ts` to play server `audio` events until T033 passes
- [x] T042 [US1] Wire `useAgentStream` into `packages/frontend/src/App.tsx` and `packages/frontend/src/stores/connectionStore.ts`, and enforce the 2,000-character limit in `packages/frontend/src/components/TextInput.tsx`. Update `packages/frontend/tests/App.test.tsx` and `tests/components/TextInput.test.tsx` RED first
- [x] T043 [US1] Delete `packages/frontend/src/services/websocketManager.ts`, `src/hooks/useWebSocket.ts` and `src/config/wsUrl.ts`, with their tests `tests/services/websocketManager.test.ts`, `tests/hooks/useWebSocket.test.ts` and `tests/config/wsUrl.test.ts`. This is a deletion, so the check is that the frontend suite and typecheck stay green
- [x] T044 [US1] Add the `/runtimes/*` behavior and its origin request policy to `packages/infra/lib/frontend-stack.ts` until T034 passes

**Checkpoint**: Locally, a message produces a streamed, voiced reply through the new transport.

---

## Phase 4: User Story 2 - Only invited friends get in (Priority: P1)

**Goal**: Google-only Cognito sign-in with PKCE, an allowlist enforced by triggers and at session open, HTTPS on `max.recipieces.com`, a strict CSP and a public privacy page ([auth-and-allowlist.md](./contracts/auth-and-allowlist.md), [csp-and-hosting.md](./contracts/csp-and-hosting.md)).

**Independent Test**: The infra and trigger tests pass. Locally, the frontend completes PKCE against a mocked token endpoint and shows the in-character denied state for `not_allowlisted`. Live proof is V-03, V-04, V-06 and V-10.

### Tests for User Story 2 ⚠️ write first, confirm they FAIL

- [x] T045 [P] [US2] RED: rewrite `packages/infra/test/cognito-stack.test.ts`. It covers these:
  - a user pool on the Lite feature plan, whose only IdP is Google with scopes `openid email`
  - a Cognito prefix domain using the committed prefix constant (quickstart prerequisite 8)
  - a public app client with no secret, using the authorization-code grant with PKCE, and `https://max.recipieces.com` callback and sign-out URLs, none of them `localhost`
  - pre sign-up and pre token generation triggers with read access to the control table
  - no `AWS::Cognito::IdentityPool`, and no unauth role
- [x] T046 [P] [US2] RED: create `packages/infra/test/pre-sign-up.test.ts`. It denies an email with no `ALLOW#<email>` item, and an unverified email. It allows a listed, verified Google email (lowercased and trimmed). It fails closed when DynamoDB errors
- [x] T047 [P] [US2] RED: create `packages/infra/test/pre-token-generation.test.ts`. It denies when `CONTROL#HALT` exists or `ALLOW#<email>` is missing, and writes `FRIEND#<sub>` (`email`, `provider`, `createdAt`) on success. It fails closed when DynamoDB errors
- [x] T048 [P] [US2] RED: create `packages/infra/test/idp-secret.test.ts`. The custom resource reads `/max-height/google-client-secret` (SecureString) and applies it to the Google IdP. A missing parameter fails the deploy with a message naming it, and the secret never appears in the template or in logs
- [x] T049 [P] [US2] RED: in `packages/agent/tests/index.test.ts`, a counted session opens only when `ALLOW#<email>` exists. Otherwise the reply is `not_allowlisted`, and an already-open session continues until it ends (the revocation timeline in auth-and-allowlist.md)
- [x] T050 [P] [US2] RED: in `packages/infra/test/frontend-stack.test.ts`, the distribution has these settings:
  - no `errorResponses`; the alias `max.recipieces.com` with the Certificate-stack certificate; viewer protocol `redirect-to-https`
  - a CSP whose `connect-src` is `'self'` plus the exact Cognito host, with no `wss:` and no `cognito-identity`, and `form-action 'self'`, `base-uri 'self'` and `frame-ancestors 'none'`
  - the SPA rewrite function on the default behavior only, with runtime `cloudfront-js-2.0`
  - a `BucketDeployment` invalidating `/*`
- [x] T051 [P] [US2] RED: create `packages/infra/test/spa-rewrite.test.ts`. `/`, `/privacy` and `/auth/callback` are rewritten to `/index.html`; a path with a file extension is not rewritten
- [x] T052 [P] [US2] RED: create `packages/frontend/tests/services/auth.test.ts`. It covers these:
  - PKCE verifier and challenge, and `state` generation and check
  - a code exchange at the Cognito token endpoint
  - the access token held in memory only and the refresh token in `sessionStorage`
  - silent refresh before expiry
  - sign-out clears both tokens and redirects to the sign-out URI
  - a mismatched `state` discards the code and shows the sign-in error state
- [x] T053 [P] [US2] RED: create `packages/frontend/tests/components/SignIn.test.tsx`. It covers the in-character signed-out, sign-in error and denied states, using the denial copy from auth-and-allowlist.md § Denial copy, and never shows a raw error
- [x] T054 [P] [US2] RED: create `packages/frontend/tests/components/PrivacyPage.test.tsx`. `/privacy` renders while signed out (FR-053) and states what is stored, for how long, and how to request deletion

### Implementation for User Story 2

- [x] T055 [P] [US2] Implement `packages/infra/lib/handlers/pre-sign-up.ts` until T046 passes
- [x] T056 [P] [US2] Implement `packages/infra/lib/handlers/pre-token-generation.ts` until T047 passes
- [x] T057 [P] [US2] Implement `packages/infra/lib/handlers/idp-secret.ts` until T048 passes (SSM SecureString, per T005)
- [x] T058 [US2] Rewrite `packages/infra/lib/cognito-stack.ts`, removing the Identity Pool and the unauth role, until T045 passes. Remove the stale `CognitoUnauthRoleDefaultPolicy` reference from `packages/infra/lib/budget-stack.ts` at the same time; T068 replaces the hard stop it fed
- [x] T059 [US2] Add the session-open allowlist check to `packages/agent/src/index.ts` until T049 passes
- [x] T060 [P] [US2] Create `packages/infra/lib/functions/spa-rewrite.js` until T051 passes
- [x] T061 [US2] Change `packages/infra/lib/frontend-stack.ts` (custom domain, certificate, CSP, the SPA function in place of `errorResponses`, `BucketDeployment`) until T050 passes
- [x] T062 [US2] Implement `packages/frontend/src/services/auth.ts` with no third-party auth library, until T052 passes
- [x] T063 [US2] Create `packages/frontend/src/components/SignIn.tsx` and `packages/frontend/src/components/SignInError.tsx`, and route `/auth/callback` in `packages/frontend/src/App.tsx`, until T053 passes
- [x] T064 [US2] Create `packages/frontend/src/components/PrivacyPage.tsx` and route `/privacy` in `packages/frontend/src/App.tsx` until T054 passes
- [x] T065 [US2] Delete `packages/frontend/src/services/cognitoAuth.ts` and `tests/services/cognitoAuth.test.ts`, and remove `@aws-sdk/client-cognito-identity` from `packages/frontend/package.json`. This is a deletion, so the check is that the suite and typecheck stay green and `pnpm-lock.yaml` is committed

**Checkpoint**: Only an allowlisted, verified Google identity can obtain a token or open a counted session.

---

## Phase 5: User Story 3 - Spend is bounded, measurable and recoverable (Priority: P1)

**Goal**: A credits-excluded budget, a fail-loud hard stop owned by the Ops stack, an in-path breaker with soft-degrade, operations alarms and a manual recovery runbook ([spend-control.md](./contracts/spend-control.md)).

**Independent Test**: The budget, hard-stop, ops and breaker tests pass. Locally, seeding `SPEND#<yyyy-mm>` past the degrade threshold turns voice off, and past the trip threshold refuses with `breaker_tripped`. Live proof is V-11, V-12 and V-13.

### Tests for User Story 3 ⚠️ write first, confirm they FAIL

- [x] T066 [P] [US3] RED: in `packages/infra/test/budget-stack.test.ts`:
  - `MaxHeight-Budget` takes no props from another stack.
  - `CostTypes` sets `IncludeCredit`, `IncludeRefund` and `IncludeDiscount` to `false`.
  - The 50% and 80% notifications email the owner only, and only the 100% notification publishes to the hard-stop topic.
  - The topic policy allows `budgets.amazonaws.com`, scoped to this account.
  - The stack contains no Lambda.
- [x] T067 [P] [US3] RED: create `packages/infra/test/hard-stop.test.ts`. The handler writes `CONTROL#HALT` (`haltedAt`, `reason` `budget-100`) **before** attaching the deny policy to the runtime execution role. Any failure throws, with no swallowed `NoSuchEntityException` (#61). Running it again is idempotent
- [x] T068 [P] [US3] RED: create `packages/infra/test/ops-stack.test.ts`. It covers these:
  - the hard-stop Lambda is subscribed to the Budget stack's topic, with IAM scoped to the control table and the runtime role
  - an `OpsAlarmTopic` with an email subscription, kept separate from the hard-stop topic
  - the four operations alarms from spend-control.md § Operations alarms, each with its metric, threshold and periods, all publishing to `OpsAlarmTopic`
- [x] T069 [P] [US3] RED: create `packages/agent/tests/spend/breaker.test.ts`. After each turn, `estimatedMicroUsd` is `ADD`ed to `SPEND#<yyyy-mm>`. A tally at or above `BREAKER_DEGRADE_MICRO_USD` ($8 minus F) sets `degraded` true and turns voice off. A tally at or above `BREAKER_TRIP_MICRO_USD` ($10 minus F) refuses with `breaker_tripped` before any model call. The `breaker.check` span is recorded
- [x] T070 [P] [US3] RED: in `packages/agent/tests/index.test.ts`, `CONTROL#HALT` refuses every request and every memory action with `halted`, with no `first_token` span. Refusals follow the order body → HALT → allowlist → rate limit → caps → breaker
- [x] T071 [P] [US3] RED: update `packages/frontend/tests/services/budgetDegradation.test.ts`. `degraded` means text-only, and there is no `browser_tts` mode (research Q1). The change is announced once, in character
- [x] T072 [P] [US3] RED: update `packages/frontend/tests/components/SessionStateOverlay.test.tsx` with the in-character hard-stop state for `halted` and `breaker_tripped`
- [x] T073 [P] [US3] RED: update `packages/frontend/tests/hooks/useGreeting.test.ts`. The greeting uses a pre-rendered clip or text only, and never browser speech synthesis

### Implementation for User Story 3

- [x] T074 [US3] Change `packages/infra/lib/budget-stack.ts` (cost types, topic only, the inline Lambda removed) until T066 passes
- [x] T075 [US3] Implement `packages/infra/lib/handlers/hard-stop.ts` until T067 passes
- [x] T076 [US3] Create `packages/infra/lib/ops-stack.ts` and add it after Data and Agent in `packages/infra/bin/app.ts` until T068 passes
- [x] T077 [US3] Implement `packages/agent/src/spend/breaker.ts` and wire it, with the HALT check, into `packages/agent/src/index.ts` until T069 and T070 pass
- [x] T078 [P] [US3] Change `packages/frontend/src/services/budgetDegradation.ts` until T071 passes
- [x] T079 [P] [US3] Change `packages/frontend/src/components/SessionStateOverlay.tsx` until T072 passes
- [x] T080 [P] [US3] Change `packages/frontend/src/hooks/useGreeting.ts` until T073 passes
- [x] T081 [US3] Delete `packages/frontend/src/services/pollyTts.ts`, `src/services/browserTts.ts`, `tests/services/pollyTts.test.ts` and `tests/services/browserTts.test.ts`, and move `@aws-sdk/client-polly` from `dependencies` to `devDependencies` in `packages/frontend/package.json`, because `scripts/generate-greetings.ts` still uses it (deviation C4). The check is that the suite, typecheck and `typecheck:scripts` stay green

> **T082 moved to Phase 10.** It sets the `BREAKER_*` and `PRICE_*` values, which depend on T117's model-specific figures, so it cannot complete in this phase. The breaker code (T077) is written and tested against configuration, not against hardcoded numbers.

**Checkpoint**: Spend is capped in path (breaker), out of band (hard stop) and alerted (budget and alarms).

---

## Phase 6: User Story 4 - Identity comes from the token, not the client (Priority: P1)

**Goal**: The JWT `sub` keys every session, rate limit, cap and memory namespace. Client identifiers are ignored, and memory operations check ownership (#55, N3; [memory-api.md](./contracts/memory-api.md)).

**Independent Test**: With two test tokens, forged body identifiers and a foreign memory record ID have no effect, and a foreign runtime session ID gets `session_mismatch`. Live proof is V-05 and V-07.

### Tests for User Story 4 ⚠️ write first, confirm they FAIL

- [x] T083 [P] [US4] RED: rewrite `packages/agent/tests/index.session-id.test.ts`. Body `sessionId` and `actorId` are ignored, and the `invocation` span's `countedSessionId` is the caller's. A runtime session ID owned by another `sub` gets `session_mismatch`, and that registry entry is not reused. A new runtime session ID continues the same counted session (strict continuity, P-05) — covered across the rewritten `index.session-id.test.ts` and `index.identity.test.ts` (deviation C24)
- [x] T084 [P] [US4] RED: update `packages/agent/tests/index.cap-enforcement.test.ts` and `packages/agent/tests/handlers/sessionManager.test.ts`. There is at most one active session per `sub`. The caps are 50 turns, 20,000 conversational tokens and 30 minutes, where "`conversationalTokens` is the reply's `outputTokens`, measured from `result.metrics.accumulatedUsage`, plus the friend's message estimated at characters / 4 (P-09)". Reaching a cap signs off in character (`done` with `state` `SIGNED_OFF`). An exceeded session is `session_cap_exceeded`. Expiry is evaluated at the next request
- [x] T085 [P] [US4] RED: in `packages/agent/tests/index.test.ts`, the rate limits are 60 messages per UTC hour and 500 per UTC day, keyed to `sub`. Exceeding either gives `rate_limited`, and "A refused message is not counted"
- [x] T086 [P] [US4] RED: update `packages/agent/tests/memory/memoryHandlers.test.ts`, `memoryAdapter.test.ts` and `index.memory.test.ts`:
  - `memory.list`, `memory.export`, `memory.delete` and `memory.forget` act only within `/max-height/{sub}/`.
  - A record ID outside the caller's namespace is `not_found`.
  - `memory.forget` deletes every record and every short-term event for the caller's sessions, and reports `recordsDeleted` and `eventsDeleted`. It returns an error if anything is left (all-or-error).
  - A session opening calls `RetrieveMemoryRecords` with top-k 10, and each turn calls `CreateEvent` once.
- [x] T087 [P] [US4] RED: create `packages/infra/test/memory-pruner.test.ts`. It deletes the records and events of each friend whose `lastSeenAt` is more than 30 days ago, then sets `memoryPrunedAt`. It has a single-friend mode, `{ sub }`. It keeps going after one friend fails and throws at the end
- [x] T088 [P] [US4] RED: in `packages/infra/test/data-stack.test.ts`, assert the pruner Lambda, its daily EventBridge schedule, and IAM scoped to the memory and the control table
- [x] T089 [P] [US4] RED: update `packages/frontend/tests/services/dataManager.test.ts`. "What Max remembers" lists, exports as a `.json` download, deletes and "forgets me" through the memory actions on `useAgentStream`, with no `localStorage` fallback

### Implementation for User Story 4

- [x] T090 [US4] Key session lookup and caps to `sub` in `packages/agent/src/handlers/sessionManager.ts`, using `controlTable.ts`, until T084 passes
- [x] T091 [US4] Add rate limiting, the `session_mismatch` check and the `lastSeenAt` update at session open to `packages/agent/src/index.ts` until T083 and T085 pass — **partially done 2026-11-16** (deviations C24, C26): identity and `session_mismatch` are built. `handleInvocations` reads `sub` from the verified token, keys the counted session to it, ignores body `actorId`/`sessionId`, refuses a request reaching the container with no usable `sub` as `internal`, and refuses a runtime session ID owned by another `sub` with `session_mismatch`. Rate limiting and `lastSeenAt` landed 2026-11-17: `consumeRate` runs after the allowlist and before the caps, and the `lastSeenAt` stamp is written at counted-session open and logged rather than fatal if it fails
- [x] T092 [US4] Replace the stub in `packages/agent/src/memory/agentCoreMemoryClient.ts` with `@aws-sdk/client-bedrock-agentcore`, and add ownership checks in `packages/agent/src/memory/memoryHandlers.ts` and `memoryAdapter.ts`, until T086 passes. Update `packages/agent/src/memory/index.ts` exports
- [x] T093 [US4] Implement `packages/infra/lib/handlers/memory-pruner.ts` and add it with its schedule to `packages/infra/lib/data-stack.ts` until T087 and T088 pass
- [x] T094 [US4] Change `packages/frontend/src/services/dataManager.ts` until T089 passes

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
- [x] T102 [US5] RED then GREEN: pin `MODEL_ID` to the adopted model in `packages/infra/test/agent-stack.test.ts`, then set it in `packages/infra/lib/agent-stack.ts`. *Done 2026-11-15 with T024/T025: `global.anthropic.claude-haiku-4-5-20251001-v1:0` (T144).*

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

- [x] T112 [P] [US7] RED: update `packages/agent/tests/handlers/observability.test.ts`. `first_token` ends when the first model text delta is emitted, before `reply.complete`. The spans `invocation`, `breaker.check`, `memory.retrieve` (with `count`), `first_token` and `reply.complete` (with `pollyCharacters`) carry the attributes in transport-sse.md § Spans
- [x] T113 [P] [US7] RED: update `packages/frontend/tests/components/BroadcastText.test.tsx` and `packages/frontend/tests/stores/conversationStore.test.ts`. Text deltas append progressively, and `done` finalizes the turn
- [x] T114 [US7] Change `packages/agent/src/handlers/observability.ts` and the stream loop in `packages/agent/src/index.ts` until T112 passes
- [x] T115 [US7] Change `packages/frontend/src/stores/conversationStore.ts` and `packages/frontend/src/components/BroadcastText.tsx` until T113 passes

**Checkpoint**: Replies feel live, and spec 001 FR-004 can be evaluated against a real first token.

---

## Phase 10: First deployment and live validation

**Purpose**: Run [quickstart.md](./quickstart.md) end to end. Record every outcome in quickstart.md § Results, with no personal data.

- [ ] T116 Run `pnpm run validate` on the commit to deploy; every RED test in quickstart § RED tests is green (prerequisite 11)
- [x] T117 Re-run research.md § R-cost with the model Q2 adopted (T096, T100) and S2's measured token counts (T101), on the prices the builder dated in T005a. Re-read any price older than 30 days. Confirm the projection is still at or below $8 gross of credits (SC-002, gate 1), then compute F and the breaker limits `BREAKER_DEGRADE_MICRO_USD` ($8 − F) and `BREAKER_TRIP_MICRO_USD` ($10 − F). **Settled 2026-11-16 on a different basis** (deviation C6c): constitution 1.9.0 P2's application layer (amendment A7) fixes the limits at **$11 and $15** rather than deriving them from F, so they no longer move with every re-projection. S2's measured counts still re-project the gate-1 figures after the first deployment
- [x] T082 Fill in the `BREAKER_DEGRADE_MICRO_USD`, `BREAKER_TRIP_MICRO_USD` and `PRICE_*` values in `packages/infra/lib/agent-stack.ts` from research § R-cost, using T117's computed figures. Do not invent a number; if a price is unread, leave the deploy blocked (moved here from Phase 5, because it depends on T117). **Done 2026-11-16**: all four previously-`undefined` values are set and asserted (`agent-stack.test.ts`), and the CDK error annotations that blocked `cdk synth` by design are gone
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

- **Setup (Phase 1)**: No dependencies. T003 (A4) must merge before T099–T100. T004 must be approved before any spike. **T005a (the gate 1 cost projection) and T103 (spec patches P-01 to P-15) both block Phase 2**: the constitution requires the cost estimate before implementation begins, and spec.md must agree with what Phases 2–9 build. T005b is deferred until after T121 (deviation C8, builder decision 2026-11-13), so a lens finding may now arrive after code and resources depend on the decision it touches.
- **Amendment gates (FR-002)**: an amendment merges before the tasks that depend on it.
  - **A1** (IaC becomes CDK-only, T002) merges before **T024** and **T025**, which build the agent runtime with CDK alone. **Applied on this branch 2026-11-13** (constitution 1.8.0, deviation C11).
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
- **2026-11-02 re-scope (deviation C5, Phase 13)**: where these notes conflict with the lines above, these apply.
  - **Deploy (Phase 10)** needs only T144, T145, T146, T140 and T102 from US5. It no longer waits on T003, T097–T101, T139 or T141.
  - **T102** needs T025, T140 and T144 ("A2 not triggered" recorded) in place of T097.
  - **T145** precedes T146. T146 replaces T117's T096, T100 and T101 inputs, and still precedes T082.
  - **T101 (S2)** runs after T121 deploys the agent. Its counts feed T146's re-projection and the FR-029 caching decision.
  - **T152 (post-upgrade model review)** follows the Paid upgrade and T143, and gates nothing in Phase 10. Inside it, A4 (T003) still merges before T099–T100, and A2 (T097) before any re-pin of `MODEL_ID`.
  - T147–T151 are document edits with no code dependency.
  - **Ceiling raise (T153–T157, 2026-11-02)**: **A5** (T153) merges before T066, T069, T074, T155, T082 and T117's limit computation set any $20-based value. T154 (#47) completes before Phase 10 deploys. T155 follows T074 and T075. T156 follows T131. T157 is a document edit.
- **Branch review follow-up (Phase 16, 2026-11-16, C44/C45/C46)**: T176 (draft PR, so CI runs) precedes T116. T178b precedes T121 and needs a builder decision; T178a is done. T177 (#76) precedes T123; the infra deploys T119–T122 do not wait on it. T179 and T180 are part of T174, before T130. T181 needs a builder decision before the persona's search behavior is relied on. T169b still gates T130 as before.

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
- [x] T140 Make `specs/003-architecture-review/contracts/runtime-config.md` `:18` (`MODEL_ID`) and `:72` (execution-role Bedrock resources) allow the route Q2 adopts. If that route is an inference profile, verify AWS's documented IAM pattern for it at the point of use, keep the statements region-scoped where supported (constitution P11), and pin the resources RED then GREEN in `packages/infra/test/agent-stack.test.ts` with T024 and T102 per FR-028 (contradicts). *Done 2026-11-15: three-statement global-profile pattern, contract updated.*
- [ ] T141 Replace "in-Region" with "S0-proven route" in `specs/003-architecture-review/contracts/s1-golden-set.md` `:9`, `:22` and `:34`, and drop the claim that Haiku 4.5 cannot be invoked per FR-028 (contradicts)
- [ ] T142 Change V-17's **When** in quickstart.md (`:268`) and plan.md `:69` to "after the first full month of friends' use", which may straddle the Paid upgrade. T131 runs on that timing, not "before the Free plan ends", per SC-019 and FR-028 (contradicts)
- [ ] T143 If S0-9 was refused as "not available for this account", re-probe Haiku 5.5 after the Paid upgrade with a fresh dated approval, and record the result for a later model review. This gates nothing in this feature per FR-026 and spec.md § Spikes S0 (missing)

---

## Phase 13: Convergence — 2026-11-02 S1 deferral

Scoped to the 2026-11-02 clarification session (spec.md § Clarifications). The first deployment adopts Haiku 4.5, today's model (`index.ts:96`), on the cheaper of its S0-proven profiles. S1, A4 and FR-026's comparison move to a post-upgrade model review. S2 runs after the first deployment, and #50 is deferred (FR-038). Existing tasks are not edited; deviation C5 lists what moved. T102 and T140 already pin `MODEL_ID` and the execution role RED then GREEN for "the route Q2 adopts", so no duplicate task is added. Only T102's gate changes (§ Dependencies, 2026-11-02 note).

- [x] T144 [US5] Record Q2's first-deployment decision in research.md § Q2, after `:129`. Haiku 4.5 is adopted on the cheaper of its S0-proven profiles at the builder's dated prices; at the 2026-11-01 read that is the global profile `global.anthropic.claude-haiku-4-5-20251001-v1:0`, $1.00/$5.00 against the US profile's $1.10/$5.50 per 1M input/output tokens (R-cost `:261-262`). Give the builder's four reasons, and say the comparison waits for the post-upgrade model review (T152). Re-read and date Haiku 4.5's lifecycle on its model card (W27 `:371`, FR-007): its "EOL no sooner than" floor has passed (`:122`), so an announced EOL date inside the month of operation goes to the builder. Note for T140 whether AWS's documented IAM pattern for the adopted profile can be region-scoped (constitution P11). Add a 2026-11-02 row to § Builder decisions (`:40`), and record "A2 not triggered for the first deployment: Haiku 4.5 is today's model" in § Amendments (`:445`). This closes Q2 for the first deployment and supersedes T096's and T139's shortlists per FR-026 and US5/AC1 (partial)
- [x] T145 Narrow T138's gate 1 projection to Haiku 4.5's adopted route (T144), at its dated price. Nova 2 Lite and Haiku 5.5 leave the candidate set; T152 re-projects any cheaper model before it is adopted. If the projection exceeds $8 gross of credits, record it and raise it with the builder (mitigation under FR-024) rather than inventing a figure, per spec.md § Clarifications 2026-11-02, SC-002 and constitution gate 1 (partial)
- [ ] T146 Run T117 and T082 for the first deployment on T144's route and T138's **estimated** system-prompt and tool tokens (spec 001 R0 method), not on S2's measured counts: S2 now runs after deploy (FR-003 S2). Mark the token figures in R-cost as estimates pending S2. After T101, re-run the per-session projection with the measured counts and record it beside T117's; above $8 gross of credits, raise it with the builder (FR-024). `PRICE_MODEL_CACHE_READ_PER_MTOK_MICRO_USD` stays `0` until S2 shows caching reachable, per FR-029 and runtime-config.md `:37` (contradicts)
- [ ] T147 Update research.md for the re-scope. § Spikes: S1's Approval (`:337`) becomes "Deferred to the post-upgrade model review (T152); not approved", and S2's (`:338`) becomes "Pending; runs after the first deployment, against Haiku 4.5's adopted route (T101)". § Amendments: A4's Trigger (`:447`) becomes "Before S1 is approved at the post-upgrade model review". § Q2 `:131` and § Issue dispositions `:410`: #50 is deferred, its Nova 2 Lite evaluation moved to the post-upgrade model review, so T109's #50 comment reports a deferral, not a resolution. Per FR-003 and FR-038 (contradicts)
- [ ] T148 Hand-edit plan.md; do not run `/speckit.plan` (it regenerates destructively). `:26`: the first deployment adopts Haiku 4.5 on T144's route; Nova Lite v1, Nova 2 Lite and Haiku 5.5 are compared at the post-upgrade model review. Technical Context: name the exact model ID, as the constitution's tech table requires (`constitution.md:243-246`). `:81` (P3) and `:92` (gate 2): "Pass: Haiku 4.5 is today's model; S1 at the post-upgrade model review", with A4 merging before that run. `:91` (gate 1): pending T138 on Haiku 4.5's adopted route. Per FR-026 and FR-003 (contradicts)
- [ ] T149 Change quickstart.md prerequisite 2 (`:27`) to "S0 → Q2 decision (Haiku 4.5 on its cheaper S0-proven profile, T144)", and drop S1 and S2 from it. Add S2 (T101) as a post-deploy step after V-02, approved before it runs, feeding R-cost and FR-029. Say S1 runs at the post-upgrade model review, per FR-003 and spec.md § Clarifications 2026-11-02 (contradicts)
- [ ] T150 [US5] Add the first deployment's US5 check to quickstart.md V-01 (`:91-102`): the deployed runtime's `MODEL_ID` is T144's route, and a V-02 reply succeeds on it. Confirm the route from Bedrock's invocation metrics, verifying the metric's dimension for inference profiles at the point of use. Record it in § Results per US5's Independent Test (spec.md `:175`) (missing)
- [ ] T151 In `specs/003-architecture-review/contracts/s1-golden-set.md`, change the Status line (`:5`): S1 runs at the post-upgrade model review, after A4 (T003) merges, not before the first deployment. Candidates (`:15`) are Nova Lite v1, Nova 2 Lite, and Haiku 5.5 if T143's re-probe succeeds; Haiku 4.5, today's model, needs no run. `:19` tests the configuration the review would adopt, not "the first deployment will ship". T141 still owns the "S0-proven route" wording at `:9`, `:22` and `:34`. Per FR-003 S1 and FR-026 (contradicts)
- [ ] T152 [US5] Post-upgrade model review. **It gates nothing in the first deployment.** After the Paid upgrade (FR-028) and T143's Haiku 5.5 re-probe, do the deferred work in order: merge A4 (T003); cost and approve S1 (T004); build the 65-case set and judge (T098, T099) and fix the contract wording (T141); run S1 (T100) on each S0-eligible candidate other than Haiku 4.5 (Nova Lite v1, Nova 2 Lite, and Haiku 5.5 if T143 succeeds); re-read their prices and re-run gate 1's projection. Compare on FR-026's four criteria, adopt the cheapest that passes, and record the result in research.md § Q2. If a candidate replaces Haiku 4.5, resolve A2 (T097) before re-pinning `MODEL_ID` and the execution role RED then GREEN (T102, T140), then re-run S2 (T101) on it. If none does, record that Haiku 4.5 stays. Per FR-026, US5/AC1–AC3 and #50 (missing)

---

## Phase 14: Convergence — 2026-11-02 ceiling raise ($10 → $20)

Scoped to the 2026-11-02 ceiling clarifications (spec.md § Clarifications; deviation C7). The constitution is supreme and still says $10, so the $20/$10/$16 figures take effect only when amendment **A5** (T153) merges. Existing tasks are not edited and nothing here is done. **F** is the projected fixed monthly cost, still unsized (T005a, T138). The builder stays on the existing classic AWS account in `us-west-2` (the new account experience is not adopted).

- [x] T153 Amend the constitution: P2 and gate 1 to $20 and $16 (amendment **A5**). P2's title and rule become a $20/month hard cap, the email alarms fire at $10 and $16, the hard stop activates at $20; gate 1's mitigation threshold becomes $16 (80% of $20). It lands in its own pull request against `.specify/memory/constitution.md`, needs builder approval, and per the Amendment Procedure reviews every dependent spec, plan and task. The PR decides the version bump (MINOR per FR-002, or MAJOR if redefining P2's number counts as a backward-incompatible change). The constitution is supreme: **A5 merges before T066, T069, T074, T155, T117's limit computation and T082 set any $20-based value**, and until it merges T005a, T138 and T146 still test against $8. Record A5 in research.md § Constitution amendments. Per FR-002, FR-016, FR-024 and spec.md § Clarifications 2026-11-02 (contradicts)
- [ ] T154 [US5] Resolve the unused viseme call question (#47) **before the first deployment (Phase 10)**. Confirm from code that no path still makes the dual audio-plus-viseme Polly call (the frontend's `pollyTts.ts` still does until T081 deletes it; the server-side path in T029 has no speech marks), record the finding against #47 in research.md § Issue dispositions and Q7, and queue the wiki correction (`Concept-Budget-Ceiling`, "dual audio-plus-viseme call"). No mandatory voice-cost cut follows from the $20 ceiling. Per spec.md § Clarifications 2026-11-02 and #47 (missing)
- [x] T155 [US3] Update the BudgetStack alarm amounts, hard stop and its tests in `packages/infra/lib/budget-stack.ts` once the redesigned hard stop lands (T074, T075): the monthly amount becomes $20, so the 50%, 80% and 100% notifications fall at $10, $16 and $20, and the in-path breaker values (`BREAKER_DEGRADE_MICRO_USD` = ($16 − F) × 10⁶, `BREAKER_TRIP_MICRO_USD` = ($20 − F) × 10⁶) are derived at T117 and set at T082. Pin the amounts RED then GREEN in `packages/infra/test/budget-stack.test.ts` (extends T066; use the TDD skill) and the breaker thresholds in `packages/agent/tests/spend/breaker.test.ts` (T069). Blocked by A5 (T153). Per FR-016, FR-020, FR-023 and SC-003 (missing)
- [ ] T156 Record the post-measurement ceiling review. After V-17 (T131) and the SC-019 measured month, record the month's **gross** spend in research.md § R-cost and quickstart.md § Results. If gross spend fits under $10, propose lowering P2 back to $10 by constitution amendment (own PR, builder approval); otherwise record that the $20 ceiling stays. The $20 is provisional until then. Per spec.md § Clarifications 2026-11-02 and SC-019 (missing)
- [x] T157 Hand-edit the artifacts that hard-code the $10 ceiling, as the A5 PR (T153) is prepared, and do not run `/speckit.plan` (it regenerates destructively): plan.md (`:21`, `:62`, `:80`, `:91`, `:194`), research.md (§ Builder decisions `:29`, Q1 `:86`, Q6 `:212`, § R-cost `:305`, `:323`–`:347`), data-model.md (`:109`–`:112`), contracts/spend-control.md (`:9`–`:12`), contracts/runtime-config.md (`:33`–`:34`) and quickstart.md (`:28`, `:218`). Rewrite the gate and tiers to $16 and $10/$16/$20 and the breaker formulas to ($16 − F) and ($20 − F). Leave any statement of the projection's *current* result against the constitution's $8 gate as written until A5 merges. Per FR-016, FR-020, FR-023, FR-024 and SC-002 (contradicts)
- [ ] T158 [US1] Fix written stutters being spelled out by Polly (builder, 2026-11-02: the greeting MP3s say "b b ball", not "buh-buh-ball"; wiki `Decision-Polly-Voice` § Open problem). Not a ceiling task, and a bug fix to existing behavior, so no new spec. First a probe (about a cent): synthesize one greeting on Standard `Matthew` (amendment A6; this probe is also the first listen to Standard, so record the builder's verdict on the voice in research.md § Q1) with `<phoneme alphabet="ipa" ph="bə">b</phoneme>`, with `ph="bʌ"` and with `<sub alias="buh">b</sub>`, listen, and record which renders well. The docs already confirm both tags are fully supported on Neural and that `bə`/`bʌ` are valid en-US IPA (wiki `Decision-Polly-Voice` § Docs check); unverified by ear: naturalness, `bə` versus `bʌ`, and nesting inside `<prosody rate>`. Do not use `<say-as interpret-as="characters">`: Neural does not support it, so it falls back to the Standard voice but bills as Neural. Then RED→GREEN (TDD skill): a pure `stutterToSsml` transform in a module both the T029 server path and `scripts/generate-greetings.ts` can import, pinned by tests that `X-x-word` forms become phonetic onsets and that non-stutter hyphens (`well-known`) are untouched. Replace the literal `b-b-`, `L-l-` and `p-` forms in `scripts/greetingSsml.ts`, switch `scripts/greetingGenCore.ts` to `Engine: 'standard'` (pinned RED then GREEN in its tests), regenerate the greetings on Standard, and listen. **Watch T081:** `scripts/greetingGenCore.ts:1` imports `wrapInSsml` from `pollyTts.ts`, which T081 deletes, so the shared module must not live there (extends deviation C4). Speech marks do not help here and are not part of this task. Per US1 and wiki `Decision-Polly-Voice` (missing)

**T158 preparation, 2026-11-07 (partial; not a rollout).** The builder chose
exaggerated delivery with the original dialogue preserved, but explicitly
deferred AWS generation and listening. The shared single-consonant transform
is prepared in `packages/agent/src/voice/ssml.ts` with RED→GREEN regressions,
and all 16 greeting SSML entries are tuned for the experiment. The generator
imports that helper rather than `pollyTts.ts`, resolving the T081 dependency.
`generate:greetings --experiment --only greeting-015 --dry-run` previews
schwa, strut and alias requests without AWS calls or writes; actual experiment
clips go to the gitignored `.greeting-experiment` directory, not production.
Duration validation now precedes production audio writes. Commands, a
conservative three-request estimate and the listening checklist are in
`docs/audio-plan.md` § T158. **Still pending:** AWS approval and execution,
listening through the playback DSP, selecting the pronunciation, verifying
all durations, regenerating the production MP3s and calibrating the manifest.

**T158 first audition and pacing follow-up, 2026-11-07 (still partial).** The
builder ran the three pronunciation clips and chose **IPA schwa**, but found
the stutters and overall speech too slow. Measured greeting-015 durations:
alias 16992 ms, schwa 16560 ms, strut 16344 ms; shipped baseline 12792 ms.
All three trials exceed the unchanged 15000 ms ceiling. The first probe and
pronunciation selection are now complete, superseding those pending items
above; final pacing is not accepted.

RED→GREEN adds `generate:greetings --pace-experiment --only greeting-015`:
two isolated schwa clips at 115% overall rate and 50 ms onset gaps, with
`pace-snappy` additionally wrapping just the repeated onsets in `x-fast`.
The original pronunciation trials and production assets are preserved.
Commands, the two-request cost bound and raw/reconstructed DSP measurements
are in `docs/audio-plan.md` § T158. **Still pending:** builder generation and
listening of the faster trials, final in-app acceptance, greeting-005 and
non-`b` checks, all-pool regeneration and manifest calibration. The builder
wants replay/static effect triggers for greetings **after** base pacing is
right; this follow-up changes no DSP settings or trigger wiring.

**T158 second audition and stutter-only follow-up, 2026-11-07 (still partial).**
The builder preferred `pace-snappy` and explicitly approved its overall speech
speed, requesting faster stuttering only. Actual greeting-015 measurements:
`pace-faster` 15408 ms; `pace-snappy` 14976 ms, only 24 ms below the ceiling.
The latest `--pace-experiment` now compares `pace-snappier` (20 ms onset gaps)
with `pace-rapid` (no inserted gaps); both preserve 115% normal speech, schwa,
onset-only `x-fast`, dialogue and other pauses. Prior candidates are preserved.
New generation and listening remain pending, as do final in-app acceptance
and all-pool production regeneration. See `docs/audio-plan.md` § T158.

**T158 decision and production regeneration, 2026-11-07.** The builder listened
and chose **`pace-rapid`** (schwa, 115% speech, onset-only `x-fast`, no inserted
gaps; "almost too fast"). A `pace-gap-5ms` trial was not better, and numeric
onset rates of 180% and 200% saved only 240 and 360 ms, so the gaps, not the
onset rate, are the lever. `rapid` is now the default `SpeechPacing`, and the
builder regenerated all 16 production MP3s and calibrated the manifest. Measured
durations span 8424 to 14736 ms, inside the 1000 to 15000 ms bounds, with no
clamping. See `docs/audio-plan.md` § T158. **Still pending:** in-app listening
through the playback DSP, and the greeting-005 and non-`b` onset checks.

**T158 Standard engine switch, 2026-11-14 (still partial).** RED→GREEN switches
`buildSynthesisInput` in `scripts/greetingGenCore.ts` to `Engine: 'standard'`
(amendment A6, C10). The builder deferred regeneration until after the first
deploy, so it does not block it. **Still pending:** full-pool regeneration on
Standard, which is the first listen to Standard Matthew (record the verdict in
research.md § Q1); manifest calibration, including `voiceConfig.engine`; and
the in-app and onset checks above. See `docs/audio-plan.md` § Generator
switched to Polly Standard.

## Phase 15: Deployment-readiness convergence (2026-11-15)

**Source:** the deployment review at `docs/reviews/2026-11-15-agent-infra-deployment-review.md`
and approved safety defaults in spec.md's Session 2026-11-15. These tasks extend,
not renumber or silently redefine, the earlier tasks. The initial reviewable
batch is T159-T162; it is not deployment readiness.

- [x] T159 RED: extend `packages/agent/tests/session/controlTable.test.ts` to require strongly consistent allowlist, friend, session, spend and HALT reads, create-if-absent sessions, rejection of competing snapshot updates and stale completions, and conditional replacement of ended sessions. Use a stateful item boundary plus actual command-expression assertions; confirm the nine cases fail for these behavioral gaps, not setup errors.
- [x] T160 Implement strong control reads and expected-snapshot session writes in `packages/agent/src/session/controlTable.ts` until T159 passes. Preserve explicit conditional failures; do not add a silent overwrite or retry already-spent work.
- [x] T161 RED: extend `packages/agent/tests/spend/usage.test.ts` so request usage wins over lifetime metrics, lifetime-only results fail loudly, and two real SDK Agent invocations with mocked Bedrock transport each report 250 rather than 250 then 500. No live model calls.
- [x] T162 Read request-scoped usage in `packages/agent/src/spend/usage.ts`, keep the invocation handler/fixtures consistent, and update the live data-model/plan references until T161 and the existing related tests pass. This does not complete cancelled/error settlement.
- [x] T163 RED: extend handler/runtime-config/tool tests for the approved 16 KiB body, 32 KiB model input, 8 KiB tool result, 4 model calls, 4 tool executions, 1,000 generated tokens, 64,000 billed-token loop cutoff and 60-second deadline. Pin oversized chunked-body early refusal, bounded valid history/tool structure, limit-stop terminal errors and cancellation accounting. Keep the between-call billed-token overshoot explicit.
- [x] T164 Implement the T163 limits/configuration/CDK wiring in the existing runtime and tool paths. Shrink the next call's generated-token allowance to remaining session/turn capacity. Bound and reserve the final call; do not treat SDK heuristics or between-turn limits as exact pre-spend accounting.
- [x] T165 Prepare/review/apply the authorized P2 amendment and reconcile the cost model for $5 non-chat headroom, $11 soft-degrade and $15 application admission refusal. Preserve $10/$16 gross emails and the delayed $20 backstop. Document that an AWS invoice ceiling is not guaranteed; follow constitutional governance/versioning. Do not deploy while this is pending. **Applied 2026-11-16 as amendment A7**, constitution 1.8.0 → 1.9.0 (MINOR), on the C9 branch route. P2 now has two named layers, gate 1 names the $11 application threshold, and P2 states plainly that the layers do not guarantee an invoice under $20. research.md § Q6, § F and § Amendments, and contracts/runtime-config.md, are reconciled to $11/$15
- [x] T166 RED: extend session/breaker/handler tests for one active request per verified friend, two globally, immediate busy/no queue or automatic replay, atomic conservative reservations, exactly-once settlement, month rollover and retained uncertain spend/capacity on crash or missing usage. Verify conflicts cannot reset another counted session, admit against the same capacity or lose billed work.
- [x] T167 Implement T166 admission/finalization with the control table and verified identity. Depends on T164/T165 and existing T059/T090/T091/T075-T077. Expiry never refunds uncertain reservations; failures alarm and require reconciliation. Re-price the additional control writes before deploy.
- [x] T168a RED: extend readiness/warm-up/registry/observability tests to prove retained serving transport resources, independent request span trees and first-token completion before reply completion. Review Node-compatible telemetry dependencies, privacy defaults and destination permissions before adding packages. **Done for the API boundary** (C41): `tests/index.observability.test.ts` and `tests/handlers/observability.test.ts` prove per-request span trees, first-token completion before `reply.complete`, and Polly/memory client reuse.
- [x] T168b Review the ADOT package (`@aws/aws-distro-opentelemetry-node-autoinstrumentation`), its privacy defaults and the Transaction Search destination permissions before adding it to the image. Done 2026-11-16 as a review, with nothing added: research.md § R-obs, ADOT review; outcome in C47.
- [x] T169a Request-scoped OpenTelemetry API spans in `observability.ts` and `index.ts`, verified with an in-memory exporter. The JSON stdout sink is removed.
- [x] T169b Wire the provider and exporter (ADOT launcher) in the Dockerfile; the live AgentCore check is T174. P9 tracing is a release gate, not optional polish; do not claim JSON stdout is trace export. Done 2026-11-18 with option (a) of C47, per spec Session 2026-11-18: ADOT 0.13.0, with 12 scoped overrides in `pnpm-workspace.yaml` (`pnpm audit` clean). Compatibility was checked locally under `node --require …/register` with a console exporter: an ESM span through the agent's own `@opentelemetry/api` reached ADOT's `NodeTracerProvider`, and the patched `instrumentation-http` 0.222.0 exported client and server spans with no load errors. The tracing variables are in `RUNTIME_CONFIG` (contracts/runtime-config.md § Tracing). Transaction Search is enabled in `OpsStack`. **T174 must still confirm** that spans reach X-Ray, and that content capture is still `false` once AgentCore Runtime adds its own OpenTelemetry variables.
- [x] T170 RED: extend app/frontend stack/build tests for bootstrap without `dist` or production outputs, explicit publication failing when required assets/configuration are absent, successful publication/invalidation, a dependency-free Budget stack and 14-day retention on generated Lambdas in both modes.
- [x] T171 Implement the reviewed bootstrap/publication separation with T040/T061 and reconcile T116/T123. Provide honest offline build configuration for validation without weakening production required-output checks.
- [ ] T172 Verify AgentCore/source timestamp and consolidation semantics, then revise T086-T088/T092-T093 for true 30-day retention even for active friends. The verification is recorded as 2026-11-17 (C35), which is future-dated as of 2026-11-16 (C36); keep this task open until the sources are checked. T087/T088/T093 and the agent-side T086/T092 are complete. RED proves old data is removed while recent data remains, pagination/deletion failures are explicit, and housekeeping cannot reset retention. Do not invent an API or use `lastSeenAt` alone as the deletion rule.
- [ ] T173 Reconcile remaining affected spec/plan/contracts/quickstart prerequisites and dependencies for the approved safety profile, unapplied/applied amendments, C5's model/S2 re-scope and mandatory P9. Keep original decisions/probe history, append deviations, and use non-destructive analysis rather than regenerating established artifacts. Preserve T158's already-recorded post-deploy Standard-audition deferral. **Progress:** the soft-degrade/breaker threshold text is reconciled (C43). Still open: C5's model/S2 re-scope, mandatory P9 and the quickstart prerequisites.
- [ ] T174 After the complete migration, T164/T167/T169/T171/T172 and existing T116-T129, verify the exact candidate and the controlled live V-01-V-16 scenarios before inviting friends. AWS deployment/billable probes need separate approval and temporary credentials. Preserve spend protection during rollback; keep T005b/S2 and the measured-month follow-up visible. Update the wiki only with publication approval.

## Phase 16: Branch review follow-up (2026-11-16)

**Source:** the 2026-11-16 review of this branch (C44, C45). No review document is checked in: the findings live in these tasks and in issues #83–#91. Only what stops the first AWS deployment is a task here.

- [x] T175 Fix the five defects in C44, test-first (RED seen for the intended reason, then GREEN). Frontend: `tests/App.test.tsx` (sending from `INITIALIZING` and `SIGNAL_LOST`; the audio players are created once), `tests/hooks/useAudio.test.ts` (two turns, each numbering its segments from 0). Agent: `tests/index.invocationFailure.test.ts` (a failure after the response started does not crash the process), `tests/index.admission.test.ts` (a cancelled turn settles at the reservation, sends no `done` and writes no memory), `tests/limits/turnLimits.test.ts` § where it cuts. `pnpm run validate` exits 0.
- [ ] T176 Open a draft PR into `main` so the required `CI` and `Audit` checks run on Ubuntu. `ci.yml` triggers only on pull requests and pushes to `main`, so this branch has never had a CI run; only a Windows `validate` backs it. Do this before T116, and fix anything that fails only on Linux (line endings, paths).
- [x] T177 Fix #76 before T123 publishes the frontend. `audioChain.ts` loads each worklet with `new URL('./xProcessor.ts', import.meta.url)`, which a production build inlines as a `data:video/mp2t` raw-TypeScript URL. Browsers reject it, and CSP `script-src 'self'` would block a `data:` URL anyway, so greetings and replies are silent in production. RED first: a build-level test that no worklet URL in `dist` is a `data:` URL or a `.ts` file. See wiki `Component-Audio-Chain` § Production builds cannot load the worklets. #77 (the broken stutter worklet) is related. The infra deploys T119–T122 do not depend on this. Done 2026-11-16: the processors are imported with Vite's `?worker&url`, so the build emits each as a compiled same-origin `/assets/*Processor-*.js`; `tests/audio/workletAssets.test.ts` builds the client and failed first on the `data:` URL and missing processor scripts. Not yet heard in a real browser (T174). #77 is untouched.
- [x] T178a Replace Google Custom Search with AgentCore `InvokeWebSearch` (C46, #87). RED seen for the intended reasons, then GREEN. `webSearchTool.ts` sends `InvokeWebSearchCommand` (`web-search.v1`, at most 5 results, query at most 200 characters) through an injected client, forwards the abort signal and drops a result with no URL. `runtimeConfig` no longer reads `SSM_PARAM_SEARCH_*` (36 variables). `agent-stack.ts` loses the two search parameters and gains `bedrock-agentcore:InvokeWebSearch` on `arn:aws:bedrock-agentcore:<region>:aws:tool/web-search.v1`; the hard stop denies it. Tests: `tools/webSearchTool.test.ts`, `index.cancellation.test.ts`, `config/runtimeConfig.test.ts`, `index.readiness.test.ts`, infra `agent-stack.test.ts` and `hard-stop.test.ts`. Contracts `runtime-config.md` and `spend-control.md` updated.
- [x] T178b Decide what the runtime does when a weather or news key is absent. `runtimeConfig.ts` reads both parameters from SSM at startup and throws if either is missing or empty, so one missing key stops the runtime booting. The tools already return `missingCredential`. Either (a) the builder confirms both parameters exist for T118 and T121, or (b) the credentials become optional, in line with the graceful-degradation guardrail (RED then GREEN, and update `contracts/runtime-config.md`). Needs a builder decision; gates T121. **Done 2026-11-18, option (b)** (spec Session 2026-11-18). A `ParameterNotFound` or an empty value leaves the key `undefined` with a warning. Any other read failure still fails startup. RED seen in `tests/config/runtimeConfig.test.ts` for the intended reasons. `contracts/runtime-config.md` § Secrets updated. T121 no longer needs either parameter to exist.
- [ ] T180 Part of T174: make one real `InvokeWebSearch` call from the deployed role (it falls inside the 5,000 free queries, but spends the builder's quota, so ask first). Confirm the role's permission works, the quality of the results for the persona's typical questions, that a Free-plan account gets the free queries (AWS says "every AWS account"; not verified), and the real text-extract length against `TOOL_RESULT_MAX_BYTES`. Do this before T130.
- [x] T181 Decide two things the swap leaves open, and record each as a spec 003 clarification before coding. (1) **Citations**: AWS's acceptable-use terms require the source link to be retained and displayed with each result shown to a friend. Today the persona may relay a result without surfacing its URL. (2) **Metering**: the breaker prices model, voice, memory and runtime but not searches, which cost $7 per 1,000 after the free 5,000 a month. Either price them (a new `PRICE_*` variable) or show the F reserve covers the worst case. No per-session search cap exists either; `TURN_MAX_TOOL_EXECUTIONS` bounds a turn only. Do not invent the numbers. **Done 2026-11-18** (spec Session 2026-11-18): links in the UI beside the reply, searches priced at `PRICE_WEB_SEARCH_MICRO_USD` 7,000 with the free allowance not credited, and `SESSION_MAX_WEB_SEARCHES` 10. RED seen for the intended reasons, then GREEN. Agent: `tools/webSearchTool.test.ts` § searchForTurn, `index.webSearch.test.ts`, `spend/usage.test.ts`, `spend/reservation.test.ts` (each tool execution is reserved as a search), `handlers/sessionManager.test.ts`, `session/controlTable.test.ts`, `config/runtimeConfig.test.ts`, `index.cancellation.test.ts`. Frontend: `hooks/useAgentStream.test.ts`, `components/BroadcastText.test.tsx`. Infra: `agent-stack.test.ts`. Contracts `runtime-config.md` (38 variables) and `transport-sse.md` (`sources` event), and `data-model.md` (`webSearches`), updated. **Adversarial follow-up:** persistent claims now increment `SESSION#<sub>.webSearches` atomically before outbound execution, survive cancellation/failure, reject stale snapshots and are written back as an absolute count without turn-local double counting.
- [ ] T179 Part of T174: against live Bedrock, run a conversation long enough that `boundModelInput` trims it, including a tool round trip, and confirm Bedrock Converse accepts what remains. T175's tests pin the cut rule (a genuine user message, and never the turn in progress) but it has not been exercised live. Do this before T130.

## Phase 17: PR 92 adversarial review remediation (2026-11-24)

**Source:** the adversarial review of PR 92. No review document is checked in:
the findings and their TDD plan are in
`docs/tdd-plans/PR-92-Adversarial-Review-TDD-Plan.md`.
T182 and T183 are merge blockers for spend integrity; T184-T188 do not defer
until after merge.

- [x] T182 RED: add stateful admission tests that commit the DynamoDB
  transaction and then return a timeout/lost-response error, plus the inverse
  with no matching lease. Assert exact-request reconciliation uses a strongly
  consistent `LEASE#<sub>` read and that unresolved admission starts no model
  work. GREEN: reconcile exact request IDs in
  `packages/agent/src/session/controlTable.ts`, fail closed on no matching
  lease, preserve `friend_busy` for another holder, and document the behavior
  in `contracts/spend-control.md`.
- [x] T183 RED: extend `packages/agent/tests/index.cancellation.test.ts` so
  aborted/deadline-expired Polly synthesis with a positive character count
  asserts that settlement includes that billed voice work. GREEN: copy
  `PollySynthesisError.pollyCharacters` into the settlement counter before
  applying cancellation/deadline branches, preserving full-reservation
  settlement when usage is missing.
- [x] T184 RED: add a synthesized `AgentStack` test that the runtime application
  log group or retention custom resource has 14-day retention and depends on
  runtime creation. Verify the pinned CDK and primary AWS documentation for
  the exact AgentCore runtime log-group name before choosing the GREEN
  mechanism. GREEN: use the pinned L2 Runtime's explicit
  `APPLICATION_LOGS` CloudWatch delivery to
  `/aws/vendedlogs/bedrock-agentcore/max-height` with `TWO_WEEKS`
  retention and no guessed service-managed runtime ID.
- [x] T185 RED: add an `index.memory.test.ts` case for an existing counted
  `continue` session with no in-process registry entry; assert memory retrieval
  succeeds once on that fresh agent and does not repeat while the agent is
  reused. GREEN: return enough acquisition information from `AgentRegistry`
  for `index.ts` to rehydrate memory once on a fresh agent.
- [x] T186 RED: update `useAgentStream.test.ts` so HTTP 429 proves one fetch,
  no automatic retry, an active session state, and the existing in-character
  busy outcome. GREEN: map platform 429 to transient busy, leaving
  application-SSE `rate_limited` on its existing terminal behavior.
- [x] T187 RED: add `useAudio.test.ts` coverage for cancelling active and queued
  clips, and App tests for power-off/channel/send interruption. GREEN: add a
  non-disposing audio cancel operation that stops the active voice source,
  clears the queue and stops mouth polling; invoke it from power-off, channel
  change and new-send paths. Follow-up C49 verifies channel change also aborts
  the in-flight Agent stream.
- [x] T188 RED: add direct-invocation and prompt tests for 50 Unicode-code-point
  aliases, 51-character rejection, control/format characters, whitespace
  normalization and quote/backslash framing. GREEN: normalize and reject
  aliases in `isInvocationBody`, and escape or omit accepted aliases in
  `buildSystemPrompt()` without treating them as instruction policy.

## Phase 18: Pre-deployment adversarial findings (2026-11-25)

**Source:** `docs/tdd-plans/Adversarial-Findings-Four-Fixes-TDD-Plan.md`.
These merge-gating spend-integrity fixes are implemented before AWS deployment.

- [x] T189 RED: add refusal-order tests proving a tripped breaker, busy
  admission, session cap, allowlist refusal or invalid action consumes neither
  the fixed-window counter nor the model or memory SDK. GREEN: move
  `consumeRate()` behind successful admission and pre-admission/session
  refusals; settle a just-created lease at zero for a rate refusal.
- [x] T190 RED: add deadline tests for model work and memory retrieval that
  expect `turn_deadline`, not `session_cap_exceeded`, and keep the counted
  session active. GREEN: add the agent/frontend deadline code and update the
  transport contract.
- [x] T191 RED: add cancellation and missing-usage settlement tests proving
  no memory-retrieval or model cancellation settles below the admitted
  reservation. GREEN: initialize settlement to the reservation immediately
  after admission and replace it only with verified usage.
- [x] T192 RED: add persistent web-search claim tests for cancellation, failure,
  allowance exhaustion and stale session snapshots. GREEN: conditionally
  increment `SESSION#<sub>.webSearches` before outbound search; pass the claim
  callback through invocation state and preserve absolute session counts
  without final-write double counting.
