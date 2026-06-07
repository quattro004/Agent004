# Plan: Update Dependencies & Spec to Latest Stable (Pre-Deployment)

## Problem & Context

Max Height is a new project preparing to deploy soon. A dependency/version review found:

- **Spec §R0 version table is stale** — research.md lists React 19.2.5, Vite 8.0.9, TS 5.8.2, Zustand 5.0.12, CDK 2.250.0; all behind latest stable.
- **`pnpm audit` currently FAILS constitution P6 gate**: 1 **CRITICAL** (`vitest <4.1.0` file-read/RCE via UI server) + 1 **moderate** (`qs` DoS, transitive via `@strands-agents/sdk` → MCP SDK → express).
- **Strands SDK is on a pre-release** (`1.0.0-rc.5`); spec says "latest stable" and **1.4.0 stable** now exists.
- **CDK out of lockstep**: `aws-cdk-lib` resolves to 2.254.0 but `@aws-cdk/aws-bedrock-agentcore-alpha` is pinned 2.250.0-alpha.0 — alpha modules must match the lib version exactly.

**User decisions (this session):**
- Update **all** deps to **latest stable**, including dev-tooling majors.
- **Override** the spec's TS-6 deferral → adopt **TypeScript 6.0.3** and **update the spec to match**.

## Approach

- Establish a green baseline first, then update in **safe → risky** order, running `pnpm run validate` (lint → format:check → typecheck → build → test) after each batch so breakage is attributable.
- The **existing test suite is the regression gate**. Any production-code change required for compatibility (e.g., Strands API migration) follows **TDD** (RED→GREEN→REFACTOR) — invoke the `tdd` skill before modifying production code.
- Keep **exact pins** for SDKs/alpha packages per constitution **P6**; keep `pnpm-lock.yaml` committed.
- Reconcile `aws-cdk-lib` + `agentcore-alpha` to the **same 2.258.x** version.
- End state: **`pnpm audit` clean** + full `pnpm run validate` green.
- Scope is dependency + spec updates only — **no cloud deploy** is performed here.

## Target Versions

**Runtime / prod deps**

| Package | Current | Target | Workspace | Risk |
|---|---|---|---|---|
| react / react-dom | 19.2.6 | 19.2.7 | frontend | patch |
| zustand | 5.0.13 | 5.0.14 | frontend | patch |
| @aws-sdk/client-* (polly, cognito-identity, bedrock-runtime, apigatewaymanagementapi) | 3.1048.0 | 3.1063.0 | fe/agent/infra | minor |
| aws-cdk-lib | 2.254.0 | 2.258.0 | infra | minor |
| @aws-cdk/aws-bedrock-agentcore-alpha | 2.250.0-alpha.0 | 2.258.0-alpha.0 | infra | **lockstep w/ lib** |
| @strands-agents/sdk | 1.0.0-rc.5 | 1.4.0 | agent | **MAJOR (RC→stable)** |

**Dev deps**

| Package | Current | Target | Workspace | Risk |
|---|---|---|---|---|
| typescript | 5.9.3 | 6.0.3 | root + all | **MAJOR (overrides spec)** |
| vite | 8.0.13 | 8.0.16 | frontend | patch |
| vitest | 3.2.4 | 4.1.8 | frontend, agent | **MAJOR (security-critical)** |
| jsdom | 26.1.0 | 29.1.1 | frontend | **MAJOR ×3** |
| @types/react | 19.2.14 | 19.2.17 | frontend | patch |
| tsx | 4.22.0 | 4.22.4 | agent | patch |
| @types/node | 25.6.0 | 25.9.2 | agent | minor |
| @types/node | 22.19.19 | 25.9.2 | infra | **MAJOR (align w/ agent)** |
| @types/aws-lambda | 8.10.161 | 8.10.162 | infra | patch |
| jest + @types/jest | 29.x | 30.x | infra | **MAJOR** |
| ts-jest | 29.4.9 | 29.4.11 | infra | patch (verify Jest 30 support) |
| eslint + @eslint/js | 9.39.4 | 10.x | root | **MAJOR** |
| typescript-eslint | 8.59.3 | 8.60.1 | root | minor (verify ESLint 10 support) |

**Security**
- `vitest` CRITICAL → resolved by Vitest 4.1.8.
- `qs` moderate (transitive) → re-audit after Strands 1.4.0; if still present, add root `pnpm.overrides` `"qs": ">=6.15.2"`.

## Spec / Doc Update Surface (from grep)

- **research.md**: line 5 (status note "TS pinned 5.8.x"); §R0 table lines 32–40 (React/Vite/TS/Zustand/CDK/Node); TS row 34 (remove "deferred to post-MVP", document override decision); agentcore-cli refs lines 38, 90, 118; CDK ref line 101 ("v2.250.0+"); R1 Strands description (rc → 1.4.0 stable).
- **plan.md** (spec): line 18 ("TypeScript 5.8.x"); line 19 ("AWS CDK 2.250+", strands "latest stable", agentcore-cli 0.9.1).
- **quickstart.md**: line 15 ("AWS CDK CLI 2.250+"); line 218 ("CDK CLI ≥ 2.250.0").
- **tasks.md**: line 49 ("aws-cdk-lib 2.250+") — optional/historical.

## Verify During Implementation
- `@aws/agentcore-cli` latest (docs say 0.9.1) — `npm view @aws/agentcore-cli version`; update doc refs if newer stable exists.
- `typescript-eslint@8.60.1` supports ESLint 10 (bump further if required).
- `ts-jest@29.4.11` supports Jest 30.
- Latest Node 24.x for the research.md note (.nvmrc stays `24`).

## Todos (phased — see SQL for tracking)
- **P0 baseline**: confirm `pnpm run validate` + `pnpm audit` snapshot are understood before changes.
- **P-A**: patch/minor batch (all safe bumps incl. CDK lib+alpha lockstep) → validate.
- **P-B**: TypeScript 6.0.3 across all 4 workspaces → typecheck/build, fix breakage → validate.
- **P-C**: test tooling majors — Vitest 4 (fe/agent) + jsdom 29 (fe) + Jest 30/@types/jest 30 (infra) → fix configs → validate.
- **P-D**: ESLint 10 + @eslint/js 10 (verify typescript-eslint) → lint clean.
- **P-E**: Strands SDK rc.5 → 1.4.0 (agent) — review API changes, migrate code via TDD, keep tests green.
- **P-F**: infra `@types/node` 22 → 25 align → infra typecheck/test.
- **P-G**: security reconciliation — `pnpm audit` clean (add `qs` override if needed).
- **P-H**: spec/doc updates (research.md, plan.md, quickstart.md; verify agentcore-cli/Node).
- **P-I**: final `pnpm run validate` + `pnpm audit` clean; ensure `pnpm-lock.yaml` committed.

## Notes / Risks
- Highest-risk change is **Strands rc.5 → 1.4.0** (core agent SDK; likely API changes) and **TS 6.0** (type/tsconfig breakage across all workspaces). These are isolated into their own phases.
- Constitution **P6**: no new runtime deps added; only version bumps + (possibly) one `qs` override. Lockfile stays committed; audit must be clean before merge.
- No constitution amendment needed — the Technology Stack table does not pin a TypeScript version (TS-6 override is captured in research.md §R0 only).
- Work is largely **sequential** (shared root lockfile + shared validate gate), not parallelizable across workspaces.
