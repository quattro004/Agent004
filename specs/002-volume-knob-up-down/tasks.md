# Tasks: Volume Knob — Turn Up and Down

**Input**: Design documents from `specs/002-volume-knob-up-down/`
**Prerequisites**: spec.md ✅, plan.md ✅

**Tests**: Per constitution P10 ("PRs that add or modify behavior MUST include corresponding test
coverage"), test tasks are embedded within each user story phase and are written **first**
(RED → GREEN → REFACTOR). Vitest + React Testing Library for units and integration, Playwright
for E2E.

**Organization**: Tasks are grouped by user story so each story can be implemented, tested and
demoed independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- All paths are relative to `packages/frontend/` unless stated otherwise
- Paths follow `plan.md` §5 "Project structure (files touched)"

## Learner Notes

This feature is being implemented by a developer who is learning. `plan.md` §4 contains a short
primer on the concepts each task uses (pure functions, clamping, angle maths, CSS custom
properties, overshoot easing, `prefers-reduced-motion`, accessible names). Read it before
starting Phase 1. Each phase below links back to the matching plan cycle.

---

## Critical Constraints (read before any task)

| ID | Constraint | Why |
|----|------------|-----|
| C1 | Do **not** change the size or position of `.volume-knob` | `tests/e2e/panel-alignment.spec.ts` asserts its centre within ±1.5% of the painted knob across viewports and must pass **unedited** (plan.md §3a) |
| C2 | Do **not** modify `public/TV-frame.png` | The brass knob is baked artwork; the turning effect is an overlay, not a rotation of the image (plan.md §3b) |
| C3 | Do **not** change the `VolumeKnob` prop contract `{ volume, onVolumeChange, disabled }` | Keeps `src/App.tsx` untouched and limits blast radius (plan.md §5) |
| C4 | Do **not** change the 12-step model or the `step / 11` gain curve | FR-011 — this feature changes traversal, not meaning |

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Extract the volume maths into a pure, independently testable module before any UI
work. Mirrors the existing convention where `nextTheme` lives in `src/config/constants.ts`.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete — every story imports
these helpers.

**Plan reference**: Cycle 1

- [ ] T001 **[RED]** Write Vitest tests for the volume helpers in `tests/config/volume.test.ts` — assert `clampStep(-3) === 0`, `clampStep(5) === 5`, `clampStep(99) === 11`; `gainToStep(0) === 0`, `gainToStep(1) === 11`, `gainToStep(0.5) === 6`; `stepToGain(0) === 0`, `stepToGain(11) === 1`; a round-trip loop asserting `gainToStep(stepToGain(n)) === n` for every `n` in 0..11; `stepToAngle(0) === -135`, `stepToAngle(11) === 135`, and `expect(stepToAngle(6)).toBeCloseTo(12.27, 2)`. Run the file and confirm it fails with a missing-module/missing-export error
- [ ] T002 **[GREEN]** Implement `src/config/volume.ts` exporting `VOLUME_MAX_STEP = 11`, `VOLUME_LED_COUNT = 11`, `KNOB_MIN_ANGLE_DEG = -135`, `KNOB_MAX_ANGLE_DEG = 135`, and pure functions `clampStep`, `gainToStep`, `stepToGain`, `stepToAngle` (angle formula: `KNOB_MIN_ANGLE_DEG + (step / VOLUME_MAX_STEP) * (KNOB_MAX_ANGLE_DEG - KNOB_MIN_ANGLE_DEG)`). Re-run T001 until green
- [ ] T003 **[REFACTOR]** Review `src/config/volume.ts` for naming clarity and add a short doc comment on each export explaining the 0..11 step model and the 270° sweep; re-run `pnpm vitest run tests/config/volume.test.ts`

**Checkpoint**: Pure helpers are green and fast. Note how little setup these tests needed — that is the payoff for extracting pure logic.

---

## Phase 2: User Story 1 — Turn the volume down, and stop at the ends (Priority: P1) 🎯 MVP

**Goal**: The knob raises **and** lowers the volume, and clamps at both ends instead of wrapping.

**Independent Test**: Power on the TV, click the right half of the knob to raise and the left half
to lower; confirm the LED bar tracks both directions and refuses to wrap past either end.

**Plan reference**: Cycles 2 and 3

### Split hit-area (up / down)

- [ ] T004 **[RED]** [US1] Update `tests/components/VolumeKnob.test.tsx` for the split hit-area — replace every ambiguous `getByRole('button', { name: /volume/i })` lookup with the exact names `'Volume up'` and `'Volume down'`; assert both buttons render; at step 3 clicking **up** calls `onVolumeChange` with `4/11` and clicking **down** calls it with `2/11`; clicking down at step 1 emits `0`; neither button calls `onVolumeChange` when `disabled` is true. Confirm the suite fails
- [ ] T005 **[GREEN]** [US1] Rewrite `src/components/VolumeKnob.tsx` per plan.md §5 — `div.volume-knob` (`role="group"`, `aria-label="Volume"`) containing `button.volume-knob-half--down` (`aria-label="Volume down"`) and `button.volume-knob-half--up` (`aria-label="Volume up"`), still wrapped in `div.volume-knob-wrapper` with the unchanged `div.volume-led-bar` beneath; import the Phase 1 helpers; keep props `{ volume, onVolumeChange, disabled }` exactly as-is (C3). Preserve the existing `aria-valuemin` / `aria-valuemax` / `aria-valuenow` / `aria-valuetext` readout (incl. the "one louder" text at step 11) on the group
- [ ] T006 [US1] Add `.volume-knob-half--up` / `.volume-knob-half--down` CSS in `src/App.css` — absolutely positioned left and right semicircles filling `.volume-knob` with no dead zone and no overlap; transparent background, no border; `.volume-knob` keeps its existing `width: 55%`, `aspect-ratio: 1/1` and position (C1)
- [ ] T007 [US1] **Fix the stale disabled selector** — `.volume-knob:hover:not(:disabled)` in `src/App.css` no longer matches now that `.volume-knob` is a `div` (`:disabled` does not apply to non-form elements). Replace with a `.volume-knob--disabled` class applied from the component, and update the hover and disabled rules accordingly
- [ ] T008 **[REFACTOR]** [US1] Collapse both click handlers in `src/components/VolumeKnob.tsx` into a single `changeStep(delta: number)` function; re-run `pnpm vitest run tests/components/VolumeKnob.test.tsx`

### Clamping (the actual bug fix)

- [ ] T009 **[RED]** [US1] In `tests/components/VolumeKnob.test.tsx`, **delete** the existing test `'wraps from step 11 back to step 0'` — it documents behaviour we are deliberately removing (do not `.skip` it) — and add replacements: at step 11 clicking **up** does **not** call `onVolumeChange` at all; at step 0 clicking **down** does **not** call it at all; at step 0 clicking **up** emits `1/11`. Confirm the new assertions fail
- [ ] T010 **[GREEN]** [US1] Route every volume change in `src/components/VolumeKnob.tsx` through `clampStep`, and return early without invoking `onVolumeChange` when the clamped step equals the current step (FR-004). Keep both half-buttons **enabled** at the ends — clamp in the handler rather than disabling, so keyboard focus is never yanked mid-interaction

**Checkpoint**: US1 is independently shippable. The reported bug is fixed and the control is fully usable by pointer.

---

## Phase 3: User Story 2 — Adjust volume by wheel or keyboard (Priority: P2)

**Goal**: The knob also responds to the mouse wheel and to the keyboard.

**Independent Test**: With the TV on, scroll the wheel over the knob and confirm the volume moves;
then tab to the knob and press the arrow keys and confirm the same.

**Plan reference**: Cycles 4 and 5

- [ ] T011 **[RED]** [P] [US2] Add keyboard tests to `tests/components/VolumeKnob.test.tsx` — `fireEvent.keyDown` on `.volume-knob` with `ArrowUp` and `ArrowRight` raises; `ArrowDown` and `ArrowLeft` lowers; `Home` emits `0`; `End` emits `1`; an unrelated key (e.g. `'a'`) emits nothing; no key does anything when `disabled`
- [ ] T012 **[GREEN]** [US2] Add an `onKeyDown` handler to the `.volume-knob` container in `src/components/VolumeKnob.tsx` (on the container, not the halves, so it fires regardless of which half has focus — events bubble). Switch on `event.key` and call `event.preventDefault()` for every key you handle so arrow keys do not also scroll the page (FR-007)
- [ ] T013 **[RED]** [P] [US2] Add wheel tests to `tests/components/VolumeKnob.test.tsx` — `fireEvent.wheel(knob, { deltaY: -100 })` raises (scrolling away from the visitor = louder, matching OS convention); `{ deltaY: 100 }` lowers; `{ deltaY: 0 }` does nothing; nothing happens when `disabled`
- [ ] T014 **[GREEN]** [US2] Add an `onWheel` handler to `.volume-knob` in `src/components/VolumeKnob.tsx` branching on `Math.sign(event.deltaY)`. Add a code comment noting that React attaches wheel listeners passively so `preventDefault()` is ignored here — acceptable because the app is a fixed full-screen layout with nothing to scroll; the escape hatch, if ever needed, is a native listener registered via `useEffect` with `{ passive: false }`
- [ ] T015 **[REFACTOR]** [US2] Ensure the click, key and wheel paths all funnel through the same `changeStep` / clamping logic so there is exactly one place where the volume rule lives; re-run the component suite

**Checkpoint**: The control is operable by pointer, wheel and keyboard alone.

---

## Phase 4: User Story 3 — See the knob turn (Priority: P3)

**Goal**: A rotating indicator makes the knob read as a physical dial, with a springy settle, and
it respects reduced-motion preferences.

**Independent Test**: Change the volume and watch the indicator swing to a new angle; enable the OS
"reduce motion" setting and confirm it still lands on the correct angle without animating.

**Plan reference**: Cycles 6 and 7

- [ ] T016 **[RED]** [US3] Add indicator tests to `tests/components/VolumeKnob.test.tsx` — an element `.volume-knob-indicator` exists; at step 0 its inline style sets `--knob-angle` to `-135deg`; at step 11 it is `135deg`; the value updates when the `volume` prop changes. Read the value with `el.style.getPropertyValue('--knob-angle')` (plain `el.style.transform` will not show a custom property in jsdom)
- [ ] T017 **[GREEN]** [US3] Render `<div className="volume-knob-indicator" style={{ '--knob-angle': `${stepToAngle(step)}deg` } as React.CSSProperties} />` as the first child of `.volume-knob` in `src/components/VolumeKnob.tsx`. The `as React.CSSProperties` cast is required because TypeScript does not accept custom properties in the style object — this is the standard escape hatch
- [ ] T018 [US3] Add `.volume-knob-indicator` CSS in `src/App.css` — `position: absolute; inset: 0; pointer-events: none;` (FR-015 — without this it swallows every click), `transform: rotate(var(--knob-angle, 0deg));` and `transition: transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1);`. The `1.56` control point is what produces the overshoot-and-settle; a plain `ease` will not do it
- [ ] T019 [US3] Draw the pointer as a `.volume-knob-indicator::after` pseudo-element in `src/App.css` — a short bar near the top of the circle with `transform-origin` at the circle's centre so it swings around the knob's axis; colour `#00ffff` with a matching `box-shadow` glow so it reads as native to the LED panel (plan.md §3b)
- [ ] T020 [US3] Add `.volume-knob-indicator { transition: none; }` to the **existing** `@media (prefers-reduced-motion: reduce)` block in `src/App.css` (~line 725). The pointer must still move to the correct angle — reduced motion means remove the animation, not the information (FR-016)
- [ ] T021 **[REFACTOR]** [US3] Tune the transition duration and the pointer's length, thickness and inset by eye against the painted brass knob at several viewport sizes. Goal per plan.md §3b: it must *read as* the knob rotating, not compete with the artwork

**Checkpoint**: All three user stories are complete.

---

## Phase 5: Integration & End-to-End Verification

**Purpose**: Prove the component is actually wired up, and that everything holds together in a real
browser with real CSS.

**Plan reference**: Cycles 8 and 9

- [ ] T022 **[RED→GREEN]** Write an App-level integration test in `tests/App.volume.test.tsx`, following the existing pattern in `tests/App.channel.test.tsx` — power the TV on, click **Volume up**, assert the mocked audio chain's `setVolume` was called with the higher gain; click **Volume down** and assert it returns to the previous gain; assert both halves are disabled while `tvPower === 'off'`. Unit tests prove the component works in isolation; this proves it is plugged in
- [ ] T023 **[RED→GREEN]** Write Playwright E2E coverage in `tests/e2e/tv-volume.spec.ts`, following `tests/e2e/tv-channel.spec.ts` — (a) both volume buttons are disabled before power-on; (b) after power-on `.volume-led--lit` has count 6 (App defaults `volume = 0.5` → step 6); (c) two clicks on **Volume up** → 8 lit; (d) three clicks on **Volume down** → 5 lit; (e) **spam up past the top → stays at 11 lit with `.volume-led--max` lit and never wraps to 0** — this is the headline regression test for the reported bug; (f) spam down past the bottom → stays at 0 lit and never wraps up; (g) `--knob-angle` on `.volume-knob-indicator` differs between minimum and maximum (`-135deg` vs `135deg`)
- [ ] T024 [P] Add a reduced-motion E2E assertion in `tests/e2e/tv-volume.spec.ts` — call `await page.emulateMedia({ reducedMotion: 'reduce' })`, then assert the computed `transitionDuration` of `.volume-knob-indicator` is `'0s'`
- [ ] T025 Run `tests/e2e/panel-alignment.spec.ts` **with zero edits** and confirm it passes (C1). If it fails you have moved or resized `.volume-knob` — revert the layout change and re-read plan.md §3a. Do not adjust the tolerances in that spec to make it pass
- [ ] T026 Confirm `src/App.tsx` and `public/TV-frame.png` are untouched — `git --no-pager diff --name-only` must not list either (C2, C3). If `App.tsx` appears in the diff, work out why before continuing

---

## Phase 6: Polish & Quality Gate

- [ ] T027 Work through the gotchas checklist in `plan.md` §8 item by item and tick each one
- [ ] T028 [P] Manually verify the control on a narrow mobile-width viewport — both halves are tappable with no dead zone at the centre line, and the knob hit-area still sits over the painted artwork
- [ ] T029 Run the full repository quality gate from the workspace root: `pnpm run validate` (lint → format:check → typecheck → build → test). All five stages must pass (SC-007)
- [ ] T030 Run `cd packages/frontend && pnpm run test:e2e` and confirm the whole Playwright suite is green, including the untouched `panel-alignment.spec.ts`

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Foundational)**: blocks everything — every story imports `src/config/volume.ts`
- **Phase 2 (US1, P1)**: depends on Phase 1. This is the MVP and the bug fix
- **Phase 3 (US2, P2)**: depends on Phase 2 (reuses `changeStep` and the clamping rule)
- **Phase 4 (US3, P3)**: depends on Phase 2 for the component shape; independent of Phase 3
- **Phase 5 (Integration/E2E)**: depends on Phases 2–4
- **Phase 6 (Polish)**: depends on Phase 5

