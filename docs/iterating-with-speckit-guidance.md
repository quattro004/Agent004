# Iterating with Spec Kit: Post-Generation Guidance

> How to safely update Spec Kit artifacts after the initial `specify → clarify → plan → tasks` pipeline has run.

---

## The Problem

Spec Kit's core workflow is a **forward pipeline** designed for greenfield development. There is no built-in "edit" or "update" command for modifying existing artifacts after they've been fully generated. This creates a gap when you need to:

- Update pinned versions (e.g., runtime upgrades, new SDK releases)
- Refresh technology decisions based on new information
- Correct stale data introduced by LLM training cutoffs
- Make structural changes to an existing feature spec

Understanding each command's scope is essential to avoid unintended data loss.

---

## Command Scope Reference

### `speckit.clarify`

- **Operates on**: `spec.md` only
- **Purpose**: Identify underspecified areas, ask up to 5 targeted clarification questions, encode answers back into `spec.md`
- **Does NOT touch**: `plan.md`, `research.md`, `data-model.md`, `contracts/`, `tasks.md`, `quickstart.md`

**Use when** you need to refine the *what* (requirements, acceptance criteria, scenarios). Not useful for updating the *how* (technology choices, architecture, versions).

### `speckit.plan`

- **Operates on**: Reads `spec.md`, then **fully regenerates** `plan.md`, `research.md`, `data-model.md`, `contracts/`, and `quickstart.md`
- **Destructive**: Running it on an existing feature **overwrites all plan artifacts** from scratch

> ⚠️ **Warning**: Re-running `speckit.plan` on a feature with established artifacts will lose all iterative refinements made since initial generation. The LLM may also introduce stale or hallucinated version data due to training cutoffs.

### `speckit.tasks`

- **Operates on**: Reads plan artifacts, generates `tasks.md`
- **Destructive**: Regenerates the full task list

### `speckit.analyze`

- **Operates on**: Reads all artifacts (non-destructive)
- **Purpose**: Cross-artifact consistency and quality analysis
- **Safe to run anytime** — it only reads, never writes

### `speckit.checklist`

- **Operates on**: Reads all artifacts (non-destructive)
- **Purpose**: Generates a quality checklist for the current feature
- **Safe to run anytime**

---

## Approaches to Updating Existing Artifacts

### 1. Manual Edits + Validation (Safest)

Best for targeted changes — version bumps, wording fixes, correcting stale data.

1. **Edit** the affected files directly (e.g., version table in `research.md`, Technical Context in `plan.md`, version references in `tasks.md`)
2. **Use `speckit.clarify`** only if changes need to flow back into `spec.md`
3. **Run `speckit.analyze`** to validate cross-artifact consistency
4. Optionally **run `speckit.checklist`** to verify quality gates still pass
5. **Commit** with clear rationale

**Pros**: Full control, no regeneration risk, sidesteps LLM training-cutoff issues.
**Cons**: Requires understanding of which artifacts reference the data being changed.

### 2. The `spec-kit-iterate` Extension (Recommended for Non-Trivial Changes)

The [spec-kit-iterate](https://github.com/imviancagrace/spec-kit-iterate) community extension was created specifically for this gap. It provides a controlled way to evolve existing specs without destructive regeneration.

#### Commands

| Command | Purpose |
|---------|---------|
| `/speckit.iterate.define <change description>` | Analyzes the change against current spec state, classifies scope, writes a reviewable `pending-iteration.md` |
| `/speckit.iterate.apply` | Updates artifacts in dependency order (`spec.md → data-model.md → plan.md → tasks.md → quickstart.md → research.md`), runs consistency validation, then hands off to `speckit.implement` |

#### Why Use It

- **Non-destructive**: Updates artifacts surgically rather than regenerating them
- **Dependency-aware**: Propagates changes in the correct order across artifacts
- **Reviewable**: The `pending-iteration.md` step lets you inspect proposed changes before they're applied
- **Validates consistency**: Runs cross-artifact checks as part of the apply step

#### Installation

See the [spec-kit-iterate README](https://github.com/imviancagrace/spec-kit-iterate) for setup instructions.

### 3. Regeneration on a Throwaway Branch (For Major Pivots)

When changes are so large that manual editing is impractical (e.g., a full architectural pivot or new feature integration):

1. **Create a throwaway branch** from your current state
2. Run `speckit.plan` (or other regenerative commands) on that branch
3. **Diff** the regenerated artifacts against your existing ones
4. **Cherry-pick** the changes you want back into your working branch
5. Run `speckit.analyze` to validate consistency

**Pros**: Leverages Spec Kit's generation capabilities without risking your working artifacts.
**Cons**: Higher effort, requires manual diff review, LLM may still introduce stale data.

---

## Decision Matrix

| Change Type | Recommended Approach | Risk |
|-------------|---------------------|------|
| Version bumps, wording fixes | Manual edits + `speckit.analyze` | Low |
| New clarifications to requirements | `speckit.clarify` | Low |
| Multi-artifact changes (new component, revised data model) | `spec-kit-iterate` extension | Low–Medium |
| Architectural pivot, major restructure | Regenerate on throwaway branch + cherry-pick | Medium |
| Re-running `speckit.plan` on existing feature | **Avoid** — destructive regeneration | **High** |

---

## General Best Practices

- **Always commit (or back up) before** running any regenerative command.
- **Use `speckit.analyze` after every batch of edits** to catch cross-artifact inconsistencies early.
- **Be aware of LLM training cutoffs**: Any AI-driven regeneration may introduce stale versions or deprecated APIs. Providing explicit version data in prompts or spec context mitigates this.
- **Upgrading Spec Kit itself is safe**: Running `specify init --here --force` updates CLI, templates, and scripts but **never touches `specs/`**.
- **Treat `spec.md` as the "what" and plan artifacts as the "how"**: Choose your update tool based on which layer you're changing.
