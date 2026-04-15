# Max Height — Cloud-Only Web App

*Inspired by Max Headroom — the iconic 1980s "computer-generated" TV presenter*

## Problem Statement

Build a web application featuring **Max Height** — an AI character inspired by Max Headroom. The app delivers the full audiovisual experience in the browser: 3D animated talking head with lip-sync, glitch/CRT effects, Max's signature personality, and voice output with stutter/pitch-shift effects. Cloud-only architecture, no native mobile app. Target budget: **under $10/month**.

## Key Constraints

- **Cloud-only**: No on-device AI inference. All LLM and TTS processing happens server-side.
- **Web-only**: No native mobile app. Works on phones, tablets, and desktops via the browser.
- **Budget**: Under $10/month for educational/personal use.
- **IP/Copyright**: Max Headroom character owned by All3Media. This project is a personal/educational "inspired-by" fan project using the name **"Max Height"** (a play on "headroom"). Not a commercial product. Cannot legally clone Matt Frewer's voice without rights.
- **Audience**: Friends and family — small group with light rate limiting. Not a public-facing product.

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
| **Web hosting (S3 + CloudFront)** | ~$0.50–1.00/mo | S3 static hosting + CloudFront CDN (free tier covers 1TB/mo transfer) |
| **DynamoDB (conversation history)** | $0/mo | Free tier: 25 GB storage, 25 RCU/WCU |
| **Additional LLM tokens (cross-session memory)** | ~$0.50–1.50/mo | Sending conversation history as context |
| **Web Search API** | ~$0–1.00/mo | Depends on provider; some have free tiers |
| **Total estimated** | **~$2–6/month** | Well under $10 target |

**Cost optimization levers:**
- Use Claude 3.5 Haiku (cheapest frontier model) vs Sonnet/Opus
- Amazon Polly Neural is high quality at a fraction of ElevenLabs pricing
- Browser's built-in SpeechSynthesis API is free but lower quality (fallback option)
- Cache common responses (weather greetings, etc.)
- AWS free tier covers Lambda, DynamoDB, and partial API Gateway
- Limit conversation history context window to control LLM token costs

**Web interface?** — Yes, the web app IS the interface. Any device with a modern browser gets the full Max Height experience: 3D avatar, voice, glitch effects. Phones, tablets, desktops — all via the browser.

---

## Design Decisions

All key design questions have been evaluated and answered. These decisions guide the implementation.

### Personality & Character

| # | Question | Decision |
|---|----------|----------|
| 1 | **Which Max?** | **ABC series (1987-88)** — polished, mainstream, most recognizable version. This is the Max most people think of. |
| 2 | **How abrasive?** | **Fixed medium intensity** — charming sarcasm with occasional bite. Not so cutting that it's off-putting, but enough edge to feel authentic. |
| 3 | **Knowledge era?** | **Modern-aware** — Max Height knows it's 2026 and comments on modern tech/culture through his 80s lens. The satirical contrast of an 80s AI commenting on TikTok, AI, and streaming services is gold. |
| 4 | **Catchphrases?** | **All of them** — stuttering repetition, "blipvert" references, fake/exaggerated laughs, riffing on anything you say, ironic self-importance ("I'm Max Height!"), TV presenter patter. Go full Max. |
| 5 | **Ethical boundaries?** | **Satirical but safe** — freely mock media, corporations, and celebrity culture. No hate speech, slurs, or personal attacks on real people. Max is provocative, not harmful. |

### Voice & Audio

| # | Question | Decision |
|---|----------|----------|
| 6 | **Voice character?** | **Broadcaster cadence + slightly nasal + smug tone** — classic Max energy. Can't clone Matt Frewer, but these qualities capture the spirit. |
| 7 | **Stutter intensity?** | **Frequent — stutter in most responses, varying intensity.** This is authentic to the ABC show where stuttering was Max's defining speech quirk, present in nearly every response. |
| 8 | **Audio FX priority?** | Ranked in build order: **1. Stutter loops** (most iconic) → **2. Pitch shifts** → **3. Signal degradation** → **4. Static bursts** → **5. Echo/reverb** |

### Visual / Avatar

