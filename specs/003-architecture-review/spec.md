# Feature Specification: Architecture Review and First AWS Deployment

**Feature Branch**: `003-architecture-review`

**Created**: 2026-10-03

**Status**: Draft

**Input**: User description: "Architecture review and first AWS deployment for Max Height (spec 003). Much of the AWS infrastructure and AWS's own agent guidance has changed since spec 001. Review the current codebase, the project wiki, and issues #42–#61 against the latest AWS guidance for building AI agents (Well-Architected Agentic AI Lens and Generative AI Lens; Bedrock AgentCore Runtime, Memory, Identity, Observability), always under the constitution's $10/month hard budget — the builder believes an agent can run for $10/month and this feature tests that. Then take the stack to its first real deployment. The UI is close enough to MVP; UI work is limited to what deployment needs. Goal: get the AWS architecture running soon."

Primary inputs: `docs/architecture-review-plan.md` (outcomes O1–O8, questions Q1–Q8, spikes S1–S3), `docs/infra-plan.md` (Phases 2–6), `docs/tdd-plans/budget-warning-routing-TDD-Plan.md` (Plan 1, issue #56), `.specify/memory/constitution.md` (v1.4.0), spec 001 (`specs/001-max-height-ai-character/`), the bodies and comments of issues #42–#61, and the project wiki (<https://github.com/quattro004/Agent004/wiki>, local clone at `2bac2b4`). This spec extends the plan's outcomes with O9–O14 and its questions with Q0 and Q9. The builder's access decisions of 2026-10-03 are also an input; see the Builder decisions note below.

Wiki pages read as inputs:

- **Spine**: Index, Gotchas
- **Components**: Component-Agent-Runtime, Component-Infra-Stacks, Component-WebSocket-Transport, Component-State-Stores, Component-Audio-Chain, Component-Speech-Input
- **Contracts**: Contract-WebSocket-API, Contract-Message-Protocol, Contract-Polly-TTS
- **Concepts**: Concept-Budget-Ceiling, Concept-Observability, Concept-Credential-Hygiene, Concept-Graceful-Degradation, Concept-Cloud-Only-Inference, Concept-Personality-Gate
- **Decisions**: Decision-AgentCore-Runtime-V2, Decision-LLM-Model-Selection, Decision-Polly-Voice, Decision-Browser-TTS-Fallback, Decision-Strands-SDK
- **Sources**: Source-AgentCore-Platform-2026, Source-AgentCore-Pricing, Source-AgentCore-Bidirectional-Streaming, Source-AgentCore-Web-Search-Tool, Source-Amazon-Nova-Lite, Source-Nova-Sonic, Source-Amazon-Polly, Source-Bedrock-Model-Lifecycle, Source-Infra-Plan, Source-Tasks-001, Source-Strands-Harness-SDK-Docs
- **Guides**: Guide-Deployment
- **Context only** (spec 002 stays out of scope): Source-Spec-002, Feature-Volume-Knob

> **Reference convention.** A bare `FR-###` or `SC-###` means a requirement in this spec; spec 001 requirements are always written `spec 001 FR-###`.
>
> **Vocabulary note.** This feature is an architecture review plus a first deployment, so AWS service names, issue numbers and constitution principles are the domain vocabulary and appear deliberately. Every hard number in this spec is cited to the constitution, spec 001, or a named source document; none is invented here.
>
> **Wiki claims.** The wiki ranks second in authority, below the constitution, but under the builder's "trust but verify the wiki" rule every wiki statement is a **claim**, not a fact. A claim this spec relies on appears in [Wiki Claims Relied On](#wiki-claims-relied-on) with its status. A claim marked *Unverified* is not a requirement or an assumption; it is a fact to verify in plan or research (FR-039). Conflicts and gaps are listed in [Wiki Discrepancies to Log](#wiki-discrepancies-to-log). This spec did not edit the wiki.
>
> **Builder decisions (builder, 2026-10-03).** These are recorded as decided, not as open questions. They add outcome **O14**: only invited friends reach a spend-bearing action, over HTTPS, on the project's own subdomain.
>
> 1. **Sign-in is required, and guest (signed-out) access is removed entirely.** An open public site would overrun the $10 budget (P2); the builder will consider scaling later if friends like it. The Cognito Identity Pool's unauthenticated access goes away. This resolved the access-gating clarification formerly at FR-015.
> 2. **Invite-only allowlist by email.** Signing in alone admits anyone with a provider account, so access also requires the signed-in, provider-verified email to be on an allowlist the builder maintains.
> 3. **Providers**: Google, Microsoft (personal accounts, through OIDC) and Login with Amazon. A provider is adopted only if registering and operating it carries no fee. Sign in with Apple was dropped later the same day for that reason: "we don't need to support Apple if it's not free" (FR-045).
> 4. **HTTPS everywhere**: the site, the sign-in pages, and every redirect and callback URL.
> 5. **Custom domain**: the site is served on a subdomain of the builder's existing domain `recipieces.com`, whose DNS is at GoDaddy.
>
> FR-041–FR-056 carry these decisions. Details they leave open are decided at plan under Q9 (FR-004). Where "guest" still appears in this spec, it describes the identity-pool path being removed or paraphrases a wiki claim.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An invited friend holds a conversation on the first real deployment (Priority: P1)

An invited friend opens Max Height on the project's own subdomain over HTTPS in an ordinary browser, signs in, types a message, and Max replies in character, served from the project's own AWS account for the first time. Infra-plan Phases 2–6 (moved out of spec 001) are complete, and the message really reaches the agent runtime. Today `packages/infra/lib/handlers/websocket-handler.ts:109` is a stub ("Route to AgentCore InvokeAgentRuntime / In production: invoke agent").

**Why this priority**: The builder's goal is to get the AWS architecture running soon, and nothing has been deployed yet. Every cost and quality claim in this project stays a projection until real traffic flows. This is outcome O12.

**Independent Test**: Deploy the stack to the pinned Region by following infra-plan Phases 2–6. From a fresh browser with no prior state, open the site's URL, sign in with an allowlisted account, send text messages, and receive in-character replies. Confirm from runtime telemetry that each reply came from the deployed agent runtime.

**Acceptance Scenarios**:

1. **Given** the stack is deployed and the hard stop is armed, **When** a signed-in, allowlisted friend sends a text message, **Then** an in-character reply arrives over the transport chosen in Q4, and runtime telemetry shows the deployed agent produced it (no stub path).
2. **Given** the deployed frontend, **When** the browser loads, **Then** every backend endpoint it uses comes from deploy-time configuration rather than a value hardcoded in source, and the page's content security policy permits exactly those endpoints, including the sign-in endpoints (FR-050).
3. **Given** the account's plan and the chosen model (Q0, Q2), **When** the deployed agent invokes the model, **Then** the invocation uses an inference path the account's plan supports, as proven by spike S0 before deployment.
4. **Given** the runtime has been idle, **When** a friend starts a fresh session, **Then** Max begins replying within spec 001 FR-011's cold-start target, with the in-character "buffering" UX covering the wait.
5. **Given** a friend composes a message, **When** it exceeds the length limit decided under FR-036, **Then** the client stops them before sending using the same limit the server enforces and the contract states. The friend never gets a server rejection for a message the UI allowed.
6. **Given** the backend becomes unavailable, **When** a friend sends a message, **Then** the existing graceful-degradation paths (spec 001 FR-014 and spec 001 FR-028) behave on the deployment as they do locally.

---

### User Story 2 - Only invited friends get in (Priority: P1)

An invited friend signs in with Google, Microsoft (personal account) or Login with Amazon, and talks to Max. Someone who is not on the builder's allowlist can still complete sign-in at their provider, but Max Height turns them away before any spend-bearing action, with a message that reveals nothing about who is invited. Removing a friend from the allowlist takes their access away.

**Why this priority**: The builder decided on 2026-10-03 that an open public site would overrun the constitution's $10/month cap (P2), so sign-in plus an invite-only allowlist is the access control for the first deployment (O14). Without the allowlist, anyone with a provider account could spend the budget. Verified: today there is no sign-in at all. The identity pool admits unauthenticated identities (`packages/infra/lib/cognito-stack.ts:20`), and no user pool, OAuth flow, custom domain or certificate exists in infra or frontend code.

**Independent Test**: With a test allowlist, sign in with an allowlisted account through each adopted provider and hold a conversation. Then sign in with a provider account that is not allowlisted, and with one whose email the provider has not verified. Confirm both are turned away, and that telemetry and billing show no spend-bearing action for them. Remove an allowlisted email and confirm access ends within the plan-defined time.

**Acceptance Scenarios**:

1. **Given** a friend's provider-verified email is on the allowlist, **When** they sign in with any adopted provider, **Then** they reach Max and can hold a conversation.
2. **Given** a person's email is not on the allowlist, **When** they complete sign-in at their provider, **Then** Max Height turns them away before any model, voice, runtime or tool invocation, and the message they see reveals nothing about who is on the allowlist.
3. **Given** a provider returns an email it has not verified, **When** the person signs in, **Then** access is denied even if that email matches an allowlist entry (FR-043).
4. **Given** a friend has signed in before, **When** the builder removes their email from the allowlist, **Then** their access is revoked within the time decided at plan, both on later sign-ins and in a session already open (FR-042, FR-047).
5. **Given** no one is signed in, **When** any spend-bearing endpoint is called directly, **Then** it refuses the call (FR-041).
6. **Given** a request for a site, sign-in or callback URL over plain HTTP, **When** it arrives, **Then** it is redirected to HTTPS or refused (FR-048).

---

### User Story 3 - Spend is bounded, measurable and recoverable (Priority: P1)

The builder can trust that the deployed Max Height never spends more than the constitution's $10/month hard cap (P2). They get email warnings at the constitution's alert thresholds, see true gross spend even while promotional credits are absorbing it, and have a documented way to restore service after a hard stop.

**Why this priority**: P2 is non-negotiable, and this feature exists to test whether an agent can run for $10/month. Verified gaps today:

- The hard stop deletes a policy name that CDK never synthesizes (#61).
- The hard stop treats a missing policy as success.
- The hard stop covers only the guest role, which the builder's 2026-10-03 decision removes (FR-041). It touches neither the Lambda nor the runtime spend path, nor the signed-in path that replaces the guest role (O2).
- The alert topic cannot receive Budgets notifications, and no threshold sends email (#56, Plan 1).
- Credits hide spend from a default budget (O10).
- Budgets data lags real usage (O11).
- Log retention defaults to never-expire (O13).

**Independent Test**: In the deployed account, drive each spend signal (alert tiers, soft-degrade, hard stop, in-path breaker) with test thresholds or simulated notifications. Confirm the builder receives email at each alert tier, the hard stop blocks every spend-bearing path, friends see the in-character break state, and the documented recovery restores service.

**Acceptance Scenarios**:

1. **Given** measured spend crosses the constitution's first or second alert threshold (P2), **When** Budgets evaluates, **Then** the builder receives an email notification as Plan 1 specifies.
2. **Given** the account holds promotional credits, **When** spend is measured against the budget, **Then** the measurement reflects gross usage before credits, so alerts fire at the real spend level (O10).
3. **Given** measured spend reaches the constitution's hard-stop threshold, **When** the hard stop fires, **Then** every path that can incur model, voice, runtime or tool spend is blocked, including the signed-in path (FR-018). Friends see spec 001 FR-015's in-character "Max is taking a break" state.
4. **Given** the hard stop's target does not exist or cannot be modified, **When** the hard stop runs, **Then** it fails loudly and alerts the builder instead of reporting success (#61).
5. **Given** usage accrues faster than Budgets data refreshes, **When** in-path spend reaches the circuit-breaker limit decided in Q6, **Then** new spend-bearing requests are refused without waiting for the next Budgets refresh (O11).
6. **Given** spend crosses spec 001 FR-016's soft-degrade threshold, **When** the soft-degrade signal is produced, **Then** the frontend's existing degrade consumer receives it and voice degrades as spec 001 FR-016 specifies (Plan 1 finding F6).
7. **Given** a hard stop has fired, **When** the recovery procedure decided in Q6 is followed, **Then** service resumes and the procedure is documented where the builder will find it.
8. **Given** the deployment is running, **When** the builder inspects observability settings, **Then** every log destination has an explicit retention period, and log levels are set deliberately. Billed observability features (such as Transaction Search) and model-invocation logging are on or off by recorded decision, and the P9 observability requirements are still met (O13).

---

### User Story 4 - A friend cannot claim another friend's budget or memory (Priority: P1)

A signed-in friend cannot reset their own caps or rate limits, impersonate another friend, or read or write another friend's memory by editing what their browser sends. Identity comes from the verified sign-in token, not from the request body.

**Why this priority**: Per-session caps (spec 001 FR-010) and rate limits (spec 001 FR-020) are part of P2's spend protection, and they mean nothing if the client picks its own identifiers. This was verified in code: `packages/agent/src/index.ts` takes `sessionId` and `actorId` from the request body with fallbacks, and `memoryAdapter.ts` builds the namespace `/max-height/${actorId}/` from that value (#55, O1, O8, spec 001 deviation C4).

**Independent Test**: Send requests with forged, omitted, and another friend's `sessionId` and `actorId` values. Confirm the server ignores them and applies caps, rate limits and memory scope from the identity in the verified sign-in token.

**Acceptance Scenarios**:

1. **Given** a friend sends a request carrying another friend's actor identifier, **When** the server processes it, **Then** the server uses the identity in the requester's verified sign-in token, and the forged value has no effect on budgets, limits or memory.
2. **Given** a friend has reached a per-session cap (spec 001 FR-010) or rate limit (spec 001 FR-020), **When** they reconnect, start a new session or clear browser storage, **Then** the limits are not reset, because they are keyed to the sign-in identity. A person who signs in through a second provider is handled as FR-046 decides.
3. **Given** long-term memory is part of the first deployment (see this spec's FR-014 clarification), **When** memory is read, written, exported (spec 001 FR-018) or wiped (spec 001 FR-017), **Then** the operation touches only the namespace derived from the requester's verified sign-in identity.

---

### User Story 5 - Max's character holds on the cheapest model that works (Priority: P2)

Max stays recognizably himself (stuttering, editorial, evasive, ironic, per spec 001 FR-007) on whichever text model the review selects. The builder's rule applies: if the Nova models are cheaper, consider them now; otherwise defer.

**Why this priority**: The text model is the largest variable cost, and wiki figures (to be re-verified) put Nova 2 Lite well below Claude Haiku 4.5 per token. A cheaper model that loses the character, or can't be invoked on the account, is no saving. This is P2 because the first deployment can proceed on whichever model Q0 proves invocable (O4, O9, #50).

**Independent Test**: Run the spike S1 golden set of real Max Height prompts against each candidate model that passed Q0 and the Guardrails gate. Judge character fidelity against `docs/max-personality-bible.md`, and compare cost at spec 001's usage assumptions using re-verified prices.

**Acceptance Scenarios**:

1. **Given** S0's results and re-verified prices, **When** Q2 is decided, **Then** the decision record compares Haiku 4.5 and Nova 2 Lite on price, availability on the account's plan and Region, Guardrails support, and S1 character fidelity, and states which is adopted and why.
2. **Given** Nova 2 Lite is verified not to support Guardrails, **When** Q2 is decided, **Then** the record says so, and #50 is resolved as not adopted unless the builder accepts an alternative enforcement point under Q8.
3. **Given** the adopted model, **When** the golden set runs, **Then** replies stay in character, respect spec 001 FR-009's reply-length bound, and resist the prompt-injection cases of spec 001 FR-013.

---

### User Story 6 - Every architecture decision is recorded, evidenced and constitutional (Priority: P2)

The builder can open one decision register and find, for each of Q0–Q9, the options considered (including "stay as is"), the cited evidence, the decision and the reasoning. Every wiki claim the review relied on has been checked against code or a primary source. Any conflict with the constitution is resolved by conformance or by a merged amendment.

**Why this priority**: The review is what makes the first deployment trustworthy. The builder has found wiki claims that were not true ("trust but verify the wiki"), and several open issues (#47, #48, #49) show the spec 001 cost model contains errors. This is P2 because decisions feed deployment but can be recorded incrementally.

**Independent Test**: For each of Q0–Q9, read its decision record and follow every citation to a primary source. Confirm the cited source says what the record claims, and that each issue #42–#61 has a disposition.

**Acceptance Scenarios**:

1. **Given** any wiki claim used as evidence, **When** a reviewer follows its citation, **Then** it leads to code, an SDK type definition, AWS documentation, `gh` output, or a human-read pricing page. Disagreements with the wiki are appended to the wiki's `Log` page and corrected on the owning page.
2. **Given** the cost model is re-derived (Q7), **When** prompt caching is evaluated, **Then** caching is either shown reachable by spike S2's measured prompt size against the verified per-checkpoint minimum, or struck from the cost model (O6, #49).
3. **Given** the voice path is evaluated (Q1), **When** Polly, Nova 2 Sonic and browser TTS are compared, **Then** the comparison counts Polly's dual billing (speech plus speech marks) and excludes free-tier usage the account's plan does not receive (#47). Nova 2 Sonic is adopted only if cheaper at spec 001's usage assumptions (O5, #48).
4. **Given** a decision conflicts with the constitution (IaC row "AWS CDK + AgentCore CLI", LLM row "Anthropic Haiku-class", P1 versus browser TTS, and the builder's sign-in decision versus P7, P11 and the Auth row per FR-055), **When** the conflict is resolved by amendment, **Then** the amendment lands in its own pull request with a MINOR version bump before dependent implementation tasks run (O7).

---

### User Story 7 - Replies appear progressively and first-token time is measured truly (Priority: P3)

A friend sees Max's reply begin to appear while it is still being generated, rather than all at once. The first-token metric measures the time to the first generated token, not to the completed reply.

**Why this priority**: Progressive replies improve perceived responsiveness, and spec 001 FR-004's latency target cannot be checked honestly without a true first-token measurement. This is P3 because the first deployment works without it, and #45 is held until Q3 and Q4 are decided (O3).

**Independent Test**: Send a message whose reply is near spec 001 FR-009's length bound. Confirm text appears in more than one increment, and the first-token span ends when the first token arrives, before the reply completes.

**Acceptance Scenarios**:

1. **Given** a friend sends a message, **When** the model begins generating, **Then** reply text appears progressively on the transport chosen in Q4.
2. **Given** a reply is generated, **When** its telemetry is inspected, **Then** the first-token measurement covers only the time to the first token, and spec 001 FR-004 is evaluated against it.

---

### Edge Cases

- **Hard stop mid-conversation**: no new spend-bearing work starts, and the friend sees the in-character break state rather than a raw error (spec 001 FR-014 and spec 001 FR-015).
- **Budgets never fires because credits absorb spend**: prevented by gross-spend measurement (FR-017).
- **Free plan ends** (6 months or credit exhaustion, then account closure without upgrade, per AWS documentation the builder cited): the deployment must not be stranded without warning. See the FR-028 clarification.
- **Model access denied at deploy time** (for example, a cross-Region profile on the Free plan): deployment is blocked by S0's evidence before shipping, never discovered by a friend.
- **New-account Bedrock quotas fall below what spec 001 FR-020's rate limits could demand**: recorded as a deploy prerequisite, and requests above quota surface as in-character refusals, not system errors.
- **Hard-stop target name differs from the synthesized name** (#61): the hard stop fails loudly (FR-019).
- **Budget notification cannot publish to its topic** (#56): delivery is verified as part of the demonstration (SC-003).
- **A friend clears browser storage**: identity comes from the sign-in token, so caps and rate limits persist (FR-010, SC-006).
- **Runtime session expires mid-conversation** (infra-plan idle timeout): behavior is defined in planning, and a friend sees an in-character state, not a failure.
- **In-path breaker and Budgets disagree on spend**: the stricter signal wins.
- **A wiki claim proves false mid-review**: the claim is logged, corrected on its owning page, and any decision that relied on it is re-evaluated.
- **Cost-allocation tags not yet active at deploy time**: early spend is unattributable, so deployment waits for activation (FR-033).
- **Model-invocation logging would capture friends' messages**: it stays off unless a recorded decision accepts the privacy trade-off (FR-022).
- **A price changed since the wiki recorded it**: the re-verified price wins, and the wiki is corrected.
- **One person signs in through two providers**: two identities mean two sets of caps and rate limits unless they are linked. The plan decides between linking and one allowlist entry per identity (FR-046).
- **An email is removed from the allowlist mid-session**: access ends within the plan-defined revocation time, with an in-character state rather than a raw error (FR-042, FR-047).
- **The sign-in token expires mid-conversation**: the friend never sees a raw error. The plan decides between silent renewal and signing in again, presented in character (FR-047).
- **A sign-in provider has an outage**: sign-in through it fails gracefully per P8, in character where possible, and the other providers keep working (FR-047).
- **A provider returns an unverified email** (possible with Microsoft, unverified): the sign-in is denied even if the email matches an allowlist entry (FR-043).
- **Denied access**: the message reveals neither whether a given email is on the allowlist nor who is (FR-043).

## Requirements *(mandatory)*

### Functional Requirements

#### Sequencing and governance

- **FR-001**: Plan 1 (#56, budget warning routing) and #61 (hard-stop policy name) MUST be merged to `main` before `/speckit.plan` runs for this feature, so the review starts from a correct baseline. Note: the builder's 2026-10-03 decision removes the unauthenticated role whose policy name #61 fixes (FR-041). The fail-loud half of #61 (FR-019) still applies to whatever the hard stop targets. Whether #61 is re-scoped before it merges is the builder's call.
- **FR-002**: Any constitution amendment arising from this review MUST land in its own pull request with a MINOR version bump and review of dependent artifacts, before the implementation tasks that depend on it run (constitution governance; O7).
- **FR-003**: Each spike (S0–S3) MUST have a written cost estimate and explicit builder approval before it runs.
  - **S0**: Free-plan model-access smoke test. Invoke the Haiku 4.5 global cross-Region profile (expected denial) and Nova 2 Lite's in-Region model ID (expected success).
  - **S1**: Golden-set character comparison of Haiku 4.5 and Nova 2 Lite. Runs only if the Guardrails gate passes.
  - **S2**: Measure real system-prompt plus tool-definition token usage from an invocation's reported usage, and verify the per-checkpoint cache minimum.
  - **S3**: Measure Nova 2 Sonic's audio tokens per second and whether silence is billed. The current per-second figure is derived, not published.

#### Review and decision register

- **FR-004**: The review MUST record a decision for each question below, **in this order**, because earlier answers reshape later ones. Each record holds the options (including "stay as is"), the cited evidence, the decision and the reasoning. Q9 is the one exception to the order: the builder decided its core on 2026-10-03, and that core already constrains Q4–Q6, so its open details are decided alongside Q5.

  | Q  | Question | Issues / outcomes |
  | -- | -------- | ----------------- |
  | Q0 | Account plan and inference path: which inference path is supported on the account's plan; this gates Q2 | O9 |
  | Q1 | Voice: Polly Neural, Nova 2 Sonic, browser TTS, and conformance with P1 | #47, #48, O5 |
  | Q2 | Text model: Haiku 4.5 or Nova 2 Lite | #50, O4 |
  | Q3 | Personality placement: Strands hooks or post-processing (may be recorded as deferred with #42) | #42 |
  | Q4 | Streaming and transport: Lambda proxy, direct Runtime call with inbound JWT auth (sign-in now supplies a JWT), or native AgentCore WebSocket | #45, O3, O12 |
  | Q5 | Session identity, caps and edge rate limiting. The basis is decided: the verified sign-in identity (builder, 2026-10-03). Open: which token claim keys it, and how caps and edge rate limits apply | #55, O1, O14 |
  | Q6 | Hard-stop mechanism, recovery policy, and in-path circuit breaker | Plan 1, #61, O2, O11 |
  | Q7 | Cost-model corrections: cache rates, Polly dual billing, free-tier applicability, gross-spend measurement | #47, #49, O6, O10 |
  | Q8 | Platform and IaC ownership (CDK vs AgentCore CLI), memory path, Strands harness, where Guardrails are enforced, observability cost | O7, O8, O13 |
  | Q9 | Access and sign-in details. The core was decided by the builder on 2026-10-03 (FR-041–FR-049). Open: the allowlist enforcement and revocation mechanism and its timing, linking identities across providers, the Cognito feature plan, the sign-in page domain, the subdomain name, identity-provider secret storage, Microsoft email verification, and confirming that each adopted provider is fee-free (FR-045) | O14 |

- **FR-005**: The review MUST assess the current codebase and architecture against current AWS guidance: the Well-Architected Agentic AI Lens and Generative AI Lens, and Bedrock AgentCore Runtime, Memory, Identity and Observability. Findings are recorded in the decision register where they bear on Q0–Q9.
- **FR-006**: **Trust but verify.** Every wiki claim the review relies on MUST be verified against code or a primary source (AWS documentation, SDK type definitions, `gh` output) before it informs a decision, and each verification MUST be cited. Any disagreement MUST be appended to the wiki's `Log` page and corrected on the owning page. FR-039 and FR-040 define the record and the correction workflow.
- **FR-007**: These external facts MUST be re-verified at plan time:
  - Haiku 4.5 lifecycle status
  - latest Strands SDK version
  - Nova 2 Lite Guardrails support
  - AgentCore Runtime V2 committed-baseline pricing status
  - Google Custom Search JSON API availability for existing customers
  - model access on the account's plan
  - Nova, Haiku and Polly prices
  - the sign-in, certificate and DNS facts marked unverified in FR-043, FR-044, FR-045, FR-048, FR-051, FR-052 and FR-054, and in the DNS and certificate assumptions

  AWS pricing pages render client-side, so a human reads the prices and the reading is cited.
- **FR-008**: Each decision MUST be published as a wiki `Decision-*` page, with `Index` and `Log` updated, `wiki:lint` passing, and builder approval before any wiki push.
- **FR-009**: During close-out, spec 001's `research.md` cost entries corrected by this review (R0 for #49, R4 for #47) MUST receive dated correction annotations, not overwrites.

#### Identity and isolation

- **FR-010**: The server MUST derive session and actor identity from the verified sign-in token: the JWT `sub`, or the claim the plan decides under Q5. It MUST NOT accept identity from client-supplied request fields such as `sessionId` or `actorId` (#55). A verified sign-in identity is also what AgentCore Runtime inbound JWT authorization and AgentCore Memory fine-grained access control key on, both via the JWT `sub`. Those two are research-agent findings, unverified; verify at plan under Q4 and Q8.
- **FR-011**: Per-session caps (spec 001 FR-010) and rate limits (spec 001 FR-020) MUST be keyed to the verified sign-in identity (FR-010) and MUST NOT be resettable through any client-controlled value.
- **FR-012**: Memory namespaces MUST be derived only from the verified sign-in identity, providing tenant isolation between friends (O8, deviation C4).
- **FR-013**: Forget-me (spec 001 FR-017) and Export (spec 001 FR-018) MUST operate only on the requester's own data.
- **FR-014**: Long-term memory scope for the first deployment: [NEEDS CLARIFICATION: Does the first deployment include long-term memory (AgentCore Memory with the constitution's 30-day rolling window; infra-plan T023b/c), or is long-term memory deferred until after the first deployment, with conversations kept session-only?]
- **FR-015**: Access MUST require sign-in, and only invited friends on the allowlist may get past it (builder, 2026-10-03; P7; O14). Guest (signed-out) access is removed entirely, including the identity pool's unauthenticated identities (`cognito-stack.ts:20`). FR-041–FR-056 define sign-in and access. This decision resolved the access-gating clarification formerly here.

#### Spend control and observability

- **FR-016**: Budget alerts MUST route as Plan 1 decides: the constitution's alert tiers notify the builder by email, the hard-stop tier triggers the hard stop, and every notification target MUST permit the budgets service to publish to it.
- **FR-017**: Spend measurement for alerts and the hard stop MUST reflect gross usage before credits, so the $10 experiment is measurable while promotional credits last (O10).
- **FR-018**: The hard stop MUST block every path that can incur model, voice, runtime or tool spend (O2). That includes the WebSocket handler, the agent runtime, and the signed-in path that replaces the guest role: the authenticated role, token issuance, and the runtime authorizer. Today it touches only the unauthenticated guest role (`budget-stack.ts:64-66`, `cognito-stack.ts:71`), which FR-041 removes, so the existing hook is no longer enough.
- **FR-019**: The hard stop MUST fail loudly and alert the builder when its target cannot be found or modified. A missing target MUST NOT count as success (#61).
- **FR-020**: An in-path circuit breaker MUST bound spend between Budgets refreshes (O11). Its limit and the signal it reads are decided in Q6 and derived from P2; no limit is set in this spec.
- **FR-021**: The hard stop MUST have a defined recovery procedure (automatic at the start of the budget period, or manual, decided in Q6). The procedure MUST be documented and demonstrated once.
- **FR-022**: Observability MUST fit the budget while meeting P9:
  - every log destination has an explicit retention period (never the never-expire default)
  - log levels are set deliberately
  - billed tracing features (such as Transaction Search) are enabled only by recorded decision
  - model-invocation logging is enabled only if a recorded decision accepts the privacy trade-off for friends' messages
  - operational alarms (infra-plan T111) use their own notification target, separate from budget alerts (Plan 1 F7, deviation C8) (O13)
- **FR-023**: A producer MUST emit the soft-degrade signal at spec 001 FR-016's threshold, so the frontend's existing consumer acts on it (Plan 1 F6).
- **FR-024**: Projected monthly spend at spec 001's usage assumptions, using re-verified prices, gross of credits, and including infrastructure, storage, observability, container-registry and sign-in costs (user-pool and federation MAUs, FR-051; secret storage, FR-052), MUST be at or below the constitution's cost gate. A projection above the gate MUST carry a documented mitigation. The fee-free provider rule (FR-045) keeps sign-in from adding non-AWS costs. The existing domain's renewal is covered under Assumptions.

#### Model, voice and inference path

- **FR-025**: Q0 MUST be decided first, using spike S0's evidence. The model inference path used by the deployment MUST be one the account's plan supports.
- **FR-026**: The text model (Q2) MUST be chosen by comparing Haiku 4.5 and Nova 2 Lite on re-verified price, availability on the account's plan and pinned Region, Guardrails support, and S1 character fidelity. Following the builder's rule, the Nova model is adopted if it is cheaper and passes those gates.
- **FR-027**: The voice path (Q1) MUST be chosen by comparing Polly Neural, Nova 2 Sonic and browser TTS at spec 001's usage assumptions. Nova 2 Sonic is adopted only if cheaper. Any departure from P1 (cloud-only TTS) requires an amendment under FR-002.
- **FR-028**: The deployment account MUST be on a plan that supports the chosen models and keeps the deployment alive past the first-deploy period: [NEEDS CLARIFICATION: Should the account stay on the AWS Free plan (no cross-Region inference, credits mask spend, the plan ends after 6 months or when credits run out) or be upgraded to the Paid plan before the first deployment?]
- **FR-029**: Prompt caching MUST be either shown reachable for the adopted model or struck from the cost model (#49, S2).

#### First deployment

- **FR-030**: Infra-plan Phases 2–6 MUST be complete:
  - T151: snapsafe base image
  - T023b/c: AgentCore Memory, subject to the FR-014 clarification
  - T152/T153: CDK deployment of AgentCore Runtime V2
  - T111/T113: alarms
  - Phase 6
- **FR-031**: The deployment Region MUST be pinned explicitly in infrastructure code, which today sets none. It defaults to infra-plan's Region, provided the adopted model is invocable in-Region there under Q0.
- **FR-032**: The path from the signed-in friend to the agent runtime MUST be implemented end to end via the transport decided in Q4. Every invoking principal MUST be granted invoke permission on the specific deployed runtime only, not a wildcard. Verified gaps the path must close (see W4–W6 and W1):
  - the WebSocket handler's agent call is a stub (`websocket-handler.ts:109`)
  - the browser opens an unsigned socket (`useWebSocket.ts:75`), while the API's connect route requires IAM authorization (`agent-stack.ts:62`). The presigning helper exists but nothing calls it (`cognitoAuth.ts:76`).
  - server and client disagree on message payload fields: `connection_ack` and `session_state_change` at `websocket-handler.ts:115,121` vs `useWebSocket.ts:41,56`, and `agent_turn_complete` at `websocket-handler.ts:128`. Both sides MUST match the spec 001 WebSocket and message-protocol contracts, or the contracts are amended. The contracts' guest-credential auth is superseded by FR-056.
  - the identity-pool role's invoke grant (today on the unauthenticated role, which FR-041 removes) defaults to a wildcard runtime ARN (`packages/infra/bin/app.ts:11-12`, `cognito-stack.ts:43-44`)
  - the browser's Polly client is created with no credentials or Region (`packages/frontend/src/services/pollyTts.ts:28`, `new PollyClient({})`). The voice path therefore needs credentials from the signed-in identity, or a server-side path, as decided under Q1 and Q4.
- **FR-033**: Deploy prerequisites MUST be completed and recorded before the first deploy:
  - CDK bootstrap
  - an ARM64 container-image build path that works from the builder's Windows machine (local emulation or a cloud build)
  - model access enabled and new-account quotas checked against spec 001's rate limits
  - cost-allocation tags activated far enough ahead of deployment for spend attribution (about 24 hours, per AWS guidance the builder cited)
  - the budget stack deployed first (infra-plan)
  - the third-party sign-in app registrations (FR-054)
  - the custom subdomain's certificate, its DNS validation record, and the subdomain's own DNS record at GoDaddy (FR-049), as manual steps documented in the deployment guide
- **FR-034**: Deployment MUST use a least-privilege deploy identity, with no long-lived credentials committed (P11). Whether that identity is a manual role session or GitHub OIDC is decided in planning.
- **FR-035**: Until the infrastructure library offers a typed property for the runtime platform version, the infrastructure MUST keep the low-level override that sets it, with a test assertion that pins it. Verified on 2026-10-03: infra resolves `aws-cdk-lib` 2.270.0, whose `aws-bedrockagentcore/lib/bedrockagentcore.generated.d.ts` has no `platformVersion` property (W17). Re-check at plan time.
- **FR-036**: Frontend changes MUST be limited to what deployment needs, which now includes sign-in:
  - endpoint and configuration injection at deploy time
  - the sign-in, sign-out and denied-access surfaces, and the in-character states of FR-047
  - the privacy page (FR-053)
  - content security policy allowances for exactly the deployed endpoints, including sign-in (FR-050). Today's policy (`frontend-stack.ts:24`) allows wildcard API Gateway and Cognito hosts but no voice endpoint, although the browser calls Polly directly (`useAudio.ts:13`); see D9.
  - one message-length limit shared by the client, the server and the spec 001 WebSocket contract. Today they disagree: the contract allows 1–2,000 characters (`specs/001-max-height-ai-character/contracts/websocket-api.md:65,209`), and so does the client (`TextInput.tsx:10`), but the server rejects more than 500 (`websocket-handler.ts:7,97`). Planning decides whether the server moves to the contract's limit or the contract is amended, and records the decision's effect on per-turn token cost.
- **FR-037**: The deployment MUST preserve cloud-only AI behavior (no browser-side model inference) and the existing graceful-degradation paths: text fallback, signal-lost state and capability fallbacks.

#### Issue disposition

- **FR-038**: Every issue #42–#61 MUST be dispositioned as below (states verified with `gh` on 2026-10-03). Each in-scope issue MUST receive a resolution comment linking its decision. Any new issue MUST be proposed to the builder, never filed unprompted.

  | Disposition | Issues |
  | ----------- | ------ |
  | Done (closed issue or merged PR); no action | #43, #44, #46, #51, #52, #53, #54, #57, #59, #60 |
  | Prerequisite, merged before `/speckit.plan` | #56 (Plan 1), #61 |
  | Open and in scope, resolved by Q0–Q9 | #45, #47, #48, #49, #50, #55 |
  | Deferred until after the first deployment | #42 |
  | Related, out of scope | #58 (semantic wiki maintenance workflow; relates to FR-006) |

#### Wiki verification

- **FR-039**: The review MUST produce a **wiki-claim verification record** covering every wiki claim that informs a decision, requirement or assumption. Each entry gives:
  - the claim
  - the owning wiki page
  - the verification method and citation: `file:line`, SDK `.d.ts` path, AWS documentation URL, `gh` output, or a human-read pricing page
  - the date checked
  - the result: *Verified*, *Refuted*, or *Unverified*

  No decision may rest on an *Unverified* claim. The record starts from this spec's [Wiki Claims Relied On](#wiki-claims-relied-on) table and is completed during plan and research.
- **FR-040**: Every *Refuted* claim, and every wiki gap the review finds (a fact the wiki needs but lacks), MUST be:
  - appended to the wiki's `Log` page
  - corrected or added on its owning page, with a `Gotchas` row when it is a trap
  - checked with `wiki:lint`
  - pushed only after explicit builder approval, because wiki pushes are live and public

  This applies first to the items in [Wiki Discrepancies to Log](#wiki-discrepancies-to-log). A conflict between a builder-cited AWS fact and the constitution is resolved by amendment under FR-002, not by a wiki edit.

#### Sign-in and access (builder decisions, 2026-10-03)

- **FR-041**: **Sign-in is required.** Every spend-bearing action (a model, voice, runtime or tool invocation) MUST require a signed-in, allowlisted identity, and no signed-out path to any of them may exist. The Cognito Identity Pool's unauthenticated access MUST be removed. Today it is enabled (`packages/infra/lib/cognito-stack.ts:20`), with an unauthenticated role (`:32`) attached at `:65`.
- **FR-042**: **Invite-only allowlist.** Access MUST require the signed-in, provider-verified email to be on an allowlist the builder maintains. A person who completes sign-in at their provider but is not on the allowlist MUST be turned away before any spend-bearing action. Cognito's pre sign-up trigger runs on a user's first federated sign-in and can deny the user (AWS documentation "Pre sign-up Lambda trigger", verified by the builder on 2026-10-03). Because it runs at first sign-in, it cannot revoke access on its own. Removing an email from the allowlist MUST revoke that person's access, not only block their first sign-up. Which mechanism enforces revocation, and how soon it takes effect, are decided at plan under Q9; this spec sets no revocation time.
- **FR-043**: **Verified emails only, and a denial that reveals nothing.** Allowlist matching MUST use only emails the provider marks as verified. A sign-in whose email claim is unverified MUST be denied, even if it matches an entry. Microsoft's `email` claim may not be verified, which would let someone spoof an invited email (unverified; verify at plan, and decide under Q9 which Microsoft claim to trust). The denied-access message MUST NOT reveal whether a given email is on the allowlist, or who is.
- **FR-044**: **Providers.** Sign-in MUST offer Google, Microsoft (personal accounts) and Login with Amazon (builder, 2026-10-03). Google and Amazon are Cognito built-in social providers. Microsoft is configured as a generic OIDC provider with a fixed tenant issuer. Cognito's issuer validation likely rejects the multi-tenant "common" endpoint, and personal accounts likely need the consumer tenant's issuer; both are unverified, so verify at plan.
- **FR-045**: **Fee-free providers only; Sign in with Apple excluded** (builder, 2026-10-03).
  - **Rule.** A sign-in provider is adopted only if registering and operating it with that provider carries no fee. Cognito's own charges for user-pool and federated users are a separate cost, projected under FR-051.
  - **Apple is excluded.** Sign in with Apple on the web needs a Services ID created in the Apple Developer portal, and the portal requires a paid Apple Developer Program membership ($99/year). This was verified via web search from secondary sources, not Apple's own pricing page: the Apple Community thread <https://discussions.apple.com/thread/254664133> and Firebase's "Authenticate Using Apple" documentation.
  - **Adding a provider later.** Apple, or any other provider with a fee, needs a cost decision recorded first.
  - **The adopted three.** Registering a Google Cloud OAuth client, a Microsoft Entra app, or a Login with Amazon security profile, and operating it, is believed to be free (unverified; verify at plan under FR-007).
- **FR-046**: **One person, several providers.** A person who signs in through two providers holds two identities, and so two sets of caps and rate limits, unless the identities are linked. The plan MUST choose between linking identities and one allowlist entry per identity, and record the residual risk under Q5 and Q9.
- **FR-047**: **Sign-in failures degrade gracefully (P8).** A provider outage, a sign-in token expiring mid-conversation, and an email removed from the allowlist mid-session MUST each produce an in-character state where possible, never a raw error or a blank page. Whether an expiring token is renewed silently or the friend signs in again is decided at plan.
- **FR-048**: **HTTPS everywhere.** The site, the sign-in pages, and every redirect and callback URL MUST be HTTPS-only. Verified: the CloudFront distribution already redirects HTTP to HTTPS (`packages/infra/lib/frontend-stack.ts:47`, `ViewerProtocolPolicy.REDIRECT_TO_HTTPS`). Unverified, to verify at plan: Cognito requires HTTPS callback URLs except for `localhost`.
- **FR-049**: **Custom domain.** The site MUST be served on a subdomain of the builder's existing domain `recipieces.com`. Its DNS is at GoDaddy, and its current configuration is unknown. The subdomain's name, and whether the sign-in pages use a Cognito prefix domain or a custom sign-in subdomain, are decided at plan under Q9. Verified gap: no stack declares a custom domain or certificate today (no `domainNames` or certificate anywhere in `packages/infra/lib` or `bin`). The DNS and certificate defaults are under Assumptions.
- **FR-050**: **Content security policy for sign-in.** The page's content security policy MUST allow the sign-in endpoints in every directive sign-in needs (for example `connect-src` and `form-action`), naming exact hosts as FR-036 requires. Today's policy (`frontend-stack.ts:24`) allows the identity-pool host but no user-pool or sign-in-page host, and sets no `form-action`.
- **FR-051**: **Cognito feature plan and sign-in cost.** The Cognito user-pool feature plan (Lite or Essentials) is chosen at plan. Pricing per <https://aws.amazon.com/cognito/pricing/> (fetched by the builder on 2026-10-03):
  - users who sign in through social providers bill as direct user-pool monthly active users (MAUs)
  - SAML and OIDC federation, which covers Microsoft, has a 50-MAU free tier, then $0.015 per MAU

  The plan MUST verify that the user-pool free tier is an "Always Free" offer, and so active on a Free-plan account (FR-028). Sign-in costs are included in the FR-024 projection.
- **FR-052**: **Sign-in secrets.** Identity-provider client secrets and keys MUST be stored per P11: SSM SecureString or environment variables, never in source (`constitution.md:210-211`). Their storage MUST NOT add recurring cost unless the decision record justifies it. Secrets Manager charges per secret per month, so the plan MUST check whether CloudFormation can consume an SSM SecureString for Cognito identity-provider resources.
- **FR-053**: **Privacy.** Sign-in makes friends' emails stored personal data, so P7's rationale that privacy obligations are minimal (`constitution.md:131-132`) no longer fully holds. A privacy page MUST disclose:
  - what sign-in stores
  - how long it is kept (the retention period is defined at plan)
  - how to request deletion

  Deletion on request MUST remove the person's sign-in record and allowlist entry, alongside spec 001 FR-017's memory wipe. Spec 001's privacy requirements call for a privacy page (`specs/001-max-height-ai-character/spec.md:298-302`), but none exists in frontend source (search on 2026-10-03). It is therefore created, not updated.
- **FR-054**: **Third-party app registrations are deploy prerequisites** (FR-033), each with HTTPS callback URLs (FR-048) and none carrying a fee (FR-045):
  - Google Cloud OAuth client and consent screen. A consent screen in "Testing" publishing status may cap users and expire tokens (unverified; verify at plan).
  - Microsoft Entra app registration for personal accounts, with the issuer per FR-044.
  - Login with Amazon security profile.
- **FR-055**: **Constitution amendments for sign-in.** These constitution texts conflict with the builder's decision and MUST be amended under FR-002:
  - P7's auth posture, "Cognito guest identity + per-session caps, not full user accounts" (`constitution.md:125-126`)
  - P7's "No public registration" (`:128`). The amendment states explicitly that invite-only sign-in is not public registration.
  - P7's rationale that privacy obligations are minimal (`:131-132`; FR-053)
  - P11's "Runtime access MUST use scoped temporary credentials (Cognito guest), consistent with P7" (`:203-204`)
  - the technology table's Auth row, "Amazon Cognito Identity Pool (guest/unauthenticated)" (`:229`)
  - P2's example of a hard stop, "Lambda disables Cognito guest role" (`:67-68`), which names the role being removed. This is an editorial update to the example only; P2's rule is unchanged.

  This is a MINOR bump, because the principle is materially expanded and the stack changes. It lands in its own pull request before implementation, together with the review's other amendments.
- **FR-056**: **Spec 001 supersession.** For access, this spec supersedes:
  - spec 001's 2026-04-20 clarification, which removed the shared-password gate in favor of the unlisted URL, rate limits and the hard stop (`specs/001-max-height-ai-character/spec.md:42`)
  - spec 001's guest-identified Visitor entity (`:289`) and its guest-identity privacy disclosure (`:302`)
  - the guest-credential auth in spec 001's WebSocket and Polly contracts (`contracts/websocket-api.md:14,22`; `contracts/polly-tts.md:15,191`)

  Spec 001 is frozen and is not edited. At close-out, a wiki Decision page (for example `Decision-Access-And-Sign-In`) records the decision. The pages in [Wiki Pages to Update After the Access Decision](#wiki-pages-to-update-after-the-access-decision) are then updated under FR-040's approval rule. They are not discrepancies, because they were true when written.

### Key Entities

- **Decision Record**: One per question Q0–Q9. Holds the question, the options (including "stay as is"), cited evidence, the decision, the reasoning, the affected issues and outcomes, and any constitution impact. It is published as a wiki `Decision-*` page.
- **Verification Citation**: Links a claim (often from the wiki) to the primary source that confirms or refutes it: code location, AWS documentation, SDK type definition, `gh` output, or a human-read pricing page. It records the date checked and, when the claim was false, the resulting `Log` entry.
- **Wiki Claim Verification Record**: The FR-039 collection of wiki claims the review relies on. Each entry holds the claim, its owning page, a Verification Citation, the date checked, and a status of *Verified*, *Refuted* or *Unverified*. Refuted claims and gaps link to their `Log` entry and owning-page correction (FR-040).
- **Spike**: A bounded experiment (S0–S3) with an objective, a cost estimate, an approval record, and its result. It feeds one or more Decision Records.
- **Spend Signal**: A measured or projected spend state that drives behavior. Kinds: alert tier, soft-degrade, hard stop, in-path circuit breaker. Each records its source (gross usage, in-path tally), threshold source (constitution or spec 001), action, and recovery.
- **Invited Friend**: A person on the allowlist who has signed in. Identified by the verified identity in their sign-in token (the JWT `sub`, or the claim decided under Q5), from which session caps, rate-limit counters and the memory namespace are derived. The identity is never supplied by the client. For access, it replaces spec 001's guest-identified Visitor (FR-056).
- **Allowlist**: The builder-maintained list of invited emails. Each entry holds a provider-verified email and, as the plan decides, a provider identity (FR-046). Adding an entry grants access; removing one revokes it within the plan-defined time (FR-042).
- **Deployment Environment**: The account and its plan, the pinned Region, model access and quotas, the deploy identity, bootstrap state and cost-allocation tag status that a deployment depends on, plus the custom subdomain with its certificate and DNS records, and the third-party sign-in app registrations.
- **Issue Disposition**: The status of each issue #42–#61 (done, prerequisite, in scope, deferred, out of scope), with the decision or resolution comment that closes it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On the live deployment, an invited friend signs in from a fresh browser and holds a multi-turn, in-character conversation from first message to the friend's chosen end, with no operator intervention and no stub path.
- **SC-002**: The projected monthly spend at spec 001's usage assumptions is at or below the constitution's $8 cost gate. The projection uses re-verified prices and gross (pre-credit) costs, including infrastructure, storage, observability and sign-in.
- **SC-003**: In a demonstration, each constitution alert tier ($5 and $8, P2) delivers an email to the builder. The $10 hard stop is followed by zero successful spend-bearing invocations on any path until recovery.
- **SC-004**: In a demonstration, the in-path circuit breaker refuses new spend-bearing requests once its limit is reached, without waiting for a Budgets refresh.
- **SC-005**: After a demonstrated hard stop, the documented recovery procedure restores service on its first attempt.
- **SC-006**: In forged-identifier tests, zero requests change the budget, rate-limit counter or memory namespace applied to the requester.
- **SC-007**: All ten questions (Q0–Q9) have a recorded decision. Every wiki claim relied on carries a primary-source citation, and every disagreement found appears on the wiki's `Log` page.
- **SC-008**: All twenty issues #42–#61 carry a disposition, and every in-scope issue has a resolution comment linking its decision.
- **SC-009**: The architecture has zero unresolved constitution conflicts: each one either conforms or is covered by a merged amendment.
- **SC-010**: The spend figure the builder sees for the budget period matches gross usage before credits, verified by comparing it with the account's billing data for the same period.
- **SC-011**: No log destination in the deployment retains data indefinitely.
- **SC-012** (P3, US7): For replies spanning more than one increment, the reported first-token time is earlier than the time to the complete reply, and spec 001 FR-004 is evaluated against it.
- **SC-013**: Every wiki claim that informs a recorded decision appears in the verification record with status *Verified* or *Refuted*, and none with *Unverified*. Every item in [Wiki Discrepancies to Log](#wiki-discrepancies-to-log), and every discrepancy found later, has a `Log` entry and an owning-page correction pushed with builder approval.
- **SC-014**: In tests, an account that completes provider sign-in but is not on the allowlist, or presents an unverified email, reaches zero spend-bearing actions: no model, voice, runtime or tool invocation is attributable to it.
- **SC-015**: An allowlisted friend can sign in with each adopted provider and hold a conversation.
- **SC-016**: After the builder removes an email from the allowlist, that person makes zero spend-bearing actions once the plan-defined revocation time has passed, including in a session open at the time of removal.
- **SC-017**: An audit of the deployment finds no signed-out path to any spend-bearing action.
- **SC-018**: Every site, sign-in and callback URL in the deployment is served over HTTPS, and a plain-HTTP request is redirected or refused.

## Assumptions

- **Methodology.** The review produces decisions, not behavior, so it has no RED test. Its checks are `speckit.analyze` and `wiki:lint`. Every implementation task that comes out of the review follows RED → GREEN → REFACTOR.
- **Usage assumptions** are spec 001's: the session-cost and sessions-per-month figures in `specs/001-max-height-ai-character/plan.md` and `research.md`. They are corrected under Q7 where #47 and #49 found errors, and are not re-invented here.
- **Account plan facts** come from AWS documentation the builder cited, and are re-verified under FR-007. The wiki records none of them (D1, D10, D11):
  - the account is on the Free plan (created after 2025-07-15)
  - the Free plan does not support global or geographic cross-Region inference
  - it excludes certain Marketplace offers that can incur charges (whether this blocks Claude models is unverified)
  - it ends after 6 months or when credits run out, with 90 days to upgrade before closure
  - joining AWS Organizations upgrades the account to Paid automatically
- **Inference paths** (from model cards the builder cited; to be re-verified): the code uses Haiku 4.5's global cross-Region profile (`index.ts:96`, W12), which `bedrock-runtime` requires for that model. Nova 2 Lite has an in-Region model ID on `bedrock-runtime`. The wiki records neither the restriction nor the in-Region ID (D1, D2).
- **Free-tier voice usage**: Free-plan accounts receive only "Always Free" offers, so Polly's 12-month free usage is assumed not to apply until verified. Several wiki pages say it may apply (D5).
- **Budgets behavior** (AWS documentation, re-verified under FR-007): credits are included by default, and data refreshes up to three times a day with a lag of hours. The hard stop is therefore a lagging backstop, and FR-020's breaker covers the gap. The wiki records neither fact (D6, D7).
- **Pricing figures** on the wiki (Source-Amazon-Nova-Lite, Decision-LLM-Model-Selection, Source-Nova-Sonic, Source-Amazon-Polly, Source-AgentCore-Pricing, Source-AgentCore-Web-Search-Tool) are treated as unverified until a human reads the pricing pages under FR-007 (W29).
- **Region** defaults to `us-west-2`, the Region `docs/infra-plan.md:58-60` names. That document's claim that it is one of five AgentCore Runtime V2 Regions is unverified (W24), and so is Nova 2 Lite's in-Region availability there (Q0).
- **Message length** is not assumed. FR-036 makes the shared limit a planning decision, because the contract (2,000 characters) and the server (500) disagree (W7).
- **Session expiry**: the runtime idle timeout is the 1800 seconds decided on Decision-AgentCore-Runtime-V2 and Guide-Deployment, which matches spec 001's 30-minute session cap. The wiki's claim that the service default is shorter is unverified (W25). In-character behavior on mid-conversation expiry is defined in planning and is an expected `/speckit.clarify` topic.
- **Text-in first deployment**: speech input exists but is not wired into the app; only `TextInput` renders (`App.tsx:8,357`; W19). Wiring it is UI work beyond FR-036, so the first deployment takes typed input only, and voice output stays in scope.
- **Operator**: the builder is the sole operator, the email recipient for every alert, and maintains the allowlist manually.
- **Invited emails**: friends sign in with the email address the builder invited (FR-042).
- **DNS and certificate defaults** (builder, 2026-10-03; each verified at plan under FR-007):
  - DNS stays at GoDaddy, with no Route 53 hosted zone, to avoid a recurring charge.
  - The CloudFront certificate is an ACM certificate in us-east-1, validated by a DNS record added at GoDaddy. That Region differs from the pinned deployment Region (FR-031), so the plan decides how the certificate is provisioned.
  - GoDaddy DNS records are manual steps documented in the deployment guide, outside infrastructure code.
  - The site uses a subdomain, not the apex, because GoDaddy is believed unable to point the apex at CloudFront without ALIAS support (unverified).
- **Sign-in facts** marked unverified in FR-043, FR-044, FR-045, FR-048, FR-051, FR-052 and FR-054 are not assumptions. They are verified at plan under FR-007 before any decision rests on them.
- **Non-AWS costs**: the fee-free provider rule (FR-045) means sign-in adds none. `recipieces.com` is the builder's existing domain, so its renewal is assumed to be the builder's cost regardless of this feature and is not counted in the FR-024 projection. The constitution enforces P2 through AWS Budgets (`constitution.md:61-71`), which sees only AWS spend. If the builder wants the renewal counted, it is added to the projection as a separate line.
- **Inbound JWT auth**: AgentCore Runtime supports it (builder-cited; Source-AgentCore-Bidirectional-Streaming describes browser OAuth, unverified, W36), so direct browser-to-runtime transport is a valid Q4 option. Whether it is used is decided in Q4. Sign-in now supplies a user-pool JWT, which strengthens that option. The research findings that Runtime inbound JWT authorization and AgentCore Memory fine-grained access control both key on the JWT `sub` are unverified (FR-010).
- **UI** is close enough to MVP. No UI work beyond FR-036 is in scope; FR-036 now includes the sign-in surfaces and the privacy page.
- **Out of scope**:
  - spec 002 and issues #10–#14 (volume knob)
  - #42 personality hooks (deferred until after the first deployment)
  - #58 semantic wiki maintenance workflow
  - spec 001 V1 features not needed for the first deployment
  - public or self-service registration, and any audience beyond invited friends (the builder will consider scaling later if friends like it)
- **Dependencies**:
  - Plan 1 (#56) and #61 merge before `/speckit.plan` (FR-001)
  - constitution amendments merge before dependent implementation (FR-002)
  - spikes run only with approval (FR-003)
  - wiki pushes, including the discrepancy entries below, happen only with builder approval (FR-040)
  - third-party sign-in app registrations and the GoDaddy DNS steps complete before the first deploy (FR-033, FR-054)

## Wiki Claims Relied On

The seed of the FR-039 verification record, checked on 2026-10-03 against the wiki clone at `2bac2b4`. Status meanings:

- **Verified**: confirmed against the cited source.
- **Conflict**: the code or a builder-cited fact disagrees; see the D-number.
- **Unverified**: verify in plan or research before relying on it.

Paths without a package prefix are in `packages/infra/lib/` (infra), `packages/agent/src/` (agent) or `packages/frontend/src/` (frontend).

| # | Claim (paraphrased) | Wiki page(s) | Status | Evidence |
| -- | ------------------- | ------------ | ------ | -------- |
| W1 | No stack sets an account or Region; the guest invoke grant defaults to a wildcard runtime ARN | Component-Infra-Stacks | Verified | `packages/infra/bin/app.ts:11-12`; `cognito-stack.ts:43-44` |
| W2 | No AgentCore Runtime or Memory resource is constructed (deviations C4, C5) | Source-Tasks-001, Component-Infra-Stacks, Guide-Deployment | Verified | `agent-stack.ts`: only `lambda.Runtime.NODEJS_22_X` (`:23`); no runtime or memory construct |
| W3 | The agent-side memory client throws, and the runtime does not use the memory adapter | Source-Tasks-001, Component-State-Stores | Verified | `memory/agentCoreMemoryClient.ts:58`; `index.ts:1-18` imports no memory module |
| W4 | The WebSocket handler's agent call is a stub, and it mints its own session id | Component-WebSocket-Transport, Component-Infra-Stacks | Verified | `handlers/websocket-handler.ts:109,115` |
| W5 | The browser hook neither presigns nor uses Cognito, though connect requires IAM | Component-WebSocket-Transport, Contract-WebSocket-API | Verified | `hooks/useWebSocket.ts:75`; `services/cognitoAuth.ts:76` (never called); `agent-stack.ts:62` |
| W6 | Server and client payload fields disagree (`sessionId`/`agentCoreSessionId`, `state`/`newState`, `agent_turn_complete`) | Component-WebSocket-Transport | Verified | `websocket-handler.ts:115,121,128`; `useWebSocket.ts:41,56` |
| W7 | Message length: the contract and client allow 2,000 characters; the server allows 500 | Contract-WebSocket-API | Verified | `specs/001-max-height-ai-character/contracts/websocket-api.md:65,209`; `components/TextInput.tsx:10`; `websocket-handler.ts:7,97` |
| W8 | The hard stop deletes a literal policy name, treats a missing policy as success, and touches only the guest role (#61) | Component-Infra-Stacks, Gotchas | Verified in code; synthesized hash-suffixed name unverified here (no synth run) | `cognito-stack.ts:71`; `budget-stack.ts:40-47,64-66` |
| W9 | Budget notifications are at 50%, 80% and 100% of a $10 monthly amount | Component-Infra-Stacks | Verified | `budget-stack.ts:79,88,97,108` |
| W10 | The $5/$8 alarms and $10 hard stop are limits a caller cannot step around | Concept-Budget-Ceiling | **Conflict (D3)** | `budget-stack.ts:20-22,71,91,100,111`; Plan 1 F1–F3 |
| W11 | Prompt caching is unconfigured; the system prompt (~2,990 tokens) is below Haiku 4.5's 4,096-token checkpoint minimum | Concept-Budget-Ceiling, Decision-LLM-Model-Selection, Source-Strands-Harness-SDK-Docs | No cache config: Verified. Token count and minimum: Unverified (S2) | `index.ts:96-104` has no cache option; `personality/systemPrompt.ts` is 11,171 bytes, consistent with the wiki's character count |
| W12 | The runtime uses the global Haiku 4.5 cross-Region profile with a 250-token reply cap | Component-Agent-Runtime, Decision-LLM-Model-Selection | Verified | `index.ts:96-97` |
| W13 | The live handler performs no personality post-processing or stutter injection (#42) | Concept-Personality-Gate, Source-Strands-Harness-SDK-Docs | Verified | `index.ts` has no reference to either function |
| W14 | `reply.first_token` spans the whole invocation, not the first token (#45) | Component-Agent-Runtime, Concept-Observability | Verified | `index.ts:199,203,215` |
| W15 | Disconnect cancels the invocation and tools receive the cancel signal | Component-Agent-Runtime, Source-Strands-Harness-SDK-Docs | Verified | `index.ts:61,72,83,188,204` |
| W16 | Strands SDK is pinned at 1.19.0, which is the latest release | Source-Strands-Harness-SDK-Docs, Decision-Strands-SDK | Pin Verified; "latest" Unverified (FR-007) | `packages/agent/package.json:17` |
| W17 | `aws-cdk-lib` has no typed runtime `platformVersion`, so an override is needed | Guide-Deployment, Decision-AgentCore-Runtime-V2 | Verified | infra resolves 2.270.0; `aws-bedrockagentcore/lib/bedrockagentcore.generated.d.ts` has 0 `platformVersion` matches |
| W18 | The constitution names AgentCore CLI for agent deployment | Decision-AgentCore-Runtime-V2, Guide-Deployment, Source-Tasks-001 | Verified | `.specify/memory/constitution.md:233` |
| W19 | Speech input is not wired into the app | Component-Speech-Input | Verified | `App.tsx:8,357` renders only `TextInput`; `components/MicButton.tsx` is imported nowhere |
| W20 | Guest Polly access is limited to the neural engine and one voice, on resource `*` | Contract-Polly-TTS, Component-Infra-Stacks | Verified | `cognito-stack.ts:48-60` |
| W21 | The browser calls Polly directly | Component-Audio-Chain, Contract-Polly-TTS | Verified | `hooks/useAudio.ts:13` → `services/pollyTts.ts` |
| W22 | The frontend distribution sets a content security policy | Component-Infra-Stacks | Verified; content gap (D9) | `frontend-stack.ts:22-24` |
| W23 | The Organization constraint on the free plan: creating one conflicts with the budget ceiling | Concept-Credential-Hygiene | Verified against constitution; mechanism gap (D10) | `.specify/memory/constitution.md:27-28,185` |
| W24 | V2 Regions, cold start, image size, architecture, port, startup deadline and env-var limits | Decision-AgentCore-Runtime-V2, Source-AgentCore-Platform-2026 | Unverified | AWS documentation, at plan time |
| W25 | Idle-session timeout: the service default is shorter than the decided 1800 s | Guide-Deployment, Decision-AgentCore-Runtime-V2, Gotchas | Unverified (default); decided value is consistent with spec 001's 30-minute cap | AWS documentation, at plan time |
| W26 | The runtime role needs `bedrock:ListAsyncInvokes` for warm-up; deploy must poll the runtime until ready and confirm `platformVersion` | Component-Agent-Runtime, Guide-Deployment | Call in code: Verified (`bedrock/warmup.ts`). IAM and deploy behavior: Unverified | AWS documentation, at plan time |
| W27 | Haiku 4.5 is Active, and "EOL no sooner than" is a floor, not a date | Source-Bedrock-Model-Lifecycle, Decision-LLM-Model-Selection | Unverified (FR-007) | Model card and lifecycle page |
| W28 | Claude bills through AWS Marketplace | Concept-Budget-Ceiling, Source-Amazon-Nova-Lite | Unverified; bears on the Free-plan Marketplace exclusion (FR-028, D11) | Billing data or AWS documentation |
| W29 | Unit prices: Nova 2 Lite, Haiku 4.5 including cache rates, Nova 2 Sonic, Polly Neural (speech marks billed like speech), Runtime V2, Memory, web search | Source-Amazon-Nova-Lite, Decision-LLM-Model-Selection, Source-Nova-Sonic, Source-Amazon-Polly, Source-AgentCore-Pricing, Source-AgentCore-Web-Search-Tool | Unverified (FR-007; human-read) | Pricing pages |
| W30 | Polly Neural's 12-month free tier may apply if the account is eligible | Source-Amazon-Polly, Decision-Polly-Voice, Gotchas | **Conflict with builder-cited fact (D5)** | AWS Free plan documentation (builder-cited) |
| W31 | Nova 2 Sonic: in-Region only, a per-connection time limit, no Guardrails, no visemes | Source-Nova-Sonic | Unverified (S3, FR-007) | Model card |
| W32 | Nova 2 Lite Guardrails support is unconfirmed | Source-Amazon-Nova-Lite | Unverified (FR-007; gates S1) | AWS documentation |
| W33 | `CountTokens` is unsupported for cross-Region-only Claude models | Gotchas, Decision-AgentCore-Runtime-V2 | Unverified; S2 uses invocation-reported usage regardless | AWS documentation |
| W34 | Strands caching `strategy: 'auto'` skips application inference profile ARNs; native invocation limits reset per call | Source-Strands-Harness-SDK-Docs | Unverified (check the 1.19.0 `.d.ts` at plan time) | SDK type definitions |
| W35 | AgentCore Memory and Strands session persistence are alternatives for the same job | Source-AgentCore-Platform-2026, Source-Strands-Harness-SDK-Docs | Unverified; open under Q8 and FR-014 | AWS and SDK documentation |
| W36 | AgentCore Runtime accepts browser OAuth over WebSocket | Source-AgentCore-Bidirectional-Streaming | Unverified (Q4) | AWS documentation |

## Wiki Discrepancies to Log

Found while writing this spec. **The wiki was not edited.** After builder approval, each item is appended to the wiki's `Log` and corrected or added on its owning page under FR-040, with a `Gotchas` row where it is a trap. Builder-cited AWS facts below are themselves re-verified under FR-007 before the wiki states them as fact.

| # | Kind | Owning page (others affected) | Discrepancy | Evidence |
| -- | ---- | ----------------------------- | ----------- | -------- |
| D1 | Gap | Decision-LLM-Model-Selection (Component-Agent-Runtime, Decision-AgentCore-Runtime-V2, Source-Amazon-Nova-Lite, Gotchas) | No page says the AWS Free plan does not support global or geographic cross-Region inference. Every page assumes the global Haiku 4.5 profile the code uses (`index.ts:96`) is invocable. | AWS "Supported AWS services for Sign up for AWS (new)" (builder-cited) |
| D2 | Gap | Source-Amazon-Nova-Lite (Decision-LLM-Model-Selection) | Nova 2 Lite's in-Region model ID `amazon.nova-2-lite-v1:0` on `bedrock-runtime` is absent; the page prices only global cross-Region inference. Also absent: Haiku 4.5 being in-Region only via the `bedrock-mantle` endpoint. | Nova 2 Lite and Haiku 4.5 model cards (builder-cited) |
| D3 | Conflict with code | Concept-Budget-Ceiling | The page says the $5/$8 alarms and $10 hard stop are limits a caller cannot step around. In code: no threshold emails anyone; the topic has no Budgets publish grant; all three thresholds publish to the topic the hard-stop Lambda subscribes to without filtering, so once delivery and #61 are fixed the $5 warning would also stop service (Plan 1's ordering trap); and the delete targets a name CDK does not synthesize (#61). | `budget-stack.ts:20-22,71,83-113`; Plan 1 F1–F3; W8 |
| D4 | Incomplete | Component-Infra-Stacks | It records #61 and the guest-role-only scope, and says the 100% notification "is meant to" drive the hard stop. It omits that the 50% and 80% notifications reach the same topic (Plan 1 F1), the missing email subscribers (F2), and the missing publish grant (F3). Only `Log` entry 44 mentions the grant. | `budget-stack.ts:71,91,100,111` |
| D5 | Conflict with builder-cited fact | Source-Amazon-Polly (Decision-Polly-Voice, Concept-Budget-Ceiling, Decision-LLM-Model-Selection, Source-Amazon-Nova-Lite, Source-Nova-Sonic, Gotchas) | Pages treat Polly Neural's 12-month free tier as possibly applying "if the account is eligible". No page mentions the post-2025-07-15 Free plan, whose accounts receive "Always Free" offers and credits, not 12-month trials. | AWS Free plan documentation (builder-cited) |
| D6 | Gap | Concept-Budget-Ceiling | AWS Budgets includes credits by default (`IncludeCredit`), so a $10 budget on a credit-funded account shows near-zero spend and never fires. The page says the account-wide budget and hard stop are "unaffected" by Marketplace billing; that holds only gross of credits. | AWS Budgets documentation (builder-cited) |
| D7 | Gap | Concept-Budget-Ceiling | Budgets data refreshes up to three times a day with hours of lag, so the hard stop is a lagging backstop. No page says so or names an in-path breaker. | AWS Budgets documentation (builder-cited) |
| D8 | Gap | Concept-Observability (Component-Infra-Stacks) | No page covers log retention or observability cost. No infra code declares a log group or retention (no `aws-logs` use under `packages/infra/lib` or `bin`), so Lambda logs keep the never-expire default; AWS's own GenAI cost sample shows CloudWatch Logs as the largest line. | Code search; AWS GenAI sample cost table (builder-cited) |
| D9 | Gap | Component-Infra-Stacks (Component-Audio-Chain, Gotchas) | The page notes a CSP but not its content. Its outbound-connection list (`frontend-stack.ts:24`) allows wildcard API Gateway and Cognito hosts only, while the browser calls Polly directly (`useAudio.ts:13`), so the deployed voice path would be blocked. To confirm on deploy. | `frontend-stack.ts:24`; `hooks/useAudio.ts:13` |
| D10 | Gap | Concept-Credential-Hygiene | The page says creating an Organization on the free plan conflicts with the budget ceiling. The constitution says it expires remaining credits (`constitution.md:27-28`). The builder-cited fact is that joining Organizations upgrades the account to the Paid plan automatically. The mechanism is missing, and whether credits survive the upgrade is unverified; if AWS contradicts the constitution, that is an FR-002 amendment, not a wiki edit. | `.specify/memory/constitution.md:27-28,185`; AWS Free plan documentation (builder-cited) |
| D11 | Gap | Concept-Budget-Ceiling (or a new source page, proposed to the builder) | No page records the Free plan's lifecycle (it ends after 6 months or when credits run out, then the account closes unless upgraded within 90 days) or its exclusion of certain charge-incurring Marketplace offers, which may bear on Claude (W28). | AWS Free plan documentation (builder-cited) |

Not discrepancies, checked and recorded here so they are not re-investigated:

- The wiki's "the constitution mandates AgentCore CLI" is accurate (W18).
- The message-length disagreement is recorded correctly on Contract-WebSocket-API; it was this spec's earlier draft that was wrong.
- Decision-Strands-SDK's stale 1.4.0/1.15.0 references are already flagged on that page and on Source-Strands-Harness-SDK-Docs.

## Wiki Pages to Update After the Access Decision

These pages describe the guest (unauthenticated) access the builder removed on 2026-10-03 (FR-041). They were true when written, so they are **not discrepancies** and are not logged as such. After the access decision is published (FR-056), each is updated under FR-040's approval rule. Found by searching the wiki clone (`2bac2b4`) for "guest", "Cognito" and "unauthenticated" on 2026-10-03; line numbers refer to that clone.

| Page | What describes guest access |
| ---- | --------------------------- |
| Component-Infra-Stacks | CognitoStack as a guest identity pool with an unauthenticated role (17, 78-85); the hard stop's unauthenticated-role target (30-36, 64, 70-72) |
| Component-WebSocket-Transport | Guest credentials and the presigning helpers (27, 45-46, 99) |
| Contract-WebSocket-API | Auth by guest credentials, and the guest-identity connection lifecycle (24, 31) |
| Concept-Budget-Ceiling | A hard stop "such as disabling the Cognito guest role" (23-24) |
| Concept-IP-And-Legal-Posture | "Cognito guest identity plus per-session caps, not full public user accounts" (35, 48) |
| Concept-Credential-Hygiene | Runtime access tied to the friends-and-family posture (35-36); update after the P11 amendment (FR-055) |
| Guide-Deployment | CognitoStack as the guest identity pool (73) |
| Source-Constitution | P7's guest identity and the Auth row (47, 75); update when the amendment is ingested |
| Feature-Max-Height-Core | `/invocations` accepts unauthenticated, client-supplied identity (36); update when #55 is resolved |
| Gotchas | The #61 row names the unauthenticated role's policy (121); revisit once that role is removed |

These are not updated:

- `Log`, which is append-only.
- Source-Initial-Plan and Source-Infra-Plan, which summarize point-in-time documents.

Pages that use "guest" only as a word for the person talking to Max (Component-Agent-Runtime:137, Gotchas:124, Source-Strands-Harness-Docs, Concept-Budget-Ceiling:190) need at most a terminology refresh.
