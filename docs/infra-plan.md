# Infra Plan — Max Height AWS Deployment

## Problem & Approach

The greeting MP3s are done (`docs/audio-plan.md` Phase 3), so the next frontier is
standing the backend up on AWS. An audit on 2026-09-20 found the infra is further
from done than `tasks.md` claimed, and that a September 2026 AgentCore release
changes decisions we must make **before** writing the runtime code — not after.

Two things drive this plan:

1. **T023 was marked complete but only half-built.** `packages/infra/lib/agent-stack.ts`
   contains the WebSocket API, Lambda, and SSM parameters. It contains no AgentCore
   Memory construct. `@aws-cdk/aws-bedrock-agentcore-alpha` was declared in
   `packages/infra/package.json` and imported **nowhere in the repo** — that pin
   is now removed (issue #34), but the missing Memory construct remains. On the
   agent side, `agentCoreMemoryClient.ts` is a stub that throws. Tracked as **C4**.
2. **AgentCore Runtime V2 is out, and we are targeting it.** V2 restores each
   instance from a snapshot instead of booting the container, which changes how the
   agent process must be structured. Getting this wrong is not a deploy failure —
   it is a silent correctness bug replicated across every restored instance.
   Recorded as research.md **§R2c**, tracked as **C5**.

## Current State (verified 2026-09-20)

| Component | Status | Location |
| --- | --- | --- |
| WebSocket API + routes + throttled prod stage | ✅ Built | `infra/lib/agent-stack.ts` |
| Lambda `live` alias for blue/green rollback (P9) | ✅ Built | `infra/lib/agent-stack.ts` |
| SSM SecureString params for tool API keys | ✅ Built | `infra/lib/agent-stack.ts` |
| CognitoStack (guest identity pool, scoped IAM) | ✅ Built | `infra/lib/cognito-stack.ts` |
| BudgetStack ($5/$8 SNS, $10 hard stop) | ✅ Built | `infra/lib/budget-stack.ts` |
| FrontendStack (S3 + CloudFront) | ✅ Built | `infra/lib/frontend-stack.ts` |
| **AgentCore Memory construct** | ❌ **Never written** (T023 claimed it) | — |
| **AgentCore Runtime provisioning** | ❌ **Never written** | — |
| **Agent-side Memory client** | ❌ Stub that throws | `agent/src/memory/agentCoreMemoryClient.ts` |
| Agent snapshot-safety for V2 | ❌ Not started | `agent/src/index.ts` |
| CloudWatch operational alarms | ❌ Not started (T111/T113) | — |
| Nothing deployed to AWS yet | — | — |

## Decisions

- **Platform version: V2.** AWS-measured P75 cold start is ~2 s and flat from a
  200 MB to a 2 GB image, versus ~5.4 s rising to ~30 s on V1. This project scales
  to zero with friends-and-family traffic, so essentially every visit is a cold
  start — V2 is the difference between Max answering promptly and Max stalling.
  It also bills reclaimed memory instead of the session peak, which helps against
  the P2 ceiling.
- **CDK owns the runtime too (revised 2026-09-27).** This plan originally said the
  CLI must own the runtime because "CloudFormation and the CDK cannot set
  `platformVersion`". **That is no longer true**: `AWS::BedrockAgentCore::Runtime`
  now has a `PlatformVersion` property, and every AgentCore construct except
  `Policy` has graduated into stable `aws-cdk-lib/aws-bedrockagentcore`. The
  runtime moves into CDK; the CLI keeps local development. See research.md **§R2d**.
  Caveat: CDK codegen lags the CFN spec, so `PlatformVersion` needs an L1
  `addPropertyOverride` escape hatch plus an assertion test until the typed
  property lands.
- **Region stays `us-west-2`.** It is one of only five V2 Regions
  (`us-east-1`, `us-east-2`, `us-west-2`, `eu-west-1`, `ap-northeast-1`) and already
  carries the Polly neural Matthew dependency. Region choice is now load-bearing.
- **Session opens on TV power-on, not first message.** Greetings run 8832–14688 ms,
  which fully hides a ~2 s V2 start. This is a design requirement, not an
  optimization — it is the whole reason V2's cold start becomes invisible.
- **Toolchain refresh.** The AgentCore CLI was renamed `@aws/agentcore-cli` →
  `@aws/agentcore` (old name 404s on npm; now v0.30.0, specs said 0.9.1). The CLI
  internally uses `@aws/agentcore-cdk`, which is a *different* package from the
  `@aws-cdk/aws-bedrock-agentcore-alpha` we used to pin — **removed 2026-09-28**
  (issue #34) in favour of the stable module already present in `aws-cdk-lib`.

## Phases & Tasks

### Phase 0 — Close the spec/reality gap ✅ DONE

- research.md **§R2c** added: V2 constraints, snapshot-safety rules, the CDK
  limitation, Region list, env-var cap, and the greeting-hides-cold-start finding.
- Stale versions corrected in `research.md`, `plan.md`, `quickstart.md` (the
  documented install command was broken).
- `tasks.md`: T023 split into **T023a** (done) / **T023b** / **T023c**; V2 work
  added as **T148–T153**; deviations **C4** and **C5** recorded.
- `.mcp.json`: added the AWS MCP Server over plain HTTP (OAuth), giving AWS API
  access and docs with no local proxy, no `uvx`, and no credentials on disk.

### Phase 1 — Make the agent snapshot-safe (TDD) — _blocks any V2 deploy_ ✅ DONE

**Status (2026-09-28).** PR #30 landed T148 and T149: `initialize()` gates the
listener, `/ping` returns 503 until init resolves, and init fails loudly at the
120 s deadline. T150's audit is satisfied — no module-scope randomness, UUIDs,
timestamps or PID/hostname-derived ids remain in `packages/agent/src`, and the
stale "lifetime of the Lambda execution environment" comment is corrected.

**T154 closes the last gap.** `warmBedrockClient()` used to only *construct* the
client, so the setup the snapshot exists to capture — credential resolution,
endpoint-ruleset evaluation, SigV4 signing, protocol serde, the TLS connection
pool — was allocated lazily and re-paid on every restored instance.
`src/bedrock/warmup.ts` now drives one real signed request,
`ListAsyncInvokes(maxResults: 1)`, against the same `bedrock-runtime` host the
`Converse` path uses.

That operation was chosen on **P2** grounds: it runs no model and bills nothing,
so the frequent container starts of a scale-to-zero service stay free. Rejected
alternatives: `CountTokens` (free, but AWS documents Claude models offered only
through cross-Region inference — which `global.anthropic.claude-haiku-4-5-*`
is — as unsupported on `bedrock-runtime`), and a small `maxTokens` invocation
(bills every cold start). Failure propagates: a degraded snapshot would be
inherited by every later instance, so the process stops rather than serving.

**Carries an IAM prerequisite.** The runtime execution role built in **T152**
must grant `bedrock:ListAsyncInvokes`, or the container fails to start.

**T148 → T149 → T150.** Do this before provisioning anything, because a snapshot
is taken on the first healthy `/ping` and then inherited by every instance.

- **RED:** `/ping` must not report healthy until init resolves; the listener must
  not accept connections before then; init must fail loudly past the 120 s deadline
  rather than retry (no silent fallbacks).
- **GREEN:** replace the unconditional module-scope `server.listen(PORT)` with an
  explicit async init that constructs **and exercises** the Bedrock/Strands client,
  so endpoint/credential resolution and the connection pool land in the snapshot.
  Preserve the `isTestEnvironment` guard that keeps parallel Vitest files off 8080.
- **Audit (T150):** no module-scope randomness, UUIDs, tokens, timestamps, or
  monotonic reference points — all are frozen into the snapshot and identical on
  every instance. No id derived from hostname or PID (every instance reports
  `localhost` / PID 1). Credentials refresh in-handler. Also fix the stale
  "lifetime of the Lambda execution environment" comment on the `sessions` Map;
  the agent is not Lambda-hosted.

### Phase 2 — Base image (T151)

Container agents bringing their own cryptographic libraries need a snapsafe build
that reseeds after restore (`openssl-snapsafe-libs` on Amazon Linux 2023).
Verify Node's crypto links against it. Fold into T106's existing Dockerfile checks
and keep LINUX_ARM64, non-root, <200 MB.

### Phase 3 — Finish AgentStack (T023b, T023c)

Add the AgentCore Memory construct — semantic + summary + userPreferences
strategies, namespace `/max-height/{actorId}/`, 30-day retention — and export
`memoryId`. Then replace the throwing client stub, keeping the injectable-client
seam `memoryAdapter.test.ts` already mocks. CDK assertions first, per P10.

Import `Memory` and `MemoryStrategy` from **stable `aws-cdk-lib/aws-bedrockagentcore`**.
The alpha package was removed on 2026-09-28 (issue #34), and
`packages/infra/test/agentcore-constructs.test.ts` pins both exports, so they
are proven present before this task starts.

### Phase 4 — Deploy (T152, T153)

Deploy the runtime **via CDK** using the stable `Runtime` construct, setting
`platformVersion` through an L1 `addPropertyOverride('PlatformVersion', 'V2')`
escape hatch (the typed property is absent from `aws-cdk-lib` 2.270.0 and
2.271.0) and `lifecycleConfiguration.idleRuntimeSessionTimeout` to 1800 s. Cover
both with CDK assertions — the escape hatch is untyped, so the test is the only
thing standing between us and a silent V1 deploy.

Then confirm against the deployed resource with
`get-agent-runtime --query platformVersion`. **This verification is not optional**:
provisioning V2 through CloudFormation is newly exposed and untested by us. If it
does not come back `V2`, fall back to `agentcore deploy` / the AWS CLI, which
still work, and record the failure in the deviations table.

Poll until `READY` or `*FAILED`: create/update returns while still `CREATING`,
takes minutes on V2, and calling update/delete early returns `ConflictException`.
Keep agent env vars under the 2.5 KB V2 container cap. Then move `session_start`
to the power-on transition (T153) so the greeting covers the start.

**Resolved — session idle timeout versus FR-010 (verified 2026-09-27).** The
default was confirmed against the AgentCore lifecycle-settings reference:
`idleRuntimeSessionTimeout` defaults to **900 s (15 min)** and accepts
**60–28800 s** on microVM runtimes. Since T153 opens the session at TV power-on
and `spec.md` FR-010 allows 30 minutes, the default would drop a quiet visitor at
16 minutes.

**Decision: set it to 1800 s (30 min)**, matching the cap `sessionManager`
already enforces, so the platform timer never pre-empts the spec. This is set
declaratively via the stable L2 `Runtime`'s `lifecycleConfiguration` — no
deploy-step edit needed. `maxLifetime` stays at its 8-hour default: it bounds the
instance, not the session, and cannot bind before our 30-minute cap. Recorded as
research.md **§R2d**.

### Phase 5 — Operational readiness (T111, T113)

CloudWatch alarms for error rate, cold-start P95, and WebSocket 5xx, feeding the
existing budget SNS topic, plus CDK assertions.

**Do not drop T111 because of V2.** It carries three alarms and only one is
touched by this change; error rate and WebSocket 5xx are unaffected. Dropping
alarms outright would also run against constitution **P9 (Observability Before
Features)**.

The cold-start threshold does deserve a second look, but it is **not T111's
number to change**: `spec.md` §Operational Readiness defines "Healthy" as
*latency targets met at P95 + error rate < 5% over any 10-minute window +
cold-start P95 < 8 seconds over any 1-hour window*. Retuning it is a spec
clarification, not an infra edit.

Note the 8 s budget is **end-to-end** — platform start *plus* the agent loop and
model calls — while V2 only shrinks the platform portion (~5.4–30 s → ~2 s). A
slow model call can still breach 8 s, so the alarm can absolutely still fire; it
simply becomes a looser guardrail than it was when platform start alone could
consume the whole budget. Worth asking during Phase 5 whether the *useful* signal
is now a tighter cold-start bound, or whether `spec.md`'s separate "reply begins
within 5 seconds (P95)" target is the better thing to alarm on.

### Phase 6 — Validate & finalize

`pnpm run validate` must pass. Confirm this document and `tasks.md` match reality —
the C4 audit exists precisely because that drifted last time.

## Cost & Dependency Notes

- **Cost:** first real spend for this project. BudgetStack ($5/$8 alerts, $10 hard
  stop) should be deployed **first**, before the runtime, so the guardrail predates
  the thing it guards. V2's memory reclamation and scale-to-zero both work in our
  favour.
- **Credentials:** same org-free constraint as `docs/audio-plan.md` Phase 3 — no
  long-lived `AKIA` keys on disk (P11). CDK bootstrap and deploy need broader
  permissions than Polly did, so the least-privilege policy for `max-height-gen`
  will need revisiting as its own decision.
- **Deps:** no new runtime dependencies — and one **removal**, done 2026-09-28
  (issue #34). `@aws-cdk/aws-bedrock-agentcore-alpha@2.267.0-alpha.0` was
  declared in `packages/infra/package.json` and imported nowhere; its constructs
  had graduated into the stable `aws-cdk-lib` we already pin, so it was deleted
  rather than bumped — a net reduction in supply-chain surface (P6). Dropping it
  also took the transitive `@aws-cdk/aws-bedrock-alpha` out of the lockfile.
  Verified by import that the stable module is a **complete** replacement: even
  `Policy`, which the alpha README still calls experimental, is exported from
  stable.

## Risks / Considerations

- **Untyped escape hatch for `platformVersion`.** `addPropertyOverride` is not
  type-checked, so a typo silently deploys V1 — the exact failure V2 was chosen to
  avoid, and it looks like success. A CDK assertion asserting `PlatformVersion:
  'V2'` in the synthesized template is mandatory, not optional.
- **V2-through-CloudFormation is unproven by us.** The CFN property is newly
  exposed and its description is still blank upstream. Verify with
  `get-agent-runtime` at Phase 4 before trusting it; the CLI path remains a
  working fallback.
- **Snapshot bugs are silent.** Nothing fails loudly when entropy or a timestamp is
  frozen into a snapshot — it just produces identical values everywhere. Phase 1's
  audit is the only defence, so treat it as correctness work, not cleanup.
- **Do not snapshot anything that changes without a redeploy.** A tool catalog
  fetched at startup looks ideal but would freeze Max's tool inventory.
- **`platformVersion` typed support may land later.** When `aws-cdk-lib` adds the
  typed property, migrate off the escape hatch and delete the override. Re-check
  on every `aws-cdk-lib` bump.
- TDD is mandatory for code (constitution). Docs, spec edits, and asset generation
  are exempt; Phases 1, 3, and 5 are not.

## Out of Scope (this plan)

- Personality gate (T069/T070) and memory continuity gate (T120/T121) — they need a
  deployed agent, so they follow this work rather than belonging to it.
- Frontend polish, PWA/offline (T093–T098), and bundle optimization (T105).
- 3D avatar and other V1 deferred scope.

## Next Steps (todo list)

1. ~~**spec-alignment** — Phase 0 research/tasks/quickstart corrections.~~ ✅ done
2. ~~**agent-snapshot-safe** — Phase 1 T148–T150, TDD.~~ ✅ done in #30
3. ~~**warm-client-exercise** — Phase 1 remainder, T154, TDD.~~ ✅ done
4. ~~**agentcore-cdk-migration** — drop the alpha dep, move to stable
   `aws-cdk-lib/aws-bedrockagentcore` (research.md §R2d).~~ ✅ done in #34
5. **snapsafe-base-image** — Phase 2 T151. ⬅️ **NEXT**
6. **agentcore-memory** — Phase 3 T023b + T023c.
7. **deploy-v2** — Phase 4 T152 + T153 (now a CDK deploy).
8. **ops-alarms** — Phase 5 T111 + T113.
9. **validate-finalize** — Phase 6 `pnpm run validate` + doc reconciliation.

## Possible spec session — native AgentCore WebSocket (after Phase 4)

AgentCore Runtime now speaks WebSocket natively (`/ws` on port 8080), which could
remove the API Gateway + Lambda hop from `Contract-WebSocket-API` entirely.
Researched and recorded on the wiki as `Source-AgentCore-Bidirectional-Streaming`;
**nothing is adopted.**

This trips the hybrid rule — it changes the cost model, adds or removes AWS
resources, and needs a constitution check (P2 budget, P8 graceful degradation,
P11 credentials, since the browser OAuth path carries a token in
`Sec-WebSocket-Protocol`). So it wants **`/speckit.specify`, not a pull request.**

**Do not spec it yet.** Nothing is deployed, so the trade-off would be argued
against assumptions rather than measurements. Revisit after Phase 4, when real
cold-start and cost numbers exist. Impact on this plan if it were adopted:

| Phase | Affected |
| --- | --- |
| 1 — snapshot safety | No. Same container and `/ping` trigger; `/ws` widens the readiness gate rather than replacing it. |
| 2 — base image | No. Protocol-agnostic. |
| 3 — AgentCore Memory | No. Orthogonal to transport. |
| 4 — deploy | Resolved — the idle-timeout question is now decided (1800 s, research.md §R2d), so this phase is no longer coupled to the WebSocket question. |
| 5 — alarms | **Yes.** A WebSocket trace covers the whole connection rather than each message, and "WebSocket 5xx" is an API Gateway metric that would no longer exist. |

Three parts of the current contract conflict with the platform — subprotocol,
close codes, and heartbeat versus the idle timer. They are tabled on the wiki's
`Contract-WebSocket-API` page and should be treated as blocking questions for any
such spec.