| # | Question | Decision |
|---|----------|----------|
| 9 | **Art style?** | **Retro low-poly with recognizable Max-inspired features.** Slicked-back hair, exaggerated jaw, smirk, suit/tie — enough to read as "Max" instantly. The 80s CG aesthetic actually reinforces the character association. |
| 10 | **Background?** | **Classic blues, purples, cyans with rotating wireframe cubes and pyramids.** The most iconic Max look — 80s digital aesthetic. |
| 11 | **Glitch frequency?** | **Constant subtle scan lines + occasional dramatic glitches synced to audio stutter.** Subtle CRT always-on, dramatic effects timed to stutter events for cohesion. |

### Interaction Model

| # | Question | Decision |
|---|----------|----------|
| 12 | **Greeting style?** | **Random rotation** — Max was never predictable. Rotate through: TV presenter intro, mocking the user for showing up, launching into a monologue, riffing on the time of day. Most authentic to character. |
| 13 | **Conversation memory?** | **Cross-session memory via DynamoDB** (free tier). Max remembers previous conversations. Adds ~$0.50–1.50/mo in extra LLM token costs for sending history as context. Worth it for character depth. |
| 14 | **Factual answers?** | **Full editorial mode** — Max always editorializes, even on factual answers. He never gives a straight answer. "The WEATHER? You want ME to tell you about the WEATHER?" This is the most authentic Max behavior. |
| 15 | **Tools?** | **Weather + News + Web Search.** Three tools that give Max plenty to riff on. Web search lets him look up anything and editorialize about it. |

### Meta / Project

