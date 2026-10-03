# Specification Quality Checklist: Architecture Review and First AWS Deployment

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-10-03
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs) — *justified exception, see Notes*
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders — *justified exception, see Notes*
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — resolved by `/speckit.clarify` on 2026-10-03 (FR-014 memory deferred, FR-028 Free plan)
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details) — *domain-vocabulary exception, see Notes*
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification — *same exception as Content Quality*

## Notes

- **Domain-vocabulary exception (builder-approved).** This feature is an architecture review plus a first deployment. The builder directed that AWS service names, issue numbers and constitution principles are the domain vocabulary and may appear.
  - File paths appear only as evidence of verified gaps (for example the `websocket-handler.ts` stub and client-asserted `actorId`), not as prescribed designs.
  - Mechanism choices (transport, hard-stop mechanism, model, voice, IaC ownership, revocation mechanism, sign-in domain) are left to decisions Q0–Q9 rather than fixed in the spec.
  - The audience is the builder, who is a technical stakeholder.
- **Hard numbers audit (iteration 1).** Every number in the spec traces to a source:
  - the constitution: $5, $8 and $10 tiers, the $8 cost gate, and the 30-day memory window
  - spec 001 FRs, cited by ID rather than restated
  - AWS facts the builder supplied, flagged for re-verification under FR-007: Free-plan duration and closure window, the cost-allocation tag lead time, and the Budgets refresh cadence

  No limit, threshold or budget was invented. The in-path breaker limit (FR-020) is deliberately left to Q6.
- **Iteration 1 fixes applied.**
  1. Moved the memory-scope clarification from the spend section to the identity section, and renumbered FR-014 to FR-024.
  2. Disambiguated every reference to a spec 001 requirement with the `spec 001 FR-###` prefix and added a reference convention note.
  3. Recorded the message-length default as an assumption, because spec 001 sets no character limit. **Withdrawn in iteration 3**: that premise was wrong.
