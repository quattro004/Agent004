# AGENTS.md

## Project overview

Max Height is a clone of Max Headroom and is a non-commercial fan project: an interactive AI character web experience.

This is a pnpm workspace monorepo:

- `packages/frontend` — React + Vite web app
- `packages/agent` — Strands agent (Bedrock/AgentCore runtime)
- `packages/infra` — AWS CDK infrastructure
- `packages/repo-tools` — repository hygiene tooling (wiki linter)

## Source of truth (read before coding)

1. `.specify/memory/constitution.md` (non-negotiable principles) — supreme.
2. **The GitHub wiki** — <https://github.com/quattro004/Agent004/wiki>. Current-state truth for completed work.
3. Relevant feature folder in `specs/` (spec/plan/tasks/clarifications) — authoritative _while_ a feature is being implemented; frozen and point-in-time afterwards.
4. `docs/` (supporting background only)

When the wiki and a _completed_ spec disagree, the wiki wins **and the
disagreement is appended to the wiki's `Log` page** rather than silently
resolved.

If behavior, thresholds, or architecture choices are not defined there, do not invent them — ask for clarification or propose a spec update.

## The wiki

The wiki is the project's compounding knowledge base. It is a **separate git
repo** cloned to a gitignored `./wiki` directory. Its default branch is
`master`, not `main`.

The pattern comes from Karpathy's ["LLM wiki" idea file](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f):
three layers (immutable raw sources, an LLM-owned wiki, a schema the human and
LLM co-evolve), three operations (ingest, query, lint), and an `Index` plus a
`Log` to navigate them. Our adaptations are deliberate — see
`Source-LLM-Wiki-Pattern` on the wiki for what we kept, changed and dropped.

**External sources arrive as research, not as a reading list.** The original
pattern assumes you drop articles into a folder. Here, outside knowledge shows
up because someone building on the project went and found it — AWS or SDK
documentation, an upstream changelog, a GitHub issue that explains a behavior.
Treat that the same as any other ingest: cite it, give it a `Source-*` page if
it will be consulted again, and update whatever pages it affects. Research that
only ever reaches a pull request description has evaporated.

**Session start ritual:** `pnpm run wiki:pull`, then read the wiki's `Index`
page. Check `Gotchas` before rediscovering a known trap.

The three workflows, documented in full on the wiki's `Wiki-Conventions` page
and available as the **`wiki` skill** (`.github/skills/wiki/`, or the `/wiki`
prompt):

- **Ingest** — read the new source → write or refresh its `Source-*` page → update every affected `Concept-`, `Component-`, `Contract-`, `Decision-` and `Feature-` page → update `Index` → append to `Log` → `pnpm run wiki:lint` → `pnpm run wiki:push`.
- **Query** — read `Index` first, drill in, answer **with citations**. If the answer is durable, file it back as a new page.
- **Record a trap** — write it on the page that owns it and link it from `Gotchas`, in the same change.

**Wiki or Spec Kit?** Use Spec Kit (`specs/NNN-*`, feature branch, full
pipeline) for a new user-facing capability, a new AWS resource or cost-model
change, work needing a constitution check, or work needing research first.
Use the wiki (a `Feature-*` page plus GitHub issues, no branch) for changes to
existing behavior, bug fixes, refactors, tooling, dependency and CI work, and
documentation.

**Wiki edits are live.** Wikis have no branches, no pull requests and no CI, so
a push publishes immediately — and wiki content therefore goes public _before_
the main-repo PR that accompanies it merges. If that PR is reworked, revert the
wiki separately via its own git history.

## Setup and core commands

| Task                     | Command                           |
| ------------------------ | --------------------------------- |
| Install dependencies     | `pnpm install`                    |
| Run full validation gate | `pnpm run validate`               |
| Lint                     | `pnpm run lint`                   |
| Format check             | `pnpm run format:check`           |
| Type-check               | `pnpm run typecheck`              |
| Build all workspaces     | `pnpm run build`                  |
| Test all workspaces      | `pnpm run test`                   |
| Pull the wiki clone      | `pnpm run wiki:pull`              |
| Lint the wiki            | `pnpm run wiki:lint`              |
| Push the wiki (live)     | `pnpm run wiki:push -- "Message"` |

`wiki:lint` is deliberately **not** part of `validate`: the `wiki/` clone is
optional and gitignored, so `validate` must pass without it.

