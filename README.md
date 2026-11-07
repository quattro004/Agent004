# Max Height

_Inspired by Max Headroom — the iconic 1980s "computer-generated" TV presenter_

## About

Max Height is an interactive AI character you talk to in your browser. Flip the TV's power switch and a stylized talking head greets you from inside a glitchy CRT monitor — stuttering, editorializing, and refusing to give a straight answer, just like the original. Type to Max (voice input is available where your browser supports it); he replies with his signature rapid-fire, self-important, media-saturated persona. The plan is for him to remember prior visits (loosely) and pretend to know you.

This is a **non-commercial fan project** for a friends-and-family audience. It is not affiliated with or endorsed by the Max Headroom rights holders.

## Status

Work in progress, **not yet deployed to AWS**. The frontend runs locally with pre-generated greetings; the agent and infrastructure code exist and are tested, but the pieces below are still ahead:

- A live end-to-end conversation: the WebSocket handler still emits placeholder frames and the agent replies in one chunk, not streamed tokens.
- AgentCore Runtime and AgentCore Memory resources in CDK (the memory client is a stub).
- Invite-only sign-in. The guest Cognito identity pool in the code today is being replaced before first deployment.
- The 3D avatar and the installable PWA.

The wiki's [Feature-Max-Height-Core](https://github.com/quattro004/Agent004/wiki/Feature-Max-Height-Core) page tracks what is built, verified, and open.

## Key Features

- **Personality-first AI** — Max's character is the product. A detailed personality bible governs his speech patterns, stutter taxonomy, editorial deflection, and 80s-through-a-modern-lens worldview. A 65-case golden-set rubric gates quality before any visual polish ships.
- **Voice in, voice out** — press-and-hold mic input (Web Speech API) with Amazon Polly Neural TTS output, plus real-time stutter and pitch-glitch audio DSP in the browser.
- **Retro TV presentation** — a CRT bezel with scanline/static effects, a power switch, and volume and channel knobs. The channel knob cycles Max through retro, pop-art, and cartoon looks. The avatar is 2D today; a 3D React Three Fiber model with Polly viseme lip-sync is planned for V1.
- **Graceful degradation** — no mic → text input; cloud down → in-character "signal lost" state. Never a white screen. (A 2D fallback for the planned 3D avatar comes with it.)
- **Cloud-only architecture** — all AI inference runs server-side; nothing heavy in the browser.
- **$10/month hard budget cap** — email alarms at $5, $8, and $10, with the $10 alarm triggering a hard stop of guest spend. A soft-degrade at $8 (TTS off, text continues) is specified and has a frontend consumer, but nothing triggers it yet.

## Architecture

