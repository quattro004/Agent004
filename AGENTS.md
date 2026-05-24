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
