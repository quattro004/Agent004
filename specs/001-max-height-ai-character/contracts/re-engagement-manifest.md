# Contract: Re-Engagement Manifest Schema

**Feature**: 001-max-height-ai-character  
**Date**: 2026-04-30  
**Source**: spec.md §Iterations (2026-04-30), personality bible §5.1, message-protocol.md §Mid-Session Re-Engagement Protocol

---

## Overview

Re-engagement messages are pre-generated static assets deployed with the frontend. The manifest file at `/public/greetings/re-engagements/re-engagement-manifest.json` describes the pool. Each re-engagement includes text, a pre-synthesized MP3 audio file, and a short video clip of Max's talking head. This eliminates LLM + Polly costs for idle re-engagements while maintaining instant playback.

This contract mirrors the structure of `greeting-manifest.md` but is tailored to re-engagement archetypes from the personality bible §5.1.

---

## File Layout

```
public/
  greetings/
    re-engagements/
      re-engagement-manifest.json
      audio/
        re-engagement-001.mp3
        re-engagement-002.mp3
        ...
      video/
        re-engagement-001.mp4
        re-engagement-002.mp4
        ...
```

---

## Manifest JSON Schema

```jsonc
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["version", "reEngagements"],
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
      "description": "Polly config used to synthesize all re-engagement audio",
      "required": ["voiceId", "engine"],
      "properties": {
        "voiceId": { "type": "string", "const": "Matthew" },
        "engine": { "type": "string", "const": "neural" },
        "ssmlPitch": { "type": "string", "default": "+10%" },
        "ssmlRate": { "type": "string", "default": "105%" }
      }
    },
    "reEngagements": {
      "type": "array",
      "minItems": 12,
      "items": {
        "$ref": "#/definitions/ReEngagement"
      }
    }
  },
  "definitions": {
    "ReEngagement": {
      "type": "object",
      "required": ["id", "archetype", "text", "audioPath", "audioDurationMs", "videoPath"],
      "properties": {
        "id": {
          "type": "string",
          "pattern": "^re-engagement-\\d{3}$",
          "description": "Unique re-engagement ID (e.g., re-engagement-001)"
        },
        "archetype": {
          "type": "string",
          "enum": [
            "SIGNAL_CHECK",
            "FAKE_CONCERN",
            "RAMBLING_FILL",
            "SELF_ENTERTAINMENT",
            "MOCK_SIGN_OFF",
            "AUDIENCE_ADDRESS"
          ],
          "description": "One of the 6 re-engagement archetypes from personality bible §5.1"
        },
        "text": {
          "type": "string",
          "minLength": 20,
          "maxLength": 400,
          "description": "Max's re-engagement text (20–80 words; 2nd re-engagement should be shorter/more genuine)"
        },
        "audioPath": {
          "type": "string",
          "pattern": "^audio/re-engagement-\\d{3}\\.mp3$",
          "description": "Relative path to pre-synthesized MP3"
        },
        "audioDurationMs": {
          "type": "integer",
          "minimum": 1000,
          "maximum": 12000,
          "description": "Audio playback duration in milliseconds"
        },
        "videoPath": {
          "type": "string",
          "pattern": "^video/re-engagement-\\d{3}\\.mp4$",
          "description": "Relative path to short talking-head video clip"
        },
        "weight": {
          "type": "number",
          "minimum": 0.0,
          "maximum": 1.0,
          "default": 1.0,
          "description": "Selection probability weight within archetype (higher = more likely)"
        }
      }
    }
  }
}
```

---

## Re-Engagement Archetypes

Per personality bible §5.1, the 6 re-engagement archetypes are:

| Archetype | Description | Example tone |
|-----------|-------------|--------------|
| `SIGNAL_CHECK` | Max checks if the visitor is still there | "H-h-hello? Is this thing still on?" |
| `FAKE_CONCERN` | Feigned worry about the visitor's absence | "Should I be worried? Did you fall asleep on me?" |
| `RAMBLING_FILL` | Max fills the silence with a tangent | "You know, while you're away, I've been thinking about—" |
| `SELF_ENTERTAINMENT` | Max amuses himself | "Don't mind me, I'll just entertain m-m-myself..." |
| `MOCK_SIGN_OFF` | Threatens to leave (but doesn't) | "Well, if you're not going to talk to me, maybe I'll just—" |
| `AUDIENCE_ADDRESS` | Breaks fourth wall, addresses imaginary audience | "Ladies and gentlemen, it appears my guest has left the building." |

---

## Selection Algorithm

```
1. Load re-engagement-manifest.json on app init.
2. Track usedIds (set of IDs used this session) and lastArchetype.
3. On re-engagement trigger (timer fires, reEngagementCount < 2):
   a. Filter out entries with IDs in usedIds (no-repeat-within-session).
   b. Filter out entries matching lastArchetype (never repeat same archetype consecutively).
   c. From remaining pool, perform weighted random selection.
   d. Add selected ID to usedIds; set lastArchetype to selected archetype.
   e. Return selected entry (text + audioPath) for playback.
4. If pool exhaustion after filtering: relax no-repeat-within-session constraint,
   but maintain archetype rotation constraint.
```

### Key constraints

- **Archetype rotation**: Never repeat the same archetype consecutively (if 1st re-engagement was `SIGNAL_CHECK`, 2nd must be a different archetype).
- **No repeat within session**: Once an entry is used in a session, it cannot be used again in the same session.
- **Weighted random**: Within the eligible pool, entries are selected by weight.
- **2nd shorter/more genuine**: Content authoring should ensure later-numbered entries per archetype skew shorter and slightly more genuine in tone, supporting the personality bible's directive that the 2nd re-engagement is shorter and more genuine than the 1st.

---

## Validation Rules

| Rule | Constraint | Source |
|------|-----------|--------|
| Minimum pool size | ≥ 12 entries (2 per archetype × 6 archetypes) | Cost optimization iteration |
| Archetype coverage | At least 2 entries per archetype value | Pool completeness |
| Text length | 20–80 words | Personality bible §5.1 targets |
| Audio exists | `audioPath` must resolve to valid MP3 | Build-time validation |
| Video exists | `videoPath` must resolve to valid MP4 | Build-time validation |
| No duplicate IDs | Each `id` must be unique | Data integrity |
| Duration accuracy | `audioDurationMs` within ±500ms of actual MP3 duration | Build-time validation |

---

## Build-Time Validation

A CI step should validate (alongside greeting manifest validation):

1. `re-engagement-manifest.json` passes the JSON Schema above.
2. Every `audioPath` resolves to an existing `.mp3` file in `public/greetings/re-engagements/audio/`.
3. All 6 archetypes have at least 2 entries each (12 total minimum).
4. No duplicate `id` values.
5. All `audioDurationMs` values are within ±500ms of actual MP3 duration.

---

## Cost Impact

By serving re-engagement content from pre-recorded assets:
- **Eliminated**: ~$0.003 LLM cost + ~$0.004 Polly cost per re-engagement (previously $0.007/re-engagement).
- **At scale**: With max 2 re-engagements per idle stretch, this saves ~$0.014 per idle visitor session.
- **Additional benefit**: Instant playback (no LLM latency or Polly synthesis wait).

---

## Relationship to Post-Greeting Nudge

The post-greeting nudge (FR-003, 4–10s timer) is a separate system from mid-session re-engagements. It MAY optionally also use pre-recorded content in a future iteration, but this is **not required for MVP**. The nudge currently uses LLM generation, which is acceptable because it fires at most once per session during the greeting→first-input window.