| # | Question | Decision |
|---|----------|----------|
| 16 | **IP / naming?** | **"Max Height"** — a play on "headroom" (vertical clearance → height). Immediately evocative to fans, legally distinct. Paired with "inspired by Max Headroom" tagline. |
| 17 | **Audience?** | **Friends and family** — small group, light rate limiting. No public-facing auth needed, but basic rate limiting to prevent runaway costs. |
| 18 | **Build order?** | **Inside-out: Personality → Voice → Visuals.** A beautiful avatar with a bland personality is worse than a text box with a pitch-perfect Max. Get the character right first. |

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
| **Conversation History** | Amazon DynamoDB | Cross-session memory, free tier covers usage |
| **API Communication** | WebSocket (streaming) | Real-time token streaming for responsive avatar |
| **Hosting** | S3 + CloudFront | HTTPS required (Web Speech API, wss://); global CDN edge caching for 3D assets |

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
│  │  │  │  Max Height Persona    │  │  │  │
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
│  │  │  │  - Web Search          │  │  │  │
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
│  ┌──────────────────────────────────┐    │
│  │  DynamoDB (Conversation History) │    │
│  └──────────────────────────────────┘    │
└──────────────────────────────────────────┘
```

---

## Can We Train Max Height's Personality?

**Yes — via prompt engineering + Strands steering hooks.** Here's how each trait maps:

### Voice & Speech Patterns
- **Stuttering**: Frequent, varying intensity (authentic to ABC series). Strands steering handler injects stutter markup (`W-w-well`) into agent output before TTS
- **Pitch shifting**: Audio DSP post-processing on TTS output — random pitch modulation per phrase
- **Static/glitch**: Audio buffer manipulation — insert micro-bursts of static, repeat syllables
- **Audio FX build order**: Stutter loops → Pitch shifts → Signal degradation → Static bursts → Echo/reverb

### Personality & Demeanor
- **Reference**: ABC series Max (1987-88) — polished, mainstream, most recognizable
- **Tone**: Fixed medium intensity — charming sarcasm with occasional bite
- **System prompt**: Detailed persona definition — arrogant wit, phony bonhomie, assumes instant familiarity, commentary on everything, ironic self-importance. Modern-aware (knows it's 2026, comments through 80s lens).
- **Catchphrases**: All Max-isms enabled — stuttering, "blipvert", fake laughs, riffing, self-references
- **Guardrails**: Satirical but safe — mock media/corporations freely, no hate speech or personal attacks
- **Factual responses**: Full editorial mode — Max never gives a straight answer
- **Greeting**: Random rotation — unpredictable, most authentic to character
- **Steering handler (personality guard)**: Intercepts model responses and validates tone using LLM-as-judge — rejects responses that break character
- **Steering handler (catchphrase triggers)**: Injects Max-isms based on conversation context

### Visual/Facial Expressions
- **Art style**: Retro low-poly with recognizable Max-inspired features (slicked-back hair, exaggerated jaw, smirk, suit/tie)
- **Morph target animations**: Map emotion tags from agent output to facial blend shapes
- **Glitch shader**: Custom GLSL fragment shader for CRT scan lines, chromatic aberration, signal distortion. Constant subtle scan lines + dramatic glitches synced to audio stutter.
- **Geometric background**: Rotating wireframe cubes and pyramids in blues, purples, cyans (Amiga-era aesthetic) via Three.js

### What We Can't Do (IP Constraints)
- Cannot clone Matt Frewer's actual voice (using "Max-inspired" synthetic voice: broadcaster cadence + slightly nasal + smug tone)
- Character is named **"Max Height"** (not Max Headroom) — a play on "headroom"
- Avatar styled as "inspired by" rather than an exact replica — retro low-poly with recognizable features
- Position as fan art / educational project with "inspired by Max Headroom" tagline

---

## Implementation Phases

### Phase 1: Project Scaffolding & Max Height's Brain (Text Chat)
Get Max Height talking — personality is the foundation.

- Initialize React + Vite project with TypeScript
- Set up project structure (components, services, hooks, types)
- Configure ESLint, Prettier, path aliases
- Create Strands Agent backend (Node.js/TypeScript on AWS Lambda)
- Write Max Height system prompt (ABC series personality, modern-aware 2026 knowledge, speech patterns, all catchphrases)
- Implement WebSocket API endpoint (API Gateway + Lambda)
- Build simple text chat UI in browser
- Implement random greeting rotation (monologue, mocking, TV presenter intro, time-of-day riff)
- End-to-end text conversation working: you type → Max Height responds in character

### Phase 2: Personality Steering & Tools
Make Max Height reliably stay in character and be useful (in his own way).

- Create personality guard steering handler (LLM-as-judge for tone — charming sarcasm, medium intensity)
- Create stutter injection steering handler (frequent stuttering, varying intensity per response)
- Create catchphrase trigger handler (context-aware Max-isms — all catchphrases enabled)
- Create topic deflection handler (Max Height comments through a TV/media lens)
- Integrate tools (all with full editorial mode — Max always editorializes):
  - Weather API tool (OpenWeatherMap or similar)
  - News headlines tool (NewsAPI or similar)
  - Web search tool (general knowledge lookup)
- Write evaluation test cases for personality consistency
- Validate Max Height stays in character even with factual tool responses
- Validate editorial mode: Max never gives a straight factual answer

### Phase 3: Voice Pipeline
Give Max Height his voice — synthesis + the signature glitch effects.

- Integrate Amazon Polly Neural TTS (server-side, streamed to client)
- Select/configure voice (broadcaster cadence, slightly nasal, smug tone)
- Build client-side Web Audio API DSP pipeline (in priority order):
  1. Stutter loop effect (repeat syllable segments from stutter markup) — most iconic
  2. Pitch modulation (random per-phrase shifts)
  3. Signal degradation (lo-fi broadcast feel)
  4. Static burst insertion (micro-bursts of white noise)
  5. Slight echo/reverb (broadcast studio feel)
- Integrate Web Speech API for microphone input (browser STT)
- Generate viseme timing data from TTS output
- Stream audio chunks to browser with synchronized viseme events
- Add talk/listen mode toggle (push-to-talk or voice activity detection)

### Phase 4: 3D Avatar & Scene
Build the visual Max Height experience in the browser.

- Create/source Max Height 3D head model (GLB/GLTF with blend shapes):
  - Retro low-poly style with recognizable features (slicked-back hair, exaggerated jaw, smirk, suit/tie)
  - Viseme morph targets (mouth shapes for lip-sync)
  - Expression morph targets (smirk, raised eyebrow, surprise, fake laugh)
  - Head/neck bones for subtle movement
- Set up React Three Fiber scene
- Implement viseme-driven lip-sync animation (synced to audio stream)
- Add idle animations (subtle head movement, blinks, random eyebrow raises)
- Build emotion-to-expression mapping from agent output tags

### Phase 5: Visual Effects & Background
The signature Max Height look.

- Create CRT/glitch shader (GLSL via Three.js ShaderMaterial):
  - Constant subtle scan lines overlay
  - Chromatic aberration
  - Random horizontal displacement (signal interference)
  - Occasional full-frame glitch (synced to audio stutter events)
- Build geometric animated background:
  - Rotating wireframe cubes, pyramids, abstract polyhedra
  - Grid lines
  - Color palette: blues, purples, cyans — 80s digital aesthetic
- Add screen edge vignette and CRT curvature distortion
- Synchronize visual glitches with audio stutter events

### Phase 6: Integration & Polish
Bring all layers together.

- Synchronize avatar lip-sync with audio playback (tight timing)
- Synchronize visual glitches with audio stutter effects
- Implement cross-session conversation memory (DynamoDB)
  - Store conversation history per user
  - Load recent history as LLM context on session start
  - Max Height remembers previous conversations
- Implement app state management (Zustand)
- Light rate limiting for friends/family audience
- Error handling and graceful degradation:
  - No mic? Text-only input still works
  - WebGL not supported? Fallback to 2D or text-only
  - Cloud down? Friendly error with Max Height personality
- Responsive design (desktop + mobile browsers)
- Loading states (Max Height "warming up" animation)
- PWA manifest (installable on mobile home screens)
- Performance optimization (target 60fps for 3D scene on modern hardware)

### Phase 7: Stretch Goals
- Multiple "channels" Max Height can appear on (different backgrounds/moods)
- Voice wake word ("Hey Max") via Web Speech API continuous listening
- Share clips of Max Height's responses as video (canvas capture)
- AR mode via WebXR (Max Height in your room, no native app needed)
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

### Why S3 + CloudFront (not S3 alone)?
- **HTTPS is mandatory** — S3 website endpoints do not support HTTPS. Web Speech API (mic input) and secure WebSocket (wss://) both require a secure context. Without HTTPS, core features don't work.
- **Free SSL via ACM** — AWS Certificate Manager provides free TLS certificates for CloudFront distributions. No ongoing cert cost.
- **Custom domain support** — CloudFront supports custom domains with Route 53 alias records. S3 website endpoints alone require CNAME workarounds.
- **Edge caching for 3D assets** — GLB model files, GLSL shaders, and textures are served from the nearest CloudFront edge location. Faster initial load for the 3D avatar scene.
- **Security headers** — CloudFront response headers policies let you set Content-Security-Policy, X-Frame-Options, etc. S3 alone can't add response headers.
- **CloudFront free tier is generous** — 1 TB data transfer out + 10M HTTP/HTTPS requests per month. More than enough for a friends-and-family audience.
- **Cost impact is negligible** — S3 storage + request costs are the same either way. CloudFront adds ~$0–0.50/mo at this traffic level, mostly covered by free tier.
- **OAC (Origin Access Control)** — S3 bucket stays private (no public access). Only CloudFront can read from it. Better security posture than a public S3 website bucket.
- **SPA routing** — CloudFront custom error responses can return `index.html` for all 404s, enabling client-side routing without S3 redirect rules.

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
- ~~**Option A**: Commission/create a custom GLB model in Blender with proper blend shapes~~
- ~~**Option B**: Use Ready Player Me as starting point and customize~~
- **Option C (chosen)**: Retro low-poly model with recognizable Max-inspired features
- Rationale: Matches the retro 80s CG aesthetic, performs better in browsers, and the style actually *reinforces* the character association. Key features: slicked-back hair, exaggerated jaw, signature smirk, suit/tie collar.

### Voice Strategy
- Use Amazon Polly Neural for a base synthetic voice — **broadcaster cadence, slightly nasal, smug tone**
- Apply real-time DSP effects in the browser via Web Audio API for the Max glitch layer
- Audio FX build priority: 1) Stutter loops 2) Pitch shifts 3) Signal degradation 4) Static bursts 5) Echo/reverb
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
│       │   ├── agent.ts             # Max Height agent definition
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
│       │   │   ├── news.ts          # News API tool
│       │   │   └── web-search.ts    # Web search tool
│       │   ├── memory/
│       │   │   └── dynamodb.ts      # Cross-session conversation history
│       │   └── handler.ts           # Lambda handler + WebSocket
│       ├── evals/                   # Personality eval test cases
│       ├── tsconfig.json
│       └── package.json
├── infrastructure/                  # AWS CDK or SAM template
│   └── template.yaml               # Lambda, API Gateway, S3 bucket, CloudFront distribution
├── docs/
│   └── initial-plan.md              # This file
├── package.json                     # Monorepo root (npm workspaces)
└── tsconfig.json
```

---

## IP / Legal Notes
- Max Headroom character owned by All3Media
- Project character named **"Max Height"** — a play on "headroom", legally distinct
- Project positioned as personal/educational "inspired by Max Headroom" fan project
- Cannot clone Matt Frewer's voice — using "inspired-by" synthetic voice (broadcaster cadence + nasal + smug)
- Avatar styled as retro low-poly with recognizable but not replica features
- Not for commercial use or distribution
- Audience limited to friends and family

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
