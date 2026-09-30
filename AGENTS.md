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

## Transitive advisories: nudge, then remove the nudge

`pnpm audit` queries the **live** advisory database, so the Audit job can go red
on a commit that passed an hour earlier, with nothing in this repo having
changed. That is normal — treat it as news, not as a regression you caused.
On 2026-09-30 the gap was 41 minutes: a PR run went green at 23:03 UTC, four
`brace-expansion` and `fast-uri` advisories were published between 23:44 and
23:54, and the identical tree failed on merge the next morning.

**Check the patched version's publish date before assuming urgency.** Those four
fixes had been on npm since 2026-09-14/15 — a fortnight before disclosure. The
common case is a maintainer shipping the fix quietly and the advisory landing
later, which means the repo was carrying the vulnerable version all along and
the red build is the disclosure catching up, not a new exposure.

Fixing one is a two-step trap:

1. **pnpm will not re-resolve a dependency the lockfile already satisfies.**
   `pnpm update <pkg> -r` and `--depth Infinity` both no-op on a transitive
   package — they match direct dependencies only. An `overrides:` entry in
   `pnpm-workspace.yaml` is usually the only lever that actually moves it.

   When one package is vulnerable in **two major lines at once**, reach for a
   selector override per line (`'brace-expansion@^2.0.2': ^2.1.7` alongside
   `'brace-expansion@^5.0.8': ^5.0.12`). A _convergence_ override — the
   `"pkg@": <exact version>` form added in pnpm 11.13 — cannot express this:
   it takes a single exact version per key, and one key cannot satisfy both
   `^2.0.2` and `^5.0.8`. Convergence overrides are the better tool for the
   single-line case, since they only rewrite edges whose declared range already
   admits the version and pnpm warns when one goes stale.

2. **Once the lockfile carries the patched version, that override is inert.**
   Parent ranges are typically permissive (`express-rate-limit` asks for
   `ip-address: ^10.2.0`), and pnpm resolves to the highest satisfying version,
   so the patched version sticks on its own. Remove the override in the same PR
   or the next one, and verify by deleting it, re-installing, and confirming no
   resolved version changes and `pnpm audit` stays clean.

Do not leave inert overrides behind. Each is a floor someone must revisit by
hand, it hides whether the upstream graph recovered, and it can hold a
dependency _back_ once ranges move on. Five accumulated this way and were
removed on 2026-09-28. The standing protection is the Audit job on every PR —
detection in review, not a pin nobody re-reads.

Dependabot covers the ordinary case: its security updates bump a transitive
dependency in the lockfile whenever the parent's range permits the patch. It
cannot help when a parent pins an exact vulnerable version, which is the one
situation that justifies keeping an override until the parent moves.

**Dependabot PRs arriving is not evidence that security updates are on.** The
two halves come from different places and fail independently:

| Half                 | Configured by                                                                 | Produces                                                    |
| -------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Version** updates  | `.github/dependabot.yml`, in the repo                                         | The weekly "Bump the dependencies group with N updates" PRs |
| **Security** updates | A repo **setting**, and it requires Dependabot **alerts** to be enabled first | A PR targeting one advisory, as soon as a fix exists        |

This repo ran the first without the second from its creation until
**2026-09-30**. Nine Dependabot PRs merged over that period, all version
updates, so the safety net looked healthy while the half that reacts to
advisories had never run. That is why the `brace-expansion` and `fast-uri`
fixes sat unproposed on npm for a fortnight and the Audit job was the only
thing that noticed — after a merge to `main`, where it blocked everyone.

Check the setting rather than inferring it from the PR list:

```sh
gh api /repos/quattro004/Agent004/vulnerability-alerts          # 204 = on, 404 = off
gh api /repos/quattro004/Agent004 --jq '.security_and_analysis.dependabot_security_updates'
```

## When a guard test earns its keep

Most tests here assert **behavior** and need no justification. A **guard test**
is different: it asserts on configuration, dependencies, or toolchain state —
`mcp-config.test.ts`, `workflow-pins.test.ts`, `toolchain.test.ts`,
`speckit-hooks.test.ts`. These are cheap to write, feel responsible, and are
easy to over-produce. Two have now been written and deleted in review.

A guard test must satisfy **all four** conditions. They are necessary, not
sufficient individually — the earlier bar was "guards a file we hand-edit and
names a human mistake", and a test satisfying only that still got cut:

1. **We author the file it guards.** Not generated, not vendored, not a third
   party's. (Removed in review: a test asserting `.specify/extensions.yml`
   agreed with Spec Kit's own agent files — both generated by upstream from one
   manifest, so it could only restate upstream's invariant.)
2. **The failure names a human mistake, and the fix is an action we are allowed
   to take.** A guard whose red build pressures someone toward a forbidden
   remedy is worse than no guard.
3. **No earlier or cheaper gate already catches it.** If `tsc`, ESLint, the
   build, or the package manager fails on the same mistake, the guard is
   redundant. (Removed in review: assertions that `aws-cdk-lib` exports
   `Runtime` and `Memory` — `tsc` fails on the `import` sooner and more
   precisely, so the guard expired exactly when it became relevant.)
