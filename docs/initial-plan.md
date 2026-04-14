# Max Headroom AI Clone — Cloud-Only Web App

## Problem Statement

Build a web application featuring an AI character inspired by Max Headroom — the iconic 1980s "computer-generated" TV presenter. The app delivers the full audiovisual experience in the browser: 3D animated talking head with lip-sync, glitch/CRT effects, Max's signature personality, and voice output with stutter/pitch-shift effects. Cloud-only architecture, no native mobile app. Target budget: **under $10/month**.

## Key Constraints

- **Cloud-only**: No on-device AI inference. All LLM and TTS processing happens server-side.
- **Web-only**: No native mobile app. Works on phones, tablets, and desktops via the browser.
- **Budget**: Under $10/month for educational/personal use.
- **IP/Copyright**: Max Headroom character owned by All3Media. This project is a personal/educational "inspired-by" project, not a commercial product. Cannot legally clone Matt Frewer's voice without rights.

## Proposed Approach

**Tiered build — personality first, then layers:**

The most important thing is getting Max's *personality* right. A perfectly rendered 3D avatar with a bland personality is worse than a text box with a pitch-perfect Max. Build inside-out:

1. Get the Strands agent personality nailed (text-only)
2. Add voice synthesis + glitch audio effects
3. Add 3D avatar with lip-sync
4. Add CRT visual effects and background
5. Polish and integrate everything

---

## Cost Analysis (Target: < $10/month)

Assuming casual/educational use (~20-50 messages/day, ~600-1500 messages/month):

| Service | Cost | Notes |
|---------|------|-------|
| **LLM (Amazon Bedrock — Claude 3.5 Haiku)** | ~$0.30–1.50/mo | ~$0.001 per message at casual use |
| **TTS (Amazon Polly)** | ~$0.50–2.00/mo | $4/1M characters; ~100-300 chars/response |
| **AWS Lambda** | $0/mo | Free tier: 1M requests/month |
| **API Gateway WebSocket** | ~$0.10/mo | $1/1M messages |
| **Web hosting (Vercel free tier)** | $0/mo | Static site + edge functions |
| **Total estimated** | **~$1–4/month** | Well under $10 target |

**Cost optimization levers:**
- Use Claude 3.5 Haiku (cheapest frontier model) vs Sonnet/Opus
- Amazon Polly Neural is high quality at a fraction of ElevenLabs pricing
- Browser's built-in SpeechSynthesis API is free but lower quality (fallback option)
- Cache common responses (weather greetings, etc.)
- AWS free tier covers Lambda and partial API Gateway

**Web interface?** — Yes, the web app IS the interface. Any device with a modern browser gets the full Max experience: 3D avatar, voice, glitch effects. Phones, tablets, desktops — all via the browser.

---

## Questions You Should Be Asking (Max Headroom Authenticity)

To make this as close to the real Max Headroom as possible, here are the key questions to consider:

### Personality & Character
1. **Which Max?** — There were multiple versions: the Channel 4 music show host (1985), the TV movie "20 Minutes into the Future" (1985), and the ABC series (1987-88). Each had slightly different tones. Which version is your reference?
2. **How abrasive?** — Real Max ranged from charmingly sarcastic to genuinely cutting. Do you want a dial on this, or a fixed personality intensity?
3. **Knowledge era** — Should Max know about 2026 events and comment on them through his 80s lens? Or should he think it's still the 1980s? (The satirical contrast of an 80s AI commenting on modern tech could be gold.)
4. **Catchphrases** — Which Max-isms are essential? ("I'm Max Headroom!", the stuttering repetition, "blipvert", his tendency to riff on anything you say, his fake laughs). Make a list of must-haves.
5. **Ethical boundaries** — Max was provocative and made fun of everyone. How far should the AI go? The original character was satirical about media, corporations, and celebrity culture. Should this Max have guardrails?

### Voice & Audio
6. **Voice character** — You can't legally clone Matt Frewer's voice. What "inspired-by" voice qualities matter most? (Slightly nasal, broadcaster cadence, smug tone, British-ish accent?)
7. **Stutter intensity** — How frequent should the signature stuttering/glitching be? Every sentence? Every few sentences? Triggered by certain topics?
8. **Audio effects priority** — Rank these: stutter loops, pitch shifts, static bursts, echo/reverb, signal degradation. Which are most essential to "feeling like Max"?