Package-level commands:

- Frontend: `cd packages/frontend && pnpm run dev` / `pnpm run test` / `pnpm run test:e2e`
- Agent: `cd packages/agent && pnpm run dev` / `pnpm run test`
- Infra: `cd packages/infra && pnpm run build` / `pnpm run test` / `npx cdk diff`
- Repo tools: `cd packages/repo-tools && pnpm run test`

## Required engineering workflow

**Open every piece of work by naming the methodology.** Before writing code,
state (a) whether this needs a spec and (b) what the failing test is. Both
questions get answered in your first response, even when the user didn't raise
them.

- If a Spec Kit trigger fires — new user-facing capability, new AWS resource or
  cost-model change, a required constitution check, or research needed first —
  **recommend `/speckit.specify` before coding.** Name the trigger and the
  concrete cost of skipping it (typically an invented hard number, or a
  constitution check never run).
- The user can decline either methodology, but only **explicitly and with a
  reason**, recorded in the PR or issue. Silence is not consent. Push back once,
  then respect the decision and note the exception.
- Use TDD for production code: **RED → GREEN → REFACTOR**. Its subject is **behavior** — a change with no behavioral delta (removing an unimported dependency, a rename, formatting, docs) cannot have a RED test, so name that out loud and state the check replacing it rather than manufacturing one. See the `tdd` skill.
- Add or update tests for any non-trivial behavior change.
- Reuse existing patterns/helpers before introducing new abstractions.
- Do not hide failures with broad catches or silent fallbacks; surface errors clearly.
- Keep dependency hygiene strict: review new dependencies and keep `pnpm-lock.yaml` committed.

## Dependencies and advisories

`AGENTS.md` states the rules; the wiki's `Concept-Supply-Chain-Discipline`
tells the story, with dates and worked examples.

- **A red `pnpm audit` on an unchanged commit is news, not a regression.** It
  queries the live advisory database. Check the patched version's npm publish
  date before assuming new exposure — fixes often ship weeks before disclosure.
- **pnpm will not re-resolve a transitive dependency the lockfile already
  satisfies.** `pnpm update <pkg> -r` and `--depth Infinity` both no-op on one.
  Use an `overrides:` entry in `pnpm-workspace.yaml` (pnpm 11 reads them nowhere
  else). Two vulnerable major lines need a selector override per line; a
  convergence override (`"pkg@": <exact version>`) takes one exact version.
- **An override is a one-time nudge.** Once the lockfile holds the patch, remove
  it in the same PR or the next one, and verify no resolved version changes and
  `pnpm audit` stays clean. Keep one only while a parent pins an exact vulnerable
  version.
- **Dependabot PRs arriving do not prove security updates are on** — that half
  is a repo setting, not `dependabot.yml`. Check it rather than inferring it:

```sh
gh api /repos/quattro004/Agent004/vulnerability-alerts          # 204 = on, 404 = off
gh api /repos/quattro004/Agent004 --jq '.security_and_analysis.dependabot_security_updates'
```

## When a guard test earns its keep

Most tests here assert **behavior** and need no justification. A **guard test**
asserts on configuration, dependencies, or toolchain state —
`mcp-config.test.ts`, `workflow-pins.test.ts`, `toolchain.test.ts`,
`speckit-hooks.test.ts`. They are cheap to write and easy to over-produce; two
have been written and deleted in review (wiki `Log` entries 25 and 28).

A guard test must satisfy **all four** conditions:

1. **We author the file it guards.** Not generated, not vendored, not a third
   party's.
2. **The failure names a human mistake, and the fix is an action we are allowed
   to take.** A guard whose red build pressures someone toward a forbidden
   remedy is worse than no guard.
3. **No earlier or cheaper gate already catches it.** If `tsc`, ESLint, the
   build, or the package manager fails on the same mistake, the guard is
   redundant.
4. **It does not expire.** If planned work makes it redundant, it is scaffolding,
   not a guard.

**Corollary for TDD.** RED → GREEN requires a failing test to _drive_ the
change; it does not require that test to survive it. When the change is a
deletion or a config edit, the test is often scaffolding. Delete it in REFACTOR
and keep the reasoning in the PR or on the wiki. Never delete a test that pins
behavior.

## Trust, but verify, task status and wiki claims