4. **It does not expire.** If planned work makes it redundant, it is scaffolding,
   not a guard.

**Corollary for TDD.** RED → GREEN requires a failing test to _drive_ the
change; it does not require that test to survive it. When the change is a
deletion or a config edit, the test is often scaffolding — it proved the thing
was safe to remove and has no lasting subject. Delete it in REFACTOR and keep
the reasoning in the PR, the wiki or here, where nothing has to break for it to
be read. Never delete a test that pins behavior.

## Trust, but verify, task status

A task marked `[x]` in `tasks.md` is a claim, not proof. T023 was checked off
while half its scope — the AgentCore Memory construct — was never written, and
the gap survived a "completed" phase because nothing re-checked it.

Before building on a task marked complete, confirm the code actually exists.
A declared-but-unimported dependency is a strong tell: grep for the import, not
just the `package.json` entry.

When you find drift, record it in the deviations table at the top of `tasks.md`
(`C1`, `C2`, … ) and split the task rather than silently re-scoping it, so the
correction is reviewable.

## External facts go stale — verify before relying on them

Package names, versions, and service limits in `specs/` were true when written.
`@aws/agentcore-cli` was renamed and unpublished, leaving a documented install
command that 404s. When a spec drives an external action (install, deploy, API
call), check the current reality first and update the spec in the same change.

**Two traps specific to verifying AWS pricing and lifecycle facts**, both of
which have already put a wrong number in this repo:

- **AWS renders its pricing tables client-side.** `aws.amazon.com/bedrock/pricing/`
  returns prose and no token rates when fetched — confirmed repeatedly. Ask a
  human to read it in a browser rather than reporting "unobtainable", and prefer
  `aws___read_documentation` over a plain fetch for `docs.aws.amazon.com`.
- **A provider's own page is not a proxy for Bedrock's.** Anthropic's pricing
  and deprecation pages are server-rendered and tempting. They are fine for
  orientation and unsafe for a budget number: Anthropic lists Haiku 4.5 cache
  reads at $0.10/MTok, which is the `us-east-1` rate and wrong for the
  `us-west-2` we deploy to — the single cell that differs between those Regions
  for any Anthropic model. Anthropic also lists models as retired that Bedrock
  still serves.

Lifecycle dates carry their own misreading. **"EOL no sooner than \<date\>" is a
floor, not a schedule** — but the deadline that matters is earlier and quieter
than EOL: a Legacy model enters **public extended access** after roughly three
months, where AWS says to expect **higher pricing set by the provider**. That is
a price rise with no code change and no traffic growth. See the wiki's
`Source-Bedrock-Model-Lifecycle`.

## Maintaining the Spec Kit toolchain

To change a feature's artifacts _after_ the `specify → clarify → plan → tasks`
pipeline has run, read the wiki's `Guide-Spec-Kit-Iteration` first. The short
version: `speckit.plan` and `speckit.tasks` **regenerate destructively**,
`speckit.analyze` is read-only, and `speckit.converge` is append-only and is the
right default for closing code-versus-artifact drift.

Upgrade with the **manifest-aware** path, not `specify init --here --force`
(upstream calls that an escape hatch — it skips per-file integrity checks):

```sh
uv tool install specify-cli --force --from git+https://github.com/github/spec-kit.git@<tag>
specify integration status                  # review before changing anything
specify integration upgrade copilot --force
specify extension update
```

`integration status` is trustworthy only because
`.specify/scripts/powershell/*.ps1` are pinned to **LF** in `.gitattributes`.
Spec Kit records a SHA-256 per managed file and writes those scripts with LF, so
the repo-wide `*.ps1 text eol=crlf` rule made all of them report as modified on
every Windows checkout. Never "fix" that by relaxing the LF rule — the advertised
remedy for the warning is `--force`, which overwrites real customizations.

Two tiers of protection, and only one is safe:

- **Integration-managed** files (`.github/prompts/`, `.github/agents/`,
  `.specify/scripts/`, `.specify/templates/`, `.vscode/settings.json`) carry
  per-file hashes. Local edits are detected and preserved; upgrade refuses until
  you resolve them.
- **Extension-provided** files carry only a whole-manifest hash. `extension
update` has no `--force` and no per-file comparison — it removes and reinstalls,
  so any local patch is lost silently. Do not patch extensions in place; prefer
  an extension that needs no patching.

Untracked files are never deleted by any Spec Kit command — removal iterates
manifest keys only, so hand-authored files such as `.github/prompts/tdd.prompt.md`,
`.github/prompts/wiki.prompt.md` and everything under `.github/skills/` are safe.
Put our own skills and prompts there, never in `.specify/extensions/` — that is
the tier with no per-file hashing, where `extension update` deletes and
reinstalls without a diff. `.specify/feature.json` is machine-local and
gitignored.

`.specify/extension-catalogs.yml` **replaces** Spec Kit's built-in catalog
stack; it does not extend it. Adding one catalog therefore drops every catalog
you did not list, and any installed extension that only the dropped catalog
knows about is silently orphaned — `extension update` skips it with _"Not found
in catalog"_ forever. Keep the **default** catalog
(`extensions/catalog.json`, the one carrying bundled extensions such as `git`)
in that file whenever anything else is added, and leave unvetted public
catalogs at `install_allowed: false`, per the CLI's own guidance.

