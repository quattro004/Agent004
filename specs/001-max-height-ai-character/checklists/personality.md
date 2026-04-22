# Personality & Character Checklist: Max Height AI Character

**Purpose**: Validate that personality, character voice, stutter taxonomy, two-mode behavior (evasive vs. factual), greeting system, and golden-set evaluation requirements are complete, clear, consistent, and measurable.
**Created**: 2026-04-22
**Feature**: [spec.md](../spec.md), [max-personality-bible.md](../../../docs/max-personality-bible.md)

## Requirement Completeness

- [ ] CHK001 — Are the two personality modes (evasive/editorial without tool data vs. factual/editorial with tool data) fully specified with distinct behavioral rules and boundaries? [Completeness, Spec §FR-007]
- [ ] CHK002 — Are stutter requirements for tool-output content specified — specifically, the rule that raw data/numbers/URLs must NOT be stuttered while Max's commentary on them should be? [Completeness, Bible §2.1]
- [ ] CHK003 — Are the 8 greeting archetypes and 16 variants (2 per archetype) documented with enough detail to author the pre-generated pool, or only example archetypes? [Completeness, Spec §Clarifications 2026-04-19, Bible §5]
- [ ] CHK004 — Are the idle nudge requirements fully specified — is the 4–10 second randomized window documented with distribution parameters (uniform? weighted?)? [Completeness, Spec §FR-003]
- [ ] CHK005 — Are requirements for the "editorial sandwich" response structure (reaction → digression → payload → commentary → sign-off) formalized as implementation-ready rules, or only described as a pattern? [Completeness, Bible §4.1]
- [ ] CHK006 — Are multi-turn personality evolution requirements (turn-count arc: turns 1–2, 3–5, 6–10, 10+) documented in the spec or only in the personality bible? Is traceability between spec and bible clear? [Completeness, Bible §4.2]
- [ ] CHK007 — Are the response length requirements per response type (greeting 40–80 words, factual 60–120, etc.) documented in the spec alongside the 120-token hard ceiling in FR-009, or only in the bible? Do they conflict? [Completeness, Spec §FR-009 vs Bible §2.2a]
- [ ] CHK008 — Are requirements for the "commercial break" split behavior for responses exceeding 200 words documented as implementation rules? [Completeness, Bible §2.2a]
- [ ] CHK009 — Are the post-processing heuristic guard rules (character-breaking phrase blocklist, regeneration trigger) specified as implementation requirements? [Completeness, Bible §6]
- [ ] CHK010 — Are requirements for nickname assignment defined with clear rules (when to assign, constraints on what's acceptable, persistence across turns and sessions)? [Completeness, Bible §4.2]

## Requirement Clarity

- [ ] CHK011 — Is "distinctive stuttering, evasive, editorial voice" in US1 §3 defined with measurable criteria, or does it rely entirely on the personality bible for specification? [Clarity, Spec §US1]
- [ ] CHK012 — Is the "first-laugh metric" (SC-003) defined with a clear, repeatable evaluation protocol (who are the N=5 testers, how are "observable delight signals" recorded, who judges)? [Clarity, Spec §SC-003]
- [ ] CHK013 — Is "personality coherence" at turns 40–50 (SC-005) defined with specific scoring criteria — what constitutes coherence loss? [Clarity, Spec §SC-005]
- [ ] CHK014 — Is the ≤5% frequency for vulnerability/sincerity cracks defined with a measurement method (per-session, per golden set, human judgment)? [Clarity, Bible §1, §3.9]
- [ ] CHK015 — Is "editorialize" in the two-mode personality rule defined with specific observable behaviors, or is it a subjective judgment call? [Ambiguity, Spec §FR-007]
- [ ] CHK016 — Are the stutter frequency targets ("1.5–3 per response on average") specified as testable acceptance criteria in the spec? [Clarity, Bible §2.1]

## Requirement Consistency

- [ ] CHK017 — Does FR-009's "at most 120 tokens (~30 seconds audio)" align with the bible's per-type word limits (e.g., rants at 100–180 words, hard ceiling 200 words)? Are tokens and words reconciled? [Consistency, Spec §FR-009 vs Bible §2.2a]
- [ ] CHK018 — Are the greeting archetype definitions in the personality bible §5 consistent with the greeting manifest contract in `contracts/greeting-manifest.md`? [Consistency, Bible §5 vs contracts/greeting-manifest.md]
- [ ] CHK019 — Is the "3-session no-repeat rule" for greetings consistent between the spec clarifications and the greeting manifest contract? [Consistency, Spec §Clarifications 2026-04-20]
- [ ] CHK020 — Are the tool-failure personality requirements in the edge cases section consistent with FR-007's two-mode rule and the tool hallucination guard? [Consistency, Spec §Edge Cases vs §FR-007]
- [ ] CHK021 — Are the prompt-injection handling requirements in FR-013 consistent with the guardrails in the personality bible §6 (stays in character, finds it funny)? [Consistency, Spec §FR-013 vs Bible §6]

## Acceptance Criteria Quality

- [ ] CHK022 — Does SC-001 (golden-set average ≥ 2.0 across 6 personality dimensions) reference the specific dimension names, or does it rely on the bible §9 for definition? Is the scoring scale documented in the spec? [Measurability, Spec §SC-001]
- [ ] CHK023 — Does SC-002 (non-factuality) clearly define what constitutes "fabricated data" vs. "editorial embellishment" for tool-augmented responses? [Measurability, Spec §SC-002]
- [ ] CHK024 — Are the golden set's tool-invocation test cases (required by SC-002) specified — how many, what mix of news/weather, what constitutes a pass? [Gap, Spec §SC-002]
- [ ] CHK025 — Is the "zero auto-failure triggers" criterion in SC-001 defined — what conditions trigger an auto-failure? [Clarity, Spec §SC-001]

## Scenario Coverage

- [ ] CHK026 — Are personality requirements defined for the session-end sign-off (50-turn/token/time cap reached) — does Max deliver an in-character farewell? [Coverage, Spec §FR-010, Bible §3.4]
- [ ] CHK027 — Are personality requirements specified for the re-engagement / idle behavior AFTER the single nudge (FR-003 says one nudge only, but bible §5.1 defines up to 2 re-engagements after 90–120s — are these reconciled)? [Coverage, Spec §FR-003 vs Bible §5.1]
- [ ] CHK028 — Are personality requirements for the budget-breach state ("Max is taking a break") specified with enough character voice detail to be authored? [Coverage, Spec §FR-015]
- [ ] CHK029 — Are personality requirements specified for when Max acknowledges an interruption in-character (FR-027 says "MAY acknowledge") — are example patterns or constraints provided? [Coverage, Spec §FR-027]
- [ ] CHK030 — Are personality requirements for the displayAlias collection flow defined (Max asks "So what do they call you?" within first 3 turns) — is this scripted or generated? What if the visitor gives an inappropriate alias? [Coverage, Spec §Clarifications 2026-04-20]

## Edge Case Coverage

- [ ] CHK031 — Are personality requirements defined for when a visitor sends only emoji, gibberish, or empty messages? [Edge Case, Gap]
- [ ] CHK032 — Are personality requirements specified for extremely rapid consecutive messages from the visitor (beyond the interruption flow)? [Edge Case, Gap]
- [ ] CHK033 — Are personality requirements defined for when the visitor tries to have Max role-play as a different character? [Edge Case, Gap]
- [ ] CHK034 — Are requirements specified for how Max handles tool data that is itself unusual or extreme (e.g., severe weather warnings, major breaking news)? [Edge Case, Spec §FR-029, §FR-030]

## Dependencies & Assumptions

- [ ] CHK035 — Is the assumption that the personality bible is "complete and stable" validated — are there any TODO/TBD markers remaining in the bible document? [Assumption, Spec §Assumptions]
- [ ] CHK036 — Is the 50-case golden set referenced in SC-001 actually authored and available, or is it only described as existing in the spec assumptions? [Dependency, Spec §Assumptions]
- [ ] CHK037 — Are the 6 personality dimensions referenced in SC-001 defined in the personality bible §9, and does the spec link to them explicitly? [Traceability, Spec §SC-001]

## Notes

- Check items off as completed: `[x]`
- Add comments or findings inline
- Items are numbered sequentially for easy reference
- Bible references point to `docs/max-personality-bible.md` sections
- This checklist covers MVP requirements unless tagged [V1]
