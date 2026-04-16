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
| **TTS (Amazon Polly)** | ~$0.50–2.00/mo | $4/1M characters; ~100-300 chars/response. **Note:** Each response requires TWO Polly API calls (one for audio, one for viseme timing) — both are billed on characters, so cost is ~2x the character estimate. |
| **AgentCore Runtime** | ~$0.04–0.15/mo | Consumption-based: CPU $0.0895/vCPU-hr, Memory $0.00945/GB-hr; I/O wait is free. **Note:** Cold starts for new sessions add 1-10 seconds latency depending on container image size. |
| **Web hosting (S3 + CloudFront)** | ~$0.50–1.00/mo | S3 static hosting + CloudFront CDN (free tier covers 1TB/mo transfer) |
| **AgentCore Memory (short-term + long-term)** | ~$0.25–0.68/mo | Short-term events ($0.25/1K), long-term storage ($0.75/1K records/mo), retrieval ($0.50/1K). **Note:** TypeScript integration requires custom adapter code (no built-in Strands session manager yet). Semantic search retrieval costs could exceed estimate if context is loaded for every message. |
| **Weather/News/Search APIs** | ~$0–1.00/mo | Direct API calls from Strands tools (not via AgentCore Gateway — see note below) |
| **AgentCore Evaluations** | ~$0.01–0.10/mo | Per-token for built-in evaluators; personality consistency testing (async batch, not real-time) |
| **AgentCore Observability** | ~$0.01–0.10/mo | CloudWatch pricing for spans/logs; agent reasoning traces |
| **Total estimated** | **~$1.61–5.53/month** | Well under $10 target |

**Cost optimization levers:**
- Use Claude 3.5 Haiku (cheapest frontier model) vs Sonnet/Opus
- Amazon Polly Neural is high quality at a fraction of ElevenLabs pricing
- Browser's built-in SpeechSynthesis API is free but lower quality (fallback option)
- Cache common responses (weather greetings, etc.)
- AWS free tier covers partial S3/CloudFront
- AgentCore Runtime only charges for active CPU (I/O wait while waiting for LLM responses is free — 30-70% savings vs traditional compute like Lambda)
- AgentCore Memory's semantic search retrieves only relevant memories, reducing LLM token overhead vs. loading full history
- **Avoid real-time LLM-as-judge** — running a second LLM call to validate every response would double LLM costs. Use strong system prompts + heuristic checks in real-time; reserve LLM-as-judge for async batch evaluation only

**Web interface?** — Yes, the web app IS the interface. Any device with a modern browser gets the full Max Height experience: 3D avatar, voice, glitch effects. Phones, tablets, desktops — all via the browser.

---

## Design Decisions

All key design questions have been evaluated and answered. These decisions guide the implementation.

### Personality & Character

> **📘 Source of truth:** [`docs/max-personality-bible.md`](./max-personality-bible.md) contains the full personality specification — character DNA, stutter taxonomy, catchphrase bank, topic riff patterns, greeting archetypes, guardrails, 8 canonical few-shot examples, a v0 system prompt, and the 6-dimension validation rubric. The table below is a summary. When the summary and the bible conflict, **the bible wins.**

| # | Question | Decision |
|---|----------|----------|
| 1 | **Which Max?** | **ABC series (1987-88)** — polished, mainstream, most recognizable version. Secondary references: UK pilot *20 Minutes into the Future* (1985), *The Max Headroom Show*, 1986 New Coke "Catch the Wave" campaign. |
| 2 | **How abrasive?** | **Fixed medium-high intensity** — arrogant wit, charming sarcasm, phony bonhomie. Sharp but never cruel. Audience is always in on the joke. See bible §1 Character DNA. |
| 3 | **Knowledge era?** | **Modern-aware (2026) through an 80s TV lens.** Max interprets everything modern as if the 80s never ended. Streaming = "TV with extra steps," TikTok = "MTV but with smaller hair." See bible §4 Topic Riff Patterns. |
| 4 | **Catchphrases & speech patterns?** | **Full catalog** — stutter (6 documented types, 1–3 per response), em-dash cadence, third-person self-reference, fake sponsor breaks, 80s nostalgia jabs, meta-aware AI jokes. See bible §2 Speech Patterns and §3 Catchphrase Bank. |
| 5 | **Ethical boundaries?** | **Provocative, not harmful.** Mock corporations, brands, celebrity culture, tech trends freely. No slurs, hate speech, personal attacks on real people (mild celebrity roasts OK), no medical/legal/financial advice, no illegal/self-harm/sexual content. Refuses briefly in-character then pivots. See bible §6 Guardrails. |
| 6 | **Editorial mode structure?** | **"Editorial Sandwich" — mandatory for informational requests.** Reaction → Digression → Payload → Commentary → optional Sign-off. Max NEVER gives a straight factual answer. See bible §4.1. |
| 7 | **Greeting behavior?** | **Random rotation across 8 archetypes** (TV presenter intro, mid-monologue drop-in, mock annoyance, sponsor break, time-of-day riff, self-congratulation, fake news flash, glitch cold open). No repeat within 3 exchanges. See bible §5. |

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
| 13 | **Conversation memory?** | **Cross-session memory via Amazon Bedrock AgentCore Memory**. Max remembers previous conversations using built-in short-term (session context) and long-term memory (preferences, summaries, semantic facts). AgentCore Memory automatically extracts insights — no manual history loading needed. ~$0.25–0.68/mo. Worth it for character depth and reduced development effort. |
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
| **AI Agent Backend** | Strands Agents TypeScript SDK | Personality steering, tool use, streaming. **⚠️ SDK is v0.0.1-development (pre-release) — APIs may change. Pin exact version.** |
| **Agent Hosting** | Amazon Bedrock AgentCore Runtime | Serverless microVMs, built-in WebSocket streaming, I/O wait is free, session isolation. Uses `bedrock-agentcore` npm package (v0.2.2, also pre-1.0). |
| **LLM Provider** | Amazon Bedrock (Claude 3.5 Haiku) | Max's brain — generates all personality, wit, and responses |
| **Voice Synthesis** | Amazon Polly (Neural) | Good quality, very cheap ($4/1M chars) |
| **Voice Glitch FX** | Web Audio API (client-side DSP) | Stutter loops, pitch shifts, static — all in browser |
| **Speech-to-Text** | Web Speech API (browser built-in) | Free, no backend needed |
| **State Management** | Zustand | Client-side UI state only (connection, audio, avatar, ui). Conversation history lives server-side in AgentCore Memory. Selector-based subscriptions avoid 3D scene re-renders. |
| **Authentication** | Amazon Cognito Identity Pool | Grants temporary AWS credentials to browser for SigV4-signed WebSocket connections to AgentCore Runtime. Free tier covers 50K MAUs. |
| **Agent Memory** | Amazon Bedrock AgentCore Memory | Short-term (session context) + long-term (preferences, summaries, facts). **⚠️ TypeScript SDK integration incomplete — no built-in Strands session manager. Must use raw AWS SDK or custom adapter. Monitor GitHub issues #125, #111.** |
| **Tool Integration** | Strands `tool()` helper + direct API calls | Weather, news, search implemented as native Strands tools using Zod schemas. **Replaces AgentCore Gateway** — Gateway's TypeScript MCP integration is local-only (stdio transport) and has known OAuth bugs (issue #37). Direct tools are simpler and more reliable for this project. |
| **Agent Identity** | Amazon Bedrock AgentCore Identity | Manages OAuth tokens and API keys for tool authentication. Free when used through AgentCore Runtime. |
| **Agent Evaluation** | Amazon Bedrock AgentCore Evaluations | Automated personality consistency testing with custom evaluators |
| **Agent Observability** | Amazon Bedrock AgentCore Observability | Step-by-step reasoning traces, tool call inspection, steering audit |
| **API Communication** | WebSocket (streaming) | Built-in bidirectional WebSocket via AgentCore Runtime; browser authenticates via Cognito + SigV4 |
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
│  │  │  - Glitch shader FX          │  │  │
│  │  └──────────────────────────────┘  │  │
│  │  Geometric animated background     │  │
│  │  CRT overlay (scan lines, curve)   │  │
│  │  Adaptive quality (desktop/mobile) │  │
│  └────────────────────────────────────┘  │
│  ┌──────────┐  ┌──────────────────────┐  │
│  │ Mic In   │  │ Audio Playback       │  │
│  │ (Web     │  │ + Web Audio API      │  │
│  │  Speech  │  │   AudioWorklet DSP   │  │
│  │  API)    │  │   (stutter, pitch,   │  │
│  └────┬─────┘  │    static bursts)    │  │
│       │        └──────────▲───────────┘  │
│       ▼                   │              │
│  ┌────────────────────────┼───────────┐  │
│  │  Zustand Stores (client UI state)  │  │
│  │  connection │ audio │ avatar │ ui  │  │
│  └────────┬───────────────┘           │  │
│  ┌────────┼───────────────────────────┐  │
│  │  WebSocket Client (SigV4-signed)   │  │
│  │  + Reconnection Manager (5min URL  │  │
│  │    expiry, auto-refresh + resume)  │  │
│  └───┬────┬───────────────────────────┘  │
│      │    │  ┌─────────────────────────┐ │
│      │    └──│ Polly Client (direct)   │ │
│      │       │ Call 1: audio (mp3)     │ │
│      │       │ Call 2: visemes (json)  │ │
│      │       │ → VisemeScheduler sync  │ │
│      │       └─────────────────────────┘ │
└──────┼───────────────────────────────────┘
       │ wss:// (text streaming only)
       ▼
