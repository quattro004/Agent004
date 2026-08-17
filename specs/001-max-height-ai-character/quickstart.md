# Quickstart: Max Height AI Character

**Feature**: 001-max-height-ai-character  
**Date**: 2026-04-19

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 24 LTS | [nodejs.org](https://nodejs.org/) |
| pnpm | 11+ | `npm install -g pnpm@11.0.8` |
| AWS CLI | 2.x | [aws.amazon.com/cli](https://aws.amazon.com/cli/) |
| AWS CDK CLI | 2.258+ | `npm install -g aws-cdk` |
| AgentCore CLI | 0.9+ | `npm install -g @aws/agentcore-cli` |
| Docker | 24+ | [docker.com](https://www.docker.com/) |

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
pnpm install                     # See note below if Zod peer conflict arises

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

> **Note**: If a Zod peer dependency conflict occurs between `@strands-agents/sdk` and transitive dependencies still on Zod 3, add an `overrides` block to the root `package.json`: `"overrides": { "zod": "^4.3.6" }`. Zod 4 includes a `zod/v3` compatibility mode for gradual migration. Avoid `--legacy-peer-deps` — it silently masks conflicts. See `research.md §R1` for details.

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
# All tests
pnpm test

# By package
cd packages/frontend && pnpm test    # Vitest + RTL
cd packages/agent && pnpm test       # Vitest
cd packages/infra && pnpm test       # Jest + CDK assertions

# E2E (requires deployed stack)
cd packages/frontend && pnpm run test:e2e   # Playwright
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
| `pnpm run lint` | ESLint across all packages |
| `pnpm run typecheck` | TypeScript compilation check |
| `pnpm run build` | Build all packages |
| `pnpm run test:coverage` | Tests with coverage report |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `zod` peer dependency error | Add `"overrides": { "zod": "^4.3.6" }` to root `package.json`, then `pnpm install`. |
| CDK bootstrap error | Ensure CDK CLI ≥ 2.258.0 and correct AWS region |
| Polly "not authorized" | Check Cognito guest role has `polly:SynthesizeSpeech` |
| WebSocket connection fails | Verify presigned URL generation, check Cognito identity pool |
| Agent cold start > 5s | Check container image size (target < 200MB) |
| Audio doesn't play on iOS | Ensure TV-on gesture unlocks AudioContext before playback |
| Tool API returns errors | Check `NEWS_API_KEY` / `WEATHER_API_KEY` env vars are set in agent container. See research.md §R7 for provider details |
