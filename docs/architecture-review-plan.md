# Plan 2 — Architecture review (spec `003-architecture-review`)

**Starts after Plan 1 (#56) merges.** Plan 1's findings feed question Q6 below.

## Methodology

- **Spec?** Yes. Triggers fired: a constitution check is required (two
  unresolved conflicts, plus likely technology-table changes), a cost-model
  change, possible new AWS resources, and research needed first.
- **Failing test?** None for the review itself. It produces decisions, not
  behavior. The checks are `speckit.analyze` and `wiki:lint`. Every
  implementation task that comes out of the review gets a normal
  RED→GREEN→REFACTOR cycle.

## Step 0 — Before `/speckit.specify`

1. Pull `main`, run `pnpm run wiki:pull`, and re-read `Index` and `Gotchas`.
2. **Number the spec 003 explicitly.** The number 002 was used once
   (`specs/002-volume-knob-up-down`, now superseded and out of the tree), and
   wiki permalinks still cite it. Sequential auto-numbering could reuse it.
3. Re-verify external facts that drift: Haiku 4.5's lifecycle (**Active** as
   of 2026-10-01), the Strands SDK latest version, and **whether Nova 2 Lite
   supports Guardrails**. That last check is a cheap gate: if the answer is no,
   #50 likely ends there.

## Step 1 — `/speckit.specify`: describe outcomes, not mechanisms

| Outcome | Issues |
| --- | --- |
| O1 A guest can't reset or claim a budget; memory namespaces can't be asserted by the client | #55 |
| O2 After a hard stop, a defined recovery happens (today nothing restores the policy) | from Plan 1 |
| O3 Replies reveal progressively; the first-token metric measures the first token | #45 |
| O4 Max's character voice holds regardless of which model generates it | #42, #50 |
| O5 Voice-path cost is predictable, including after the free tier expires; viseme spend is justified | #47, #48 |
| O6 The cost model is accurate: caching is either reachable or struck | #49 |
| O7 The architecture conforms to the constitution, or amendments are proposed | wiki-flagged |
| O8 The memory path is chosen with tenant isolation (deviation C4) | wiki-flagged |

## Step 2 — `/speckit.clarify` (expected questions, at most 5 per run)

Guest identity basis (is the Cognito identity ID enough?), session expiry
mid-conversation, whether V1 3D lip-sync is still planned (this decides the
viseme spend), a first-token latency target, and the hard-stop recovery
policy (automatic at month start, or manual).

## Step 3 — `/speckit.plan`: `research.md` as a decision register

Decide **in this order**, because earlier answers reshape later ones:

| Q | Question | Issues | Constitution impact |
| --- | --- | --- | --- |
| Q1 | Voice architecture: Polly only, or a Polly + Nova Sonic hybrid | #48 | TTS/STT rows → MINOR amendment |
| Q2 | Text model: Haiku 4.5 or Nova 2 Lite (skip if Q1 makes it moot) | #50 | LLM row pins "Anthropic Haiku-class" → MINOR amendment |
| Q3 | Where personality processing runs: Strands hooks, or post-processing | #42 | P3/P5 (personality gate) |
| Q4 | Streaming and transport: SSE chunks or AgentCore native WebSocket | #45 | Observability gate |
| Q5 | Session identity and caps; edge rate limiting | #55 | P2; possibly a new AWS resource |
| Q6 | Hard-stop mechanism: Lambda delete or Budgets Action, plus recovery | Plan 1 | P2, P8 |
| Q7 | Cost-model corrections: R0 cache rates, R4 dual billing, free-tier expiry date | #47, #49 | Cost-model gate |
| Q8 | Platform: CDK vs AgentCore CLI; browser TTS vs P1; memory path; Strands harness; where Guardrails are enforced | wiki-flagged | IaC row; P1 |

For each question, record the options, the evidence, the decision, and the
reasoning, including "stay as is". Hold #45 until Q3 and Q4 are decided.

**Constitution amendments** go in their own PR(s), with a MINOR version bump
and review of dependent artifacts, **before** implementation tasks run.

## Step 4 — Spikes (flagged; each needs your approval and a cost estimate first)

- **S1** Golden-set comparison of Haiku 4.5 and Nova 2 Lite on real Max Height
  prompts, judged on character voice (#50 + #42). Only if the Guardrails check
  passes.
- **S2** Actual token usage of the system prompt plus tool definitions, from a
  real invocation's `usage`, to see whether they clear the 4,096-token cache
  floor (#49). `CountTokens` is unsupported for our cross-region Haiku profile.
- **S3** Nova 2 Sonic's audio tokens per second, and whether silence is billed
  (#48). The current 25 tokens/s figure is derived, not published.

## Step 5 — Artifacts

`/speckit.analyze`, then `/speckit.tasks`, then `/speckit.analyze` again.
**Checkpoint with you before `/speckit.implement`.** Never re-run
`speckit.plan` on spec 001 (it regenerates destructively; see
`Guide-Spec-Kit-Iteration`).

## Step 6 — Record and close out

- Wiki: create or update a `Decision-*` page for each decision, then `Index`,
  `Log` and `wiki:lint`. Pushes need your approval.
- Spec 001: add dated correction annotations, not overwrites, to
  `research.md` R0 (#49) and R4 (#47).
- Issues: post a resolution comment on each, linking the decision. **Ask
  before filing any new issue.**

## Issue disposition (42–56)

| Issue | Disposition |
| --- | --- |
| #43, #44, #46, #51, #52, #53, #54 | Already done (closed issue or merged PRs). No action. |
| #56 | Plan 1. |
| #42, #45, #47, #48, #49, #50, #55 | Resolved by decisions Q1–Q7 here. |

## Done when

Every question Q1–Q8 has a recorded decision, any amendments are merged,
`tasks.md` passes `analyze`, the wiki is updated, and every issue in range has
a resolution comment.
