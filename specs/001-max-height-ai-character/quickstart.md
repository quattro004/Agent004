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
| AWS CDK CLI | 2.250+ | `npm install -g aws-cdk` |
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

# Configure AWS credentials
aws configure                    # Or use SSO / env vars

# Bootstrap CDK (first time only)
cd packages/infra
npx cdk bootstrap
```

> **Note**: If a Zod peer dependency conflict occurs between `@strands-agents/sdk` and transitive dependencies still on Zod 3, add an `overrides` block to the root `package.json`: `"overrides": { "zod": "^4.3.6" }`. Zod 4 includes a `zod/v3` compatibility mode for gradual migration. Avoid `--legacy-peer-deps` — it silently masks conflicts. See `research.md §R1` for details.

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
| `AWS_REGION` | Target AWS region | Agent, Infra |
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
| CDK bootstrap error | Ensure CDK CLI ≥ 2.250.0 and correct AWS region |
| Polly "not authorized" | Check Cognito guest role has `polly:SynthesizeSpeech` |
| WebSocket connection fails | Verify presigned URL generation, check Cognito identity pool |
| Agent cold start > 5s | Check container image size (target < 200MB) |
| Audio doesn't play on iOS | Ensure TV-on gesture unlocks AudioContext before playback |
| Tool API returns errors | Check `NEWS_API_KEY` / `WEATHER_API_KEY` env vars are set in agent container. See research.md §R7 for provider details |
