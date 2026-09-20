# AGENTS.md

## Project overview

Max Height is a clone of Max Headroom and is a non-commercial fan project: an interactive AI character web experience.

This is a pnpm workspace monorepo:

- `packages/frontend` — React + Vite web app
- `packages/agent` — Strands agent (Bedrock/AgentCore runtime)
- `packages/infra` — AWS CDK infrastructure

## Source of truth (read before coding)

1. `.specify/memory/constitution.md` (non-negotiable principles)
2. Relevant feature folder in `specs/` (spec/plan/tasks/clarifications)
3. `docs/` (supporting background only)

If behavior, thresholds, or architecture choices are not defined there, do not invent them — ask for clarification or propose a spec update.

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

Package-level commands:

- Frontend: `cd packages/frontend && pnpm run dev` / `pnpm run test` / `pnpm run test:e2e`
- Agent: `cd packages/agent && pnpm run dev` / `pnpm run test`
- Infra: `cd packages/infra && pnpm run build` / `pnpm run test` / `npx cdk diff`

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
