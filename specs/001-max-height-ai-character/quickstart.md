# Quickstart: Max Height AI Character

**Feature**: 001-max-height-ai-character  
**Date**: 2026-04-19

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 24 LTS | [nodejs.org](https://nodejs.org/) |
| pnpm | 11.24.0 | `corepack enable` (uses the pinned `packageManager` version) |
| AWS CLI | 2.x | [aws.amazon.com/cli](https://aws.amazon.com/cli/) |
| AWS CDK CLI | 2.258+ | `npm install -g aws-cdk` |
| AgentCore CLI | 0.9+ | `npm install -g @aws/agentcore-cli` |
| Docker | 24+ | [docker.com](https://www.docker.com/) |

Only Node.js and pnpm are needed to install, build, and test the repo. The AWS
CLI, CDK CLI, AgentCore CLI, and Docker are required only for deploying.

`corepack enable` is preferred over `npm install -g pnpm@11.24.0` because the
version then comes from the `packageManager` field in the root `package.json`,
so it stays correct as that pin changes.

> **Note**: `.npmrc` sets `engine-strict=true`. On Node older than 24,
> `pnpm install` **fails outright** rather than warning. Check with `node -v`
> first; `.nvmrc` pins the major version for `nvm`/`fnm` users.

AWS account with Bedrock model access enabled for `anthropic.claude-haiku-4-5-20251001-v1:0` in your target region.

---

## Repository Structure

```
packages/
  frontend/          # React + Vite SPA
  agent/             # Strands agent for AgentCore Runtime
  infra/             # AWS CDK stacks
specs/               # Feature specifications (source of truth)
docs/                # Design documents, personality bible
```

---

## First-Time Setup

```bash
# Clone and install
git clone <repo-url>
cd Agent004
pnpm install

# Confirm the toolchain is healthy before going further
pnpm run validate                # lint → format:check → typecheck → build → test

# Configure AWS credentials — temporary (ASIA…) credentials only.
# Do NOT use long-lived IAM user access keys (AKIA…) on disk or in the repo. See constitution P11.
#
# If your account is NOT part of an AWS Organization, so IAM Identity Center (SSO)
# is unavailable: SSO only grants AWS-account access from an *organization*
# instance, and creating an organization would expire the free-tier credits
# immediately (conflicts with P2). Use the CloudShell export path instead:
#
#   1. Sign in to the AWS console as a least-privilege IAM user
#      (console password only — no access keys).
#   2. Open AWS CloudShell in the target region.
#   3. Run: aws configure export-credentials --format env-no-export
#   4. Copy the three ASIA… values into your local shell as env vars.
export AWS_ACCESS_KEY_ID=ASIA...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...
export AWS_REGION=us-west-2

# Bootstrap CDK (first time only)
cd packages/infra
npx cdk bootstrap
```

> **Note**: These credentials are short-lived and live only in the current
> shell — they expire with the CloudShell session, and nothing is written to
> `~/.aws`. Re-export them when they expire. On PowerShell use
> `$env:AWS_ACCESS_KEY_ID="ASIA..."` instead of `export`.

> **Note**: A single Zod 4 version is already forced across the workspace via the
> `overrides` block in `pnpm-workspace.yaml`, so the peer conflict described in
> `research.md §R1` should not occur. If you need to adjust it, edit it **there** —
> pnpm reads overrides only from `pnpm-workspace.yaml`. A top-level `overrides`
> key in `package.json` is npm-only, and pnpm 11 also ignores `pnpm.overrides`
> in `package.json`; either one is silently a no-op. Zod 4 includes a `zod/v3`
> compatibility mode for gradual migration. Avoid `--legacy-peer-deps` — it
> silently masks conflicts.

### SSM SecureString secrets (required before `cdk deploy`)

CloudFormation does **not** support creating SSM `SecureString` parameters,
so the agent's tool API keys must be created manually before deploying the
`AgentStack`. The stack imports them by name and surfaces the expected names
as CloudFormation outputs (`WeatherApiKeyParam`, `NewsApiKeyParam`).

```bash
# Weather API key (OpenWeather or your chosen provider)
aws ssm put-parameter \
  --name /max-height/weather-api-key \
  --type SecureString \
  --value "<your-weather-api-key>" \
  --overwrite

# News API key (NewsAPI.org or your chosen provider)
aws ssm put-parameter \
  --name /max-height/news-api-key \
  --type SecureString \
  --value "<your-news-api-key>" \
  --overwrite
```

If either parameter is missing at deploy time, the Lambda will fail to read
the key and the agent will reject tool invocations.

### Rollback

`AgentStack` publishes a Lambda version and a `live` alias on the WebSocket
handler. To roll back a bad deploy without rerunning CDK:

```bash
# List versions
aws lambda list-versions-by-function --function-name <FunctionName>

# Repoint the alias to a known-good version
aws lambda update-alias \
  --function-name <FunctionName> \
  --name live \
  --function-version <prior-version-number>
```

The `WebSocketHandlerLiveAliasArn` CloudFormation output is the alias ARN.

---

## Local Development

### Frontend

```bash
cd packages/frontend
pnpm run dev
# Opens at http://localhost:5173
```

The frontend dev server supports hot module replacement. Local mode uses mock WebSocket responses (no AWS credentials needed for UI development).

### Agent (local testing)

```bash
cd packages/agent
agentcore dev
# Starts local agent dev server with hot reload on port 8080
# Requires AWS credentials for Bedrock API calls
```

Alternatively, without the AgentCore CLI:

```bash
cd packages/agent
pnpm run dev
# Starts local agent server on port 8080
```

### Infrastructure

```bash
cd packages/infra
npx cdk synth          # Validate templates
npx cdk diff           # Preview changes
npx cdk deploy         # Deploy all stacks
```

---

## Running Tests

```bash
# Everything the CI gate runs, in order
pnpm run validate

# All tests
pnpm test

# By package
cd packages/frontend && pnpm test    # Vitest + RTL
cd packages/agent && pnpm test       # Vitest
cd packages/infra && pnpm test       # Jest + CDK assertions

# Coverage (v8 provider for Vitest packages, --coverage for Jest)
pnpm run test:coverage
```

Coverage reports are written to `coverage/` in each package (text summary plus
HTML and lcov). `coverage/` is git-ignored. Baseline at the 2026-08-30 refresh:
agent ~93% statements, frontend ~79%, infra 100%.

E2E requires a deployed stack **and** the Playwright browser binaries, which are
not installed by `pnpm install`:

```bash
cd packages/frontend
npx playwright install              # One time — downloads browser binaries
pnpm run test:e2e                   # Playwright
```

---

## Key Environment Variables

| Variable | Description | Required for |
|----------|-------------|--------------|
| `AWS_REGION` | Target AWS region (default `us-west-2`) | Agent, Infra, build scripts |
| `VITE_WS_ENDPOINT` | WebSocket API URL (set after deploy) | Frontend (prod) |
| `VITE_COGNITO_IDENTITY_POOL_ID` | Cognito pool ID (set after deploy) | Frontend (prod) |
| `VITE_MOCK_AGENT` | `true` for local UI dev without backend | Frontend (dev) |
| `NEWS_API_KEY` | API key for news provider (selected in research.md §R7) | Agent |
| `WEATHER_API_KEY` | API key for weather provider (selected in research.md §R7) | Agent |
| `WEB_SEARCH_API_KEY` | API key for web search provider (if required, TBD) | Agent |

CDK deploy outputs the WebSocket endpoint and Cognito pool ID. Copy these to `.env.local` in `packages/frontend/`.

---

## Deployment

### Agent (via AgentCore CLI)

```bash
cd packages/agent
agentcore deploy
# Deploys to AgentCore Runtime
```

### Infrastructure (via CDK)

```bash
cd packages/infra
npx cdk deploy --all
```

This deploys:
1. **CognitoStack** — Guest identity pool + IAM roles.
2. **AgentStack** — AgentCore Memory, WebSocket API + Lambda integration.
3. **FrontendStack** — S3 bucket + CloudFront distribution.
4. **BudgetStack** — Cost alerts ($5/$8 SNS) + hard-stop ($10 Lambda).

The agent itself is deployed separately via `agentcore deploy` (see above).

Post-deploy: update frontend `.env.local` with stack outputs, then `cd packages/frontend && pnpm run build && aws s3 sync dist/ s3://<bucket>`.

---

## Useful Commands

| Command | Description |
|---------|-------------|
| `pnpm run validate` | Full gate — lint, format:check, typecheck, build, test |
| `pnpm run lint` | ESLint across all packages |
| `pnpm run format` | Auto-fix formatting |
| `pnpm run format:check` | Verify formatting without writing |
| `pnpm run typecheck` | TypeScript compilation check |
| `pnpm run build` | Build all packages |
| `pnpm run test:coverage` | Tests with coverage report (v8 for Vitest, `--coverage` for Jest) |
| `pnpm audit --audit-level=moderate` | Dependency audit — **also run by CI** |

`pnpm run validate` does **not** include the audit. CI runs both, so run the
audit as well before opening a PR or CI can fail on a locally-green branch.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| VS Code: "Vitest not found in `agent`/`frontend` folder" | Expected on a fresh clone — the Vitest extension scans for `vitest.config.ts` before dependencies exist. Run `pnpm install`, then reload the window. **Do not** run the suggested `pnpm add -D vitest`; vitest is already a declared devDependency and re-adding it only churns `pnpm-lock.yaml`. |
| Prettier reformats hundreds of untouched files | Your clone predates `.gitattributes` (added in `060f925`), so the working tree still has CRLF endings while Prettier expects LF. Adding `.gitattributes` does not rewrite an existing working tree. Fix with `git add --renormalize .`, or simply re-clone. Verify with `git ls-files --eol` — only `*.ps1` files should show `w/crlf`. |
| `pnpm install` fails on an engine check | `.npmrc` sets `engine-strict=true` and the repo requires Node >= 24. Check `node -v` and upgrade. |
| `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` | pnpm 11.24+ rejects lockfile entries published too recently (this enforces constitution P6). Pick a slightly older release of the offending package. Because the check runs *before* resolution, a lockfile written by an older pnpm can't be patched in place — restore it with `git checkout -- pnpm-lock.yaml` and re-run `pnpm install` so resolution happens under the policy. |
| `ERR_PNPM_IGNORED_BUILDS` | A dependency wants to run a build script. Decide explicitly by adding it to `allowBuilds` in `pnpm-workspace.yaml` as `true` (allow) or `false` (deny). |
| `zod` peer dependency error | The workspace already forces a single Zod 4 version via `overrides` in **`pnpm-workspace.yaml`**. Adjust it there — pnpm ignores `overrides` and `pnpm.overrides` in `package.json`. |
| CDK bootstrap error | Ensure CDK CLI ≥ 2.258.0 and correct AWS region |
| Polly "not authorized" | Check Cognito guest role has `polly:SynthesizeSpeech` |
| WebSocket connection fails | Verify presigned URL generation, check Cognito identity pool |
| Agent cold start > 5s | Check container image size (target < 200MB) |
| Audio doesn't play on iOS | Ensure TV-on gesture unlocks AudioContext before playback |
| Playwright E2E fails with missing browsers | Run `npx playwright install` in `packages/frontend` |
| Tool API returns errors | Check `NEWS_API_KEY` / `WEATHER_API_KEY` env vars are set in agent container. See research.md §R7 for provider details |
