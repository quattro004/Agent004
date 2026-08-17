# Max Height

_Inspired by Max Headroom — the iconic 1980s "computer-generated" TV presenter_

## About

Max Height is an interactive AI character you talk to in your browser. Open the page, click "Turn on the TV," and a stylized talking head greets you from inside a glitchy CRT monitor — stuttering, editorializing, and refusing to give a straight answer, just like the original. Speak or type; Max replies in voice and on-screen text with his signature rapid-fire, self-important, media-saturated persona. He remembers prior visits (loosely) and pretends to know you.

This is a **non-commercial fan project** for a friends-and-family audience. It is not affiliated with or endorsed by the Max Headroom rights holders.

## Key Features

- **Personality-first AI** — Max's character is the product. A detailed personality bible governs his speech patterns, stutter taxonomy, editorial deflection, and 80s-through-a-modern-lens worldview. A 50-case golden-set rubric gates quality before any visual polish ships.
- **Voice in, voice out** — press-and-hold mic input (Web Speech API) with Amazon Polly Neural TTS output, plus real-time stutter and pitch-glitch audio DSP in the browser.
- **3D avatar with lip-sync** — React Three Fiber head-and-shoulders model inside a CRT bezel, driven by Polly viseme data, with continuous scanline/glitch effects. (MVP ships with a 2D placeholder; 3D arrives in V1.)
- **Graceful degradation** — no WebGL → 2D fallback; no mic → text input; cloud down → in-character "signal lost" state. Never a white screen.
- **Installable PWA** — add to home screen on mobile or desktop; app-shell caching for offline launch with an in-character offline state.
- **Cloud-only architecture** — all AI inference runs server-side; nothing heavy in the browser.
- **$10/month hard budget cap** — automated alarms, soft-degrade at $8 (TTS off, text continues), hard-stop at $10.

## Architecture

| Layer         | Technology                                                  |
| ------------- | ----------------------------------------------------------- |
| Frontend      | React + Vite SPA, React Three Fiber, Zustand, Web Audio API |
| Agent Backend | Strands Agents SDK on Amazon Bedrock AgentCore Runtime      |
| LLM           | Amazon Bedrock — Claude 3.5 Haiku                           |
| TTS           | Amazon Polly Neural (direct SDK, streaming)                 |
| STT           | Web Speech API (browser built-in)                           |
| Auth          | Amazon Cognito Identity Pool (guest/unauthenticated)        |
| Memory        | AgentCore Memory (30-day rolling window)                    |
| Observability | AgentCore Observability (traces, metrics, logs)             |
| Hosting       | S3 + CloudFront                                             |
| IaC           | AWS CDK (all infrastructure, including AgentCore resources) |

## Repo Layout

```
apps/web/               # React + Vite SPA
packages/agent/         # Strands agent backend + Dockerfile
infrastructure/cdk/     # All AWS resources via CDK
docs/                   # Specs, personality bible, plans
```

## Legal

Max Height is a personal fan tribute inspired by Max Headroom. The name, likeness, and voice are deliberately distinct from the original character. No Matt Frewer voice cloning. Not a commercial product.