### Visual / Avatar
9. **Art style** — Photorealistic attempt, stylized/cartoon, or intentionally retro low-poly (matching the 80s CG aesthetic)? The original was actually a human actor in prosthetic makeup — it wasn't actually CG.
10. **Background** — The rotating geometric shapes are iconic. Any specific shapes, colors, or motion styles that feel essential? (Blues, purples, cyans, rotating wireframe cubes/pyramids?)
11. **Glitch frequency** — How often should the CRT/visual glitch effects fire? Constant subtle scan lines + occasional dramatic glitches? Or more aggressive?

### Interaction Model
12. **How does Max greet you?** — Does he launch into a monologue? Wait for you to speak? Make fun of you for taking so long?
13. **Conversation depth** — Should Max remember earlier conversations, or is each session fresh? (Memory adds cost and complexity but improves character.)
14. **"Search engine" mode** — When Max answers factual questions (weather, news), should he still editorialize and comment? ("The weather? Oh, you want ME to tell you about the WEATHER? *stutters* Fine. It's 72 and sunny in — but honestly, who cares about weather when the REAL storm is...")
15. **Tool integration** — For real-time data (weather, news), which APIs matter to you? (OpenWeatherMap, NewsAPI, etc.) These become "tools" the Strands agent can call.

### Meta / Project
16. **IP comfort level** — How close to the original do you want to push it? "Inspired by" with a different name? Or explicitly "Max Headroom fan project"?
17. **Audience** — Just you? Friends/family? Public demo? This affects hosting tier and rate limiting.
18. **Iteration speed** — Would you rather get a text-only Max personality working quickly, then layer on voice and visuals? Or build all layers in parallel?

---

## Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Web Framework** | React + Vite (TypeScript) | Fast, lightweight, great DX |
| **3D Rendering** | React Three Fiber (Three.js) | WebGL in browser — mature, well-supported |
| **AI Agent Backend** | Strands Agents TypeScript SDK | Personality steering, tool use, streaming |
| **Agent Hosting** | AWS Lambda + API Gateway WebSocket | Serverless, cheap at low volume |
| **LLM Provider** | Amazon Bedrock (Claude 3.5 Haiku) | Cheapest quality option for personality |
| **Voice Synthesis** | Amazon Polly (Neural) | Good quality, very cheap ($4/1M chars) |
| **Voice Glitch FX** | Web Audio API (client-side DSP) | Stutter loops, pitch shifts, static — all in browser |
| **Speech-to-Text** | Web Speech API (browser built-in) | Free, no backend needed |
| **State Management** | Zustand | Lightweight, TypeScript-friendly |
| **API Communication** | WebSocket (streaming) | Real-time token streaming for responsive avatar |
| **Hosting** | Vercel (free tier) or S3 + CloudFront | Static site deployment |

---

## Architecture Overview

```
┌──────────────────────────────────────────┐
│         Browser (Any Device)             │
│  ┌────────────────────────────────────┐  │
│  │   React Three Fiber Scene          │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │  Max 3D Avatar (GLB)         │  │  │
│  │  │  - Viseme lip-sync           │  │  │
│  │  │  - Facial expressions        │  │  │
│  │  │  - Glitch shader FX (GLSL)   │  │  │
│  │  └──────────────────────────────┘  │  │
│  │  Geometric animated background     │  │
│  │  CRT overlay (scan lines, curve)   │  │
│  └────────────────────────────────────┘  │
│  ┌──────────┐  ┌──────────────────────┐  │
│  │ Mic In   │  │ Audio Playback       │  │
│  │ (Web     │  │ + Web Audio API      │  │
│  │  Speech  │  │   DSP Glitch FX      │  │
│  │  API)    │  │   (stutter, pitch,   │  │
│  └────┬─────┘  │    static bursts)    │  │
│       │        └──────────▲───────────┘  │
│       ▼                   │              │
│  ┌────────────────────────┼───────────┐  │
│  │  WebSocket Client      │           │  │
│  └────────┬───────────────┘           │  │
└───────────┼───────────────────────────┘
            │ wss://
            ▼
┌──────────────────────────────────────────┐
│        Cloud Backend (AWS)               │
│  ┌────────────────────────────────────┐  │
│  │  API Gateway (WebSocket)           │  │
│  │         │                          │  │
│  │         ▼                          │  │
│  │  AWS Lambda                        │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │  Strands Agent (TypeScript)  │  │  │
│  │  │  ┌────────────────────────┐  │  │  │
│  │  │  │  Max Headroom Persona  │  │  │  │
│  │  │  │  System Prompt         │  │  │  │
│  │  │  └────────────────────────┘  │  │  │
│  │  │  ┌────────────────────────┐  │  │  │
│  │  │  │  Steering Plugins      │  │  │  │
│  │  │  │  - Personality guard   │  │  │  │
│  │  │  │  - Stutter injection   │  │  │  │
│  │  │  │  - Tone enforcement    │  │  │  │
│  │  │  │  - Catchphrase hooks   │  │  │  │
│  │  │  └────────────────────────┘  │  │  │
│  │  │  ┌────────────────────────┐  │  │  │
│  │  │  │  Tools                 │  │  │  │
│  │  │  │  - Weather API         │  │  │  │
│  │  │  │  - News API            │  │  │  │
│  │  │  │  - TTS generation      │  │  │  │
│  │  │  │  - Viseme timing       │  │  │  │
│  │  │  └────────────────────────┘  │  │  │
│  │  └──────────────────────────────┘  │  │
│  └────────────────────────────────────┘  │
│  ┌───────────┐  ┌─────────────────────┐  │
│  │ Bedrock   │  │  Amazon Polly       │  │
│  │ (Claude   │  │  (Neural TTS)       │  │
│  │  Haiku)   │  │                     │  │
│  └───────────┘  └─────────────────────┘  │
└──────────────────────────────────────────┘
```

