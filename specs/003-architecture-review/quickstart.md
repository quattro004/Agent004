# Quickstart: Deploy and validate Max Height on AWS

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Research**: [research.md](./research.md)

This is a run and validation guide for the first deployment. It does not restate the design. Every behavior it checks is defined in a contract or in research, and each step links there. It contains no implementation code.

## Conventions

- **Credentials**: temporary only (P11).
  - Sign in to the console as the deploy user and open CloudShell.
  - Export the CloudShell session's credentials into the local shell ([research.md](./research.md) § R-deploy).
  - Never create access keys.
- **CDK**: run from `packages/infra` as `pnpm exec cdk deploy <stack> -c budgetAlertEmail=<owner email>`.
  - Every `synth`, `diff` and `deploy` needs that context value. Never commit the address (AGENTS.md).
  - Add `--outputs-file "$env:TEMP\max-height-outputs.json"`. `.gitignore` does not cover an outputs file, so it stays out of the working tree.
- **Personal data**: friends' emails, `sub` values and message text go only in the operator's log, outside the repository and the wiki. [§ Results](#results) holds dates, outcomes and evidence pointers such as a trace ID.
- **Placeholders** are in angle brackets. `<control table>`, `<runtime role>`, `<hard-stop topic>` and `<pruner>` come from the outputs file or the stack resources.
- **A failed check stops the run.** Fix it, or record an exception with its reason, before the next step.

## Prerequisites (FR-033)

Record each one in [§ Results](#results) before the first spend-bearing stack deploys (deploy step 3).

| # | Prerequisite | How | Source |
| --- | --- | --- | --- |
| 1 | Free plan end date and remaining credits | Read them in the Billing console. V-17's month must end before the plan does. | FR-028, SC-019 |
| 2 | Spikes run and the model adopted | S0 → Q2 decision → S1 pass → S2 measurement, each approved before it runs | research § Spikes, Q2; [s0-probe-matrix.md](./contracts/s0-probe-matrix.md); [s1-golden-set.md](./contracts/s1-golden-set.md) |
| 3 | Cost projection at or below $8, gross of credits | Every human-read price is read and dated, including the Memory extraction cost | research § R-cost; SC-002, gate 1 |
| 4 | Model access and quotas | The adopted model's Service Quotas in `us-west-2`, compared with spec 001's peak | research § R-deploy, Quotas |
| 5 | One-time administrator setup | In CloudShell, as an administrator, once: `cdk bootstrap` for `us-west-2` and `us-east-1`. Create the deploy user, its deploy policy and the operator policy ([§ Operator permissions](#operator-permissions)), and the SSM parameters (row 7). | research § R-deploy (the `AdministratorAccess` default awaits builder confirmation) |
| 6 | ARM64 build path | Docker Desktop is running, and `docker buildx ls` lists `linux/arm64` | research § R-deploy |
| 7 | SSM SecureStrings in `us-west-2` | `/max-height/weather-api-key`, `/max-height/news-api-key`, the two search parameters and `/max-height/google-client-secret`. A missing one fails the deploy or the runtime's startup. | [runtime-config.md](./contracts/runtime-config.md) § Agent runtime; [auth-and-allowlist.md](./contracts/auth-and-allowlist.md) § Google client secret |
| 8 | Cognito domain prefix chosen | `aws cognito-idp describe-user-pool-domain --domain <prefix>` returns an empty `DomainDescription`. Commit the prefix as the constant. | auth-and-allowlist § Cognito resources (Deploy-time values) |
| 9 | Google OAuth client registered | A web application client with the redirect URI and origin for `<prefix>`, and the scopes `openid email`. Read and record the "Testing" status limits, which are unverified. Commit the client ID; the secret goes in row 7. | auth-and-allowlist § Third-party registration; FR-054 |
| 10 | A second Google account | Acts as "another friend" in V-04, V-05 and V-07. It is allowlisted only for those scenarios. | — |
| 11 | `pnpm run validate` passes on the commit being deployed | Every RED test in [§ RED tests](#red-tests-p10) is green | constitution P10 |
| 12 | Cost-allocation tag active | After deploy step 1, `project` appears on the Billing "Cost allocation tags" page; activate it. Allow up to 48 hours in all. | research § R-deploy; P-06 |

## Operator permissions

The operator policy grants exactly these calls, each scoped to the resource named. IAM action names and resource types are checked against the service authorization reference when the policy is written.

| Call | Resource | Used by |
| --- | --- | --- |
| DynamoDB `get-item`, `put-item`, `update-item`, `delete-item` | The control table | Allowlist ([auth-and-allowlist.md](./contracts/auth-and-allowlist.md) § Allowlist operations), recovery, V-05, V-13 |
| Lambda `invoke` | The pruner only | Delete on request; V-07 |
| Cognito `admin-delete-user`, `list-users`, `describe-user-pool-client` | The user pool | Delete on request; V-03, V-06 |
| Cognito `describe-user-pool-domain` | — | Prerequisite 8 |
| IAM `get-role-policy`, `delete-role-policy` | The runtime execution role only | V-12; recovery step 3 |
| SNS `publish` | The hard-stop topic only | V-12 fallback |
| Budgets: create and delete a budget and its notifications | The test budget `MaxHeight-AlertDemo`, where Budgets supports resource scoping | V-11, V-12 |
| Budgets and Cost Explorer reads | Account | V-11, V-17; recovery step 1 |
| CloudWatch Logs, metrics, X-Ray and Transaction Search reads | Account | Span and log checks; V-16 |
| CloudFormation `describe-stacks`, `list-stack-resources` | `MaxHeight-*` stacks | V-06 |
| AgentCore control-plane reads for the runtime and the memory; Memory `ListSessions`, `ListEvents` | The one runtime and the one memory | V-01, V-07 |
| Service Quotas reads | Account | Prerequisite 4 |

## Deploy order

Each step finishes before the next. `cdk deploy <stack>` also deploys any dependency not yet deployed, so follow this order to make each check at its step.

1. **`MaxHeight-Budget`.** It takes no props from another stack ([spend-control.md](./contracts/spend-control.md) § Budget). Check that `MaxHeight-Monthly` has its 50%, 80% and 100% notifications, with credits excluded.
2. **Cost-allocation tag** (prerequisite 12). No spend-bearing stack deploys until `project` is active.
3. **`MaxHeight-Certificate`** (`us-east-1`). While the deploy waits, read ACM's validation CNAME from the ACM console or the stack events, and add it at GoDaddy ([csp-and-hosting.md](./contracts/csp-and-hosting.md) § GoDaddy records). The deploy finishes when ACM issues the certificate.
4. **`MaxHeight-Data`.**
5. **`MaxHeight-Cognito`.** It needs prerequisites 7 to 9. The `idp-secret` custom resource fails the deploy if the secret is missing.
6. **`MaxHeight-Agent`.** It builds the ARM64 image locally (prerequisite 6) and creates the runtime. Run V-01.
7. **`MaxHeight-Ops`.** Confirm the `OpsAlarmTopic` subscription email and check that the four alarms exist (spend-control § Operations alarms). Until this step, a 100% alert reaches no hard stop.
8. **Build the frontend.** Write the `VITE_*` values ([runtime-config.md](./contracts/runtime-config.md) § Frontend build) from the outputs file into `packages/frontend/.env.production.local`, which `.gitignore` covers. Then run `pnpm --filter @max-height/frontend run build`. The build fails if any value is missing.
9. **`MaxHeight-Frontend`.** `BucketDeployment` uploads `packages/frontend/dist` and invalidates `/*` (research § R-deploy).
10. **GoDaddy `max` CNAME** to the `DistributionDomainName` output (csp-and-hosting § GoDaddy records). When `https://max.recipieces.com/` loads, run V-06.
11. **First allowlist entry**: the builder's own address only. Friends are added at the end of [§ Run order](#run-order).

## Run order

After deploy step 11:

1. V-02, then V-15 from V-02's spans
2. V-03
3. V-13, before any friend is allowlisted, so no friend is refused
4. V-14
5. V-07, V-05, then V-04, which use the second account (prerequisite 10)
6. V-08, V-09 and V-10
7. V-16
8. V-11, then V-12
9. **Invite friends**: one `put-item` per friend (auth-and-allowlist § Allowlist operations)
10. V-17, at the end of the first full month

## Scenarios

### V-01 Runtime readiness (W26)

- **When**: deploy step 6. This is the first use of AgentCore Runtime and Memory ([s0-probe-matrix.md](./contracts/s0-probe-matrix.md) § Rules).
- **Steps**:
  1. Read the runtime's status and platform version, in the AgentCore console or with the control-plane read.
  2. Read the memory's status.
  3. Read the runtime's log group for its startup.
- **Expected**:
  - The runtime is ready on Runtime V2, and the memory is active.
  - Startup completes with no `AccessDenied`, including on the warm-up's `bedrock:ListAsyncInvokes` ([runtime-config.md](./contracts/runtime-config.md) § Execution role).
- **If it fails**: the `AccessDenied` names the missing grant. Add a failing `agent-stack.test.ts` assertion for it before changing the role.
- **Record**: W26 as Verified or Refuted in research § Verification record.

### V-02 Streaming through CloudFront (Q4)

- **Steps**:
  1. Signed in as the builder, ask something whose reply spans several increments.
  2. In the browser's network panel, open the `invocations` request.
  3. Start another long reply, and close the tab mid-stream.
- **Expected**:
  - Step 2: `200` and `text/event-stream`. Events arrive over time in the order `session`, `text`…, `done`, with `audio` interleaved ([transport-sse.md](./contracts/transport-sse.md) § Framing). The request carried `Authorization` through CloudFront to the authorizer (transport-sse § CloudFront behavior). V-06 covers the case with no token.
  - Step 3: that request's `invocation` span has `cancelled` set to true (transport-sse § Cancellation).
- **If it fails**:
  - The stream arrives in one burst, or `Authorization` does not reach the authorizer: build the Lambda streaming proxy fallback (plan § Complexity Tracking). It is a new resource, so it is costed and approved first.
  - `cancelled` is false: CloudFront did not close the origin connection. Record it under research Q4 for a decision. The turn's usage is still counted either way.

### V-03 Sign-in, allowlist and verified email (SC-001, SC-014, SC-015)

- **Steps**:
  1. In a fresh browser profile, the builder signs in with Google and holds a multi-turn conversation until Max signs off or the builder stops.
  2. In another fresh profile, try to sign in with a Google account that is not on the allowlist.
  3. Unverified email: Google reports Gmail addresses as verified, so a live case may not be producible. Record whether it was.
- **Expected**:
  - Step 1: Google opens directly, with no Cognito page. The conversation stays in character with no stub path, and Max's sign-off arrives as `done` with `state` `SIGNED_OFF`. Google is the only adopted provider (P-02), so this also proves SC-015.
  - Step 2: the in-character denial ([auth-and-allowlist.md](./contracts/auth-and-allowlist.md) § Denial copy). `list-users` shows no user for that address, and no `invocation` span exists for it (SC-014).
  - Step 3: whether or not it is producible live, the trigger RED tests cover it.

### V-04 Revocation (SC-016)

- **Steps**:
  1. Allowlist the second account, sign in with it, and send a message.
  2. Delete its `ALLOW#` item.
  3. Send another message in the same counted session.
  4. End that session (Max's sign-off, or the 30-minute cap), then send a message.
  5. In a fresh profile, sign in with the same account.
  6. Leave the original tab open until its access token refreshes.
- **Expected**: step 3 continues; step 4 gets `not_allowlisted` and the denied state; steps 5 and 6 are denied by pre token generation, and step 6 shows the signed-out state. This is [auth-and-allowlist.md](./contracts/auth-and-allowlist.md) § Revocation timeline, row by row.

### V-05 Forged identifiers (SC-006)

- **Setup**:
  - Both accounts are allowlisted, and each has sent a message and has at least one memory record (V-07).
  - Copy the builder's access token from a request's headers, the second account's runtime session ID from its `sessionStorage`, and one of its memory record IDs from its export.
  - `get-item` both friends' current `RATE#` and `SESSION#` items.
- **Steps**: as the builder, send these to `/runtimes/<encoded ARN>/invocations`:
  1. A chat turn whose body sets `sessionId` and `actorId` to the second account's values.
  2. `memory.delete` with the second account's record ID.
  3. A chat turn with the second account's runtime session ID in the session header.
- **Expected**:
  - Step 1: handled as the builder. The `invocation` span's `countedSessionId` is the builder's, and only the builder's `RATE#` item changes ([transport-sse.md](./contracts/transport-sse.md) § Body).
  - Step 2: `not_found`. The record is still listed for its owner ([memory-api.md](./contracts/memory-api.md) § Friend-facing operations).
  - Step 3: `session_mismatch`.
  - In every step, the second account's `RATE#` item, `SESSION#` item and memory are unchanged.

### V-06 Signed-out audit and HTTPS (SC-017, SC-018)

- **When**: deploy step 10, before any allowlist entry. Repeat after any stack change.
- **Steps**:
  1. `POST` to `https://max.recipieces.com/runtimes/<encoded ARN>/invocations` with no `Authorization`.
  2. List the resources of every `MaxHeight-*` stack.
  3. Request `/`, `/privacy` and the runtime path over plain `http://`.
  4. Read the app client's callback and sign-out URLs.
  5. Open `/`, `/privacy` and `/auth/callback` directly, and request an asset that does not exist.
- **Expected**:
  - Step 1: `401` or `403` with a non-HTML content type, so it is not rewritten to `index.html` ([csp-and-hosting.md](./contracts/csp-and-hosting.md) § SPA routing). No `invocation` span: the container never ran.
  - Step 2: no API Gateway API, Lambda function URL, Cognito Identity Pool or WebSocket resource. The only public entry points are CloudFront (static content), the Cognito domain (gated by the triggers, V-03) and the runtime (JWT, step 1).
  - Step 3: redirected to `https://` (csp-and-hosting § HTTPS everywhere).
  - Step 4: every URL is `https://`, and none is `localhost`.
  - Step 5: each route serves the app. `/privacy` is readable while signed out (FR-053). The missing asset gets S3's `403`.

### V-07 Memory (FR-014; spec 001 FR-017, FR-018)

- **Steps**:
  1. In a counted session, tell Max a durable fact about yourself, then let Max sign off.
  2. Open "What Max remembers" until a record appears, and note how long extraction took.
  3. In a new counted session, ask about the fact.
  4. Export, delete one record, then use "Forget me".
  5. As the operator, invoke the pruner in single-friend mode with the second account's `sub` ([memory-api.md](./contracts/memory-api.md) § Pruner).
  6. The next day, read the pruner's scheduled run.
- **Expected**:
  - Step 3: Max uses the fact, and the `memory.retrieve` span has a `count` of at least 1.
  - Step 4: a `.json` download of the listed records; the deleted record is gone. "Forget me" reports `recordsDeleted` and `eventsDeleted`. After it, the list is empty, and `ListEvents` returns nothing for every session that `ListSessions` lists for the builder's `sub` ([memory-api.md](./contracts/memory-api.md) § Friend-facing operations).
  - Step 5: the second account's records and events are gone.
  - Step 6: no `Errors`, and the pruner alarm stays OK.
- **Record**: the extraction time from step 2, beside the Q8 decision.

### V-08 Voice falls back to text (gate 4)

- **Steps**:
  1. Mute voice in the app and send a message.
  2. Observe the breaker's degrade step in V-13.
- **Expected**:
  - Step 1: `session` has `voice` `off`; text only, with no `audio` events; `reply.complete` has `pollyCharacters` 0.
  - Step 2: Max announces the change once, in character, and then replies in text only ([spend-control.md](./contracts/spend-control.md) § Breaker).
  - Neither uses browser speech synthesis (research Q1).

### V-09 Signal lost (gate 4)

- **Steps**: mid-reply, set the network panel to offline. Go back online and send a message.
- **Expected**: the signal-lost state with no raw error, and the next message succeeds ([transport-sse.md](./contracts/transport-sse.md) § Response). A `5xx` and a stream that ends without `done` share that table row and are covered by RED tests.

### V-10 In-character failure states (gate 4)

- **Steps**:
  1. Copy the `/auth/callback` URL from a sign-in, change its `state` value, and open it.
  2. Delete the refresh token from `sessionStorage` and reload.
  3. Review the denied, revoked and hard-stop states from V-03, V-04 and V-12.
- **Expected**: step 1 shows the sign-in error state and discards the code; step 2 shows the signed-out state with a sign-in button ([auth-and-allowlist.md](./contracts/auth-and-allowlist.md) § Browser flow). No state shows a raw error. The rate-limited and session-cap states are covered by RED tests only, because triggering them live costs 60 messages or 50 turns.

### V-11 Alert emails (SC-003, alert tiers)

- **When**: month-to-date gross spend is above zero (after V-16).
- **Steps**:
  1. Read month-to-date spend with credits excluded, in Cost Explorer.
  2. Create a temporary cost budget, `MaxHeight-AlertDemo`. Make it monthly, with credits, refunds and discounts excluded, and a limit at or below the figure from step 1. Give it ACTUAL email notifications at 50% and 80% to the owner email. Budgets without actions are free ([AWS Budgets pricing](https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/)).
  3. Wait for the next Budgets update. "AWS Budgets information is updated up to three times a day. Updates typically occur between 8 to 12 hours after the previous update" ([Budgets console help](https://docs.aws.amazon.com/help-panel/cost-management/latest/console/hp-budgets-overview-table.html)).
  4. Read `MaxHeight-Monthly`'s notifications.
- **Expected**: one email per tier. `MaxHeight-Monthly` has the same two email notifications at 50% and 80%, which are $5 and $8. That is the configuration this demonstration stands in for, and `budget-stack.test.ts` asserts it.

### V-12 Hard stop and recovery (SC-003, SC-005; FR-021)

- **Setup**: the builder is signed in, mid-session, in browser A. The second account is allowlisted and signed out.
- **Steps**:
  1. Add an ACTUAL 100% notification to `MaxHeight-AlertDemo`, with the hard-stop topic and the owner email as subscribers. The topic policy accepts any budget in this account (`budget-stack.ts:86-99`), so this drives the real path from Budgets to SNS to the hard stop. Wait for the next Budgets update.
     - **Fallback**: if no 100% email arrives after two updates, `sns publish` to the hard-stop topic. That proves the path from SNS to the hard stop, but not from Budgets to SNS. Record which path ran.
  2. Confirm the halt: the 100% email, the hard-stop Lambda's log line, `CONTROL#HALT` with `reason` `budget-100`, and the deny policy on the runtime role ([spend-control.md](./contracts/spend-control.md) § Hard stop).
  3. Try every path: browser A sends a message; browser A opens "What Max remembers"; the second account signs in from a fresh profile; browser A refreshes its token.
  4. Delete `MaxHeight-AlertDemo`.
  5. Recover with spend-control § Recovery, steps 1 to 5. Step 2's wait does not apply: `MaxHeight-Monthly`'s own 100% alert has not fired this period, so the real hard stop stays armed. Record that reason in the operator's log.
- **Expected**:
  - Step 3: the message and the action get `halted` and the hard-stop state; the sign-in and the refresh are denied (spend-control § What blocks each path). No `first_token` span exists, and the model's and Polly's CloudWatch request metrics show nothing after `haltedAt`.
  - Step 5: recovery's own step 5 returns `session`, `text`, `done` **on the first attempt** (SC-005). If it does not, fix the runbook and repeat V-12.

### V-13 Breaker and soft-degrade (SC-004)

- **When**: before any friend is allowlisted.
- **Steps**:
  1. `get-item` `SPEND#<UTC yyyy-mm>`, and note `microUsd` as T (0 if the item is missing).
  2. `update-item` with `ADD microUsd` of `BREAKER_DEGRADE_MICRO_USD` − T ([runtime-config.md](./contracts/runtime-config.md) § Agent runtime). Send a message.
  3. `ADD` `BREAKER_TRIP_MICRO_USD` − `BREAKER_DEGRADE_MICRO_USD`. Send a message.
  4. `ADD` T − `BREAKER_TRIP_MICRO_USD`, a negative number. This removes the seeded amount and keeps the demo turns' real estimates.
- **Expected**:
  - Step 2: `breaker.check` has `degraded` true; voice is off, as V-08 describes.
  - Step 3: `breaker_tripped` and the hard-stop state with no `first_token` span. This happens at once, without a Budgets update (SC-004).
  - Step 4: the tally equals T plus the demo turns' estimates.

### V-14 Idle state survival (spike S4)

- **When**: after S4 is approved (research § Spikes).
- **Steps**: in one counted session, mention something in passing. Stay idle for longer than 120 seconds, timing it, then ask about it.
- **Why this works**: long-term memory is retrieved only when a counted session opens ([memory-api.md](./contracts/memory-api.md) § Read path), so recall within a session can come only from in-process history.
- **Expected**, one of:
  - Max recalls it, and the runtime log shows no new startup: in-process state survives. Record S4 as passed.
  - Max does not, or the log shows a new startup: idle reclaim drops in-process state. Record it, and adopt the short-term Memory history fallback (plan § Complexity Tracking) after costing it in R-cost.

### V-15 First token (SC-012)

- **Steps**: from V-02's spans, take each reply with more than one `text` event.
- **Expected**: `first_token` ends before `reply.complete`. Evaluate spec 001 FR-004 against `first_token`, and record the result.

### V-16 Log retention (SC-011)

- **Steps**: list every log group in `us-west-2` and `us-east-1`. The account hosts only this project.
- **Expected**: every group has `retentionInDays` 14, and none is unset. This includes the runtime's group, every Lambda's group (CDK's own included), and `aws/spans` (research § R-obs).

### V-17 One month's cost (SC-010, SC-019)

- **When**: after the first full month of friends' use, before the Free plan ends (prerequisite 1).
- **Steps**:
  1. Read that month's spend in Cost Explorer, with credits excluded, grouped by service.
  2. Read `MaxHeight-Monthly`'s actual spend for the same month.
  3. Build an AWS Pricing Calculator estimate of the as-built infrastructure.
- **Expected**:
  - Steps 1 and 2 agree (SC-010).
  - The figures by service, the R-cost projection and the calculator estimate are recorded side by side with the Q7 decision (SC-019). A material gap becomes a cost-model correction under research Q7.

## RED tests (P10)

Each scenario above checks deployed behavior end to end. It does not replace TDD. Every behavior it checks is first driven by a failing test, which must be green before deploying (prerequisite 11).

| Behavior | RED test | Contract |
| --- | --- | --- |
| Budget deploys first; credits excluded; only 100% reaches the hard-stop topic | `infra/test/budget-stack.test.ts` | spend-control § Tests |
| Hard stop fails loud and writes HALT before IAM | `infra/test/hard-stop.test.ts` (new) | spend-control § Tests |
| Hard-stop subscription and the four alarms | `infra/test/ops-stack.test.ts` (new) | spend-control § Tests |
| Region pinned; `project` tag; every Lambda has a 14-day log group | `infra/test/app.test.ts` | research § R-deploy, § R-obs |
| Distribution: no `errorResponses`, SPA function on the default behavior only, CSP, domain | `infra/test/frontend-stack.test.ts`, `infra/test/spa-rewrite.test.ts` (new) | csp-and-hosting § Tests |
| Runtime V2 pin, JWT authorizer, header allowlist, execution role | `infra/test/agent-stack.test.ts` | runtime-config § Runtime resource settings, § Execution role |
| User pool: Lite, Google only, PKCE public client, `https` callbacks, no Identity Pool | `infra/test/cognito-stack.test.ts` | auth-and-allowlist § Cognito resources |
| Control table, memory strategies, pruner schedule | `infra/test/data-stack.test.ts` (new) | data-model; memory-api § Resource |
| Pre sign-up denies unlisted or unverified, and fails closed | `infra/test/pre-sign-up.test.ts` (new) | auth-and-allowlist § Triggers |
| Pre token generation denies on HALT or a missing `ALLOW#`, and fails closed | `infra/test/pre-token-generation.test.ts` (new) | auth-and-allowlist § Triggers |
| A missing client secret fails the deploy | `infra/test/idp-secret.test.ts` (new) | auth-and-allowlist § Google client secret |
| Pruner window, single-friend mode, throws after trying every friend | `infra/test/memory-pruner.test.ts` (new) | memory-api § Pruner |
| Refusal order and error codes | `agent/tests/index.test.ts` | transport-sse § Error codes |
| Identity from the token only; body identifiers ignored; `session_mismatch` | `agent/tests/index.session-id.test.ts` | transport-sse § Body |
| A cancelled turn still counts | `agent/tests/index.cancellation.test.ts` | transport-sse § Cancellation |
| Caps on conversational tokens, keyed to `sub` | `agent/tests/index.cap-enforcement.test.ts`, `agent/tests/handlers/sessionManager.test.ts` | data-model |
| Missing configuration or SSM parameter fails startup | `agent/tests/index.readiness.test.ts`, `agent/tests/bedrock/warmup.test.ts` | runtime-config § Rules |
| Breaker degrade and trip | `agent/tests/spend/breaker.test.ts` (new) | spend-control § Tests |
| Usage read from reported metrics | `agent/tests/spend/usage.test.ts` (new) | spend-control § Breaker |
| Server voice segments; no `audio` when voice is off | `agent/tests/voice/pollyStream.test.ts` (new) | transport-sse § Events |
| Cross-friend delete is `not_found`; forget is all-or-error | `agent/tests/memory/memoryHandlers.test.ts` | memory-api § Friend-facing operations |
| Spans, including `first_token` | `agent/tests/handlers/observability.test.ts` | transport-sse § Spans |
| PKCE, `state` check, token storage, silent refresh, sign-out | `frontend/tests/services/auth.test.ts` (new) | auth-and-allowlist § Browser flow |
| SSE framing, status and error-code mapping, signal-lost | `frontend/tests/hooks/useAgentStream.test.ts` (new) | transport-sse § Response |
| Build fails on a missing `VITE_*` value | The build-configuration test that replaces `frontend/tests/config/wsUrl.test.ts` | runtime-config § Frontend build |
| Degraded means text-only | `frontend/tests/services/budgetDegradation.test.ts` | research Q1 |
| In-character signed-out, denied, hard-stop and signal-lost states | `frontend/tests/components/SessionStateOverlay.test.tsx` | gate 4 |
| Privacy page reachable while signed out | `frontend/tests/components/PrivacyPage.test.tsx` (new) | auth-and-allowlist § Privacy page |

Paths are relative to `packages/`. "(new)" marks a file that does not exist yet. New agent and frontend tests mirror their `src/` path, as the existing ones do.

## Success criteria map

| SC | Proved by |
| --- | --- |
| SC-001 | V-03 |
| SC-002 | Prerequisite 3 |
| SC-003 | V-11, V-12 |
| SC-004 | V-13 |
| SC-005 | V-12 |
| SC-006 | V-05 |
| SC-007 | research § Decision register; wiki `Log` entries (pushed with builder approval) |
| SC-008 | research § Issue dispositions, and a resolution comment on each in-scope issue |
| SC-009 | plan § Constitution Check, with amendments A1 to A3 merged where triggered |
| SC-010 | V-17 |
| SC-011 | V-16 |
| SC-012 | V-15 |
| SC-013 | research § Verification record and § Wiki discrepancies, with owning pages corrected (builder approval) |
| SC-014 | V-03, V-04 |
| SC-015 | V-03 |
| SC-016 | V-04 |
| SC-017 | V-06 |
| SC-018 | V-06 |
| SC-019 | V-17 |

## Results

Fill in during the run. Keep personal data out (see [§ Conventions](#conventions)).

| Check | Date | Outcome | Evidence |
| --- | --- | --- | --- |
| Prerequisites 1–12 | | | |
| Deploy steps 1–11 | | | |
| V-01 | | | |
| V-02 | | | |
| V-03 | | | |
| V-04 | | | |
| V-05 | | | |
| V-06 | | | |
| V-07 | | | |
| V-08 | | | |
| V-09 | | | |
| V-10 | | | |
| V-11 | | | |
| V-12 | | | |
| V-13 | | | |
| V-14 | | | |
| V-15 | | | |
| V-16 | | | |
| V-17 | | | |
