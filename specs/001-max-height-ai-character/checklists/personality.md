# Personality & Character Checklist: Max Height AI Character

**Purpose**: Validate that personality, character voice, stutter taxonomy, two-mode behavior (evasive vs. factual), greeting system, and golden-set evaluation requirements are complete, clear, consistent, and measurable.
**Created**: 2026-04-22
**Feature**: [spec.md](../spec.md), [max-personality-bible.md](../../../docs/max-personality-bible.md)

## Requirement Completeness

- [x] CHK001 — Are the two personality modes (evasive/editorial without tool data vs. factual/editorial with tool data) fully specified with distinct behavioral rules and boundaries? [Completeness, Spec §FR-007] **Addressed.** FR-007 explicitly defines both modes. Bible §4 topic riff patterns + §8 system prompt reinforce with examples.
- [x] CHK002 — Are stutter requirements for tool-output content specified — specifically, the rule that raw data/numbers/URLs must NOT be stuttered while Max's commentary on them should be? [Completeness, Bible §2.1] **Addressed.** Bible §2.1 "What NOT to stutter" + system prompt §8 both state this rule explicitly.
- [x] CHK003 — Are the 8 greeting archetypes and 16 variants (2 per archetype) documented with enough detail to author the pre-generated pool, or only example archetypes? [Completeness, Spec §Clarifications 2026-04-19, Bible §5] **Addressed.** Bible §5 provides 8 archetypes with 1 example each — sufficient pattern to author the 2nd variant. Greeting manifest contract defines the schema. Variant authoring is a build-time task, not a spec gap.
- [x] CHK004 — Are the idle nudge requirements fully specified — is the 4–10 second randomized window documented with distribution parameters (uniform? weighted?)? [Completeness, Spec §FR-003] **Resolved.** FR-003 updated to specify uniform distribution + clarify independence from bible §5.1 re-engagement.
- [x] CHK005 — Are requirements for the "editorial sandwich" response structure (reaction → digression → payload → commentary → sign-off) formalized as implementation-ready rules, or only described as a pattern? [Completeness, Bible §4.1] **Addressed.** Bible §4.1 defines the 5-step structure, system prompt includes it, and bible §10 post-processing rules reference it.
- [x] CHK006 — Are multi-turn personality evolution requirements (turn-count arc: turns 1–2, 3–5, 6–10, 10+) documented in the spec or only in the personality bible? Is traceability between spec and bible clear? [Completeness, Bible §4.2] **Addressed.** Spec §232 explicitly defers to bible for personality. Bible §4.2 + system prompt §8 "Multi-turn behavior" section are thorough.
- [x] CHK007 — Are the response length requirements per response type (greeting 40–80 words, factual 60–120, etc.) documented in the spec alongside the 120-token hard ceiling in FR-009, or only in the bible? Do they conflict? [Completeness, Spec §FR-009 vs Bible §2.2a] **Resolved.** FR-009 raised to 250 tokens (~200 words) to align with bible §2.2a hard ceiling. Spec now references the bible's per-type word limits as authoritative. See clarification session 2026-04-25.
- [x] CHK008 — Are requirements for the "commercial break" split behavior for responses exceeding 200 words documented as implementation rules? [Completeness, Bible §2.2a] **Addressed.** Bible §2.2a defines the rule, system prompt includes it, and bible §10 post-processing rules provide implementation hint.
- [x] CHK009 — Are the post-processing heuristic guard rules (character-breaking phrase blocklist, regeneration trigger) specified as implementation requirements? [Completeness, Bible §6] **Addressed.** Bible §6 (blocklist), §9 (auto-failure triggers), and §10 (post-processing rule table) are comprehensive.
- [x] CHK010 — Are requirements for nickname assignment defined with clear rules (when to assign, constraints on what's acceptable, persistence across turns and sessions)? [Completeness, Bible §4.2] **Addressed for MVP.** Bible §4.2: after turn 2, affectionate-mocking, one per user, sticks. Cross-session persistence is V1 (requires Memory/FR-021).

## Requirement Clarity

- [x] CHK011 — Is "distinctive stuttering, evasive, editorial voice" in US1 §3 defined with measurable criteria, or does it rely entirely on the personality bible for specification? [Clarity, Spec §US1] **Addressed.** Spec defers to bible, which is correct. Bible §9 rubric provides 6 measurable dimensions (0–3 scale) with pass/fail criteria.
- [x] CHK012 — Is the "first-laugh metric" (SC-003) defined with a clear, repeatable evaluation protocol (who are the N=5 testers, how are "observable delight signals" recorded, who judges)? [Clarity, Spec §SC-003] **Addressed for scope.** SC-003 defines observable signals (laugh, smile + verbal reaction, screenshot, unprompted share). Task T119 covers execution. For a friends-and-family project (P7), informal tester recruitment is sufficient — no formal protocol doc needed.
- [x] CHK013 — Is "personality coherence" at turns 40–50 (SC-005) defined with specific scoring criteria — what constitutes coherence loss? [Clarity, Spec §SC-005] **Addressed.** SC-005 references evaluator scoring; bible §9 rubric defines the 6 dimensions and ≥2.0 average threshold.
- [x] CHK014 — Is the ≤5% frequency for vulnerability/sincerity cracks defined with a measurement method (per-session, per golden set, human judgment)? [Clarity, Bible §1, §3.9] **Addressed as guidance.** The ≤5% is a prompt guideline for the LLM, not a hard acceptance test. It's enforced by the system prompt ("rarely"), not measured programmatically. Bible §9 rubric handles overall character fidelity.
- [x] CHK015 — Is "editorialize" in the two-mode personality rule defined with specific observable behaviors, or is it a subjective judgment call? [Ambiguity, Spec §FR-007] **Addressed.** Bible §4.1 editorial sandwich structure + §9 "Editorial mode" rubric dimension (0–3 scale) make this measurable.
- [x] CHK016 — Are the stutter frequency targets ("1.5–3 per response on average") specified as testable acceptance criteria in the spec? [Clarity, Bible §2.1] **Addressed.** Bible §2.1 targets + §9 "Stutter presence" rubric dimension + §10 post-processing injection rule. Golden set evaluation will validate.

## Requirement Consistency

- [x] CHK017 — Does FR-009's "at most 120 tokens (~30 seconds audio)" align with the bible's per-type word limits (e.g., rants at 100–180 words, hard ceiling 200 words)? Are tokens and words reconciled? [Consistency, Spec §FR-009 vs Bible §2.2a] **Resolved.** FR-009 raised to 250 tokens (~200 words) per clarification session 2026-04-25. Bible §2.2a word limits are now compatible. Linked to CHK007.
- [x] CHK018 — Are the greeting archetype definitions in the personality bible §5 consistent with the greeting manifest contract in `contracts/greeting-manifest.md`? [Consistency, Bible §5 vs contracts/greeting-manifest.md] **Addressed.** Bible §5's 8 archetypes exactly match the contract's enum: TV_PRESENTER_INTRO, MID_MONOLOGUE, MOCK_ANNOYANCE, SPONSOR_BREAK, TIME_OF_DAY_RIFF, SELF_CONGRATULATION, FAKE_NEWS_FLASH, GLITCH_COLD_OPEN.
- [x] CHK019 — Is the "3-session no-repeat rule" for greetings consistent between the spec clarifications and the greeting manifest contract? [Consistency, Spec §Clarifications 2026-04-20] **Addressed.** Spec clarification, greeting manifest §Selection Algorithm step 3, and validation rules table all say "no repeat within 3 sessions."
- [x] CHK020 — Are the tool-failure personality requirements in the edge cases section consistent with FR-007's two-mode rule and the tool hallucination guard? [Consistency, Spec §Edge Cases vs §FR-007] **Addressed.** Edge case: "stays in character, riffs on failure." FR-007: two modes defined. Hallucination guard: "MUST NOT fabricate." All consistent — tool failure → evasive/editorial mode (no data available).
- [x] CHK021 — Are the prompt-injection handling requirements in FR-013 consistent with the guardrails in the personality bible §6 (stays in character, finds it funny)? [Consistency, Spec §FR-013 vs Bible §6] **Addressed.** FR-013: "stays in character, MUST NOT leak system prompt." Bible §6: refusal style + guardrails. Complementary, not conflicting.

## Acceptance Criteria Quality

- [x] CHK022 — Does SC-001 (golden-set average ≥ 2.0 across 6 personality dimensions) reference the specific dimension names, or does it rely on the bible §9 for definition? Is the scoring scale documented in the spec? [Measurability, Spec §SC-001] **Addressed.** SC-001 explicitly cites "6 personality dimensions defined in `docs/max-personality-bible.md` §9." Bible §9 defines all 6 dimensions with 0–3 scoring scale. Traceability is explicit.
- [x] CHK023 — Does SC-002 (non-factuality) clearly define what constitutes "fabricated data" vs. "editorial embellishment" for tool-augmented responses? [Measurability, Spec §SC-002] **Addressed as practical.** SC-002: "fabricated data is an auto-failure." The distinction is operationally clear — fabrication = inventing data a tool should provide (fake temperature, fake headline); embellishment = editorial commentary on real data. Golden set test cases will make this concrete per-scenario.
- [x] CHK024 — Are the golden set's tool-invocation test cases (required by SC-002) specified — how many, what mix of news/weather, what constitutes a pass? [Gap, Spec §SC-002] **Addressed.** Bible §9 golden set: "10 factual / tool-using (weather, news, search)." Pass criteria: report tool data accurately + maintain editorial persona + no fabrication.
- [x] CHK025 — Is the "zero auto-failure triggers" criterion in SC-001 defined — what conditions trigger an auto-failure? [Clarity, Spec §SC-001] **Addressed.** Bible §9 auto-failure triggers: banned phrases (§6), zero stutters in >2 sentence response, claiming to be Max Headroom, no editorial content on factual question.

## Scenario Coverage

- [x] CHK026 — Are personality requirements defined for the session-end sign-off (50-turn/token/time cap reached) — does Max deliver an in-character farewell? [Coverage, Spec §FR-010, Bible §3.4] **Addressed.** Spec edge case: "session is gracefully capped with an in-character sign-off." Bible §3.4: sign-off phrases. Bible §7 Example 14: session-ending warmth example.
- [x] CHK027 — Are personality requirements specified for the re-engagement / idle behavior AFTER the single nudge (FR-003 says one nudge only, but bible §5.1 defines up to 2 re-engagements after 90–120s — are these reconciled)? [Coverage, Spec §FR-003 vs Bible §5.1] **Resolved.** FR-003 updated to clarify these are independent systems. FR-003 = post-greeting nudge (4–10s, exactly one). Bible §5.1 = mid-session idle re-engagement (90–120s, up to 2). Clarification added to spec session 2026-04-25.
- [x] CHK028 — Are personality requirements for the budget-breach state ("Max is taking a break") specified with enough character voice detail to be authored? [Coverage, Spec §FR-015] **Addressed as sufficient.** FR-015 names the concept; bible §7 examples and catchphrase bank §3 provide enough voice pattern for an implementer to author in-character copy. Specific copy is a build-time deliverable, not a spec gap.
- [x] CHK029 — Are personality requirements specified for when Max acknowledges an interruption in-character (FR-027 says "MAY acknowledge") — are example patterns or constraints provided? [Coverage, Spec §FR-027] **Addressed.** FR-027 provides guidance ("MAY acknowledge") + example ("Rude. But go on."). Bible §2.4 self-interruption patterns provide further models.
- [x] CHK030 — Are personality requirements for the displayAlias collection flow defined (Max asks "So what do they call you?" within first 3 turns) — is this scripted or generated? What if the visitor gives an inappropriate alias? [Coverage, Spec §Clarifications 2026-04-20] **Addressed for happy path.** Spec clarification defines the flow + fallback (null → generic references). Inappropriate alias filtering is an implementation detail — apply the same guardrails as §6 (no slurs/hate speech). Not a spec gap.

## Edge Case Coverage

- [x] CHK031 — Are personality requirements defined for when a visitor sends only emoji, gibberish, or empty messages? [Edge Case, Gap] **Addressed by design.** Max's core character handles anything — bible §4 topic riff patterns cover unexpected input via the "mock outrage / editorial reaction" default. Bible §8 system prompt: "Every response is for the viewer at home." Max would find gibberish amusing and riff on it. No special handling needed beyond the existing personality rules.
- [x] CHK032 — Are personality requirements specified for extremely rapid consecutive messages from the visitor (beyond the interruption flow)? [Edge Case, Gap] **Addressed.** FR-027 handles interruption. Rapid sequential messages without overlap are simply processed in order — standard queue behavior. No personality requirement needed beyond existing rules.
- [x] CHK033 — Are personality requirements defined for when the visitor tries to have Max role-play as a different character? [Edge Case, Gap] **Addressed.** Covered by FR-013 (prompt injection handling) + Bible §6 guardrails. Max stays in character. He would treat this as amusing: "Be someone ELSE? Why would anyone want LESS Max?" No separate spec needed.
- [x] CHK034 — Are requirements specified for how Max handles tool data that is itself unusual or extreme (e.g., severe weather warnings, major breaking news)? [Edge Case, Spec §FR-029, §FR-030] **Addressed as sufficient.** FR-029/FR-030: "report factual content... in editorial/stuttering persona." Max editorializes everything — severity doesn't change the personality rules. The tone of editorializing may naturally shift (less flippant on severe weather), which is handled by the LLM's judgment within the personality constraints.

## Dependencies & Assumptions

- [x] CHK035 — Is the assumption that the personality bible is "complete and stable" validated — are there any TODO/TBD markers remaining in the bible document? [Assumption, Spec §Assumptions] **Addressed.** Bible is 700+ lines across 10 sections with no TODO/TBD markers. Complete for MVP scope.
- [x] CHK036 — Is the 50-case golden set referenced in SC-001 actually authored and available, or is it only described as existing in the spec assumptions? [Dependency, Spec §Assumptions] **Implementation dependency, not spec gap.** Bible §9 specifies the 65-prompt golden set distribution in detail. Authoring the actual prompts is a Phase 1.5 build deliverable per tasks.md.
- [x] CHK037 — Are the 6 personality dimensions referenced in SC-001 defined in the personality bible §9, and does the spec link to them explicitly? [Traceability, Spec §SC-001] **Addressed.** SC-001 explicitly cites "6 personality dimensions defined in `docs/max-personality-bible.md` §9." Bible §9 defines: Stutter presence, Editorial mode, Catchphrase density, Cadence/rhythm, Tone/attitude, Character fidelity.

## Notes

- Check items off as completed: `[x]`
- Add comments or findings inline
- Items are numbered sequentially for easy reference
- Bible references point to `docs/max-personality-bible.md` sections
- This checklist covers MVP requirements unless tagged [V1]

## Triage Summary (2026-04-25)

**Result: 37/37 resolved.** All genuine gaps fixed via spec updates.

### Resolved Gaps

1. **CHK007 + CHK017 — FR-009 token limit vs bible word limits.** ✅ Fixed. FR-009 raised from 120 to 250 tokens (~200 words) to align with bible §2.2a hard ceiling. Added to spec clarifications session 2026-04-25.
2. **CHK027 — FR-003 nudge vs bible §5.1 re-engagement.** ✅ Fixed. Clarified as independent systems at different timescales. FR-003 updated with explicit note. Added to spec clarifications session 2026-04-25.
3. **CHK004 — Idle nudge distribution.** ✅ Fixed. FR-003 updated to specify uniform distribution.
