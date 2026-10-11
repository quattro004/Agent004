<!--
  Sync Impact Report
  ───────────────────────────────────────────────────────────
  Version change : 1.4.0 → 1.5.0
  Bump rationale : MINOR — P7 replaces guest access with
                   invite-only federated sign-in and a verified
                   email allowlist. P11 ties spend-bearing
                   runtime access to the signed-in identity;
                   the Auth technology row adds a Cognito
                   User Pool. P2's guest-role example is
                   updated without changing its $10 rule.

  Modified principles : P2 Budget Ceiling (example only),
                        P7 Friends-and-Family Audience Only,
                        P11 Credential & Secret Hygiene.

  Added : None.

  Modified sections:
    - Core Principles (P2, P7 and P11).
    - Technology Stack (Auth row).
    - Quality Gates (gate #7 aligned with P11).

  Dependent artifacts reviewed:
    - specs/003-architecture-review/spec.md FR-041–FR-056
      defines the sign-in behavior and requires this amendment
      before planning. It remains on its feature branch.
    - specs/001-max-height-ai-character/ and its guest-auth
      contracts are frozen, point-in-time artifacts; spec 003
      FR-056 supersedes them for access.
    - docs/infra-plan.md and docs/audio-plan.md describe the
      old guest path and remain historical until the new
      deployment design replaces it.
    - The wiki describes current guest code until implementation
      and must ingest this amendment after it merges.

  Follow-up TODOs : Decide signed-in credentials, revocation,
    spend-stop mechanism and sign-in cost in spec 003 planning;
    remove the unauthenticated infrastructure during
    implementation, not in this governance-only amendment.
-->

# Max Height Constitution

## Core Principles

### P1. Cloud-Only, No On-Device AI

All LLM inference and TTS MUST run server-side on AWS. No
on-device model weights, no WebGPU inference, no browser-side
LLMs are permitted.

**Rationale**: Cost control, behavioral consistency across
clients, and operational simplicity. A single inference path
means one place to monitor, one place to budget, one place to
debug.

### P2. Budget Ceiling — $10/Month Hard Cap

The $10/month figure is a **rule**, not a target. Enforcement
is automated and mandatory:

- AWS Budgets email alarm MUST fire at $5 and $8.
- Hard-stop mechanism MUST activate at $10 (e.g., revoking
  access to all spend-bearing paths).
- Per-session token cap MUST be enforced.
- No feature ships without a documented cost model.

**Rationale**: A personal fan project with no revenue MUST have
an inviolable cost ceiling. Automated enforcement prevents
"just this once" drift.

### P3. Personality-First Build Order

The personality gate (Phase 1.5 in `initial-plan.md`) is a
**hard gate**, not a checkpoint. No 3D work, no visual polish,
no stretch features MUST ship until the golden-set rubric
passes.

**Rationale**: A perfectly rendered avatar with a bland
personality is a failed product. Max's character *is* the
product; everything else is presentation.

### P4. IP & Legal Posture

- Naming MUST be **"Max Height"**, never "Max Headroom".
- No Matt Frewer voice clone or voice-model training on his
  likeness is permitted.
- Fan-project framing MUST appear in the UI (About/footer).
- The project MUST remain non-commercial.

**Rationale**: Respect for IP rights while operating in
fan-project space. Clear naming and framing minimize legal
risk.

### P5. No Real-Time LLM-as-Judge

Evaluation of personality MUST use offline golden sets and
rubrics. A live LLM MUST NOT score live outputs in the hot
path.

**Rationale**: Running a second LLM call per response doubles
cost, adds latency, and creates feedback-loop hazards where
the judge influences what it judges.

### P6. Supply-Chain Discipline

- Pin exact SDK versions; no `^` / `~` on pre-1.0
  dependencies.
- `pnpm-lock.yaml` MUST be committed, never deleted.
- `pnpm audit` MUST be clean before merging dependency changes.
- New dependencies MUST be reviewed (maintainer, publish date,
  downloads) before adding.

**Rationale**: A personal project has no security team. Strict
dependency hygiene is the substitute.

### P7. Friends-and-Family Audience Only

Max Height is not a public product. Downstream implications:

- Auth posture: invite-only federated sign-in with a
  provider-verified email allowlist. Only signed-in, allowlisted
  friends may reach spend-bearing actions. Session caps and
  rate limits are bound to a server-verified identity.
- Moderation posture: minimal, because the audience is trusted.
- Invited-provider sign-in is not public registration: no
  self-service invitations or signed-out access to spend-bearing
  actions. No marketing pages or analytics beyond operational
  metrics.

**Rationale**: Scoping access to invited friends bounds spend
and keeps moderation light. Sign-in stores personal data, so
privacy disclosures, retention and deletion are required.

### P8. Graceful Degradation Required

Three fallback axes MUST work end-to-end:

- **No WebGL** → 2D avatar fallback.
- **No microphone / permission denied** → text input surfaces
  as a fallback. Voice remains the primary UX; text is the
  escape hatch, not a co-equal interface.
- **Cloud unavailable** → friendly, in-character error state.
  Never a white screen or silent failure.

**Rationale**: A demo project that breaks on capability gaps
cannot be shown to anyone. Degradation keeps Max presentable
on any device.

### P9. Observability Before Features

If a behavior cannot be observed in production traces, it MUST
NOT ship. Trace-first development:

- AgentCore Observability MUST be wired before the second
  feature.
- Every user-visible latency target MUST have a corresponding
  trace span.
- Personality regressions MUST be diagnosable from traces and
  logs without requiring a reproduction.

**Rationale**: A solo developer cannot afford "works on my
machine" debugging. Traces are the substitute for a QA team.

### P10. Unit Tests Where Possible

All non-trivial logic MUST have unit tests. PRs that add or
modify behavior MUST include corresponding test coverage.
Trivial glue code (e.g., re-exports, simple config wiring) is
exempt, but the bar for "trivial" is high — when in doubt,
test.

**Rationale**: A solo-developer project has no second pair of
eyes. Automated tests are the substitute for code review
confidence. They also protect against personality and behavior
regressions that traces alone cannot catch.

### P11. Credential & Secret Hygiene

- Local/developer AWS access MUST use **temporary** (`ASIA…`)
  credentials. Long-lived IAM user access keys (`AKIA…`) MUST
  NOT be written to disk or committed.
- The *mechanism* for obtaining those temporary credentials is
  NOT mandated. IAM Identity Center (SSO) can only grant AWS
  account access from an **organization** instance, and
  creating an AWS Organization on the free plan expires all
  remaining free-tier credits immediately — a direct conflict
  with P2. Acceptable mechanisms, in order of preference:
  1. **AWS CloudShell session export** — sign in to the console
     as a least-privilege IAM user (console password only, no
     access keys) and export that session's temporary
     credentials into the local shell. No long-lived key is
     ever created.
  2. **`sts:AssumeRole`** into a task-scoped role, where the
     bootstrap access key lives in environment variables only
     (never `aws configure`, never on disk) and is deleted
     immediately after use.
  3. **IAM Identity Center (SSO)** — preferred on any account
     that already belongs to an AWS Organization.
- Temporary credentials MUST be supplied to tooling as
  environment variables only. They MUST NOT be written to
  `~/.aws`, committed, or pasted into chat, issue, or PR
  transcripts.
- Spend-bearing runtime access MUST be tied to a verified,
  allowlisted sign-in identity, consistent with P7. If a
  browser needs AWS credentials, they MUST be temporary and
  scoped to that identity's permitted actions; server-side
  callers MUST use least-privilege IAM roles. Unauthenticated
  guest credentials MUST NOT grant spend-bearing access.
- IAM permissions MUST follow least privilege — scoped by
  action and, where supported, by `aws:RequestedRegion` and
  service conditions (e.g., `polly:Engine`, `polly:VoiceId`).
  This applies to build-time and one-shot asset-generation
  identities as much as to runtime roles.
- Application secrets (API keys) MUST live in SSM
  SecureString or environment variables, never in source.

**Rationale**: A solo project has no security team. Temporary,
least-privilege, region-scoped credentials limit the blast
radius if a laptop, token, or repository is compromised. The
guarantee that matters is *short-lived and narrowly scoped* —
which mechanism delivers it is an account-level detail, and
pinning it to one product would have cost real money here.

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | React + Vite SPA, React Three Fiber, Zustand, Web Audio API |
| Agent Backend | Strands Agents SDK on Amazon Bedrock AgentCore Runtime |
| LLM | Amazon Bedrock — Anthropic Haiku-class (specific model version in plan) |
| TTS | Amazon Polly Neural (direct SDK, streaming) |
| STT | Web Speech API (browser built-in) |
| Auth | Amazon Cognito User Pool (invite-only federated sign-in); Identity Pool if authenticated AWS credentials are needed |
| Memory | AgentCore Memory (30-day rolling window) |
| Observability | AgentCore Observability (traces, metrics, logs) |
| Hosting | S3 + CloudFront |
| IaC | AWS CDK (infrastructure) + AgentCore CLI (agent deployment) |

Technology choices are load-bearing — changes to this table
require a constitution amendment (MINOR version bump minimum).
The LLM row pins the model tier (e.g., Haiku-class), not the
specific version. The exact model ID is specified in the feature
plan's Technical Context section. This allows model version
upgrades within the same tier without a constitution amendment.

## Quality Gates

The following gates MUST pass before work proceeds past them:

1. **Cost model gate**: Every feature MUST include a cost
   estimate before implementation begins. Features that push
   the projected monthly total above $8 MUST include a
   mitigation plan.

2. **Personality gate**: The golden-set rubric (50 cases) MUST
   pass before any visual/audio polish ships. Evaluated offline
   per P5.

3. **Dependency gate**: New dependencies MUST pass the review
   criteria defined in P6 before merging.

4. **Degradation gate**: Each fallback axis defined in P8 MUST
   be tested before the feature it covers ships.

5. **Observability gate**: Trace spans MUST exist for every
   user-visible latency path before the feature ships, per P9.

6. **Test coverage gate**: PRs that add or modify non-trivial
   logic MUST include unit tests covering the changed behavior,
   per P10. Exemptions for trivial glue code MUST be justified
   in the PR description.

7. **Credential gate**: Local AWS access uses temporary
   (`ASIA…`) credentials supplied via environment variables;
   no long-lived AWS keys committed or stored on disk. IAM
   statements MUST be least-privilege and region-scoped where
   supported — including build-time generation identities.
   Runtime access is tied to a verified, allowlisted sign-in
   identity; no unauthenticated guest access to spend-bearing
   actions, per P7 and P11.

## Governance

This constitution is the supreme governing document for the
Max Height project. All design decisions, code reviews, and
feature proposals MUST be evaluated against these principles.

### Amendment Procedure

1. Propose the change in a pull request modifying this file.
2. Document the rationale for the change in the PR description.
3. If a principle is removed or materially redefined, all
   dependent artifacts (specs, plans, tasks) MUST be reviewed
   for impact.

### Versioning Policy

The constitution follows semantic versioning:

- **MAJOR**: Principle removal or backward-incompatible
  redefinition of governance rules.
- **MINOR**: New principle added, existing principle materially
  expanded, or technology stack change.
- **PATCH**: Clarifications, wording improvements, typo fixes,
  or non-semantic refinements.

### Compliance Review

- All pull requests MUST verify compliance with applicable
  principles before merging.
- Complexity that violates a principle MUST be explicitly
  justified in the Complexity Tracking section of the
  implementation plan.

**Version**: 1.5.0 | **Ratified**: 2026-04-19 | **Last Amended**: 2026-10-11