### Within-phase notes

- T004 → T005 → T006/T007 → T008 must run in order (same file, RED before GREEN)
- T009 → T010 must run in order and must follow T008
- T011/T013 are marked [P] as independent RED steps, but their GREEN counterparts (T012/T014) both edit `VolumeKnob.tsx`, so land one pair at a time
- T016 → T017 → T018 → T019 → T020 → T021 run in order
- T024 is [P] with T023 only if written as a separate `test()` block in the same spec file

### Story completion checkpoints

| After | You can demo |
|-------|--------------|
| Phase 2 | The bug is fixed — volume goes up **and** down and stops at both ends |
| Phase 3 | Wheel and keyboard control, full keyboard-only operability |
| Phase 4 | The knob visibly turns, with reduced-motion respected |
| Phase 6 | Ship |

---

## Traceability

| Requirement | Tasks |
|-------------|-------|
| FR-001, FR-002 | T004, T005, T006 |
| FR-003, FR-004 | T009, T010, T023(e)(f) |
| FR-005 | T013, T014 |
| FR-006, FR-007 | T011, T012 |
| FR-008 | T004, T005 |
| FR-009 | T005 |
| FR-010 | T004, T011, T013, T022, T023(a) |
| FR-011 | T002, C4 |
| FR-012 | T023(b)(c)(d) |
| FR-013 | T016, T017, T018, T019 |
| FR-014 | T018, T021 |
| FR-015 | T018 |
| FR-016 | T020, T024 |
| FR-017 | T006, T025, T028 |
| FR-018 | T026 |
| SC-001…SC-005 | T022, T023, T024 |
| SC-006 | T025 |
| SC-007 | T029, T030 |
