# Audio Plan — Max Height Greeting Audio

## Goal

Bring Max Height's greeting sequence to life with pre-generated MP3 audio files that play through the existing audio chain and drive mouth animation on the avatar.

---

## Current State (What's Already Built)

The greeting audio pipeline is **fully wired** — it just needs MP3 files:

| Layer | Status | Location |
|-------|--------|----------|
| **Greeting manifest** | ✅ 16 entries with `audioPath`, `audioDurationMs` | `public/greetings/manifest.json` |
| **Greeting selector** | ✅ Weighted random, no-repeat, time-of-day | `src/services/greetingSelector.ts` |
| **Audio playback hook** | ✅ Fetches MP3 → decodes → plays via audioChain | `src/hooks/useGreeting.ts` |
| **Mouth polling** | ✅ 50ms interval drives `voiceStore.setMouthOpen()` | `src/hooks/useGreeting.ts:28-34` |
| **Avatar mouth sync** | ✅ `AvatarFrameCycler` reads `isMouthOpen` → talk frames | `src/components/AvatarFrameCycler.tsx` |
| **Audio chain** | ✅ Web Audio API pipeline with analyser node for mouth detection | `src/audio/audioChain.ts` |
| **Graceful fallback** | ✅ If MP3 fetch returns 404, text-only greeting plays | `src/hooks/useGreeting.ts:62` |

**Once MP3 files exist at the manifest paths, audio + mouth animation activates automatically.**

---

## Phase 1: Generate Greeting MP3s

### Voice Requirements

From the manifest's `voiceConfig`:
```json
{
  "voiceId": "Matthew",
  "engine": "neural",
  "ssmlPitch": "+10%",
  "ssmlRate": "105%"
}
```

**Character voice traits** (from personality bible):
- Energetic, slightly manic TV presenter cadence
- Deliberate stutter on certain consonants (marked with hyphens in text: "l-l-ladies", "b-broadcasting")
- Pitch rises at dramatic moments, drops conspiratorially for asides
- Rapid-fire delivery with sudden pauses for effect

### Option A: Amazon Polly (Recommended — lowest friction)

AWS Polly is already in the tech stack (used for conversation TTS via `synthesizeTurn`). Use the same voice for greeting consistency.

**Steps:**
1. Write a generation script at `scripts/generate-greetings.ts`
2. For each of the 16 greetings in the manifest:
   - Wrap text in SSML with `<prosody pitch="+10%" rate="105%">`
   - Add `<break>` tags at stutter points and dramatic pauses
   - Call Polly `synthesizeSpeech` with engine `neural`, voice `Matthew`
   - Save output as `packages/frontend/public/greetings/audio/greeting-{NNN}.mp3`
3. Verify `audioDurationMs` in manifest matches actual file durations (adjust if needed)

**Estimated cost:** 16 greetings × ~100 chars each ≈ 1,600 chars → well within Polly free tier (5M chars/month for 12 months).

**SSML example for greeting-001:**
```xml
<speak>
  <prosody pitch="+10%" rate="105%">
    <prosody rate="slow">L-l-ladies</prosody> and gentlemen,
    and viewers at home and in the walls
    <break time="300ms"/>
    — Max Height, coming to you
    <prosody rate="fast">live from the labyrinth of</prosody>
    television<break time="100ms"/>-vision<break time="100ms"/>-vision.
    <break time="500ms"/>
    What'll it be?
  </prosody>
</speak>
```

### Option B: ElevenLabs / External TTS

If a more expressive or custom voice is desired:
- ElevenLabs offers voice cloning from samples (NOT from Matt Frewer — constitution P4)
- Generate 16 MP3s via their API or web UI
- Place files at the same paths

### Option C: Manual Recording

Record a human voice actor performing the lines. Most authentic but highest effort.

---

## Phase 2: File Placement & Naming

All 16 MP3 files go in:
```
packages/frontend/public/greetings/audio/
├── greeting-001.mp3
├── greeting-002.mp3
├── ...
└── greeting-016.mp3
```