---

## Can We Train Max's Personality?

**Yes — via prompt engineering + Strands steering hooks.** Here's how each trait maps:

### Voice & Speech Patterns
- **Stuttering**: Strands steering handler injects stutter markup (`W-w-well`) into agent output before TTS
- **Pitch shifting**: Audio DSP post-processing on TTS output — random pitch modulation per phrase
- **Static/glitch**: Audio buffer manipulation — insert micro-bursts of static, repeat syllables

### Personality & Demeanor
- **System prompt**: Detailed persona definition — arrogant wit, phony bonhomie, assumes instant familiarity, commentary on everything, ironic self-importance
- **Steering handler (personality guard)**: Intercepts model responses and validates tone using LLM-as-judge — rejects responses that break character
- **Steering handler (catchphrase triggers)**: Injects Max-isms based on conversation context

### Visual/Facial Expressions
- **Morph target animations**: Map emotion tags from agent output to facial blend shapes
- **Glitch shader**: Custom GLSL fragment shader for CRT scan lines, chromatic aberration, signal distortion
- **Geometric background**: Animated wireframe shapes (Amiga-era aesthetic) via Three.js

### What We Can't Do (IP Constraints)
- Cannot clone Matt Frewer's actual voice (need a "Max-inspired" synthetic voice)
- Should style the avatar as "inspired by" rather than an exact replica
- Position as fan art / educational project

---

## Implementation Phases

### Phase 1: Project Scaffolding & Max's Brain (Text Chat)
Get Max talking — personality is the foundation.

- Initialize React + Vite project with TypeScript
- Set up project structure (components, services, hooks, types)
- Configure ESLint, Prettier, path aliases
- Create Strands Agent backend (Node.js/TypeScript on AWS Lambda)
- Write Max Headroom system prompt (personality, speech patterns, verbal tics)
- Implement WebSocket API endpoint (API Gateway + Lambda)
- Build simple text chat UI in browser
- End-to-end text conversation working: you type → Max responds in character

### Phase 2: Personality Steering & Tools
Make Max reliably stay in character and be useful.