- **Iteration 2 result.** All items pass except the [NEEDS CLARIFICATION] item. The banned-name scan of both files finds no hits; the project is named Max Height throughout.
- **Iteration 3: wiki integration under trust-but-verify.** The builder added the project wiki as a required input, with every statement treated as a claim.
  1. Added the wiki (clone `2bac2b4`) and the pages read to the spec's inputs.
  2. Added a "Wiki claims" note, the [Wiki Claims Relied On](../spec.md#wiki-claims-relied-on) table (W1–W36: 19 Verified, 4 partly verified, 2 Conflict, 11 Unverified), and [Wiki Discrepancies to Log](../spec.md#wiki-discrepancies-to-log) (D1–D11: 2 conflicts, 1 incomplete page, 8 gaps, including the two the builder named).
  3. Added FR-039 (verification record) and FR-040 (`Log` entry plus owning-page correction, builder approval before any push), the Wiki Claim Verification Record entity, and SC-013. FR-006 now points at them.
  4. Corrected the message-length assumption. Spec 001's contract sets 1–2,000 characters, so the server's 500 is a disagreement. FR-036 makes the shared limit a planning decision, and US1 scenario 5 follows it.
  5. Wrote verified gaps into FR-032: unsigned socket vs IAM connect route, payload field mismatches, wildcard invoke grant. Added a verified `.d.ts` citation to FR-035 and the CSP voice-endpoint gap to FR-036.
  6. Assumptions now cite W/D numbers. Region (`us-west-2`, from `docs/infra-plan.md:58`), session expiry and text-only input are stated with their verification status.
  7. No unverified claim became a requirement or assumption: each is labelled Unverified with where it gets checked.
  8. The wiki was not edited.
- **Iteration 3 result.** Re-ran every item:
  - All pass except the [NEEDS CLARIFICATION] item, which still has exactly 3 markers.
  - The new FRs are testable: SC-013 checks them.
  - New numbers trace to code, the spec 001 contract, the constitution, or builder-cited AWS facts flagged for FR-007: 2,000 and 500 characters, 1800 s, the Free-plan 6 months and 90 days, and Budgets' three refreshes a day.
  - The banned-name scan finds no hits.
- **Iteration 4: builder decisions on sign-in, HTTPS and custom domain (builder, 2026-10-03).**
  1. Recorded decisions 1–5 in a header blockquote. Added O14 (access is invite-only and bounded) and Q9 (details of access and sign-in). Q9 is decided alongside Q5, which is an exception to the FR-004 ordering.
  2. Reframed the P1 stories from "guest" to "invited friend". Added US2, "Only invited friends get in", which renumbered the old US2–US6 to US3–US7.
  3. Removed the FR-015 marker. FR-015 now states the decided access rule.
  4. Rewrote FR-010–FR-012 to key on the verified sign-in identity, never on client-supplied `sessionId` or `actorId`. The findings that Runtime inbound JWT and Memory fine-grained access control key on the JWT `sub` are labelled unverified. FR-018 extends the hard stop to the authenticated role, token issuance and the runtime authorizer.
  5. Added the "Sign-in and access" group, FR-041–FR-056:
     - sign-in required
     - allowlist with revocation
     - verified emails only, and a denial message that reveals nothing
     - providers
     - the Apple marker
     - one person across several providers
     - graceful sign-in failures
     - HTTPS everywhere
     - custom domain
     - CSP for sign-in
     - Cognito feature plan and cost
     - storage of identity-provider secrets
     - privacy
     - app registrations
     - constitution amendments (P7, P11, Auth row; MINOR bump)
     - spec 001 supersession
  6. Edge cases cover the Apple relay address, two providers, removal mid-session, token expiry, provider outage, unverified email and the non-revealing denial.
  7. Key entities: Invited Friend and Allowlist replace Guest Identity.
  8. Success criteria: SC-014 to SC-017 are the builder's four. SC-018 (HTTPS) is added. SC-001, SC-002 and SC-007 are updated.
  9. Assumptions now cover:
     - allowlist maintained manually
     - invited emails
     - GoDaddy DNS and ACM certificate defaults, each to verify at plan
     - sign-in surfaces in FR-036
     - no public registration
     - app registrations and DNS steps as dependencies
  10. Added "Wiki Pages to Update After the Access Decision". It lists the guest-auth pages as pending updates, not discrepancies.
- **Iteration 4 hard-number audit.**
  - The 50-MAU free tier and $0.015/MAU come from the Cognito pricing page the builder fetched on 2026-10-03, cited in FR-051.
  - No revocation time, retention period, token lifetime or user cap was invented. Each is left to plan.
  - The line numbers cited for the constitution, code and spec 001 were read on 2026-10-03.
- **Iteration 4 result.** Re-ran every item:
  - All pass except the [NEEDS CLARIFICATION] item, which still has exactly 3 markers.
  - FR-001–FR-056 and SC-001–SC-018 are sequential, with no dangling references.
  - Remaining uses of "guest" describe the removed identity-pool path, quote the constitution or spec 001, or paraphrase wiki claims.
  - The banned-name scan finds no hits.
  - The wiki was not edited.
- **Iteration 5: Sign in with Apple dropped (builder, 2026-10-03).** The builder said "we don't need to support Apple if it's not free".
  1. Providers are now Google, Microsoft (personal accounts, through OIDC) and Login with Amazon. This affects the header, US2 and FR-044.
  2. FR-045 is no longer a clarification marker. It states the fee-free provider rule: a provider is adopted only if registering and operating it carries no fee, and Cognito's own charges stay under FR-051.
  3. FR-045 records Apple's exclusion. Web sign-in needs a Services ID, which requires a paid Apple Developer Program membership ($99/year). This is labelled "verified via web search, secondary sources": the Apple Community thread 254664133 and Firebase's "Authenticate Using Apple" docs. Adding Apple later needs a cost decision.
  4. The Google, Microsoft and Amazon registrations are believed free; this is unverified and checked at plan (FR-007).
  5. Removed the Apple Services ID prerequisite (FR-054), the "Hide My Email" relay edge case, and the Apple relay address from the Allowlist entity.
  6. Updated the Q9 row and FR-024.
  7. FR-015 stays resolved.
  8. The removed marker had also asked whether P2 covers the domain renewal. This is now an assumption ("Non-AWS costs"): the domain already exists and its renewal is not counted, because P2 is enforced through AWS Budgets. The builder can override.
  9. FR-055 adds P2's example hard stop ("Lambda disables Cognito guest role", `constitution.md:67-68`) as an editorial update.
- **Iteration 5 hard-number audit.** The only new number is $99/year, cited to the builder's secondary sources. The Apple thread could not be re-fetched on 2026-10-03 because it sits behind a bot check.
- **Iteration 5 result.** Re-ran every item:
  - All pass except the [NEEDS CLARIFICATION] item, which now has 2 markers.
  - FR-001–FR-056 and SC-001–SC-018 are unchanged, sequential, and have no dangling references.
  - The banned-name scan finds no hits.
  - Apple now appears only in FR-045's exclusion and the header's decision.
- **Clarification markers (2).**
  - FR-014: long-term memory in the first deployment, or deferred
  - FR-028: AWS Free plan or Paid plan
- **Iteration 6: `/speckit.clarify` (session 2026-10-03).** Three questions, recorded under the spec's Clarifications section:
  1. FR-028: the account stays on the Free plan through the first deployment and its month of operation. The Paid upgrade happens when the plan ends in December 2026 and is out of scope. Consequences recorded in FR-028:
     - in-Region inference only
     - no AWS Organization (FR-034)
     - Always Free offers only
     - credit-funded spend still needs the hard stop
     - the plan's end date is recorded as a deploy prerequisite (FR-033)
     - new SC-019: one month of measured operation
  2. FR-014: long-term memory is deferred to spec 001's V1. Also updated: FR-030 (T023b/c excluded), US4 scenario 3, the Q8 row, W35, and the out-of-scope list.
  3. FR-001: #61 is folded into the Q6 hard-stop redesign, so only #56 gates planning. Also updated: the FR-038 table and Dependencies.
  - The builder's AWS Pricing Calculator note is added to Assumptions and SC-019. The calculator estimate prices the as-built stack after implementation; it does not replace FR-024's pre-deploy gate.
- **Iteration 6 hard-number audit.** The new figures are "December 2026" (when the Free plan ends) and "one month" (SC-019). Both are the builder's, quoted in the Clarifications section and SC-019.
- **Iteration 6 result.** All items pass.
  - Zero clarification markers remain.
  - FR-001–FR-056 and SC-001–SC-019 are sequential, with no dangling references.
  - The banned-name scan finds no hits.
  - The wiki was not edited.

  The builder's decisions on 2026-10-03 resolved FR-015's former access-gating marker. The same day, dropping Apple removed the FR-045 Apple marker. Each remaining marker affects scope or cost and has no source-backed default. Resolve them with `/speckit.clarify` before `/speckit.plan`.
- **Sequencing gate.** Plan 1 (#56) and #61 must merge before `/speckit.plan` (FR-001).
