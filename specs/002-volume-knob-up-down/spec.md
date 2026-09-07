# Feature Specification: Volume Knob — Turn Up and Down

**Feature Branch**: `002-volume-knob-up-down`  
**Created**: 2026-09-07  
**Status**: Draft  
**Input**: User description: "Currently when the user selects the volume it will continue to increase until it reaches max and then it starts over. The feature is to make it so the UI has the ability to be turned up or down. A nice to have would be a sweet animation where the knob turns right or left like a real knob."

---

## Product Summary

The TV console panel has a VOLUME knob. Today it is a one-way control: each click raises the
volume by one step, and once it reaches maximum the next click drops it silently back to
zero. A visitor who overshoots has no way to nudge the volume back down — they must click ten
more times to wrap all the way around, passing through silence on the way.

This feature makes the knob behave like a real volume knob: it turns **both ways**, and it
**stops** at each end instead of wrapping. A rotating indicator gives visual feedback so the
knob reads as physically turning.

---

## Clarifications

### Session 2026-09-07

- Q: How should the user turn the volume up and down? → A: Split hit-area — click the right half of the knob to raise, the left half to lower. Additionally support the mouse wheel over the knob and the arrow keys.
- Q: What should happen at the ends of the range? → A: Clamp. The volume stops at 0 and stops at maximum. Wrapping is removed entirely.
- Q: How far should the knob-turning animation go? → A: A rotating indicator with a springy overshoot as it settles, so it feels like a real dial being turned.
- Q: The brass knob is painted into the TV frame image — can it rotate? → A: No. The knob is baked pixels in `TV-frame.png`, so the animation must be a separate overlay drawn on top of it rather than a rotation of the artwork itself.
- Q: What testing scope applies? → A: All layers — unit tests for pure helpers, unit tests for the component, an app-level integration test, Playwright E2E, and reduced-motion coverage.

---

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Turn the volume down, and stop at the ends (Priority: P1)

A visitor watching Max clicks the volume knob a few times to raise it, overshoots, and wants
it slightly quieter. They click the left side of the knob and the volume steps down by one.
When they keep clicking up at maximum, the volume stays at maximum rather than dropping to
silence.

**Why this priority**: This is the reported bug and the entire point of the feature. Without
it the control is unusable in one direction and actively surprising in the other. Shipping
just this story delivers the full core value.

**Independent Test**: Power on the TV, click the right half of the knob to raise the volume
and the left half to lower it, and confirm the LED bar tracks in both directions and refuses
to wrap past either end.

**Acceptance Scenarios**:

1. **Given** the volume is at step 3, **When** the visitor clicks the right half of the knob, **Then** the volume rises to step 4 and 4 LEDs are lit.
2. **Given** the volume is at step 3, **When** the visitor clicks the left half of the knob, **Then** the volume falls to step 2 and 2 LEDs are lit.
3. **Given** the volume is at maximum, **When** the visitor clicks the right half, **Then** the volume stays at maximum and does **not** reset to silence.
4. **Given** the volume is at zero, **When** the visitor clicks the left half, **Then** the volume stays at zero and does **not** jump to maximum.
5. **Given** the volume is at zero, **When** the visitor clicks the right half, **Then** the volume rises to step 1.
6. **Given** the TV is powered off, **When** the visitor clicks either half of the knob, **Then** nothing happens and both halves are visibly unavailable.

---

### User Story 2 - Adjust volume by wheel or keyboard (Priority: P2)

A visitor hovers the knob and scrolls their mouse wheel to sweep the volume up or down
quickly. A keyboard-only visitor tabs to the knob and uses the arrow keys.

**Why this priority**: These are convenience and accessibility affordances layered on top of
the working control from US1. Valuable, but the feature is already usable without them.

**Independent Test**: With the TV on, scroll the wheel over the knob and confirm the volume
moves; then tab to the knob and press the arrow keys and confirm the same.

**Acceptance Scenarios**:

1. **Given** the TV is on, **When** the visitor scrolls the wheel up over the knob, **Then** the volume rises one step.
2. **Given** the TV is on, **When** the visitor scrolls the wheel down over the knob, **Then** the volume falls one step.
3. **Given** the knob has keyboard focus, **When** the visitor presses ArrowUp or ArrowRight, **Then** the volume rises one step.
4. **Given** the knob has keyboard focus, **When** the visitor presses ArrowDown or ArrowLeft, **Then** the volume falls one step.
5. **Given** the knob has keyboard focus, **When** the visitor presses Home, **Then** the volume goes to zero; **When** they press End, **Then** it goes to maximum.
6. **Given** the knob has keyboard focus, **When** the visitor presses an unrelated key, **Then** the volume does not change.
7. **Given** the visitor uses the arrow keys on the knob, **When** the key is pressed, **Then** the page does not also scroll.

---

### User Story 3 - See the knob turn (Priority: P3)

When the visitor changes the volume, a pointer on the knob swings to a new angle with a
slight overshoot before settling, so the control reads as a physical dial rather than a
counter.

**Why this priority**: This is the stated nice-to-have. It is pure polish — the volume is
fully controllable and fully readable via the LED bar without it.

**Independent Test**: Change the volume and observe the indicator rotating to a new angle;
enable the OS "reduce motion" setting and confirm the indicator still moves to the correct
angle but without animation.

**Acceptance Scenarios**:

1. **Given** the volume is at zero, **When** the visitor raises it to maximum, **Then** the indicator rotates through roughly 270 degrees from its minimum angle to its maximum angle.
2. **Given** the volume changes, **When** the indicator moves, **Then** it overshoots slightly and settles rather than stopping dead.
3. **Given** the visitor has "reduce motion" enabled, **When** the volume changes, **Then** the indicator jumps to the correct angle immediately with no animation.
4. **Given** the indicator is drawn over the knob, **When** the visitor clicks anywhere on the knob, **Then** the click still reaches the correct half and changes the volume.

---

### Edge Cases

- What happens when the visitor clicks the exact vertical centre line of the knob? The halves must tile the circle with no dead zone and no overlap; one of the two must receive the click.
- What happens when the volume is already at an end and the visitor keeps clicking? The value is unchanged and no redundant change notification is emitted.
- What happens when a visitor's mouse wheel emits a zero-magnitude scroll event? No change.
- What happens to a focused half-button when the volume reaches an end? It remains focusable and enabled, so keyboard focus is never yanked mid-interaction.
- What happens on a touch device with no wheel and no keyboard? The split hit-area still works by tap, so the control is fully operable.
- What happens at very small or very large viewports? The knob's hit-area must stay aligned over the painted knob artwork at every viewport size.

---

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The volume control MUST allow the visitor to both raise and lower the volume.
- **FR-002**: Clicking the right half of the knob MUST raise the volume by one step; clicking the left half MUST lower it by one step.
- **FR-003**: The volume MUST clamp at its minimum and maximum. It MUST NOT wrap from maximum to minimum or from minimum to maximum.
- **FR-004**: When the volume is already at an end, an attempt to move further past it MUST leave the value unchanged and MUST NOT emit a change notification.
- **FR-005**: Scrolling the mouse wheel over the knob MUST adjust the volume — scrolling away from the visitor raises it, scrolling toward them lowers it.
- **FR-006**: The knob MUST respond to ArrowUp/ArrowRight (raise), ArrowDown/ArrowLeft (lower), Home (minimum) and End (maximum) when focused.
- **FR-007**: Keys handled by the knob MUST NOT also cause the page to scroll.
- **FR-008**: The raise and lower controls MUST expose distinct accessible names so assistive technology can tell them apart.
- **FR-009**: The knob MUST expose its current value, minimum and maximum to assistive technology.
- **FR-010**: All volume interactions MUST be inert while the TV is powered off, and the control MUST appear unavailable in that state.
- **FR-011**: The existing 12-position step model and the resulting audio gain MUST be preserved — this feature changes how the visitor moves between steps, not what the steps mean.
- **FR-012**: The LED readout MUST continue to reflect the current step in both directions of travel.
- **FR-013**: A rotating indicator MUST show the knob's current position, mapping the full step range across roughly 270 degrees of sweep.
- **FR-014**: The indicator MUST animate with a springy overshoot when the volume changes.
- **FR-015**: The indicator MUST NOT intercept pointer events; clicks must pass through to the underlying controls.
- **FR-016**: When the visitor has requested reduced motion, the indicator MUST move to the correct angle without animating.
- **FR-017**: The knob's interactive hit-area MUST remain visually aligned over the painted knob artwork across all supported viewport sizes.
- **FR-018**: The TV frame artwork MUST NOT be modified.

### Key Entities

- **Volume step**: A discrete integer position from 0 to 11 inclusive (12 positions). The single source of truth for the control's state.
- **Gain**: The normalized 0–1 audio value handed to the audio chain, derived from the step. Unchanged by this feature.
- **Knob angle**: A presentation-only value derived from the step, used to rotate the indicator. Spans roughly -135° at minimum to +135° at maximum.

---

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A visitor who overshoots the volume can correct it in a single interaction, instead of the ten-plus interactions required today.
- **SC-002**: Raising the volume at maximum never produces silence — the wrap-around defect is eliminated in 100% of attempts.
- **SC-003**: The volume is fully controllable in both directions by pointer, by mouse wheel, and by keyboard alone.
- **SC-004**: The knob's position is readable at a glance from both the LED bar and the indicator angle.
- **SC-005**: Visitors who request reduced motion get the same control and the same information with no animation.
- **SC-006**: Existing panel alignment coverage passes without modification, confirming the knob artwork and hit-area remain aligned at every tested viewport.
- **SC-007**: The full repository validation gate passes.

---

## Assumptions

- The 12-step model and the existing gain curve are correct and are deliberately retained; only the traversal behavior changes.
- The brass knob is part of a static frame image and cannot itself be rotated, restyled, or replaced; the turning effect must be an overlay.
- The existing LED bar remains the primary numeric readout; the rotating indicator supplements it rather than replacing it.
- The application is a fixed full-screen layout, so wheel interactions over the knob have no competing page scroll in practice.
- Volume is session-only state and is not expected to persist across page reloads.
- The component's existing public interface stays stable, so no changes to the surrounding application wiring are required.

---

## Out of Scope

- Drag-to-rotate, where the visitor presses and swings the knob around its axis. A good follow-up once this ships.
- Touch swipe gestures beyond simple taps on the two halves.
- Persisting the chosen volume across page reloads.
- A dedicated mute toggle.
- Changing the number of steps or the shape of the gain curve.
- Revisiting reduced-motion handling in unrelated components.