**Never hand-edit `.specify/extensions.yml`.** It is generated from each
installed extension's own `extension.yml`, and `extension update` removes and
reinstalls the extension, regenerating the file wholesale — a fresh
`specify init --extension git` reproduces every hook stanza, so local deletions
silently come back. To drop a hook, disable it in the extension's own config
(for the git extension, `auto_commit` in
`.specify/extensions/git/git-config.yml`), which install does not overwrite.

Hooks are **pull-based**: each `before_<x>`/`after_<x>` stanza is read by the
`speckit.<x>` command itself. A hook for a command that no longer exists is
therefore inert rather than broken, so a leftover stanza — `taskstoissues`
being the one upstream is retiring — needs no action from us. Do not add a CI
guard for it: both sides of that mapping are generated by Spec Kit from the
same manifest, so the check only ever restates upstream's own invariant, and a
red build would push someone toward the hand-edit forbidden above.

## MCP configuration

`.mcp.json` is for AI coding assistants only; it is not part of the build.

**There are two MCP config files and they must be edited together.** `.mcp.json`
keys servers under `mcpServers`; `.vscode/mcp.json` uses VS Code's `servers`
key. Adding a server to one and not the other silently leaves that client
short — which is exactly what happened when `aws-mcp` landed. Parity is now
enforced by `packages/infra/test/mcp-config.test.ts`.

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

The `Audit` gate has one sharp edge worth knowing before it bites: `pnpm audit`
queries the **live** advisory database, so a newly published advisory turns
every open PR red at once, including ones that change nothing related. That is
the gate working, not a flake — fix the advisory rather than bypassing, unless
the fix is genuinely blocked upstream.

Required checks match the GitHub Actions **job name**, not the workflow's
filename. If `CI` or `Audit` is renamed without updating the ruleset's
required context, the old check stays pending and **blocks** merging; it does
not silently turn off protection. A job skipped by a conditional can report
success and satisfy a required check, whereas a workflow skipped by path,
branch or commit-message filtering leaves it pending. See the wiki's
`Guide-Validation-Gate` and GitHub's required-check troubleshooting guide.

## Keep this file current

When you learn something durable about this repo — a convention, a constraint, a
correction to a documented fact — update the relevant AI steering file
(`AGENTS.md`, `.github/copilot-instructions.md`, or a skill) as part of the same
change. Keep `.github/copilot-instructions.md` a small, stable steering layer;
operational conventions belong here.

Knowledge that is about the _project_ rather than about _working in this repo_
belongs on the wiki instead — and traps belong on the wiki's `Gotchas` page, so
they reach humans as well as agents.

**Storing an agent memory is a trigger to check the wiki.** A memory is private
to one agent and one user; it reaches no contributor and no human reader. So
whenever something is durable enough to remember, ask in the same change whether
it is also durable enough to publish:

| If the fact is…                                 | It goes…                                              |
| ----------------------------------------------- | ----------------------------------------------------- |
| A personal working preference                   | Memory only — not the wiki                            |
| A repo convention, constraint or corrected fact | Memory **and** the owning wiki page                   |
| A non-obvious trap                              | Memory, the owning page, **and** the wiki's `Gotchas` |

If it reaches the wiki, follow the ingest workflow — update `Index`, append to
`Log`, run `pnpm run wiki:lint` — and get approval before `wiki:push`, because
wiki pushes are live and public.

## Root scripts are invisible to the toolchain

`eslint.config.mjs` ignores both `scripts/` and `*.mjs`, and
`vitest.workspace.ts` covers only the workspace packages. Anything written as a
root-level script is therefore neither linted nor tested. Put real logic in a
workspace package — `packages/repo-tools` exists for exactly this — and keep
root `package.json` scripts to inline, logic-free commands.

`wiki:push` is the cautionary example. As a root one-liner,
`git add -A && git commit -m "..." && git push`, its `&&` chain encoded a
decision — push _only if_ the commit succeeded — so a clone whose work was
already committed hit "nothing to commit", exited non-zero, and never pushed.
Nothing caught it, because nothing checks root scripts. It now lives in
`packages/repo-tools` under types, lint and tests.

The rule that follows: a root script may **chain** commands, but the moment it
encodes a **decision**, it belongs in a package.

**And moving it into a package is not the end of it — mind the entry point.**
`bin/wiki-push.ts` sat inside `packages/repo-tools`, so it was linted and
type-checked, yet its argument handling was a bare `process.argv[2]` that no
test touched: `push.test.ts` covered `pushWiki` and stopped at the module
boundary. So `wiki:push --message "text"` committed the literal string
`--message` as the wiki commit message, and, because a wiki push is live and
un-reviewed, the mistake was public before anyone saw it. Argument parsing now
lives in `src/wiki/push-args.ts` under test, and the bin is a thin wrapper that
prints and exits. Keep bins that way — anything a bin decides for itself is
code no test is looking at.

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