A task marked `[x]` in `tasks.md` is a claim, not proof (the wiki's
`Source-Tasks-001` has the cases). Before building on one, confirm the code
exists — grep for the import, not just the `package.json` entry. When you find
drift, record it in the deviations table at the top of `tasks.md` (`C1`, `C2`, …)
and split the task rather than silently re-scoping it.

**A wiki page is a claim too.** It is the best current summary, not proof: the
wiki has recorded APIs that never existed (`Source-Strands-Harness-SDK-Docs`,
corrected 2026-10-01). Before a wiki claim drives a decision, a spec
requirement or code, verify it against the code (`file:line`), the pinned
package's `.d.ts`, or a primary source, and cite what you checked. Reuse the
wiki's research rather than redoing it. Just confirm the facts a decision depends on.

- When the wiki is wrong, correct the owning page **and** append the
  disagreement to `Log`. When it is silent, that is an ingest. Either way, get
  approval before `wiki:push`.
- Unverified wiki claims may inform a spec only when labelled as unverified.
  Verification then becomes plan or research work.
- Verification happens at the point of use. Issue #58 proposes a periodic
  sweep; until it lands, nothing else catches a stale page.

## External facts go stale — verify before relying on them

Package names, versions, prices and service limits in `specs/` were true when
written. When a spec drives an external action (install, deploy, API call),
check the current reality first and update the spec in the same change.

- **AWS pricing tables render client-side**, so a fetch returns no rates. Ask a
  human to read them in a browser rather than reporting "unobtainable", and
  prefer `aws___read_documentation` over a plain fetch for `docs.aws.amazon.com`.
- **A provider's own page is not a proxy for Bedrock's** — rates differ by
  Region, and Bedrock serves models the provider lists as retired.
- **"EOL no sooner than" is a floor, not a schedule.** The clock that matters is
  a Legacy model entering public extended access after ~3 months, at higher
  provider-set prices.

Stories on the wiki: `Decision-LLM-Model-Selection`,
`Source-Bedrock-Model-Lifecycle`, and `Gotchas`.

## Maintaining the Spec Kit toolchain

Read the wiki's `Guide-Spec-Kit-Iteration` before changing a feature's
artifacts after the `specify → clarify → plan → tasks` pipeline has run, and
`Decision-Spec-Kit-Upgrade` before upgrading. The rules:

- `speckit.plan` and `speckit.tasks` **regenerate destructively**;
  `speckit.analyze` is read-only; `speckit.converge` is append-only and is the
  default for closing code-versus-artifact drift.
- Upgrade with the manifest-aware path, never `specify init --here --force`:

  ```sh
  uv tool install specify-cli --force --from git+https://github.com/github/spec-kit.git@<tag>
  specify integration status                  # review before changing anything
  specify integration upgrade copilot --force
  specify extension update
  ```

- Keep `.specify/scripts/powershell/*.ps1` pinned to **LF** in
  `.gitattributes`. Never relax it to quiet `integration status`; the
  advertised remedy, `--force`, overwrites real customizations.
- Never patch files under `.specify/extensions/` — `extension update` reinstalls
  without a diff. Our own skills and prompts go in `.github/skills/` and
  `.github/prompts/`, which no Spec Kit command deletes.
- Keep the default catalog (`extensions/catalog.json`) in
  `.specify/extension-catalogs.yml`, because that file **replaces** the built-in
  stack. Leave unvetted public catalogs at `install_allowed: false`.
- Never hand-edit `.specify/extensions.yml`; it is regenerated. Disable a hook
  in the extension's own config instead (git: `auto_commit` in
  `.specify/extensions/git/git-config.yml`). Hooks are pull-based, so a stale
  stanza is inert — do not add a CI guard for it.
- `.specify/feature.json` is machine-local and gitignored.

## MCP configuration

`.mcp.json` is for AI coding assistants only; it is not part of the build.

**There are two MCP config files and they must be edited together.** `.mcp.json`
keys servers under `mcpServers`; `.vscode/mcp.json` uses VS Code's `servers`
key. Adding a server to one and not the other silently leaves that client
short. Parity is enforced by `packages/infra/test/mcp-config.test.ts`.

**Every entry must be a plain HTTP endpoint.** Do not add `stdio` servers that
shell out to `uvx`, `npx`, or similar — that makes a package manager a new
onboarding prerequisite for every contributor. Prefer AWS-hosted servers with
OAuth over local proxies holding credentials (constitution P11). See
`specs/001-max-height-ai-character/quickstart.md` § MCP servers.