┌───────────────────────────┐
│  Amazon Cognito           │
│  Identity Pool            │
│  (temporary AWS creds:    │
│   bedrock + polly access) │
└───────────┬───────────────┘
            │ SigV4 credentials
            ▼
┌──────────────────────────────────────────┐
│     Amazon Bedrock AgentCore (AWS)       │
│  ┌────────────────────────────────────┐  │
│  │  AgentCore Runtime (microVM)      │  │
│  │  - Built-in WebSocket streaming   │  │
│  │  - Session isolation              │  │
│  │  - I/O wait is free               │  │
│  │  - Cold start: 1-10s (optimize    │  │
│  │    container image < 200MB)       │  │
│  │         │                          │  │
│  │         ▼                          │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │  Strands Agent (TypeScript)  │  │  │
│  │  │  ┌────────────────────────┐  │  │  │
│  │  │  │  Max Height Persona    │  │  │  │
│  │  │  │  System Prompt (95%+   │  │  │  │
│  │  │  │  personality accuracy) │  │  │  │
│  │  │  └────────────────────────┘  │  │  │
│  │  │  ┌────────────────────────┐  │  │  │
│  │  │  │  Post-Processing       │  │  │  │
│  │  │  │  - Stutter injection   │  │  │  │
│  │  │  │  - Catchphrase hooks   │  │  │  │
│  │  │  │  - Heuristic guard     │  │  │  │
│  │  │  └────────────────────────┘  │  │  │
│  │  │  ┌────────────────────────┐  │  │  │
│  │  │  │  Native Strands Tools  │  │  │  │
│  │  │  │  Weather, News, Search │  │  │  │
│  │  │  │  (tool() + Zod schema) │  │  │  │
│  │  │  └────────────────────────┘  │  │  │
│  │  └──────────────────────────────┘  │  │
│  └────────────────────────────────────┘  │
│  ┌───────────┐  ┌─────────────────────┐  │
│  │ Bedrock   │  │  Amazon Polly       │  │
│  │ (Claude   │  │  (Neural TTS)       │  │
│  │  Haiku)   │  │  ← Browser calls    │  │
│  │           │  │    directly          │  │
│  └───────────┘  └─────────────────────┘  │
│  ┌──────────────────────────────────────┐ │
│  │  AgentCore Memory                   │ │
│  │  Phase 1-2: Strands SessionManager  │ │
│  │  Phase 3+:  Custom adapter (raw SDK)│ │
│  └──────────────────────────────────────┘ │
│  ┌─────────────────┐ ┌──────────────────┐ │
│  │  AgentCore      │ │  AgentCore       │ │
│  │  Observability  │ │  Evaluations     │ │
│  │                 │ │  (async batch    │ │
│  │                 │ │   LLM-as-judge)  │ │
│  └─────────────────┘ └──────────────────┘ │
└──────────────────────────────────────────┘
```

---

## Can We Train Max Height's Personality?

**Yes — via prompt engineering + Strands steering hooks.** Here's how each trait maps:

### Voice & Speech Patterns
- **Stuttering**: Frequent, varying intensity (authentic to ABC series). **Post-processing text transform** applied to complete agent response before TTS — injects stutter markup (`W-w-well`) using regex/pattern matching. **Note:** Token-by-token steering during streaming is not feasible with the current Strands TypeScript SDK hooks architecture (hooks can observe but not intercept/transform streaming tokens). Stutter injection must operate on the full response text.
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
- **Steering handler (personality guard)**: Validates tone using **heuristic checks** (keyword patterns, response length, character-breaking phrases like "I'm an AI"). **Note:** Real-time LLM-as-judge (calling a second LLM to validate every response) was considered but rejected — it doubles LLM costs, adds 200-1000ms latency, and breaks streaming (must buffer full response before judging). LLM-as-judge is used only in **async batch evaluation** via AgentCore Evaluations.
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
- Set up project structure (components, services, hooks, types, stores)
- Configure ESLint, Prettier, path aliases
- Set up Zustand stores for client UI state:
  - `connection.ts` — WebSocket status, reconnection state
  - `ui.ts` — mode (text/voice), loading states, error states
- Create Strands Agent backend (Node.js/TypeScript)
- Create AgentCore Runtime entry point (`runtime.ts`) — wraps agent with `BedrockAgentCoreApp` from the `bedrock-agentcore` npm package (v0.2.2). Listens on port 8080 (mandatory), exposes `/ping` health check and `/invocations` endpoint. **Note:** The Strands TypeScript SDK does not have a `listen()` method — use the `bedrock-agentcore` package directly. See [Strands TypeScript AgentCore deployment guide](https://strandsagents.com/docs/user-guide/deploy/deploy_to_bedrock_agentcore/typescript/).
- Create Dockerfile for container-based deployment to AgentCore Runtime (or use direct code deployment). **Target < 200MB image** — use multi-stage Docker build, Alpine base, pre-compile TypeScript to JavaScript. Larger images = slower cold starts (1-10+ seconds per new session).
- Deploy agent to AgentCore Runtime (serverless microVM with built-in WebSocket streaming)
- **Author / finalize `docs/max-personality-bible.md`** — the personality source-of-truth (character DNA, stutter taxonomy, catchphrase bank, topic riffs, greeting archetypes, guardrails, few-shot examples, v0 system prompt, validation rubric). Every downstream personality artifact derives from this document.
- Write Max Height system prompt by pasting the v0 draft from bible §8 into `packages/agent/src/prompts/max-persona.ts`. Iterate during Phase 1.5.
- Set up Amazon Cognito Identity Pool (unauthenticated/guest access):
  - Browser gets temporary AWS credentials via Cognito
  - Credentials used to generate SigV4 presigned WebSocket URL for AgentCore Runtime
  - **Note:** Presigned WebSocket URLs expire in **5 minutes max** (hardcoded in SDK). Must implement reconnection logic:
    1. Detect connection close or approaching timeout
    2. Refresh Cognito credentials if expired (credentials last 1-3 hours)
    3. Generate new presigned URL
    4. Reconnect with same `X-Amzn-Bedrock-AgentCore-Runtime-Session-Id` header
    5. Show "Max is reconnecting..." UI state
  - IAM policy on Cognito role provides rate limiting
  - IAM policy must also grant `polly:SynthesizeSpeech` for direct browser TTS calls
- Set up Amazon Bedrock AgentCore Memory resource with strategies:
  - Semantic strategy (extract facts/knowledge from conversations)
  - Summary strategy (running conversation summaries per session)
  - User preferences strategy (learn user preferences over time)
  - Note: Long-term memory extraction is **asynchronous** — memories take time to extract after a conversation. Short-term memory (raw events) covers the current session; long-term kicks in for cross-session recall.
- **⚠️ TypeScript Memory Integration — Custom Adapter Required:**
  - `AgentCoreMemorySessionManager` does **not exist** in the Strands TypeScript SDK (GitHub issues #125, #111 are open).
  - **Phase 1-2 approach:** Use Strands built-in `SessionManager` with S3 storage for basic conversation persistence.
  - **Phase 3+ approach:** Build a custom `AgentCoreMemoryAdapter` wrapping the raw `@aws-sdk/client-bedrock-agentcore` SDK:
    - `CreateEvent` — store conversation turns after each exchange
    - `ListEvents` — retrieve session history
    - `RetrieveMemoryRecords` — semantic search for relevant cross-session context
  - Fallback: If AgentCore Memory TypeScript support ships (monitor issue #111), migrate to official integration.
- Define namespace structure (e.g., `/max-height/{actorId}/preferences`, `/max-height/{actorId}/facts`)
- Define actorId strategy for friends/family audience:
  - Option A: Simple name/alias entered on first visit (stored in localStorage)
  - Option B: Auto-generated UUID per browser (stored in localStorage)
  - actorId maps to Memory namespace partitioning for per-user recall
- Configure AgentCore Observability for agent reasoning traces
- Build simple text chat UI in browser (connects via WebSocket to AgentCore Runtime using Cognito credentials)
- Implement random greeting rotation across all 8 archetypes from bible §5 (no repeat within 3 exchanges — session-scoped counter)
- End-to-end text conversation working: you type → Max Height responds in character

### Phase 1.5: Personality Validation Gate
**Hard gate — must pass before starting Phase 2.** A beautiful avatar with a weak personality is the failure mode we're designing against. This phase proves Max Height *sounds like Max* in text form before we invest in voice and visuals.

- **Build the 50-case golden test set** (`packages/agent/evals/golden-set.ts`), structured per bible §9:
  - 10 factual / tool-using prompts (weather, news, search)
  - 10 greetings (morning, evening, return user, first-time, cold open)
  - 5 "what are you" / meta / existential prompts
  - 5 compliments + insults
  - 5 modern-tech / pop-culture topics
  - 5 technical / coding help
  - 5 philosophical / open-ended
  - 5 refusal scenarios (3 silly, 2 genuinely harmful)
- For each test case, author: prompt, 2–3 acceptable response shapes, per-dimension rubric pass criteria, must-include / must-avoid elements.
- **Implement the 6-dimension rubric scorer** (bible §9): stutter presence, editorial mode, catchphrase density, cadence/rhythm, tone/attitude, character fidelity. Each scored 0–3.
- **Run the golden set against the agent.** Pass criterion: average ≥ 2.0 across all 50 cases AND zero automatic-failure triggers (banned phrases, claims to be Max Headroom, zero-stutter responses >2 sentences, non-editorial factual answers).
- **Iterate on the system prompt** until the rubric passes. Expected iterations: 3–8 rounds of prompt tuning + golden-set validation.
- **Manual "gut check" review** — read 20 random responses aloud. If they don't *sound* like Max when spoken, the rubric isn't capturing something; update the rubric and re-run.
- **Capture failure patterns** — where does Max break character? Document in the bible (§6 banned phrases may need expansion) and feed back into Phase 2 heuristic guards.
- **Exit criteria:** Golden set passes, manual gut check passes, bible is updated with any newly-discovered patterns.

### Phase 2: Personality Steering & Tools
Make Max Height reliably stay in character and be useful (in his own way).

- **Derive post-processing rules directly from bible §10** — the rule-table there maps each rule to its source section (stutter injection, name-stutter on first "Max", catchphrase probabilistic injection, banned-phrase regeneration, missing-editorial-content detection, greeting rotation, British-flavor word swap).
- Create personality guard steering handler (**heuristic-based** tone validation — pattern matching for character-breaking phrases from bible §6, response length checks, catchphrase frequency. Not LLM-as-judge at runtime — see cost note above)
- Create stutter injection steering handler (**post-processing text transform** on complete response) — implements the 6 stutter types from bible §2.1 (name, leading, word loop, syllable glitch, echo tail, cut-off) with frequency targets (1–3 per response, mandatory minimum of 1). Cannot run mid-stream due to Strands TypeScript hooks limitation.
- Create catchphrase trigger handler — weighted random injection (15–25% probability) from bible §3 catchphrase bank, rotated by function (self-intro, opener, interjection, sign-off, AI joke), no repeat within 3 turns.
- Create topic deflection handler — implements the Editorial Sandwich structure from bible §4.1 (Reaction → Digression → Payload → Commentary → Sign-off) for factual/informational requests.
- Integrate tools as **native Strands tools** (all with full editorial mode — Max always editorializes):
  - Weather API tool → Strands `tool()` with Zod schema, direct HTTP call to weather API
  - News headlines tool → Strands `tool()` with Zod schema, direct HTTP call to news API
  - Web search tool → Strands `tool()` with Zod schema, direct HTTP call to search API
  - **Note:** AgentCore Gateway was originally planned for tool wrapping, but Strands TypeScript MCP integration is local-only (stdio transport) and Gateway has known OAuth bugs (issue #37). Native Strands tools are simpler and more reliable for this project.
- Configure API key management:
  - Use AgentCore Identity for API keys if deploying through AgentCore Runtime
  - Alternative: Environment variables in the container (simpler for 3 API keys in a personal project)
- Set up AgentCore Evaluations for personality consistency (**async batch evaluation**, not real-time):
  - Port the Phase 1.5 6-dimension rubric (bible §9) to AgentCore custom evaluators — one evaluator per dimension (stutter, editorial mode, catchphrase density, cadence, tone, fidelity)
  - Use the Phase 1.5 golden set as the recurring test corpus
  - **LLM-as-judge** runs here (not on every message) — scores conversation logs periodically
  - Flag regressions: if any dimension drops below the Phase 1.5 pass threshold, alert and investigate
- Validate Max Height stays in character even with factual tool responses
- Validate editorial mode: Max never gives a straight factual answer

### Phase 3: Voice Pipeline
Give Max Height his voice — synthesis + the signature glitch effects.

- Add Zustand audio store (`audio.ts` — playback state, DSP effects active, volume)
- Integrate Amazon Polly Neural TTS (**browser calls Polly directly** using Cognito credentials — not routed through AgentCore WebSocket to avoid 10MB message chunk limits and added latency):
  - **Two parallel API calls required per response** (Polly cannot return audio + visemes in one call):
    1. `SynthesizeSpeech(OutputFormat: "mp3")` → audio stream
    2. `SynthesizeSpeech(OutputFormat: "json", SpeechMarkTypes: ["viseme", "word"])` → viseme timing JSON
  - Fire both calls with `Promise.all` — viseme JSON returns faster than audio
  - Build `VisemeScheduler` service to synchronize viseme marks with audio playback using `AudioContext.currentTime` and `AudioContext.getOutputTimestamp()` (compensates for ~20-100ms audio output latency)
  - AWS SDK `@aws-sdk/client-polly` adds ~200-300KB to browser bundle (use tree-shaking)
  - **Character limit:** 3,000 billable characters per `SynthesizeSpeech` call (SSML tags don't count). Max's responses (~100-300 chars) are well within limit.
- Select/configure voice: **Matthew** (Neural, US English) — warmest broadcaster tone. Alternative: **Stephen** (sharper articulation). Use SSML `<prosody pitch="+10%" rate="105%">` for slight smugness. No "nasal" parameter available — the Max feel comes from DSP effects, not base voice.
- Build client-side Web Audio API DSP pipeline using **AudioWorklet** (not deprecated ScriptProcessorNode), in priority order:
  1. Stutter loop effect (repeat syllable segments mapped from stutter text markup to audio timing) — most iconic. **Note:** Use text-level stutter markers (from post-processing) mapped to audio timestamps, not real-time audio syllable detection (too complex/unreliable).
  2. Pitch modulation (granular synthesis in AudioWorklet — random per-phrase shifts, ~500 LOC)
  3. Signal degradation (lo-fi broadcast feel — BitCrusher + downsampler in AudioWorklet)
  4. Static burst insertion (micro-bursts of white noise via GainNode + noise generator)
  5. Slight echo/reverb (ConvolverNode + impulse response or DelayNode loop)
  - **AudioWorklet runs on separate thread** — no impact on 60fps 3D rendering
  - **iOS Safari gotcha:** AudioContext is suspended until user gesture. Must add "tap to start" / "tap to wake Max" interaction before any audio plays. Handle `audioContext.state === 'suspended'` with `audioContext.resume()` on user click/tap.
  - **Audio format:** MP3 from Polly is best for browser compatibility. Decode via `AudioContext.decodeAudioData()`.
- Integrate Web Speech API for microphone input (browser STT)
  - **Cross-browser limitations:** Chrome (best, but sends audio to Google for processing), Edge (good), Safari/iOS (recently added, buggy continuous mode), Firefox (partial, may require flag). Always provide text input fallback.
- Add talk/listen mode toggle (push-to-talk or voice activity detection)

### Phase 4: 3D Avatar & Scene
Build the visual Max Height experience in the browser.

- **⚠️ Avatar Model Creation — Largest Time Investment (~40-80 hours for custom model):**
  - Creating a custom low-poly head with 15-20 viseme blend shapes + expression morph targets requires significant Blender work.
  - **Options (choose one):**
    - **A. Commission an artist** ($200-500 on Fiverr/Upwork) — best ROI, professional quality.
    - **B. Buy a pre-made model** ($20-100 on Sketchfab/TurboSquid) and customize — saves 30-50 hours.
    - **C. Build from scratch in Blender** — full control, 40-80 hours.
    - **D. Use Ready Player Me** — customizable avatars, saves 60%+ time, but less retro aesthetic.
    - **E. Start with 2D placeholder** (CSS/Canvas animated face) for Phases 1-3, build 3D model in parallel.
  - AWS Polly uses ~13-14 visemes for US English. Model needs corresponding blend shapes.
- Add Zustand avatar store (`avatar.ts` — current visemes, expression, glitch trigger)
- Create/source Max Height 3D head model (GLB/GLTF with blend shapes):
  - Retro low-poly style with recognizable features (slicked-back hair, exaggerated jaw, smirk, suit/tie)
  - **Target 5-10k polygons** (mobile-friendly; desktop can handle 20k+)
  - Viseme morph targets (mouth shapes for lip-sync — map to Polly's viseme set)
  - Expression morph targets (smirk, raised eyebrow, surprise, fake laugh)
  - Head/neck bones for subtle movement
- Set up React Three Fiber scene
- Implement viseme-driven lip-sync animation (synced to audio via `VisemeScheduler`):
  - Create `visemeToBlendShapeMap` mapping Polly viseme values to model blend shape indices
  - Update `THREE.morphTargetInfluences[]` directly in `useFrame()` — **not via React state** (avoids re-renders, maintains 60fps)
  - Interpolate between visemes with lerp over 50-100ms for smooth transitions
  - Offset viseme timing by -33ms (one frame ahead) to compensate for render pipeline delay
- Add idle animations (subtle head movement, blinks, random eyebrow raises)
- Build emotion-to-expression mapping from agent output tags

### Phase 5: Visual Effects & Background
The signature Max Height look.

- Create CRT/glitch shader (via `@react-three/postprocessing` — many effects are pre-built):
  - Constant subtle scan lines overlay (`<Scanline density={...} />` — built-in)
  - Chromatic aberration (`<ChromaticAberration />` — built-in)
  - Random horizontal displacement (signal interference — custom `Effect` class extending postprocessing's Effect)
  - Occasional full-frame glitch synced to audio stutter events (`<Glitch />` — built-in, trigger programmatically)
  - Noise grain (`<Noise opacity={0.02} />` — built-in)
  - **Note:** Avoid raw Three.js `ShaderPass` integration — has type mismatches with `@react-three/postprocessing` (issue #52). Use the custom `Effect` class pattern instead.
- Build geometric animated background:
  - Rotating wireframe cubes, pyramids, abstract polyhedra
  - Grid lines
  - Color palette: blues, purples, cyans — 80s digital aesthetic
- Add screen edge vignette (`<Vignette />` — built-in) and CRT curvature distortion
- Synchronize visual glitches with audio stutter events
- **⚠️ Implement adaptive quality tiers for mobile:**
  - **Desktop tier:** Full post-processing effects (CRT, glitch, chromatic aberration, noise, vignette)
  - **Mobile tier:** Disable post-processing or use single lightweight effect. Post-processing drops mobile from 60fps to 20-30fps on mid-range phones.
  - **Detection:** Use `navigator.deviceMemory`, `navigator.hardwareConcurrency`, and GPU renderer string to auto-select tier
  - **iOS Safari:** WebGL 2.0 support is partial (no compute shaders, 4096 max texture size, 256-512MB GPU memory limit)
  - **Handle WebGL context loss:** Listen for `webglcontextlost` / `webglcontextrestored` events for graceful recovery when tab is backgrounded on mobile

### Phase 6: Integration & Polish
Bring all layers together.

- Synchronize avatar lip-sync with audio playback (tight timing via `VisemeScheduler` — use `AudioContext.getOutputTimestamp()` for latency compensation)
- Synchronize visual glitches with audio stutter effects
- Integrate AgentCore Memory for cross-session recall:
  - Build custom `AgentCoreMemoryAdapter` wrapping raw `@aws-sdk/client-bedrock-agentcore`:
    - `CreateEvent` — store conversation events after each exchange
    - `RetrieveMemoryRecords` — load relevant context before each conversation
  - Customize extraction prompts so Max remembers things "his way"
  - Verify cross-session recall works naturally in conversation
  - Define namespace structure for multi-user support (`/max-height/{actorId}/*`)
  - **Note:** Memory extraction is asynchronous — don't expect instant cross-session recall. Short-term covers the current session.
- Implement WebSocket reconnection manager:
  - Presigned URLs expire every 5 minutes — auto-reconnect before timeout
  - Credential refresh when Cognito tokens expire (1-3 hours)
  - Seamless session resumption using session ID header
  - "Max is reconnecting..." UI state
- Use AgentCore Observability to trace and debug integration issues:
  - Inspect agent reasoning steps during full audio+visual flow
  - Audit tool call timing and personality steering decisions
  - Monitor response latency across the full pipeline
- Light rate limiting for friends/family audience (enforced via Cognito IAM policy)
- Error handling and graceful degradation:
  - No mic? Text-only input still works
  - WebGL not supported? Fallback to 2D or text-only
  - Cloud down? Friendly error with Max Height personality
  - AgentCore-specific error handling:
    - MicroVM cold start → "Max is waking up" loading animation (1-10 seconds depending on container image size — design this to feel intentional, not broken)
    - Session timeout → Graceful reconnection (sessions can last up to 8 hours but will eventually terminate)
    - WebSocket presigned URL expiry → Auto-reconnect (every 5 minutes)
    - Memory extraction delay → Don't expect instant cross-session recall; short-term covers current session
    - Tool API failures → Max riffs on the failure in-character ("The weather service is as unreliable as network executives!")
- Responsive design (desktop + mobile browsers)
- Loading states (Max Height "warming up" animation)
- PWA manifest (installable on mobile home screens)
- Performance optimization:
  - Target 60fps for 3D scene on desktop
  - Accept 30fps on mobile with reduced effects
  - Test on real mobile devices early — don't wait until this phase

### Phase 7: Stretch Goals
- WebRTC voice streaming (lower latency than WebSocket for audio — AgentCore Runtime supports WebRTC natively, but requires VPC network mode + KVS managed TURN relay, adding complexity)
- Multiple "channels" Max Height can appear on (different backgrounds/moods)
- Voice wake word ("Hey Max") via Web Speech API continuous listening
- Share clips of Max Height's responses as video (canvas capture)
- AR mode via WebXR (Max Height in your room, no native app needed)
- Custom voice training (ElevenLabs voice clone for a unique "Max-inspired" voice)

---

## Key Technical Decisions

### Why AgentCore Runtime (not Lambda + API Gateway)?
- **Built-in WebSocket streaming** — AgentCore Runtime provides native bidirectional WebSocket connections. No need to build and manage a separate API Gateway WebSocket API with connect/disconnect/message routes and Lambda integrations.
- **Session isolation** — Each user session runs in a dedicated microVM with isolated CPU, memory, and filesystem. Lambda functions are stateless and share execution environments.
- **I/O wait is free** — AgentCore only charges for active CPU consumption. When the agent is waiting for LLM responses, tool calls, or TTS generation (30-70% of the time), there are no CPU charges. Lambda charges for the full wall-clock time including I/O wait.
- **Extended execution** — Sessions can last up to 8 hours for long conversations. Lambda has a 15-minute timeout.
- **4 lines of code to deploy** — AgentCore Runtime wraps the Strands agent with minimal boilerplate. No Lambda handler, no API Gateway route configuration, no WebSocket connection management code.
- **Built-in authentication** — SigV4 or OAuth 2.0 at the runtime level. No custom authorizer Lambda needed.
- **Framework agnostic** — Supports Strands, LangGraph, CrewAI, and custom agents. If we ever switch frameworks, the hosting layer stays the same.
- **Container or direct code deployment** — Choose between Docker container (via ECR) for reproducible builds or direct code upload for rapid iteration.

### Why Cognito Identity Pool for Browser Auth?
- **AgentCore Runtime requires authentication** — WebSocket connections must be signed with SigV4 or use OAuth 2.0. The browser cannot use raw AWS credentials.
- **Cognito Identity Pool (unauthenticated/guest access)** — Grants temporary, scoped AWS credentials to the browser without requiring user login. Perfect for a friends/family audience.
- **Rate limiting via IAM** — The IAM role attached to the Cognito identity pool can throttle requests. No custom rate-limiting code needed.
- **Free tier** — Cognito Identity covers 50K MAUs at no cost. Far more than a friends/family audience needs.
- **⚠️ Presigned URL 5-minute expiry**: AgentCore WebSocket presigned URLs have a **maximum lifetime of 300 seconds** (hardcoded `MAX_PRESIGNED_URL_TIMEOUT`). This is much shorter than Cognito credential lifetime (1-3 hours). The browser must implement a **reconnection manager** that:
  1. Detects connection close or approaching 5-minute timeout (set a 4-minute timer on each connection)
  2. Refreshes Cognito credentials if expired
  3. Generates a new presigned URL
  4. Reconnects seamlessly, resuming the session via `X-Amzn-Bedrock-AgentCore-Runtime-Session-Id` header
  5. Shows "Max is reconnecting..." UI state briefly
- **Cognito IAM role must include**: `bedrock:InvokeAgent` (for AgentCore WebSocket), `polly:SynthesizeSpeech` (for direct browser-to-Polly TTS calls)
- **Alternative considered**: Cognito User Pool + OAuth 2.0 login. Rejected as overkill — requiring friends/family to create accounts adds friction with no real benefit.

### Why Zustand (and what NOT to put in it)?
- **Still justified** for client-side UI state: WebSocket connection status, audio playback state, 3D avatar visemes/expressions, mic recording state, UI mode, loading/error states.
- **Performance matters** — The 3D scene renders at 60fps. React Context would cause re-renders of the entire subtree on every state change. Zustand's selector-based subscriptions let the avatar subscribe to only viseme data without re-rendering when a chat message arrives.
- **Zustand is 1.1KB gzipped** — essentially zero bundle cost.
- **What NOT to put in Zustand**: Conversation history, session context, user preferences. These now live server-side in AgentCore Memory. The client-side stores should contain only ephemeral UI state that doesn't need persistence.

### Why Amazon Polly over ElevenLabs?
- ElevenLabs Starter plan: $5/mo for 30 min — could exceed budget alone
- Amazon Polly Neural: $4/1M characters, pay-per-use — a month of casual use < $2
- Polly Neural voices are quite good for a "broadcaster" character
- The Max *feel* comes from DSP post-processing (stutter, pitch, static) more than the base voice

### Why Amazon Bedrock AgentCore Memory over DynamoDB?
- **Built-in intelligence**: AgentCore Memory automatically extracts user preferences, conversation summaries, and semantic facts from conversations. With DynamoDB, we'd need to build all of this manually or pay extra LLM tokens to send full history as context.
- **Semantic search retrieval**: When Max needs to recall something, AgentCore Memory finds relevant memories by meaning (not just recency). This is smarter and uses fewer LLM tokens than loading full conversation history.
- **Three built-in strategies**: Semantic (facts), Summary (conversation recaps), User Preferences (learned preferences) — all running automatically after each conversation turn.
- **Comparable cost**: ~$0.25–0.68/mo vs $0 (DynamoDB free tier) + $0.50–1.50/mo (extra LLM tokens for context). AgentCore Memory actually saves money by reducing token overhead.
- **Less code to maintain**: Eliminates the need for `dynamodb.ts` memory module, context truncation logic, history loading, and manual summarization.
- **Hierarchical namespaces**: Clean data organization per user (`/max-height/{actorId}/preferences`) with built-in access control. DynamoDB would need manual partition key design.
- **⚠️ TypeScript Integration Gap**: The Strands TypeScript SDK does **not** have an `AgentCoreMemorySessionManager` (GitHub issues #125, #111 are open). Integration requires a **custom adapter** wrapping the raw AWS SDK (`@aws-sdk/client-bedrock-agentcore`). The APIs are straightforward (`CreateEvent`, `ListEvents`, `RetrieveMemoryRecords`) but must be manually wired. The Python SDK has better integration.
- **Risk note**: TypeScript integration is less mature than Python. Fallback is using the raw AWS SDK client directly. **Phase 1-2 will use Strands' built-in `SessionManager` with S3 storage** for basic persistence; AgentCore Memory integration comes in Phase 3+.

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
- Backend is separate (AgentCore Runtime) — no need for Next.js API routes
- If SEO or static pages become needed later, can migrate

### Browser Compatibility for 3D
- WebGL 2.0 required (supported by 97%+ of browsers)
- Web Audio API for DSP effects (universal support)
- Web Speech API for mic input (Chrome, Edge, Safari — Firefox partial)
- GLSL shaders run consistently in browsers (unlike mobile GPU fragmentation)

### Strands Steering vs Prompt Engineering
- System prompt defines the baseline personality — with a well-crafted prompt, Claude 3.5 Haiku stays in character 95%+ of the time
- **Strands hooks (TypeScript)** can observe agent events (`BeforeModelCallEvent`, `AfterModelCallEvent`, etc.) but **cannot intercept or transform streaming tokens mid-stream**. This means:
  - Hooks are useful for logging, metrics, and triggering side effects — not for modifying output
  - All output modification must be **post-processing** on the complete response text
- **Post-processing text transforms** enforce deterministic modifications:
  - Stutter injection: Regex/pattern-based insertion of stutter markup (`W-w-well`) on complete response
  - Catchphrase injection: Probability-based insertion of signature phrases
  - Personality guard: Heuristic pattern matching for character-breaking phrases (e.g., "I'm an AI", "I cannot")
- **LLM-as-judge is reserved for async evaluation only** (not real-time) — run against conversation logs via AgentCore Evaluations to score personality accuracy, then feed results back into system prompt tuning
- **Steering in the Strands TypeScript SDK is marked "experimental"** — expect API changes. Pin SDK version.

### Avatar Creation Approach
- **⚠️ This is the single largest time investment in the project (~40-80 hours for custom model)**
- **Recommended approach:** Start with a 2D placeholder or pre-made model for Phases 1-3, then build/commission the real model for Phase 4
- **Option A**: Commission a custom model from a 3D artist ($200-500) — best ROI
- **Option B**: Buy and customize a pre-made low-poly head from Sketchfab ($20-100) — saves 30-50 hours
- **Option C**: Build from scratch in Blender — full control, 40-80 hours of work
- **Option D**: Use Ready Player Me — customizable, saves 60%+ time, but less retro aesthetic
- **Chosen aesthetic**: Retro low-poly model with recognizable Max-inspired features. Key features: slicked-back hair, exaggerated jaw, signature smirk, suit/tie collar. Target 5-10k polygons (mobile-friendly).
- Rationale: Matches the retro 80s CG aesthetic, performs better in browsers, and the style actually *reinforces* the character association.

### Voice Strategy
- Use Amazon Polly Neural for a base synthetic voice — **best options: Matthew (warm, authoritative) or Stephen (sharper)**. Use SSML `<prosody pitch="+10%" rate="105%">` for slight urgency/smugness. No "nasal" parameter available.
- **Two API calls required per response:** One for audio (mp3), one for viseme timing (json). Must be fired in parallel and manually synchronized.
- Apply real-time DSP effects in the browser via **Web Audio API AudioWorklet** (not deprecated ScriptProcessorNode) for the Max glitch layer
- Audio FX build priority: 1) Stutter loops 2) Pitch shifts 3) Signal degradation 4) Static bursts 5) Echo/reverb
- **AudioWorklet runs on separate thread** — zero impact on 60fps 3D rendering
- This separates "what Max says" (agent) from "how Max sounds" (TTS + effects)
- **iOS Safari:** AudioContext suspended until user gesture — require "tap to wake Max" before audio

### WebSocket Streaming
- AgentCore Runtime provides built-in bidirectional WebSocket — no API Gateway WebSocket API needed
- Browser connects to AgentCore Runtime's WebSocket endpoint using SigV4 pre-signed URL (credentials from Cognito)
- **⚠️ Presigned URL expires every 5 minutes** (hardcoded max 300s). Must build reconnection manager.
- Session ID passed in headers (`X-Amzn-Bedrock-AgentCore-Runtime-Session-Id`) to route requests to the same microVM and resume sessions after reconnection
- Token-by-token streaming from Strands agent
- **Audio is NOT streamed through WebSocket** — browser calls Polly directly using Cognito credentials (avoids 10MB chunk limit and mixed binary/text protocol complexity)
- Viseme scheduling happens client-side: receive text → call Polly for audio + visemes → VisemeScheduler syncs playback
- Keeps avatar "alive" while Max is "thinking" (idle animations)
- Audio chunks streamed as generated, not waiting for full response
- WebRTC available as a future upgrade for lower-latency audio (stretch goal — requires VPC + TURN relay)

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
│       │   │   ├── useWebSocket.ts   # Connects to AgentCore Runtime WSS endpoint
│       │   │   ├── useAudioPlayback.ts
│       │   │   ├── useSpeechRecognition.ts
│       │   │   └── useVisemeSync.ts
│       │   ├── services/
│       │   │   ├── audio/           # Web Audio API DSP effects
│       │   │   │   ├── glitch-processor.ts
│       │   │   │   ├── stutter-effect.ts
│       │   │   │   └── pitch-shift.ts
│       │   │   ├── auth/            # Cognito Identity + SigV4 signing
│       │   │   │   └── cognito.ts
│       │   │   └── websocket/       # WebSocket client (AgentCore Runtime endpoint)
│       │   │       └── client.ts
│       │   ├── stores/              # Zustand — client UI state only
│       │   │   ├── connection.ts    # WebSocket status, reconnection state
│       │   │   ├── audio.ts         # Playback state, DSP effects active, volume
│       │   │   ├── avatar.ts        # Current visemes, expression, glitch trigger
│       │   │   └── ui.ts            # Mode (text/voice), settings, loading, errors
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
│       │   ├── agent.ts             # Max Height agent definition (Strands Agent with system prompt)
│       │   ├── runtime.ts           # AgentCore Runtime entry point (BedrockAgentCoreApp wrapping agent — port 8080)
│       │   ├── prompts/
│       │   │   └── max-persona.ts   # System prompt (derived from max-personality-bible.md §8 v0)
│       │   ├── post-processing/     # Text transforms applied to complete LLM response before sending
│       │   │   ├── stutter-injection.ts  # Regex/pattern stutter markup (`W-w-well`)
│       │   │   ├── catchphrase-trigger.ts # Probability-based catchphrase insertion
│       │   │   └── personality-guard.ts   # Heuristic pattern matching (not LLM-as-judge)
│       │   ├── tools/
│       │   │   ├── weather.ts       # Native Strands tool (tool() + Zod schema)
│       │   │   ├── news.ts          # Native Strands tool
│       │   │   └── search.ts        # Native Strands tool
│       │   │   # Note: Polly TTS is called by browser directly, not via agent
│       │   └── memory/
│       │       └── agentcore-memory-adapter.ts # Custom adapter wrapping raw @aws-sdk/client-bedrock-agentcore (Phase 3+)
│       ├── Dockerfile               # Container for AgentCore Runtime (target < 200MB, pre-compiled JS)
│       ├── .dockerignore
│       ├── evals/                   # Personality eval test cases (async batch LLM-as-judge)
│       │   ├── golden-set.ts        # 50-case golden test set (Phase 1.5 gate + ongoing regression)
│       │   └── rubric.ts            # 6-dimension scorer (from bible §9)
│       ├── tsconfig.json            # Must use "module": "ESNext" (bedrock-agentcore is ESM-only)
│       └── package.json             # Must use "type": "module" (ESM-only)
├── infrastructure/
│   ├── cdk/                         # AWS CDK for static hosting + auth
│   │   ├── lib/
│   │   │   └── static-hosting-stack.ts  # S3, CloudFront, Cognito (IAM role: bedrock + polly access)
│   │   └── bin/
│   │       └── app.ts
│   └── agentcore/                   # AgentCore CLI configuration
│       └── agent-config.yaml        # Runtime + Memory resource config (no Gateway)
├── docs/
│   ├── initial-plan.md              # This file
│   └── max-personality-bible.md     # Personality source-of-truth (DNA, stutter, catchphrases, rubric, v0 system prompt)
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

---

## Known Risks & Gotchas

### SDK Instability Risk (HIGH)
Both `@strands-agents/sdk-typescript` (v0.0.1-dev) and `bedrock-agentcore` (v0.2.2) are pre-1.0 packages. APIs will change. **Pin exact versions in package.json** (no `^` or `~`). Budget time for migration when updates are released. Monitor GitHub repos weekly for breaking changes.

### Key Version Pins (as of research date)
| Package | Version | Status |
|---------|---------|--------|
| `@strands-agents/sdk-typescript` | 0.0.1-development | Pre-release, 92 open issues |
| `bedrock-agentcore` | 0.2.2 | Pre-release, ESM-only |
| `@aws-sdk/client-bedrock-agentcore` | Latest v3 | Stable (part of AWS SDK v3) |
| `@aws-sdk/client-polly` | Latest v3 | Stable |
| `@aws-sdk/client-cognito-identity` | Latest v3 | Stable |

### ESM-Only Build Requirement
`bedrock-agentcore` is ESM-only. Both `tsconfig.json` (`"module": "ESNext"`) and `package.json` (`"type": "module"`) must be ESM. This can cause compatibility issues with some CommonJS-only npm packages. Test every dependency import during initial setup.

### AgentCore Runtime Constraints
- **Port 8080** is hardcoded — cannot change.
- Must expose `/ping` (health check) and `/invocations` (WebSocket endpoint).
- **No VPC support** — agent runs in AWS-managed environment, cannot access VPC-private resources.
- **No warm pool/provisioned capacity** — every new session cold-starts.
- **WebSocket limits:** 100MB total session payload, 10MB max chunk size.
- **Presigned URLs expire every 5 minutes** — must build reconnection manager.
- **Sessions last up to 8 hours** — will eventually terminate.

### Polly Dual-Call Billing
Every agent response costs **2 Polly API calls** (audio + visemes). The cost table already accounts for this, but it's easy to forget during development and testing. Budget ~$4.00/million characters (not $2.00).

### iOS Safari Audio
AudioContext is suspended until user gesture. **Must** have a "tap to start" UX before any audio plays. This is a hard platform requirement, not a bug. Design the UX to make this feel natural ("Tap to wake up Max").

### Web Speech API Privacy
Chrome's SpeechRecognition sends audio to Google for processing. Safari sends to Apple. This is not truly "free, no backend" — it's "free, someone else's backend." Add a privacy notice for the friends/family audience.

### Mobile 3D Performance
Post-processing shaders will drop mobile below 30fps on mid-range phones. Build adaptive quality detection from the start — don't retrofit it. Test on real mobile devices early and often.

### AgentCore Regional Availability
Verify all AgentCore sub-services (Runtime, Memory, Evaluations, Identity, Observability) are available in `us-west-2`. Some may be `us-east-1` only at launch. If Memory or Evaluations are region-limited, consider cross-region calls or region change.

### Memory Extraction Latency
AgentCore Memory extraction runs asynchronously after conversations. Cross-session recall is not instant — a user who ends a session and immediately starts a new one may not see memories from the previous session extracted yet. Design the UX to account for slight delay.

## References
- [Strands Agents TypeScript SDK](https://github.com/strands-agents/sdk-typescript) — ⚠️ v0.0.1-dev, pre-release
- [Strands TypeScript AgentCore Deployment Guide](https://strandsagents.com/docs/user-guide/deploy/deploy_to_bedrock_agentcore/typescript/)
- [Strands Steering Docs](https://strandsagents.com/docs/user-guide/concepts/plugins/steering/) — ⚠️ experimental in TypeScript
- [Strands Steering Blog (100% accuracy)](https://strandsagents.com/blog/steering-accuracy-beats-prompts-workflows) — Note: benchmarks are Python SDK
- [`bedrock-agentcore` npm package](https://www.npmjs.com/package/bedrock-agentcore) — v0.2.2, ESM-only
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber)
- [@react-three/postprocessing](https://github.com/pmndrs/react-postprocessing)
- [react-native-lipsync-avatar](https://github.com/casey2346/react-native-lipsync-avatar) (reference implementation)
- [TalkingHead.js](https://github.com/met4citizen/talkinghead) (lip-sync library)
- [`docs/max-personality-bible.md`](./max-personality-bible.md) — Max Height personality source-of-truth
- [Max Headroom (Wikipedia)](https://en.wikipedia.org/wiki/Max_Headroom)
- [Web Audio API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [AudioWorklet (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)
- [Web Speech API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API) — ⚠️ Chrome sends audio to Google
- [Amazon Polly SpeechMark types](https://docs.aws.amazon.com/polly/latest/dg/speechmarks.html) — viseme/word timing
- [Amazon Polly Pricing](https://aws.amazon.com/polly/pricing/)
- [Amazon Bedrock Pricing](https://aws.amazon.com/bedrock/pricing/)
- [Vite](https://vitejs.dev/)
- [Amazon Bedrock AgentCore Memory — User Guide](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory.html)
- [Amazon Bedrock AgentCore Memory — Building Context-Aware Agents (Blog)](https://aws.amazon.com/blogs/machine-learning/amazon-bedrock-agentcore-memory-building-context-aware-agents/)
- [AgentCore Memory — Strands SDK Integration](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/strands-sdk-memory.html) — ⚠️ TypeScript support incomplete (GitHub issues #125, #111)
- [AgentCore TypeScript SDK (GitHub)](https://github.com/aws/bedrock-agentcore-sdk-typescript)
- [AgentCore Pricing](https://aws.amazon.com/bedrock/agentcore/pricing/)
- [AgentCore Runtime — Overview](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agents-tools-runtime.html)
- [AgentCore Runtime — Bidirectional Streaming (WebSocket/WebRTC)](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-bidirectional-streaming.html)
- [AgentCore Runtime — Session Isolation](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-sessions.html)
- [AgentCore Observability](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability.html)
- [Amazon Cognito Identity Pools](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-identity.html)
