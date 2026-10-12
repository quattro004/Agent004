# Contract: Spend control (alerts, breaker, hard stop, recovery)

Decision: research Q6. Signals: [data-model.md](../data-model.md) § Spend Signal. Requirements: FR-016 to FR-021 and FR-023, constitution P2 (`.specify/memory/constitution.md:58-71`).

There are four layers, from cheapest and earliest to last resort:

| Layer | Reads | Fires at | Acts within | Effect |
| --- | --- | --- | --- | --- |
| Alerts | Budgets (gross) | P2: $5 and $8 | Budgets refresh (up to 3 times a day, D7) | Email only |
| Soft-degrade | `SPEND#<yyyy-mm>` | `BREAKER_DEGRADE_MICRO_USD` = (8 − F) × 10⁶ | The next turn | Voice off; text only (FR-023; spec 001 FR-016) |
| Breaker | `SPEND#<yyyy-mm>` | `BREAKER_TRIP_MICRO_USD` = (10 − F) × 10⁶ | The next turn | Chat turns refused in character |
| Hard stop | Budgets (gross) | P2: $10 | Budgets refresh | `CONTROL#HALT`, plus a deny-all-spend policy on the runtime role |

F is R-cost's projected fixed monthly cost. Every threshold comes from P2 or is derived from it. None is set here.

## Budget (`budget-stack.ts`)

**The budget stack deploys first and takes no props from another stack** (FR-033). Today it cannot deploy first, because it takes Cognito's role (`bin/app.ts:16-21`). It owns the budget, the email alerts, and the hard-stop topic with its policy, and it exports the topic. The hard-stop Lambda and the operations alarms need the runtime role, the control table and the pruner, so they live in `ops-stack.ts`, which deploys after the Data and Agent stacks (§ Stack split).

| Property | Value | Today |
| --- | --- | --- |
| Budget | `MaxHeight-Monthly`, `COST`, `MONTHLY`, 10 USD | Unchanged (`budget-stack.ts:110-117`) |
| `costTypes.includeCredit` | `false` (FR-017: measure gross of the Free-plan credits) | Unset, so it defaults to `true` (D6) |
| `costTypes.includeRefund` | `false` | Unset |
| `costTypes.includeDiscount` | `false` | Unset |
| 50% ACTUAL | Owner email | Unchanged (`:119-127`) |
| 80% ACTUAL | Owner email | Unchanged (`:128-136`) |
| 100% ACTUAL | Hard-stop topic **and** owner email | Unchanged (`:137-147`) |
| Hard-stop topic policy | `budgets.amazonaws.com` may publish, scoped by `aws:SourceAccount` and `aws:SourceArn` | Done by #62 (`:85-99`) |

The prop names are `includeCredit`, `includeRefund` and `includeDiscount` on `CfnBudget.CostTypesProperty` (`aws-cdk-lib/aws-budgets/lib/budgets.generated.d.ts:438,446,470`).

