# Contract: Greeting Manifest Schema

**Feature**: 001-max-height-ai-character  
**Date**: 2026-04-19  
**Source**: spec.md §FR-002, data-model.md §Greeting, personality bible §5

---

## Overview

Greetings are pre-generated static assets deployed with the frontend. The manifest file at `/public/greetings/manifest.json` describes the pool. Each greeting includes text, a pre-synthesized MP3 audio file, and a short talking-head video clip of Max animating (per FR-002).

---

## File Layout

```
public/
  greetings/
    manifest.json
    audio/
      greeting-001.mp3
      greeting-002.mp3
      ...
    video/
      greeting-001.mp4
      greeting-002.mp4
      ...
```

---

## Manifest JSON Schema

```jsonc
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["version", "greetings"],
  "properties": {
    "version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+\\.\\d+$",
      "description": "SemVer version of the manifest format"
    },
    "generatedAt": {
      "type": "string",
      "format": "date-time",
      "description": "When this manifest was last generated"
    },
    "voiceConfig": {
      "type": "object",
      "description": "Polly config used to synthesize all greeting audio",
      "required": ["voiceId", "engine"],
      "properties": {
        "voiceId": { "type": "string", "const": "Matthew" },
        "engine": { "type": "string", "const": "neural" },
        "ssmlPitch": { "type": "string", "default": "+10%" },
        "ssmlRate": { "type": "string", "default": "105%" }
      }
    },
    "greetings": {
      "type": "array",
      "minItems": 16,
      "items": {
        "$ref": "#/definitions/Greeting"
      }
    }
  },
  "definitions": {
    "Greeting": {
      "type": "object",
      "required": ["id", "archetype", "text", "audioPath", "audioDurationMs", "videoPath"],
      "properties": {
        "id": {
          "type": "string",
          "pattern": "^greeting-\\d{3}$",
          "description": "Unique greeting ID (e.g., greeting-001)"
        },
        "archetype": {
          "type": "string",
          "enum": [
            "TV_PRESENTER_INTRO",
            "MID_MONOLOGUE",
            "MOCK_ANNOYANCE",
            "SPONSOR_BREAK",
            "TIME_OF_DAY_RIFF",
            "SELF_CONGRATULATION",
            "FAKE_NEWS_FLASH",
            "GLITCH_COLD_OPEN"
          ],
          "description": "One of the 8 personality bible §5 archetypes"
        },
        "text": {
          "type": "string",
          "minLength": 40,
          "maxLength": 500,
          "description": "Max's greeting text (40-100 words)"
        },
        "audioPath": {
          "type": "string",
          "pattern": "^audio/greeting-\\d{3}\\.mp3$",
          "description": "Relative path to pre-synthesized MP3"
        },
        "audioDurationMs": {
          "type": "integer",
          "minimum": 1000,
          "maximum": 15000,
          "description": "Audio playback duration in milliseconds"
        },
        "videoPath": {
          "type": "string",
          "pattern": "^video/greeting-\\d{3}\\.mp4$",
          "description": "Relative path to short talking-head video clip"
        },
        "weight": {
          "type": "number",
          "minimum": 0.0,
          "maximum": 1.0,
          "default": 1.0,
          "description": "Selection probability weight (higher = more likely)"
        },
        "tags": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Optional metadata tags for context-based filtering"
        }
      }
    }
  }
}
```

---

## Selection Algorithm

```
1. Load manifest.json on app init.
2. Read visitor's greetingHistory from localStorage (last 20 IDs).
3. Filter out greetings used in last 3 sessions (FR-002 no-repeat rule).
4. If time-of-day tags exist, prefer matching greetings (morning/afternoon/evening).
5. Weighted random selection from remaining pool.
6. Push selected ID to greetingHistory, trim to 20 entries.
7. Return selected greeting for playback + session_start payload.
```

### Edge case: Pool exhaustion

If all greetings are filtered out (small pool + frequent visits), reset the no-repeat window to 1 session instead of 3, and log a warning. The pool must have at least 16 greetings (2 per archetype minimum).

---

## Greeting Validation Rules

| Rule | Constraint | Source |
|------|-----------|--------|
| Minimum pool size | ≥ 16 greetings (2 per archetype × 8 archetypes) | Spec clarification session 2 |
| No repeat within 3 sessions | Filter by visitor's `greetingHistory` | FR-002 |
| Text length | 40–100 words | data-model.md |
| Audio exists | `audioPath` must resolve to valid MP3 | Build-time validation |
| Video exists | `videoPath` must resolve to valid MP4 | Build-time validation |
| Each archetype represented | At least 2 greetings per archetype value | Pool completeness + spec clarification |

---

## Build-Time Validation

A CI step should validate:
1. `manifest.json` passes the JSON Schema above.
2. Every `audioPath` resolves to an existing `.mp3` file.
3. Every `videoPath` resolves to an existing `.mp4` file.
4. All 8 archetypes have at least 2 greetings each (16 total minimum).
5. No duplicate `id` values.
6. All `audioDurationMs` values are within ±500ms of actual MP3 duration.
