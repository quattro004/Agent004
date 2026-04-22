# UX / Visual Presentation Checklist: Max Height AI Character

**Purpose**: Validate that UX and visual presentation requirements are complete, clear, consistent, and measurable — covering the CRT framing, avatar, broadcast mode, TV interaction model, glitch effects, and mobile visual parity.
**Created**: 2026-04-22
**Feature**: [spec.md](../spec.md)

## Requirement Completeness

- [ ] CHK001 — Are layout dimensions and positioning specified for the CRT television frame (bezel size, aspect ratio, viewport proportions)? [Completeness, Spec §FR-001, §Visual Presentation]
- [ ] CHK002 — Are the visual specifications for the "Turn on the TV" knob defined (size, position on the CRT frame, affordance cues, animation on interaction)? [Completeness, Spec §FR-001]
- [ ] CHK003 — Are requirements for the wireframe/vector backdrop defined with enough detail to implement (grid density, rotation speed, color palette values, animation behavior)? [Completeness, Spec §Visual Presentation]
- [ ] CHK004 — Are the 2D placeholder avatar visual specifications documented (SVG dimensions, head-and-shoulders framing ratio, placement within CRT frame)? [Completeness, Spec §FR-006a]
- [ ] CHK005 — Are requirements for the binary mouth-state animation specified (open/closed frame timing, sync method to audio playback, visual design of each state)? [Completeness, Spec §FR-006a]
- [ ] CHK006 — Are text display requirements for Max's response defined (font, size, positioning within the CRT frame, text overflow/truncation behavior, character-by-character vs. block reveal)? [Completeness, Spec §FR-026]
- [ ] CHK007 — Are requirements for the text input area and mic button layout specified (positioning relative to TV frame, sizing, spacing, always-visible constraint)? [Completeness, Spec §FR-026]
- [ ] CHK008 — Are the "ON AIR" indicator visual requirements defined (size, color, position, animation)? [Completeness, Spec §FR-008]
- [ ] CHK009 — Are loading/buffering UX requirements for cold-start defined beyond "in-character"? (Visual treatment, animation, positioning within the CRT frame) [Completeness, Spec §FR-011]
- [ ] CHK010 — Are requirements for the in-character error states defined visually ("signal lost", "Max is taking a break", budget breach)? [Completeness, Spec §FR-014, §FR-015]
- [ ] CHK011 — Are the "Forget me" and "Export" control placements and visual treatments specified? [Gap, Spec §FR-017, §FR-018]

## Requirement Clarity

- [ ] CHK012 — Is "reduced intensity" for mobile glitch effects quantified with specific parameters (e.g., percentage reduction, which effects are reduced vs. removed)? [Clarity, Spec §Visual Presentation, US2 §2]
- [ ] CHK013 — Is "constant low-level glitching" defined with measurable parameters (frequency of frame skips, intensity of scanline artifacts, trigger conditions for "abrupt backdrop changes")? [Clarity, Spec §Visual Presentation]
- [ ] CHK014 — Is "period-appropriate palette (e.g., magenta/cyan on black)" specified with exact color values, or is this intentionally left to implementation? [Clarity, Spec §Visual Presentation]
- [ ] CHK015 — Is "head and shoulders only" framing defined with specific crop ratios or reference imagery for the 2D avatar? [Clarity, Spec §Visual Presentation]
- [ ] CHK016 — Is "broadcast mode" display behavior fully specified — specifically, how the visitor's last input is shown "briefly" (duration? animation? positioning?) before being replaced? [Clarity, Spec §FR-026]
- [ ] CHK017 — Is the "in-character 'buffering' UX" for cold start defined with specific visual/textual treatment, or just the requirement that it be in-character? [Ambiguity, Spec §FR-011]

## Requirement Consistency

- [ ] CHK018 — Are the visual framing requirements consistent between the MVP 2D avatar and the V1 3D avatar upgrade path? Does the spec confirm the CRT/bezel/backdrop framing stays the same? [Consistency, Spec §Visual Presentation, §FR-006a vs §FR-006]
- [ ] CHK019 — Are glitch effect requirements consistent between the Visual Presentation section and the performance requirement for 60fps CRT effects on desktop? [Consistency, Spec §Visual Presentation vs §SC-004]
- [ ] CHK020 — Are the anti-goal constraints (no full-body, no chat-bubble, no free-floating head) referenced in both the Visual Presentation section and any relevant acceptance scenarios? [Consistency, Spec §Visual Presentation]

## Scenario Coverage

- [ ] CHK021 — Are requirements defined for the visual transition from "TV off" to "TV on" state (animation, timing, visual treatment of the CRT powering up)? [Coverage, Gap]
- [ ] CHK022 — Are requirements specified for what the TV/CRT looks like in its "off" state before the visitor clicks the knob? [Coverage, Gap]
- [ ] CHK023 — Are visual requirements for the interruption flow defined — what happens visually when the visitor interrupts Max mid-response (partial text behavior, avatar state, transition)? [Coverage, Spec §FR-027]
- [ ] CHK024 — Are requirements for the session-end visual state specified (what does the CRT show after 50-turn/20K-token/30-min cap is hit)? [Coverage, Spec §FR-010]
- [ ] CHK025 — Are requirements specified for the rate-limit breach visual state (in-character refusal copy presentation within CRT frame)? [Coverage, Spec §FR-020]

## Edge Case Coverage

- [ ] CHK026 — Are visual requirements defined for extremely long single-word inputs or very short responses from Max (layout edge cases within the CRT frame)? [Edge Case, Gap]
- [ ] CHK027 — Are requirements specified for viewport sizes between mobile and desktop breakpoints (tablet, small laptop)? [Edge Case, Gap]
- [ ] CHK028 — Are requirements for the mic disclosure notice defined visually (first-activation modal/banner styling, persistent small-print placement relative to mic control)? [Edge Case, Spec §FR-019]

## Non-Functional Requirements (Visual Performance)

- [ ] CHK029 — Are CRT effect performance requirements defined per device class (desktop: 60fps specified in SC-004 — but is a mobile fps target defined)? [Gap, Spec §SC-004]
- [ ] CHK030 — Are progressive enhancement tiers defined for devices that can run some but not all CRT effects? [Gap, Spec §Visual Presentation]

## Accessibility

- [ ] CHK031 — Are keyboard focus indicator visual requirements defined for all interactive elements (TV knob, text input, mic button, Forget me, Export)? [Completeness, Spec §Clarifications 2026-04-20]
- [ ] CHK032 — Are color contrast requirements specified for text displayed within the CRT frame (Max's responses against the glitch/wireframe backdrop)? [Gap]
- [ ] CHK033 — Are reduced-motion requirements specified for visitors who prefer reduced motion (prefers-reduced-motion media query handling for glitch effects)? [Gap]

## Notes

- Check items off as completed: `[x]`
- Add comments or findings inline
- Items are numbered sequentially for easy reference
- This checklist covers MVP requirements unless tagged [V1]