**Only the 100% notification publishes to the hard-stop topic.** Anything published there halts the service (`budget-stack.ts:29-30`, #56). Operations alarms use a separate topic.

**An ACTUAL alert fires once per budget per period.** It fires when spend first crosses the threshold and never again that month ([AWS Budgets best practices](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-best-practices.html)). This shapes recovery (below).

## Hard stop (`handlers/hard-stop.ts`, in `ops-stack.ts`)

This replaces the inline function (`budget-stack.ts:38-66`), which today:

- deletes a policy from the guest role, which FR-041 removes
- uses a hard-coded policy name that never matches, because CDK adds a hash suffix (#61)
- returns silently when its environment is missing (`:44-49`)

| Step | Call | On failure |
| --- | --- | --- |
| 0 | Read `CONTROL_TABLE_NAME`, `RUNTIME_ROLE_NAME` and `DENY_POLICY_NAME` ([runtime-config.md](./runtime-config.md) § Lambdas) | **Throw**. A missing value is never success (FR-019). |
| 1 | `PutItem` `CONTROL#HALT` with `haltedAt` and `reason: "budget-100"`, conditional on the item not existing | A failed condition means already halted, which counts as success. Any other error throws. |
| 2 | `PutRolePolicy` on `RUNTIME_ROLE_NAME`, with the policy `DENY_POLICY_NAME` (below) | **Throw**, including on `NoSuchEntity`: a missing role is a missing target (FR-019) |
| 3 | Log `{ haltedAt, role, policy }` | — |

Both steps are idempotent, so the SNS retries of a failed asynchronous invoke are safe. HALT is written first because the runtime reads it before every request, so it takes effect without waiting for IAM propagation.

**The hard stop writes its own policy.** It is created by `PutRolePolicy` with a name CDK passes in, not by CDK, so no hash suffix applies. The recovery step deletes that same name.

**Hard-stop role**: `dynamodb:PutItem` on the control table, and `iam:PutRolePolicy` on the runtime execution role's ARN only.

### Deny-all-spend policy

This is an inline `Deny` of every spend-bearing action the runtime role is allowed ([runtime-config.md](./runtime-config.md) § Execution role, least privilege):

- the Bedrock model-invoke actions
- `polly:SynthesizeSpeech`
- the `bedrock-agentcore` memory actions

DynamoDB, CloudWatch Logs and X-Ray stay allowed, so the container can still read HALT, refuse with `halted` and log the refusal. `bedrock:ListAsyncInvokes` also stays allowed: it bills nothing, and denying it would stop a container that restarts during a hard stop from initializing at all ([runtime-config.md](./runtime-config.md) § Execution role). Explicit deny overrides the role's allows.

### What blocks each path (FR-018)

| Path | Blocked by |
| --- | --- |
| New sign-in and token refresh | Pre token generation denies while `CONTROL#HALT` exists ([auth-and-allowlist.md](./auth-and-allowlist.md)) |
| Runtime invocation with a still-valid access token | The JWT authorizer cannot see HALT. The container refuses with `halted` before any model, voice or memory call, and the deny policy backs that up. The residual is a few seconds of Runtime CPU per refused request, until existing access tokens expire (the Cognito default lifetime). |
| Model, voice and memory calls | The deny policy |
| Tool APIs (weather, news, search) | Reachable only from inside a model turn, which is denied |
| WebSocket handler and the guest or authenticated Identity Pool roles | Removed by this plan ([plan.md](../plan.md) § Project Structure) |
| Memory pruner | **Deliberately not blocked.** It keeps the 30-day retention promise. Its own role is untouched, and it only lists and deletes. |
| Static site (CloudFront and S3) | Not blocked. Counted in F. |

## Breaker (runtime, per chat turn)

```text
before turn (after rate limit and caps):
  tally ← GetItem SPEND#<UTC yyyy-mm>.microUsd   (missing item ⇒ 0)
  tally ≥ BREAKER_TRIP_MICRO_USD     ⇒ error breaker_tripped (no spend)
  tally ≥ BREAKER_DEGRADE_MICRO_USD  ⇒ session.voice = "off" (no Polly this turn)
after turn (done, error after model start, or cancelled):
  UpdateItem SPEND#<UTC yyyy-mm>  ADD microUsd :turnEstimate
```

- **The estimate** is `TurnUsage.estimatedMicroUsd` ([data-model.md](../data-model.md)): billed model tokens, Polly characters, Memory events and retrievals, and the per-turn Runtime share, each multiplied by its `PRICE_*` rate. Memory actions add their calls the same way ([memory-api.md](./memory-api.md)).
- **It is a floor, not a meter.** Fixed costs sit in F, and the Memory extraction cost is unverified (R-cost). Concurrent turns can each pass the check before any of them adds. The hard stop is the backstop.
- **The read before a turn fails closed.** If it fails, the turn ends with `internal`, and nothing is spent unmeasured.
- **The write after a turn fails loud.** The reply has already been delivered, so the turn stands. The failure is logged and counted in the `BreakerWriteFailures` metric, which has an alarm (below).
- **The month key is UTC**, matching the billing period, so the tally resets when the budget does.
- **Soft-degrade is announced in character** the first time a session goes voice-off (spec 001 FR-016). Browser speech synthesis is not used (research Q1; P1 cloud-only).

## Operations alarms (FR-019, FR-022)

All alarms notify the **operations topic** (`OpsAlarmTopic`), which has an email subscription to `budgetAlertEmail`. It is never the hard-stop topic.

### Stack split

| Stack | Deploys | Owns | Props from other stacks |
| --- | --- | --- | --- |
| `budget-stack.ts` | First (FR-033) | Budget, the 50/80/100% notifications, the hard-stop topic and its policy | None |
| `ops-stack.ts` (NEW) | After Data and Agent | The hard-stop Lambda and its subscription to the hard-stop topic, `OpsAlarmTopic`, and the four alarms below | Hard-stop topic (Budget); control table and pruner (Data); runtime and its role (Agent) |

CDK creates a Lambda subscription in the **function's** stack and makes that stack depend on the topic's stack (`aws-sns-subscriptions/lib/lambda.js`: `subscriberScope: this.fn` and `addStackDependency(topic.stack)`, `aws-cdk-lib` 2.272.0). The cross-stack subscription therefore needs no hand wiring.

Until the ops stack exists, a 100% alert reaches no hard stop. No spend-bearing path is reachable before then, because the allowlist is empty and nobody can sign in. The quickstart confirms the ops stack before it adds the first allowlist entry.

| Alarm | Metric | Condition |
| --- | --- | --- |
| Hard stop failed | `hard-stop` Lambda `Errors` | Sum ≥ 1 in a period (the CDK default period) |
| Pruner failed | `memory-pruner` Lambda `Errors` | Sum ≥ 1 in a period |
| Breaker write failed | Runtime custom metric `BreakerWriteFailures` | Sum ≥ 1 in a period |
| Runtime server errors | AgentCore Runtime's 5xx or system-error metric (exact name checked at task time) | Sum ≥ 1 in a period |

Missing data is treated as not breaching. Alarm pricing is human-read in R-cost.

## Recovery (FR-021; quickstart V-12)

Recovery is **manual**. The default is to wait for the new budget period.

1. Confirm the cause in Budgets or Cost Explorer, and record it in the operator's log.
2. **Wait for the first of the next UTC month.** Recovering mid-month leaves the month **with no hard stop**, because the 100% alert has already fired and Budgets will not send it again this period. Only the breaker would remain. Recovering anyway is a P2 exception, recorded with a reason before step 3.
3. `iam delete-role-policy` for `DENY_POLICY_NAME` on the runtime role.
4. `dynamodb delete-item` `CONTROL#HALT`.
5. Sign in as an allowlisted friend and send one message. Expect `session` → `text` → `done`.

Quickstart V-12 demonstrates this once, end to end (FR-021).

## Tests

| Test | Asserts |
| --- | --- |
| `hard-stop.test.ts` | Throws when any env var is missing. Throws on `NoSuchEntity` from `PutRolePolicy`. Writes HALT before calling IAM. Treats an existing HALT as success. |
| `budget-stack.test.ts` (CDK assertions) | `includeCredit`, `includeRefund` and `includeDiscount` are `false`. Only the 100% notification lists the hard-stop topic. The template contains no `Fn::ImportValue`, so the stack can deploy first (FR-033). |
| `ops-stack.test.ts` (CDK assertions) | The hard-stop Lambda is subscribed to the budget stack's hard-stop topic. Its `RUNTIME_ROLE_NAME` is a cross-stack reference to the runtime execution role (`Fn::ImportValue`), never a literal (#61). All four alarms notify `OpsAlarmTopic`. |
| `breaker.test.ts` | Trips at exactly `BREAKER_TRIP_MICRO_USD`. Degrades at exactly `BREAKER_DEGRADE_MICRO_USD`. A missing `SPEND#` item reads as 0. A failed read refuses the turn. A cancelled turn still adds. |
