# Copilot Instructions — Agent004 (Max Headroom AI Clone)

## Project Overview

A cloud-only web application featuring an AI character inspired by Max Headroom — the iconic 1980s "computer-generated" TV presenter. The app delivers the full audiovisual experience in the browser: 3D animated talking head with lip-sync, glitch/CRT effects, Max's signature personality, and voice output with stutter/pitch-shift effects.

- **Type**: Personal/educational fan project ("inspired by" Max Headroom)
- **Budget target**: Under $10/month
- **Architecture**: Serverless AWS backend + static SPA frontend
- **IP note**: Max Headroom is owned by All3Media. This is a non-commercial fan project.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite (TypeScript) |
| 3D Rendering | React Three Fiber (Three.js) |
| AI Agent Backend | Strands Agents TypeScript SDK |
| Agent Hosting | AWS Lambda + API Gateway WebSocket |
| LLM | Amazon Bedrock (Claude 3.5 Haiku) |
| Voice Synthesis | Amazon Polly (Neural) |
| Voice Glitch FX | Web Audio API (client-side DSP) |
| Speech-to-Text | Web Speech API (browser built-in) |
| State Management | Zustand |
| API Communication | WebSocket (streaming) |
| Hosting | Vercel (free tier) or S3 + CloudFront |
| Infrastructure | AWS CDK or SAM |

## Project Structure

This is a monorepo using npm workspaces:

- `apps/web/` — React + Vite web app (SPA)
- `packages/agent/` — Strands Agent backend (Lambda)
- `infrastructure/` — AWS CDK or SAM templates
- `docs/` — Project documentation and plans

## Coding Conventions

- **Language**: TypeScript everywhere (frontend and backend)
- **Module style**: ES modules (`import`/`export`)
- **Formatting**: Prettier defaults
- **Linting**: ESLint with TypeScript rules
- **Path aliases**: Use `@/` for `src/` in both apps/web and packages/agent
- **Naming**: PascalCase for components/types, camelCase for functions/variables, kebab-case for file names
- **State**: Zustand stores in `stores/` directory — no Redux, no Context API for global state
- **3D components**: React Three Fiber declarative JSX — avoid imperative Three.js where possible

## Architecture Principles

- **Cloud-only**: No on-device AI inference. All LLM and TTS runs server-side on AWS.
- **Serverless**: Lambda + API Gateway. No long-running servers.
- **Streaming**: WebSocket for real-time token streaming. Never wait for full response.
- **Separation of concerns**:
  - Agent personality (system prompt + steering) is separate from voice/visual
  - TTS generation (server) is separate from audio effects (client DSP)
  - Viseme timing (server) is separate from lip-sync animation (client)
- **Graceful degradation**: Text-only works without mic. 2D fallback without WebGL. Friendly error if cloud is down.
- **Cost-conscious**: Use Claude 3.5 Haiku (cheapest frontier model). Cache where possible. Polly over ElevenLabs.

## Key Implementation Details

### Strands Agent (packages/agent/)
- System prompt defines Max's personality baseline (arrogant wit, phony bonhomie, TV presenter persona)
- Steering handlers enforce personality deterministically — don't rely on prompt alone
  - `personality-guard.ts` — LLM-as-judge to reject out-of-character responses
  - `stutter-injection.ts` — Text post-processing to inject stutter markup (e.g., `W-w-well`)
  - `catchphrase-trigger.ts` — Context-aware injection of Max-isms
  - `topic-deflection.ts` — Routes topics through Max's TV/media lens
- Tools: weather, news, TTS (Polly), viseme timing
- Lambda handler manages WebSocket connections

### Audio Pipeline (apps/web/src/services/audio/)
- Web Audio API for all client-side DSP effects
- Effects chain: pitch modulation → stutter loops → static bursts → echo/reverb
- Audio chunks streamed from server, processed in real-time
- Stutter effect replays syllable segments based on markup from agent

### 3D Avatar (apps/web/src/components/avatar/)
- GLB/GLTF model with viseme morph targets for lip-sync
- Expression morph targets mapped to emotion tags from agent output
- CRT/glitch shader (GLSL): scan lines, chromatic aberration, signal interference
- Geometric background: rotating wireframe shapes, 80s color palette (blues, purples, cyans)
- Target 60fps on modern hardware

### WebSocket Communication
- API Gateway WebSocket → Lambda
- Token-by-token streaming from Strands agent
- Audio chunks streamed as generated
- Viseme events synchronized with audio

## Implementation Phases

Build inside-out — personality first, then layers:

1. **Project Scaffolding & Text Chat** — React+Vite app, Strands Agent, WebSocket, text-only Max
2. **Personality Steering & Tools** — Steering handlers, weather/news tools, personality evals
3. **Voice Pipeline** — Polly TTS, Web Audio DSP effects, Web Speech API input, viseme timing
4. **3D Avatar & Scene** — GLB model, React Three Fiber, lip-sync, expressions, idle animations
5. **Visual Effects & Background** — CRT shader, geometric background, glitch sync
6. **Integration & Polish** — Sync all layers, error handling, responsive design, PWA
7. **Stretch Goals** — Channels, wake word, conversation history, AR mode

## AWS Configuration

- **Region**: `us-west-2`
- **Bedrock model**: `anthropic.claude-3-5-haiku-20241022-v1:0` (or latest Haiku)
- **Polly voice**: Neural, male, broadcaster cadence (e.g., `Matthew` or `Stephen`)
- **Lambda runtime**: Node.js 20.x
- **API Gateway**: WebSocket API

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
- Don't use Redux or Context API for global state — use Zustand
- Don't run AI inference on the client — all LLM/TTS is server-side
- Don't use ElevenLabs — too expensive for the budget target
- Don't create exact replicas of the Max Headroom character (IP concerns)
- Don't store secrets in code — use environment variables and AWS Secrets Manager