- Create personality guard steering handler (LLM-as-judge for tone)
- Create stutter injection steering handler (text post-processing with markup)
- Create catchphrase trigger handler (context-aware Max-isms)
- Create topic deflection handler (Max comments through a TV/media lens)
- Integrate "search engine" tools:
  - Weather API tool (OpenWeatherMap or similar)
  - News headlines tool (NewsAPI or similar)
  - General knowledge (LLM's training data)
- Write evaluation test cases for personality consistency
- Validate Max stays in character even with factual tool responses

### Phase 3: Voice Pipeline
Give Max his voice — synthesis + the signature glitch effects.

- Integrate Amazon Polly Neural TTS (server-side, streamed to client)
- Select/configure voice (male, broadcaster cadence, slightly nasal)
- Build client-side Web Audio API DSP pipeline:
  - Pitch modulation (random per-phrase shifts)
  - Stutter loop effect (repeat syllable segments from stutter markup)
  - Static burst insertion (micro-bursts of white noise)
  - Slight echo/reverb (broadcast studio feel)
- Integrate Web Speech API for microphone input (browser STT)
- Generate viseme timing data from TTS output
- Stream audio chunks to browser with synchronized viseme events
- Add talk/listen mode toggle (push-to-talk or voice activity detection)

### Phase 4: 3D Avatar & Scene
Build the visual Max experience in the browser.

- Create/source Max-inspired 3D head model (GLB/GLTF with blend shapes):
  - Viseme morph targets (mouth shapes for lip-sync)
  - Expression morph targets (smirk, raised eyebrow, surprise, fake laugh)
  - Head/neck bones for subtle movement
- Set up React Three Fiber scene
- Implement viseme-driven lip-sync animation (synced to audio stream)
- Add idle animations (subtle head movement, blinks, random eyebrow raises)
- Build emotion-to-expression mapping from agent output tags

### Phase 5: Visual Effects & Background
The signature Max Headroom look.

- Create CRT/glitch shader (GLSL via Three.js ShaderMaterial):
  - Scan lines overlay
  - Chromatic aberration
  - Random horizontal displacement (signal interference)
  - Occasional full-frame glitch (synced to audio stutter events)
- Build geometric animated background:
  - Rotating wireframe shapes (cubes, pyramids, abstract polyhedra)
  - Grid lines
  - Color palette: blues, purples, cyans — 80s digital aesthetic
- Add screen edge vignette and CRT curvature distortion
- Synchronize visual glitches with audio stutter events

### Phase 6: Integration & Polish
Bring all layers together.

- Synchronize avatar lip-sync with audio playback (tight timing)
- Synchronize visual glitches with audio stutter effects
- Add conversation memory (Strands sliding window context)
- Implement app state management (Zustand)
- Error handling and graceful degradation:
  - No mic? Text-only input still works
  - WebGL not supported? Fallback to 2D or text-only
  - Cloud down? Friendly error with Max personality
- Responsive design (desktop + mobile browsers)
- Loading states (Max "warming up" animation)
- PWA manifest (installable on mobile home screens)
- Performance optimization (target 60fps for 3D scene on modern hardware)

### Phase 7: Stretch Goals
- Multiple "channels" Max can appear on (different backgrounds/moods)
- Voice wake word ("Hey Max") via Web Speech API continuous listening
- Conversation history / session persistence (DynamoDB)
- Share clips of Max's responses as video (canvas capture)
- AR mode via WebXR (Max in your room, no native app needed)
- Custom voice training (ElevenLabs voice clone for a unique "Max-inspired" voice)

---

## Key Technical Decisions

### Why Amazon Polly over ElevenLabs?
- ElevenLabs Starter plan: $5/mo for 30 min — could exceed budget alone
- Amazon Polly Neural: $4/1M characters, pay-per-use — a month of casual use < $2
- Polly Neural voices are quite good for a "broadcaster" character
- The Max *feel* comes from DSP post-processing (stutter, pitch, static) more than the base voice

### Why Bedrock Claude Haiku?
- Cheapest frontier-quality model: ~$0.25/1M input, $1.25/1M output tokens
- Handles personality enforcement well at this size
- If personality quality isn't sufficient, can upgrade to Sonnet (still < $10/mo at casual use)
- Bedrock keeps everything in AWS (simpler infra, single bill)

### Why Vite over Next.js?
- Pure client-side SPA — no SSR needed (3D scene is entirely client-rendered)
- Lighter weight, faster builds, simpler deployment
- Backend is separate (Lambda + API Gateway) — no need for Next.js API routes
- If SEO or static pages become needed later, can migrate

### Browser Compatibility for 3D
- WebGL 2.0 required (supported by 97%+ of browsers)
- Web Audio API for DSP effects (universal support)
- Web Speech API for mic input (Chrome, Edge, Safari — Firefox partial)
- GLSL shaders run consistently in browsers (unlike mobile GPU fragmentation)

### Strands Steering vs Prompt Engineering
- System prompt defines the baseline personality
- Steering hooks enforce it deterministically — no prompt drift
- Stutter injection is particularly well-suited to steering (text manipulation, not model reasoning)
- Personality guard prevents the model from "breaking character" even under adversarial prompts

### Avatar Creation Approach
- **Option A**: Commission/create a custom GLB model in Blender with proper blend shapes
- **Option B**: Use Ready Player Me as starting point and customize
- **Option C**: Start with a simpler stylized model (lower poly, more retro feel)
- Recommendation: Option C for MVP — matches the retro aesthetic and performs better in browsers

### Voice Strategy
- Use Amazon Polly Neural for a base synthetic voice (male, broadcaster cadence)
- Apply real-time DSP effects in the browser via Web Audio API for the Max glitch layer
- This separates "what Max says" (agent) from "how Max sounds" (TTS + effects)

### WebSocket Streaming
- Token-by-token streaming from Strands agent
- Each token triggers incremental viseme calculation
- Keeps avatar "alive" while Max is "thinking" (idle animations)
- Audio chunks streamed as generated, not waiting for full response

---

## Project Structure

```
Agent004/
├── apps/
│   └── web/                        # React + Vite web app
│       ├── src/
│       │   ├── components/
│       │   │   ├── avatar/          # 3D avatar, scene, shaders
│       │   │   │   ├── MaxAvatar.tsx
│       │   │   │   ├── MaxScene.tsx
│       │   │   │   ├── GeometricBackground.tsx
│       │   │   │   └── CRTEffect.tsx
│       │   │   ├── chat/            # Text chat UI
│       │   │   │   ├── ChatWindow.tsx
│       │   │   │   └── MessageBubble.tsx
│       │   │   └── controls/        # Mic button, settings
│       │   │       ├── MicButton.tsx
│       │   │       └── SettingsPanel.tsx
│       │   ├── hooks/
│       │   │   ├── useWebSocket.ts
│       │   │   ├── useAudioPlayback.ts
│       │   │   ├── useSpeechRecognition.ts
│       │   │   └── useVisemeSync.ts
│       │   ├── services/
│       │   │   ├── audio/           # Web Audio API DSP effects
│       │   │   │   ├── glitch-processor.ts
│       │   │   │   ├── stutter-effect.ts
│       │   │   │   └── pitch-shift.ts
│       │   │   └── websocket/       # WebSocket client
│       │   │       └── client.ts
│       │   ├── stores/              # Zustand state
│       │   │   └── conversation.ts
│       │   ├── types/
│       │   │   └── max.ts
│       │   ├── App.tsx
│       │   └── main.tsx
│       ├── public/
│       │   ├── models/              # 3D GLB files
│       │   └── shaders/             # GLSL shader files
│       ├── index.html
│       ├── vite.config.ts
│       ├── tsconfig.json
│       └── package.json
├── packages/
│   └── agent/                       # Strands Agent backend
│       ├── src/
│       │   ├── agent.ts             # Max Headroom agent definition
│       │   ├── prompts/
│       │   │   └── max-persona.ts   # System prompt
│       │   ├── steering/
│       │   │   ├── personality-guard.ts
│       │   │   ├── stutter-injection.ts
│       │   │   ├── catchphrase-trigger.ts
│       │   │   └── topic-deflection.ts
│       │   ├── tools/
│       │   │   ├── tts.ts           # Amazon Polly integration
│       │   │   ├── viseme.ts        # Viseme timing generation
│       │   │   ├── weather.ts       # Weather API tool
│       │   │   └── news.ts          # News API tool
│       │   └── handler.ts           # Lambda handler + WebSocket
│       ├── evals/                   # Personality eval test cases
│       ├── tsconfig.json
│       └── package.json
├── infrastructure/                  # AWS CDK or SAM template
│   └── template.yaml
├── docs/
│   └── initial-plan.md              # This file
├── package.json                     # Monorepo root (npm workspaces)
└── tsconfig.json
```

---

## IP / Legal Notes
- Max Headroom character owned by All3Media
- Project positioned as personal/educational "inspired-by" fan project
- Cannot clone Matt Frewer's voice — use an "inspired-by" synthetic voice
- Avatar should be "inspired by" rather than exact replica
- Not for commercial use or distribution

---

## References
- [Strands Agents TypeScript SDK](https://github.com/strands-agents/sdk-typescript)
- [Strands Steering Docs](https://strandsagents.com/docs/user-guide/concepts/plugins/steering/)
- [Strands Steering Blog (100% accuracy)](https://strandsagents.com/blog/steering-accuracy-beats-prompts-workflows)
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber)
- [react-native-lipsync-avatar](https://github.com/casey2346/react-native-lipsync-avatar) (reference implementation)
- [TalkingHead.js](https://github.com/met4citizen/talkinghead) (lip-sync library)
- [Max Headroom (Wikipedia)](https://en.wikipedia.org/wiki/Max_Headroom)
- [Web Audio API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [Web Speech API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
- [Amazon Polly Pricing](https://aws.amazon.com/polly/pricing/)
- [Amazon Bedrock Pricing](https://aws.amazon.com/bedrock/pricing/)
- [Vite](https://vitejs.dev/)
