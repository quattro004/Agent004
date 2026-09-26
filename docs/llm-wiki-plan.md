# LLM Wiki Plan — An Agent-Maintained Knowledge Base for Max Height

> Status: **proposed, awaiting review**. Created 2026-09-26.
> Pattern source: [Karpathy, "LLM wiki" idea file](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
> Target: <https://github.com/quattro004/Agent004/wiki>

---

## Problem & Approach

### Problem

Knowledge about this project is scattered across ~46 markdown files in three
incompatible shapes:

- **`specs/`** — Spec Kit artifacts. Point-in-time contracts. `001` alone is
  ~200KB across 16 files; `tasks.md` is 78KB / 608 lines. Excellent at capturing
  a decision *when it was made*, poor at answering "what is true now."
- **`docs/`** — six design documents. Background, partly superseded.
- **`.specify/memory/constitution.md`** — v1.4.0, the supreme governing document.

Nothing synthesizes them. Every agent session re-derives the same context by
reading large files, and drift goes unnoticed until someone trips over it — as
already recorded in the `tasks.md` deviations table (C4: T023 marked `[x]` with
half its scope unwritten; C5: AgentCore Runtime never provisioned).

Spec Kit also imposes branch-and-merge overhead on *spec* changes. Spec `002`
(volume knob) exists as three files on a feature branch plus four GitHub issues
(#10, #12, #13, #14) — heavy process for describing one control.

### Approach

Three layers, per the Karpathy pattern:

| Layer | Here | Who writes it |
| --- | --- | --- |
| **Raw sources** (immutable) | `specs/`, `docs/`, `.specify/memory/constitution.md`, `packages/**`, GitHub issues/PRs | Humans + Spec Kit. Frozen; the wiki cites, never edits. |
| **The wiki** (compounding) | GitHub Wiki — `Agent004.wiki.git` | The LLM, entirely. |
| **The schema** (rules) | `Wiki-Conventions` page + pointers in `AGENTS.md` / `.github/copilot-instructions.md` | Co-evolved by human + LLM. |

The wiki becomes the **current-state truth**; specs remain the **point-in-time
contract** for the work that produced them.

---

## Current State (verified 2026-09-26)

Checked during analysis. Several of these are traps that shaped the design.

1. **The wiki is initialized and clonable** (verified 2026-09-26, HEAD
   `89273d2`). Worth recording because it was *not* true when this plan was
   drafted: `https://github.com/quattro004/Agent004/wiki` redirected to the repo
   root, and a GitHub wiki cannot be cloned until at least one page exists —
   which can only be created through the browser UI. That step is now done.
   **Its default branch is `master`, not `main`** — the sync scripts must not
   assume otherwise.
2. **GitHub wikis are a flat page namespace.** Directories can be pushed via git
   but do not nest in the UI; every page is served from the wiki root and
   filenames must be globally unique. Structure must come from **name prefixes +
   `_Sidebar.md`**, not folders.
3. **Soft limit of 5,000 files**, per
   [About wikis](https://docs.github.com/en/communities/documenting-your-project-with-wikis/about-wikis).
   Exceeding it can make pages inaccessible; **GitHub Pages is the documented
   escape hatch**. The planned wiki is ~45 pages — roughly 1% of the ceiling —
   but the limit and the migration path get documented on `Home` and
   `Wiki-Conventions` so a future contributor finds them before it matters.
4. **The repo is PUBLIC, wiki enabled, 0 stars.** The wiki is therefore
   world-readable, and search engines will *not* index it (GitHub only indexes
   wikis with 500+ stars that disallow public editing). Non-indexing suits the
   friends-and-family posture of P7 — but world-readable means **P4** (never
   "Max Headroom" in project-visible copy) and **P11** (no credentials) apply to
   every wiki page.
5. **Wikis have no pull requests, no branch protection, no CI.** Pushes land
   directly on the default branch. That is precisely the no-branching property
   we want; the cost is that nothing gates a bad write except our own lint.
6. **`pnpm run validate` will break on a local wiki clone.** `prettier --check .`
   runs repo-wide, so a `wiki/` directory would be reformatted or fail the
   check. `.prettierignore` already excludes `specs/` and `docs/` as
   author-controlled prose — `wiki/` follows that precedent. `.gitignore` needs
   `/wiki/` as well.
7. **Root scripts are invisible to the toolchain.** `eslint.config.mjs` ignores
   both `scripts/` and `*.mjs`; `vitest.workspace.ts` covers only
   `packages/frontend` and `packages/agent`. A linter written as `scripts/*.mjs`
   would be neither linted nor tested — unacceptable under **P10**. So wiki
   tooling must live in a workspace package. Repo-hygiene logic currently
   squats in `packages/infra/test/` (`mcp-config.test.ts`, `toolchain.test.ts`,
   `workflow-pins.test.ts`) — tests about the repo, in the CDK package, because
   there was nowhere better. This plan creates that better home (D6).
8. **A new workspace wires in cheaply.** `pnpm-workspace.yaml` globs
   `packages/*`, so a new package is picked up automatically. Only two files
   need an explicit entry: `tsconfig.json` (`references`) and
   `vitest.workspace.ts`.
9. **Spec Kit is far behind**: installed `0.7.4.dev0`, latest `v1.0.12`
   (`v1.0.0` landed 2026-08-21). The catalog/extension format changed, and the
   installed `git` + `iterate` extensions plus 16 `.github/prompts/*` files would
   be regenerated. `specify init --here --force` does not touch `specs/`.
10. **Wikis render Mermaid**, math, and GeoJSON via `github/markup` — so
    architecture diagrams can live inline rather than as committed images.

---

## Decisions

| # | Decision | Rationale |
| --- | --- | --- |
| D1 | **Hybrid SDD.** Wiki owns current-state truth + lightweight changes; Spec Kit reserved for large new features. | A spec is a point-in-time contract; a wiki is a living synthesis. Retiring Spec Kit would lose the clarify/analyze discipline that produced the best artifacts. |
| D2 | **Defer the Spec Kit upgrade** to a separate follow-up. | Avoids two moving parts at once. Findings recorded now so the follow-up is cheap. |
| D3 | **`specs/` and `docs/` stay, frozen, as immutable raw sources.** Retired sources are cited by **pinned git permalink** (`path@sha`) instead of a live path. | Karpathy's pattern: the LLM reads sources but never mutates them. They are the provenance the wiki cites. The permalink form is the general answer for any source that later leaves the tree. |
| D4 | **Spec `002` migrates to the wiki** — write `Feature-Volume-Knob`, then **delete `specs/002-volume-knob-up-down/`**. Implementation is *not* part of this work. | `001` is largely built, so freezing it records real history. `002` was never built, so a frozen copy would be a stale duplicate of an active spec that now lives in the wiki — and an agent could reasonably read it as authoritative. Git history (`d3cf582`) plus issues #10/12/13/14 are the record. |
| D5 | **Local access via a gitignored `wiki/` clone** + `wiki:pull` / `wiki:push` scripts. | Agents get direct file reads; pushes bypass PR overhead entirely. |
| D6 | **Wiki tooling lives in a new `packages/repo-tools` workspace** (`src/wiki/` + `bin/wiki-lint.ts`, Vitest tests). | Repo-hygiene code is neither CDK nor app code; it deserves its own home rather than squatting in `packages/infra`. Being a workspace package means it is linted, typechecked, and tested like everything else, satisfying P10. |
| D7 | **Sync scripts are inline `git` commands** in root `package.json`, not new files. | No logic ⇒ nothing to test, and it sidesteps the eslint `scripts/` blind spot. |
| D8 | **All main-repo work happens on one branch, `feat/llm-wiki`.** | Per `AGENTS.md` (`type/kebab-case-description`). `feat` rather than `docs` because the change adds a workspace package with real code. See *Branching* below for the wiki asymmetry. |
| D9 | **The wiki carries a `Gotchas` page** — hard-won operational traps, indexed and cross-linked. | The wiki is institutional memory for other contributors and for future-us, not just a description of the system. Knowledge that currently survives only in `AGENTS.md`, a deviations table, or someone's head is exactly what gets lost between sessions and between people. |

### The hybrid rule (D1), stated precisely

**Use Spec Kit** (`specs/NNN-*`, feature branch, full pipeline) when *any* of:

- a new user-facing capability,
- a new AWS resource or a change to the cost model,
- a constitution check is required,
- research or clarification is needed before the work is understood.

**Use the wiki** (a `Feature-*` page + GitHub issues, no branch) when:

- changing behavior that already exists, bug fixes, refactors,
- tooling, dependency, or CI work,
- documentation and knowledge capture.

### Precedence when sources disagree

This replaces the current "specs are the source of truth" ordering in
`.github/copilot-instructions.md`:

1. `.specify/memory/constitution.md` — **supreme, unchanged.** The wiki never
   overrides it; `Concept-*` pages summarize and link to it.
2. **The wiki** — current-state truth for completed work.
3. `specs/` — authoritative for a feature *while it is being implemented*;
   frozen and point-in-time afterwards.
4. `docs/` — background only.

When the wiki and a *completed* spec disagree, the wiki wins **and the
disagreement is appended to `Log`** rather than silently resolved.

### Branching (D8)

Main-repo work lands on **`feat/llm-wiki`**, opened off `main`. That branch
carries: `.gitignore`, `.prettierignore`, `tsconfig.json`, `vitest.workspace.ts`,
root `package.json` scripts, the new `packages/repo-tools` package, `AGENTS.md`,
`.github/copilot-instructions.md`, this plan, and the deletion of `specs/002`.

**The asymmetry to be aware of:** the wiki is a separate git repo with no
branches and no PRs — pushes land on its default branch immediately. So wiki
content goes **live before the main-repo PR merges**. Two consequences:

- Sequence the work so the wiki is only populated once the conventions are
  settled (Phase 1 before Phase 4), because rewriting 45 live pages is worse
  than rewriting 45 staged ones.
- If the PR is ultimately rejected or reworked, the wiki must be reverted
  separately — it has git history, so this is possible, just not automatic.

This asymmetry is the price of the no-branching workflow that motivated the
whole exercise. It is worth paying; it is not worth forgetting — so it is
documented in the wiki itself, on `Guide-Wiki-Contributing` and indexed from
`Gotchas` (D9), not only here in a plan that will eventually go stale.

---

## Wiki Structure

Flat namespace, so the prefix *is* the taxonomy. ~47 pages initially.

**Spine (6):** `Home`, `_Sidebar`, `Index`, `Log`, `Wiki-Conventions`, `Gotchas`

| Prefix | Purpose | Initial pages |
| --- | --- | --- |
| `Concept-` | Cross-cutting principles, one per constitutional theme | Budget-Ceiling (P2), Cloud-Only-Inference (P1), Personality-Gate (P3/P5), IP-And-Legal-Posture (P4/P7), Graceful-Degradation (P8), Observability (P9), Testing-And-TDD (P10), Credential-Hygiene (P11), Supply-Chain-Discipline (P6) |
| `Component-` | Code entities, from `packages/**/src` | Frontend-App, Audio-Chain, Volume-Knob, CRT-Presentation, Speech-Input, WebSocket-Transport, State-Stores, Agent-Runtime, Infra-Stacks |
| `Contract-` | Interface contracts, mirroring `specs/001/contracts/` | WebSocket-API, Message-Protocol, Polly-TTS, Greeting-Manifest, Re-Engagement-Manifest |
| `Decision-` | ADR-style, one per resolved choice (from `research.md` R0–R15, `infra-plan.md`, deviations C1–C5) | LLM-Model-Selection, Strands-SDK, AgentCore-Runtime-V2, Polly-Voice, Testing-Strategy, Browser-TTS-Fallback, Dependency-Refresh, Spec-Kit-Upgrade *(status: deferred)*, Wiki-As-Knowledge-Base |
| `Feature-` | Current state of a capability | Max-Height-Core, Volume-Knob |
| `Guide-` | Operational how-tos | Local-Setup, Validation-Gate, Deployment, MCP-Servers, Wiki-Contributing |
| `Source-` | Distilled summary + provenance for each raw source | Constitution, Spec-001, Tasks-001, Quickstart, Spec-002, Initial-Plan, Personality-Bible, Infra-Plan, Audio-Plan, Image-Prompts |

`Source-*` pages earn their place by letting an agent absorb a 78KB `tasks.md`
without reading it, while keeping a citable link back to the original.

### `Gotchas` — the wiki as institutional memory (D9)

A knowledge base that only records *what is true* misses the more expensive
category: **what will bite you.** Right now that knowledge is scattered across
`AGENTS.md`, buried in a `tasks.md` deviations table, or held only in the head
of whoever last hit it. A second contributor — or the same contributor in three
months — starts from zero.

`Gotchas` is a curated index of traps. Each entry is one or two lines plus a
link to the page carrying the full story; the detail lives with the thing it
concerns, so it is found *in context* too. It seeds immediately from what is
already known:

| Trap | Full story on |
| --- | --- |
| Wiki edits are live — no branch, no PR, no CI (D8) | `Guide-Wiki-Contributing` |
| An empty wiki cannot be cloned; the first page must be made in the browser | `Guide-Wiki-Contributing` |
| Flat namespace — folders don't nest, filenames must be globally unique | `Wiki-Conventions` |
| Browser-UI edits bypass `wiki:lint` entirely | `Guide-Wiki-Contributing` |
| 5,000-file soft limit; GitHub Pages is the escape hatch | `Wiki-Conventions` |
| A local `wiki/` clone breaks `prettier --check .` unless ignored | `Guide-Validation-Gate` |
| eslint ignores `scripts/` and `*.mjs` — root scripts are silently untested | `Guide-Validation-Gate` |
| A `[x]` in `tasks.md` is a claim, not proof (deviation C4) | `Source-Tasks-001` |
| AgentCore Runtime V2 cannot be set by CDK/CFN — deploy via the CLI (C5) | `Decision-AgentCore-Runtime-V2` |
| MCP config lives in two files that must stay in parity | `Guide-MCP-Servers` |
| pnpm reads `overrides` only from `pnpm-workspace.yaml` | `Concept-Supply-Chain-Discipline` |
| `minimumReleaseAge` is checked before resolution — restore the lockfile, don't patch it | `Concept-Supply-Chain-Discipline` |
| `speckit.plan` destructively regenerates an existing feature's artifacts | `Source-Iterating-With-Speckit` |
| The brass knob is baked pixels; `.volume-knob` geometry is asserted by E2E | `Feature-Volume-Knob` |

The standing rule, recorded in `Wiki-Conventions`: **when you hit a non-obvious
trap, write it on the relevant page and link it from `Gotchas` in the same
change.** This is the human-facing counterpart to the existing `AGENTS.md` rule
about keeping steering files current — same discipline, wider audience.

`Guide-Wiki-Contributing` exists for a related reason: someone editing a page in
the browser never runs our tooling and may never read `AGENTS.md`. Whatever they
must know has to be reachable from `Home` and `_Sidebar`, because that is all
they will see.

### Page frontmatter

```yaml
---
type: concept | component | contract | decision | feature | guide | source
status: current | draft | superseded | deferred
updated: 2026-09-26
verified: 2026-09-26 # last time claims were checked against code
sources:
  - specs/001-max-height-ai-character/spec.md#requirements
  - .specify/memory/constitution.md#p2-budget-ceiling
related: [Concept-Budget-Ceiling, Component-Audio-Chain]
---
```

`verified` is deliberate. `AGENTS.md` already records that a `[x]` is a claim,
not proof. A wiki page asserting "implemented" carries the same hazard, so the
date the claim was last checked against code is part of the page.

**Open risk:** GitHub wiki frontmatter rendering is unconfirmed. It gets
verified on the pilot page in Phase 0; if it renders as visible noise, the
fallback is a `<!-- meta: ... -->` HTML comment block, which the linter parses
just as well.

### Conventions enforced by `wiki:lint`

- Every page is listed in `Index`.
- No orphans — every page has at least one inbound link.
- Every `[[wikilink]]` resolves to an existing page.
- Valid frontmatter with a known `type` and `status`.
- Every path in `sources:` resolves — either a live repo path, or a pinned
  permalink (`path@sha`) for a source that has since been removed (D3).
- Filenames match an allowed prefix and are unique.
- Page length ≤ ~300 lines; longer pages must split.
- `Log` has an entry at least as new as the newest page `updated:`.

### Workflows (the Karpathy loop)

Documented in `Wiki-Conventions`, summarized in `AGENTS.md`:

- **Ingest** — read the new source (spec, doc, issue, merged PR, AWS doc) →
  write/refresh its `Source-*` page → update every affected `Concept-`,
  `Component-`, `Contract-`, `Decision-`, `Feature-` page → update `Index` →
  append to `Log` → `wiki:lint` → push.
- **Query** — read `Index` first, drill into pages, answer **with citations**.
  If the answer is durable, **file it back as a new page** — this is what makes
  exploration compound instead of evaporating into chat history.
- **Lint** — run `wiki:lint`, then an LLM health pass: contradictions, claims
  stale against current code, orphans, concepts mentioned but lacking a page,
  missing cross-references, gaps worth researching.
- **Record a trap** — on hitting non-obvious behavior, write it on the page that
  owns it and add a linked line to `Gotchas`, in the same change (D9).

Session start ritual: `pnpm run wiki:pull`, then read `Index`.

---

## Phases & Tasks

### Phase 0 — Verify and guard

- [ ] Open branch `feat/llm-wiki` off `main`.
- [ ] Add `/wiki/` to `.gitignore` and `.prettierignore` *before* cloning, so
      `pnpm run validate` never sees the clone.
- [ ] Clone `Agent004.wiki.git` to `./wiki` (default branch `master`); confirm a
      push round-trips.
- [ ] Push one page with YAML frontmatter and a Mermaid block; confirm how
      GitHub renders both. Choose frontmatter or the HTML-comment fallback.

### Phase 1 — Spine and schema

- [ ] Author `Wiki-Conventions`: layers, naming, frontmatter, the three
      workflows, page-size limits, the P4/P11 content rules, the 5,000-file
      limit + GitHub Pages escape hatch with the docs link, and the standing
      rule that traps get written down and linked from `Gotchas`.
- [ ] Write `Home`, `_Sidebar`, an empty `Index`, and `Log` seeded with entry 1.
      `Home` and `_Sidebar` must surface `Wiki-Conventions` and `Gotchas`
      prominently — a browser editor sees nothing else.
- [ ] Write `Guide-Wiki-Contributing`: how to edit (browser vs. clone), that
      edits are live with no PR or CI, that browser edits bypass `wiki:lint`,
      and how to revert via wiki git history.
- [ ] Seed `Gotchas` with the fourteen traps already identified above, linking
      each to its owning page (creating stubs where the page comes later).

### Phase 2 — Tooling (TDD — invoke the `tdd` skill)

- [ ] Scaffold `packages/repo-tools`: `package.json`, `tsconfig.json`,
      `vitest.config.ts`. Wire it into root `tsconfig.json` `references` and
      `vitest.workspace.ts`. (`pnpm-workspace.yaml` globs `packages/*`, so no
      change needed there.)
- [ ] Add `wiki:pull` / `wiki:push` as inline git in root `package.json`, and
      `wiki:lint` delegating into `repo-tools`.
- [ ] **RED**: failing Vitest tests in `packages/repo-tools/test/` covering each
      lint rule above, against fixture pages.
- [ ] **GREEN**: implement `packages/repo-tools/src/wiki/` +
      `bin/wiki-lint.ts`. Deliberately **not** added to `validate` — the clone
      is optional and gitignored, so `validate` must pass without it.
- [ ] Confirm `pnpm run validate` still passes with and without `./wiki` present.

### Phase 3 — Steering files

- [ ] Update `AGENTS.md`: wiki location, the pull-and-read-`Index` session
      ritual, the three workflows, the hybrid rule, and a pointer to `Gotchas`
      so agents check known traps before rediscovering them.
- [ ] Update `.github/copilot-instructions.md`: replace the source-of-truth
      ordering with the four-level precedence above; keep the file a thin
      steering layer.

### Phase 4 — Ingest existing knowledge

These six are independent of each other and can run in parallel.

- [ ] `constitution` → the nine `Concept-*` pages + `Source-Constitution`.
- [ ] `spec-001` → `Feature-Max-Height-Core`, five `Contract-*` pages,
      `Source-Spec-001`, `Source-Tasks-001` (carrying deviations C1–C5),
      `Source-Quickstart`.
- [ ] `research` → the `Decision-*` pages from R0–R15 and `infra-plan.md`.
- [ ] `docs` → `Source-*` pages for the five remaining `docs/` files, plus
      `Source-LLM-Wiki-Plan` for this document; `Concept-Personality-Gate`
      absorbs the personality bible's rubric.
- [ ] `code` → the nine `Component-*` pages from `packages/**/src`, each with
      `verified:` set from an actual read of the code.
- [ ] `guides` → the four `Guide-*` pages from `quickstart.md` + `README.md`.
- [ ] Then: populate `Index`; run `wiki:lint` until clean.

### Phase 5 — Migrate spec 002

- [ ] Write `Feature-Volume-Knob` from `specs/002` + issues #10/12/13/14,
      capturing the full scope: split hit-area, wheel/keyboard, clamp-at-ends,
      the rotating-indicator animation, and the two hard constraints (the
      `.volume-knob` hit-area geometry that `panel-alignment.spec.ts` asserts,
      and the fact that the brass knob is baked pixels in `TV-frame.png`).
- [ ] Review the page against the issues — nothing may be lost in translation.
- [ ] **Delete `specs/002-volume-knob-up-down/`.** Cite the permalink
      (`specs/002-volume-knob-up-down/spec.md@d3cf582`) in the page's `sources:`.
- [ ] Confirm issues #10/12/13/14 point at the wiki page, so the tracking
      mechanism survives the move.
- [ ] Record `Decision-Wiki-As-Knowledge-Base` and `Decision-Spec-Kit-Upgrade`
      (status `deferred`) — dogfooding the wiki as the home for its own
      decisions.

### Phase 6 — Retrospective

- [ ] Full `wiki:lint` + LLM health check.
- [ ] Add every trap discovered *during* this build to `Gotchas` — the first
      real test of the D9 rule.
- [ ] Fold what was learned back into `Wiki-Conventions` and `AGENTS.md`, per the
      repo's own "keep steering files current" rule.
- [ ] Open the PR for `feat/llm-wiki`.

---

## Cost & Dependency Notes

- **AWS cost: $0.** No AWS resources are involved. P2's $10/month ceiling is
  untouched.
- **New runtime dependencies: none.** The linter uses Node built-ins, and
  `packages/repo-tools` tests with Vitest — already a devDependency via
  `packages/frontend` and `packages/agent`. Sync is plain `git`. Nothing new to
  review under P6.
- **GitHub cost: $0.** Wikis are included; the 5,000-file soft limit is the only
  quota that applies, and we sit at ~1% of it.
- **Deferred tooling that *would* add dependencies** — local search via
  [qmd](https://github.com/tobi/qmd) — is explicitly out of scope until the
  `Index` stops sufficing.

---

## Risks / Considerations

| Risk | Mitigation |
| --- | --- |
| **No CI, no PR review on the wiki** — a bad push lands live. | `wiki:lint` before every push; wiki git history makes revert easy; `Log` is the audit trail. Scheduled CI lint is deferred, not rejected. |
| **Public wiki leaks IP or secrets.** | `Wiki-Conventions` states P4 (never "Max Headroom" in project-visible copy) and P11 (no credentials, no `ASIA…`/`AKIA…` values, no account IDs) as hard content rules; the linter can grep for obvious patterns. |
| **Wiki claims drift from code.** | `sources:` + `verified:` frontmatter; lint fails when a cited path disappears; periodic lint pass re-verifies. |
| **Context bloat** — the wiki grows past what an agent can read in one pass. | `Index`-first discipline; ≤300-line pages; local search deferred until needed. |
| **Two-repo drift** between `./wiki` and origin. | `wiki:pull` at session start is part of the documented ritual. |
| **Flat namespace collisions.** | Enforced unique prefixed filenames; lint rule. |
| **Frontmatter may not render.** | Verified in Phase 0 with a defined fallback. |
| **Hybrid boundary erodes** — everything becomes "lightweight." | The D1 rule is written into `AGENTS.md` with explicit triggers, and the choice is recorded per feature on its `Feature-` page. |
| **Browser-UI edits bypass `wiki:lint`** — a contributor editing on github.com never runs our tooling. | Conventions and `Gotchas` are linked from `Home` and `_Sidebar`, the only things a browser editor sees; `Guide-Wiki-Contributing` states the rules plainly. A periodic lint pass catches what slips through. |
| **Knowledge stays in one person's head** and is lost between contributors or sessions. | `Gotchas` (D9) plus the standing rule that traps are recorded where they bite, in the same change that discovers them. |
| **Wiki content goes live before the PR merges** — wikis have no branches (D8). | Settle conventions in Phase 1 before bulk-ingesting in Phase 4; the wiki has git history, so a revert is possible if the PR is reworked. Documented on `Guide-Wiki-Contributing`. |
| **This plan is itself a raw source** that will go stale. | It gets ingested in Phase 4 as `Source-LLM-Wiki-Plan`, after which the wiki — not this file — is the current-state record of how the wiki works. |

---

## Out of Scope (this plan)

Deferred explicitly, not rejected:

- **Implementing the volume knob.** This plan moves `002`'s knowledge into the
  wiki; building the feature is separate work, driven from
  `Feature-Volume-Knob` and issues #10/12/13/14 once the wiki exists.
- Scheduled GitHub Action that lints the wiki and opens an issue on drift.
- Local search over wiki pages (qmd or similar) — the `Index` suffices at ~45
  pages.
- Spec Kit `0.7.4.dev0` → `v1.0.x` upgrade (D2), tracked as a wiki decision page.
- Migration to GitHub Pages if the wiki ever approaches the 5,000-file soft
  limit.
- Moving the existing repo-hygiene tests (`mcp-config`, `toolchain`,
  `workflow-pins`) out of `packages/infra` into the new `packages/repo-tools`.
  That is where they belong, but it is a separate, reviewable change.
- Any change to `.specify/memory/constitution.md`. The wiki summarizes the
  constitution; it does not amend it.

---

## Next Steps (todo list)

1. **Review this plan.** All previously open questions are now decided (D6 →
   `packages/repo-tools`; D4 → migrate-and-delete, no implementation).
2. Open `feat/llm-wiki`.
3. Land the `.gitignore` / `.prettierignore` guards before any clone exists.
4. Work Phases 1–3 sequentially; Phase 4 can fan out.
