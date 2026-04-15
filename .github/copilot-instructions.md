# Copilot Instructions — Agent004 (Max Height)

## Project Overview

A cloud-only web application featuring an AI character inspired by Max Headroom — the iconic 1980s "computer-generated" TV presenter. The app delivers the full audiovisual experience in the browser: 3D animated talking head with lip-sync, glitch/CRT effects, a distinct personality, and voice output with stutter/pitch-shift effects.

- **Type**: Personal/educational fan project ("inspired by" Max Headroom)
- **Budget target**: Under $10/month
- **Architecture**: Serverless AWS backend (AgentCore) + static SPA frontend
- **IP note**: Max Headroom is owned by All3Media. This is a non-commercial fan project. Do not create exact replicas.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite (TypeScript) |
| 3D Rendering | React Three Fiber (Three.js) |
| AI Agent Backend | Strands Agents TypeScript SDK |
| Agent Hosting | Amazon Bedrock AgentCore Runtime |
| LLM | Amazon Bedrock (Claude 3.5 Haiku) |
| Voice Synthesis | Amazon Polly (Neural) |
| Voice Glitch FX | Web Audio API (client-side DSP) |
| Speech-to-Text | Web Speech API (browser built-in) |
| State Management | Zustand (client UI state only) |
| Authentication | Amazon Cognito Identity Pool |
| Agent Memory | Amazon Bedrock AgentCore Memory |
| Tool Integration | Amazon Bedrock AgentCore Gateway |
| Agent Identity | Amazon Bedrock AgentCore Identity |
| Observability | Amazon Bedrock AgentCore Observability |
| API Communication | WebSocket (AgentCore built-in streaming) |
| Frontend Hosting | S3 + CloudFront |
| Infrastructure | AWS CDK (S3/CloudFront/Cognito) + AgentCore CLI (Runtime/Gateway) |

## Project Structure

This is a monorepo using npm workspaces:

- `apps/web/` — React + Vite web app (SPA)
- `packages/agent/` — Strands Agent backend (AgentCore Runtime)
- `infrastructure/cdk/` — AWS CDK stacks (S3, CloudFront, Cognito)
- `infrastructure/agentcore/` — AgentCore CLI config (Runtime, Gateway, Memory)
- `docs/` — Project documentation and plans

## Coding Conventions

- **Language**: TypeScript everywhere (frontend and backend)
- **Module style**: ES modules (`import`/`export`)
- **Formatting**: Prettier defaults
- **Linting**: ESLint with TypeScript rules
- **Path aliases**: Use `@/` for `src/` in both apps/web and packages/agent
- **Naming**: PascalCase for components/types, camelCase for functions/variables, kebab-case for file names
- **State**: Zustand stores — no Redux, no Context API for global state
- **3D components**: React Three Fiber declarative JSX — avoid imperative Three.js where possible

## Architecture Principles

- **Cloud-only**: No on-device AI inference. All LLM and TTS runs server-side on AWS.
- **AgentCore-native**: Use AgentCore Runtime for agent hosting — not Lambda + API Gateway. AgentCore provides built-in WebSocket streaming, session isolation, and free I/O wait billing.
- **Streaming**: Bidirectional WebSocket for real-time token streaming. Never wait for full response.
- **Separation of concerns**:
  - Agent personality (system prompt + steering) is separate from voice/visual
  - TTS generation (server) is separate from audio effects (client DSP)
  - Viseme timing (server) is separate from lip-sync animation (client)
  - Conversation history is server-side (AgentCore Memory) — not client state
- **Graceful degradation**: Text-only works without mic. 2D fallback without WebGL. Friendly error if cloud is down.
- **Cost-conscious**: Claude 3.5 Haiku for LLM. Polly for TTS. AgentCore Gateway for external API tools. Cache where possible.

## AWS Configuration

- **Region**: `us-west-2`
- **Bedrock model**: Claude 3.5 Haiku (latest available)
- **Polly voice**: Neural, male, broadcaster cadence
- **AgentCore Runtime**: Container deployment via ECR
- **Authentication**: Cognito Identity Pool with unauthenticated (guest) access for temporary AWS credentials; browser SigV4-signs WebSocket connections

## Supply Chain Security

- Run `npm audit` before merging dependency changes
- Use `package-lock.json` — always commit it, never delete it
- Pin exact dependency versions in `package.json` (no `^` or `~` for production deps)
- Review new dependencies before adding: check maintainers, download counts, last publish date
- Prefer well-established packages from known orgs (e.g., pmndrs, aws-sdk, vercel)
- Use `npm audit signatures` to verify package provenance when available
- Keep dependencies minimal — don't add a package for something a few lines of code can do

## Don'ts

- Don't use Next.js — this is a pure SPA, no SSR needed
- Don't use Lambda + API Gateway for the agent — use AgentCore Runtime
- Don't use Redux or Context API for global state — use Zustand
- Don't store conversation history in client state — use AgentCore Memory
- Don't run AI inference on the client — all LLM/TTS is server-side
- Don't use ElevenLabs — too expensive for the budget target
- Don't route TTS through AgentCore Gateway — use direct Polly SDK for streaming performance
- Don't create exact replicas of the Max Headroom character (IP concerns)
- Don't store secrets in code — use AgentCore Identity for API keys, environment variables for AWS config
