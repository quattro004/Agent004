# Contract: Amazon Polly TTS Integration

**Feature**: 001-max-height-ai-character  
**Date**: 2026-04-19  
**Source**: spec.md §FR-005/FR-006, research.md §R4

---

## Overview

Each agent turn produces TWO parallel Polly calls (via `Promise.all()`):
1. **Audio synthesis** — MP3 for playback.
2. **Viseme marks** — JSON timing data for future V1 lip-sync (ignored in MVP binary mouth).

Both calls are made directly from the browser using temporary Cognito guest credentials. No server-side proxy.

---

## Voice Configuration

| Parameter | Value | Source |
|-----------|-------|--------|
| VoiceId | `Matthew` | research.md §R4 |
| Engine | `neural` | Neural voices only |
| LanguageCode | `en-US` | US English |
| OutputFormat (audio) | `mp3` | Smallest payload for web |
| SampleRate (audio) | `24000` | Neural engine default |
| OutputFormat (visemes) | `json` | Speech marks output |
| SpeechMarkTypes | `["viseme"]` | For V1 lip-sync prep |

### SSML Wrapping

All text sent to Polly is wrapped in SSML. SSML tags do NOT count toward the 3,000-character billing limit.

```xml
<speak>
  <prosody pitch="+10%" rate="105%">
    {response_text}
  </prosody>
</speak>
```

The nasal quality is achieved via client-side DSP (4–6 kHz EQ boost in AudioWorklet), not SSML.

---

## Audio Synthesis Request

```typescript
interface PollyAudioRequest {
  Engine: 'neural';
  VoiceId: 'Matthew';
  LanguageCode: 'en-US';
  OutputFormat: 'mp3';
  SampleRate: '24000';
  TextType: 'ssml';
  Text: string; // SSML-wrapped response text
}
```

**Response**: Binary MP3 audio stream → decode via `AudioContext.decodeAudioData()`.

---

## Viseme Marks Request

```typescript
interface PollyVisemeRequest {
  Engine: 'neural';
  VoiceId: 'Matthew';
  LanguageCode: 'en-US';
  OutputFormat: 'json';
  SpeechMarkTypes: ['viseme'];
  TextType: 'ssml';
  Text: string; // Same SSML as audio request
}
```

**Response**: Newline-delimited JSON objects:

```jsonc
{"time": 0,   "type": "viseme", "value": "p"}
{"time": 50,  "type": "viseme", "value": "E"}
{"time": 120, "type": "viseme", "value": "t"}
// ... one per viseme
```

### Viseme Usage

- **MVP**: Ignored. Binary mouth-open/closed driven by AnalyserNode FFT energy.
- **V1**: Parsed and mapped to 3D morph targets at 20 Hz update rate. Stored per-turn for replay.

---

## Dual-Call Flow

```
agent_turn_complete received
        │
        ├──→ synthesizeSpeech(audio)  ──→ MP3 blob
        │                                    │
        └──→ synthesizeSpeech(viseme) ──→ viseme JSON (stored, not used in MVP)
                                             │
                                     Promise.all() resolves
                                             │
                                     AudioContext.decodeAudioData(MP3)
                                             │
                                     AudioBufferSourceNode.start()
                                             │
                                     AnalyserNode drives mouth animation
```

**Target latency**: 2.5s P95 from `agent_turn_complete` to first audio sample playing.

---

## Stutter Audio Processing

After Polly returns the MP3, the AudioWorklet chain applies:

1. **Pitch shift** — slight upward shift for "digital" quality.
2. **Stutter loop** — for text segments marked as stutters, replay last ~50ms of audio via ring buffer.
3. **Static burst** — brief white noise injection at stutter boundaries.
4. **EQ boost** — 4–6 kHz band boost for nasal quality.

Stutter markers are embedded in the response text by the agent (e.g., `M-M-Max`) and parsed by the frontend to identify audio regions for loop processing.

---

## Cost Model

| Item | Rate | Per-response estimate |
|------|------|----------------------|
| Audio synthesis | $4.00 / 1M chars (Neural) | ~$0.0004 per 100 chars |
| Viseme marks | $4.00 / 1M chars (Neural) | ~$0.0004 per 100 chars |
| Total per response | — | ~$0.0008 per 100 chars |

Average response: ~200 chars → ~$0.0016 per turn.  
At 50 turns/session: ~$0.08 per session on Polly alone.

---

## Error Handling

| Error | Behavior |
|-------|----------|
| Polly throttle (429) | Retry once after 500ms. On second failure, attempt browser TTS fallback; if unavailable, play text-only (no audio). |
| Polly text limit (3,000 chars) | Should never hit — Max's responses are 40–100 words. If exceeded, truncate and synthesize first 2,900 chars. |
| AudioContext not allowed | Show "unmute" prompt. Only possible if user hasn't interacted (shouldn't happen post-TV-on). |
| Viseme call fails | Silently ignore — MVP doesn't use visemes. Log warning for V1 debugging. |
| Budget soft-degrade ($8) | Polly disabled by `budgetDegradation.ts`. Switch to browser `SpeechSynthesis` fallback (see §Browser TTS Fallback below). If `SpeechSynthesis` unavailable, remain text-only. |

---

## Browser TTS Fallback (Budget Degradation)

When the $8 soft-degrade threshold is reached and Polly is disabled, the frontend MAY use the browser's native `SpeechSynthesis` API as a degraded voice fallback. See research.md §R9 for full rationale and limitations.

**Activation**: `budgetDegradation.ts` receives `session_state_change` → switches TTS provider from Polly to `browserTts.ts`.

**Voice selection priority**:
1. `en-US` voice with name containing "Google" or "Microsoft" (higher-quality neural voices).
2. Any `en-US` voice.
3. Any `en` voice.
4. System default voice.

**Parameters**: `pitch = 1.2`, `rate = 1.05` (approximate Polly's SSML `pitch="+10%" rate="105%"`).

**Limitations in fallback mode**:
- AudioWorklet chain (stutter, pitch shift, static, EQ) is NOT applied — `SpeechSynthesis` outputs directly to speakers.
- No viseme data available.
- Voice varies by platform — character consistency is degraded.
- First fallback utterance is preceded by in-character acknowledgment: "Signal's getting weak..."

---

## IAM Permissions (Cognito Guest Role)

```json
{
  "Effect": "Allow",
  "Action": [
    "polly:SynthesizeSpeech"
  ],
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "polly:Engine": "neural",
      "polly:VoiceId": "Matthew"
    }
  }
}
```

Scoped to Neural engine + Matthew voice only. Prevents abuse via other voices/engines.