These paths match the `audioPath` fields already in `manifest.json`.

**File format requirements:**
- Format: MP3 (browser-universal decoding via Web Audio API)
- Sample rate: 22050 Hz or 24000 Hz (Polly neural default)
- Bit rate: 128 kbps (good quality, small file size)
- Target size: 50-100 KB per greeting (6-8.5 seconds each)

---

## Phase 3: Duration Calibration

The manifest has `audioDurationMs` for each greeting. After generating MP3s:

1. Measure actual durations (e.g., with ffprobe or a script)
2. Update `audioDurationMs` in `manifest.json` to match
3. Consider switching `GREETING_DISPLAY_MS` to use `audioDurationMs` when audio is available:
   - Currently: fixed 15,000ms text-only display
   - Future: `audioDurationMs + 1000ms` buffer when audio exists
   - Fallback: keep 15,000ms if MP3 fetch fails (404)

---

## Phase 4: Mouth Animation Tuning

The mouth sync pipeline (`audioChain.getIsMouthOpen()`) uses an analyser node to detect audio amplitude. Once real MP3s play:

1. **Test mouth sensitivity** — the amplitude threshold may need tuning for Polly's output
2. **Adjust poll rate** — currently 50ms (~20Hz), which should be sufficient for natural-looking talk frame cycling
3. **Verify talk frame alternation** — `AvatarFrameCycler` alternates between `talk-1` and `talk-2` on each mouth-open transition. Confirm this looks natural with real audio
4. **Laugh/side-eye timing** — these fire on random timers independent of audio. Verify they don't create jarring conflicts with talk frames (glitch > blink > talk > laugh > side-eye is the priority chain)

---

## Phase 5: Volume Knob Integration

The CRT TV frame has a volume knob UI element (right panel). Wire it to control greeting audio volume:

1. Add a `volume` state to `voiceStore` (0.0–1.0, default 0.8)
2. Connect volume knob UI to the store
3. Pass volume to `audioChain.setVolume()` (or gain node)
4. Apply to both greeting audio and future conversation TTS

---

## Phase 6: Greeting-to-Conversation Transition

When the backend comes online during or after the greeting:

1. **During greeting:** Let the greeting finish playing (don't interrupt)
2. **After greeting:** Transition smoothly — short pause, then conversation mode activates
3. **Backend never connects:** After greeting ends, show "SIGNAL LOST" / color bars (already implemented)

This logic is already partially built in `App.tsx` via `isGreetingDone` gating.

---

## Implementation Order

| Step | Task | Depends On |
|------|------|------------|
| 1 | Write `scripts/generate-greetings.ts` Polly script | AWS credentials |
| 2 | Generate 16 MP3 files | Step 1 |
| 3 | Place MP3s in `public/greetings/audio/` | Step 2 |
| 4 | Verify audio plays on TV power-on | Step 3 |
| 5 | Calibrate `audioDurationMs` in manifest | Step 3 |
| 6 | Tune mouth animation threshold | Step 4 |
| 7 | Switch greeting duration to audio-driven | Step 5 |
| 8 | Wire volume knob | Step 4 |

---

## Testing Strategy

- **Unit tests:** Mock `fetch` to return a real (tiny) MP3 ArrayBuffer, verify `audioChain.play()` is called
- **Integration tests:** Verify mouth polling starts/stops, voiceStore updates
- **Manual QA:** Listen to each greeting, verify mouth sync looks natural, check volume knob
- **Fallback test:** Delete an MP3, verify text-only greeting still works (existing behavior)

---

## Notes

- The audio chain already handles `AudioContext` lifecycle (user gesture requirement for autoplay). The TV power button click satisfies this.
- Max Height's stutters should be **in the audio**, not added by post-processing. SSML `<break>` tags give precise control.
- Keep MP3 files out of git LFS for now (16 files × ~75KB = ~1.2MB total — well under threshold).
- Future enhancement: generate multiple takes per greeting and randomly select variants for more variety.
