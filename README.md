# Max Height

_Inspired by Max Headroom — the iconic 1980s "computer-generated" TV presenter_

## About

Max Height is an interactive AI character you talk to in your browser. Flip the TV's power switch and a stylized talking head greets you from inside a glitchy CRT monitor — stuttering, editorializing, and refusing to give a straight answer, just like the original. Type to Max (voice input is available where your browser supports it); he replies with his signature rapid-fire, self-important, media-saturated persona. The plan is for him to remember prior visits (loosely) and pretend to know you.

This is a **non-commercial fan project** for a friends-and-family audience. It is not affiliated with or endorsed by the Max Headroom rights holders.

## Key Features

- **Personality-first AI** — Max's character is the product. A detailed personality bible governs his speech patterns, stutter taxonomy, editorial deflection, and 80s-through-a-modern-lens worldview.
- **Voice in, voice out** — press-and-hold mic input (Web Speech API) with Amazon Polly Neural TTS output, plus real-time stutter and pitch-glitch audio DSP in the browser.
- **Retro TV presentation** — a CRT bezel with scanline/static effects, a power switch, and volume and channel knobs. The channel knob cycles Max through retro, pop-art, and cartoon looks.
- **Graceful degradation** — no mic → text input; cloud down → in-character "signal lost" state. Never a white screen.
- **Cloud-only architecture** — all AI inference runs server-side; nothing heavy in the browser.

## Architecture

The table shows the target design; not every piece is built yet. The wiki's [Feature-Max-Height-Core](https://github.com/quattro004/Agent004/wiki/Feature-Max-Height-Core) page tracks what is built and what is open.

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

You need a current Node.js (the major version is in [`.nvmrc`](.nvmrc)) and pnpm.
Install `pnpm` however you like; it then switches itself to the exact pnpm and
Node versions pinned in [`package.json`](package.json), so nobody has to match
them by hand. `.npmrc` enforces the engine check, so an older Node makes
`pnpm install` fail rather than warn.

```bash
git clone https://github.com/quattro004/Agent004.git
cd Agent004

pnpm install
pnpm run validate    # lint → format:check → typecheck → build → test
```

`validate` is the quality gate: run it before any PR. CI also runs
`pnpm audit --audit-level=moderate`, which `validate` does not, so run that too
or a locally green branch can still fail CI. The wiki's
[Guide-Local-Setup](https://github.com/quattro004/Agent004/wiki/Guide-Local-Setup)
and [Guide-Validation-Gate](https://github.com/quattro004/Agent004/wiki/Guide-Validation-Gate)
cover the toolchain pinning, individual scripts, and known traps.

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

The source code is released under the [MIT License](LICENSE). The license covers this project's own code and content only; it grants no rights to the Max Headroom character or any related trademark, likeness, or voice.
