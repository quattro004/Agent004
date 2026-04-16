# Speckit working files — Max Height

Scaffold documents for each phase of the [GitHub Spec Kit](https://github.com/github/spec-kit) flow:

1. [`01-constitution.md`](./01-constitution.md) — non-negotiable principles (P1–P9).
2. [`02-specify.md`](./02-specify.md) — the **WHAT**: personas, scenarios, observable behaviors, success criteria, NFRs.
3. [`03-clarify.md`](./03-clarify.md) — every open question with options, recommendation, and a blank for the user's decision.
4. [`04-plan.md`](./04-plan.md) — the **HOW**: technical approach, principle traceability, streaming/cost/security/observability plans.
5. [`05-tasks.md`](./05-tasks.md) — executable units with acceptance + traceability, gated by phase.
6. [`06-implement.md`](./06-implement.md) — execution rules (PR requirements, DoD, prohibitions, release/rollback).

## Upstream sources

- [`../speckit-plan.md`](../speckit-plan.md) — the review that produced these files.
- [`../initial-plan.md`](../initial-plan.md) — technical appendix referenced from `/plan`.
- [`../max-personality-bible.md`](../max-personality-bible.md) — personality source of truth for `/specify` and the personality gate.

## Status

Draft pass complete by agent. **All `____` decisions are filled with recommended defaults**, all `TBD`s resolved, all enforcement owners assigned to "Project owner." User should review and override any decisions they disagree with.

## Suggested fill-in order

1. Finish `../max-personality-bible.md` if not yet complete (review §7).
2. **Review `01-constitution.md`** — confirm P1–P9 are the right rules.
3. **Review `02-specify.md`** — confirm the locked numbers match intent (latency, rate limits, MVP boundary, success criteria).
4. **Review `03-clarify.md`** — every decision line says "Locked" or has a concrete value; override any you disagree with.
5. **Review `04-plan.md`** — the Deltas section is the diff from `initial-plan.md`; confirm.
6. **Review `05-tasks.md`** — acceptance criteria carry concrete numbers; confirm the MVP ship gate list.
7. Leave `06-implement.md` as-is until implementation actually starts.