The table shows the target design; see [Status](#status) for what exists today.

| Layer         | Technology                                                                                         |
| ------------- | -------------------------------------------------------------------------------------------------- |
| Frontend      | React + Vite SPA, Zustand, Web Audio API (React Three Fiber planned for the 3D avatar)             |
| Agent Backend | Strands Agents SDK on Amazon Bedrock AgentCore Runtime                                             |
| LLM           | Amazon Bedrock — Claude Haiku 4.5                                                                  |
| TTS           | Amazon Polly Neural (direct SDK, streaming)                                                        |
| STT           | Web Speech API (browser built-in)                                                                  |
| Auth          | Amazon Cognito Identity Pool — guest access today, moving to invite-only sign-in before deployment |
| Memory        | AgentCore Memory (30-day rolling window) — not yet wired                                           |
| Observability | AgentCore Observability (traces, metrics, logs)                                                    |
| Hosting       | S3 + CloudFront                                                                                    |
| IaC           | AWS CDK (all infrastructure, including AgentCore resources)                                        |

## Repo Layout

```
packages/
  frontend/           # React + Vite SPA
  agent/              # Strands agent for AgentCore Runtime
  infra/              # All AWS resources via CDK
  repo-tools/         # Repository hygiene tooling (wiki linter)
specs/                # Feature specifications (authoritative while a feature is built)
docs/                 # Design documents, personality bible
.specify/             # Spec Kit config and the project constitution
```

Current-state documentation lives on the [project wiki](https://github.com/quattro004/Agent004/wiki) (start at its `Index`); it is a separate git repo, cloned to a gitignored `wiki/` directory if you want it locally.

## Getting Started

Requires **Node.js 24** and **pnpm 11** to bootstrap. After that the repo pins its
own toolchain: pnpm installs the exact pnpm and Node versions this project is
built and tested against, so nobody has to match them by hand.

```bash
git clone https://github.com/quattro004/Agent004.git
cd Agent004

node -v                  # must be 24.x — `nvm use` / `fnm use` reads .nvmrc
npm install -g pnpm@11   # only if you don't already have pnpm

pnpm install             # self-switches pnpm, then downloads the pinned Node
```

Two pins are in play, both resolved by `pnpm install`:

| Tool | Declared in                    | How it's applied                                                  |
| ---- | ------------------------------ | ----------------------------------------------------------------- |
| pnpm | `packageManager` (exact)       | pnpm re-executes as that version — `pnpm -v` prints `11.24.0`     |
| Node | `devEngines.runtime` (`^24.x`) | pnpm downloads it and runs every script on it, pinned by checksum |

So `node -v` may print `24.14.0` while `pnpm exec node -v` prints `24.20.0` —
that is working as intended. Scripts, builds, and tests all use the pinned Node,
which is what CI runs too.

Notes:

- **No Corepack required.** Node removed Corepack from its distribution in Node
  25+, and pnpm 11 has a built-in equivalent: the
  [`pmOnFail`](https://pnpm.io/settings/cli#pmonfail) setting (default
  `download`) makes pnpm fetch and run the version declared in `packageManager`.
  `corepack enable` still works on Node 24 but is redundant here.
- `.npmrc` sets `engine-strict=true`, so an older Node makes `pnpm install` fail
  outright rather than warn — hence the `node -v` check before installing.
- `.nvmrc` still pins the major for `nvm`/`fnm` and for CI's `actions/setup-node`.
  A test guards it against drifting from `devEngines.runtime`.
- On Windows, pnpm recommends installing via npm — Microsoft Defender sometimes
  blocks the standalone installer. On macOS/Linux you can instead use
  `curl -fsSL https://get.pnpm.io/install.sh | sh -`.
- If you manage toolchains with asdf, mise, or Volta, set `pmOnFail: ignore` and
  `runtimeOnFail: ignore` in `pnpm-workspace.yaml` locally so pnpm defers to your
  version manager.

Then run the quality gate to confirm your environment is healthy:

```bash
pnpm run validate    # lint → format:check → typecheck → build → test
```

| Command                             | Purpose                             |
| ----------------------------------- | ----------------------------------- |
| `pnpm run validate`                 | Full gate — run before any PR       |
| `pnpm audit --audit-level=moderate` | Dependency audit — CI runs this too |
| `pnpm run lint`                     | ESLint                              |
| `pnpm run format`                   | Auto-fix formatting                 |
| `pnpm run typecheck`                | TypeScript project build            |
| `pnpm run test`                     | All workspace tests                 |
| `pnpm run test:coverage`            | All workspace tests + coverage      |

`validate` does not include the audit, but CI runs both — run the audit too, or a
locally-green branch can still fail CI.

If your editor's Vitest extension reports "Vitest not found" right after cloning,
that is expected before `pnpm install`; install, then reload the window. Don't run
the `pnpm add -D vitest` it suggests — vitest is already a declared dependency.

Per-package development:

```bash
cd packages/frontend && pnpm run dev     # Vite dev server
cd packages/agent    && pnpm run dev     # Agent watch mode
cd packages/infra    && npx cdk synth -c budgetAlertEmail=<owner email>   # Synthesize CDK stacks
```

The budget stack refuses to synthesize without an owner email for its alerts.
Pass it with `-c` and never commit it: the repo is public.

Deploying to AWS additionally requires the AWS CLI, CDK CLI, Docker, and
credentials. See
[`specs/001-max-height-ai-character/quickstart.md`](specs/001-max-height-ai-character/quickstart.md)
for the full setup, including the credentials policy (temporary `ASIA…`
credentials only).

## Contributing

- Read `.specify/memory/constitution.md`, the wiki `Index`, and the relevant folder under `specs/` before writing code. [`AGENTS.md`](AGENTS.md) has the working rules for contributors and AI assistants.
- This project uses **TDD**: write a failing test first, then the implementation. New user-facing capabilities start with a Spec Kit spec.
- `pnpm run validate` must pass before opening a PR, and so must CI's `CI` and `Audit` checks. `main` is protected: work on a `type/kebab-case-description` branch and open a PR.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/).

## Legal

Max Height is a personal fan tribute inspired by Max Headroom. The name, likeness, and voice are deliberately distinct from the original character. No Matt Frewer voice cloning. Not a commercial product.
