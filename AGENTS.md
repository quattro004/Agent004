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

**Session start ritual:** `pnpm run wiki:pull`, then read the wiki's `Index`
page. Check `Gotchas` before rediscovering a known trap.

The three workflows, documented in full on the wiki's `Wiki-Conventions` page:

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

| Task                     | Command                 |
| ------------------------ | ----------------------- |
| Install dependencies     | `pnpm install`          |
| Run full validation gate | `pnpm run validate`     |
| Lint                     | `pnpm run lint`         |
| Format check             | `pnpm run format:check` |
| Type-check               | `pnpm run typecheck`    |
| Build all workspaces     | `pnpm run build`        |
| Test all workspaces      | `pnpm run test`         |
| Pull the wiki clone      | `pnpm run wiki:pull`    |
| Lint the wiki            | `pnpm run wiki:lint`    |
| Push the wiki (live)     | `pnpm run wiki:push`    |

`wiki:lint` is deliberately **not** part of `validate`: the `wiki/` clone is
optional and gitignored, so `validate` must pass without it.

Package-level commands:

- Frontend: `cd packages/frontend && pnpm run dev` / `pnpm run test` / `pnpm run test:e2e`
- Agent: `cd packages/agent && pnpm run dev` / `pnpm run test`
- Infra: `cd packages/infra && pnpm run build` / `pnpm run test` / `npx cdk diff`
- Repo tools: `cd packages/repo-tools && pnpm run test`

## Required engineering workflow

- Use TDD for production code: **RED → GREEN → REFACTOR**.
- Add or update tests for any non-trivial behavior change.
- Reuse existing patterns/helpers before introducing new abstractions.
- Do not hide failures with broad catches or silent fallbacks; surface errors clearly.
- Keep dependency hygiene strict: review new dependencies and keep `pnpm-lock.yaml` committed.

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

## Keep this file current

When you learn something durable about this repo — a convention, a constraint, a
correction to a documented fact — update the relevant AI steering file
(`AGENTS.md`, `.github/copilot-instructions.md`, or a skill) as part of the same
change. Keep `.github/copilot-instructions.md` a small, stable steering layer;
operational conventions belong here.

Knowledge that is about the _project_ rather than about _working in this repo_
belongs on the wiki instead — and traps belong on the wiki's `Gotchas` page, so
they reach humans as well as agents.

## Root scripts are invisible to the toolchain

`eslint.config.mjs` ignores both `scripts/` and `*.mjs`, and
`vitest.workspace.ts` covers only the workspace packages. Anything written as a
root-level script is therefore neither linted nor tested. Put real logic in a
workspace package — `packages/repo-tools` exists for exactly this — and keep
root `package.json` scripts to inline, logic-free commands.

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