## Git conventions

- Branches: `type/kebab-case-description` (e.g. `docs/agentcore-v2-infra-plan`).
- Commits: Conventional Commits (`docs:`, `fix:`, `feat:`).
- Explain _why_ in the body, not just what; note trade-offs taken.

**`main` is protected — never push to it directly.** Since 2026-09-30 the
"Main Branch Protection" ruleset requires a pull request and requires the `CI`
and `Audit` checks to pass before merge. Branches are deleted on merge. A repo
admin can bypass, but bypassing is a deliberate act with a reason, not a way
around a red build.

- `pnpm audit` hits the live advisory database, so a new advisory can turn every
  open PR red at once. That is the gate working: fix the advisory rather than
  bypassing, unless the fix is blocked upstream.
- Required checks match the Actions **job name**. Renaming `CI` or `Audit`
  without updating the ruleset leaves the old check pending and blocks merging.
  See the wiki's `Guide-Validation-Gate`.

## Keep this file current

When you learn something durable about this repo — a convention, a constraint, a
correction to a documented fact — update the relevant AI steering file
(`AGENTS.md`, `.github/copilot-instructions.md`, or a skill) as part of the same
change. Keep `.github/copilot-instructions.md` a small, stable steering layer;
operational conventions belong here.

Knowledge that is about the _project_ rather than about _working in this repo_
belongs on the wiki instead.

**Durability decides where a fact goes; a memory is a cache.** Storing an agent
memory does not by itself mean publishing anything. Copilot memories come in two
scopes: a **user** memory follows one builder across their repos, and a
**repository** memory is shared with every contributor whose agent has Copilot
Memory enabled. Both reach agents only, never a human reader, and repository
memories expire after 28 days unless something reuses them. Knowledge that
expires cannot compound, so no durable fact may live _only_ in a repository
memory. That was the alternative `Decision-Wiki-As-Knowledge-Base` rejected.

| If the fact is…                                                        | It goes…                                                                                       |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Builder-specific — one person's workflow, tools or preferences         | User memory only                                                                               |
| Durable, about working here — conventions, verified commands           | A rule in `AGENTS.md` or a skill (the schema layer)                                            |
| A durable trap, whether in the tooling or the project                  | The story on the owning wiki page plus a `Gotchas` row; a one-line rule here if agents need it |
| Durable, about the project — architecture, decisions, current behavior | The owning wiki page                                                                           |
| Short-lived, or a shortcut to any of the above                         | Repository memory — losing it costs nothing                                                    |

**State rules here; tell stories on the wiki.** Agents always load `AGENTS.md`,
but the `wiki/` clone is optional, so a rule an agent must follow belongs here
even when the wiki explains it. The incident behind the rule — dates, evidence,
what broke — belongs on the wiki, linked rather than restated.

A repository memory may cache a fact recorded in the schema or on the wiki, and
should cite where it lives. When something reaches the wiki, follow the ingest
workflow — update `Index`, append to `Log`, run `pnpm run wiki:lint` — and get
approval before `wiki:push`, because wiki pushes are live and public.

## Root scripts are invisible to the toolchain

`eslint.config.mjs` ignores both `scripts/` and `*.mjs`, and
`vitest.workspace.ts` covers only the workspace packages, so a root-level script
is neither linted nor tested. A root script may **chain** commands; the moment
it encodes a **decision**, it belongs in a workspace package —
`packages/repo-tools` exists for exactly this.

**Mind the entry point, too.** Keep bins thin: anything a bin decides for itself,
argument parsing included, is code no test is looking at. `wiki:push --message
"text"` once committed the literal `--message` to the live wiki, because the bin
read `process.argv[2]` directly. Parsing now lives in `src/wiki/push-args.ts`
under test. The `wiki:push` short-circuit story is on the wiki's
`Guide-Validation-Gate`.

## Product and legal guardrails

- User-facing/project-facing name is **Max Height**.
- Do not use **Max Headroom** in product/UI copy (README/About inspiration references are acceptable).
- No Matt Frewer voice cloning or exact visual replica.
- Preserve cloud-only AI behavior (no browser-side model inference).
- Preserve graceful degradation paths (text fallback, signal-lost state, capability fallbacks).

## Completion criteria

Before considering work done, run:

`pnpm run validate`

This repository treats that command as the final quality gate.
