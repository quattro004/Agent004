# Implementation Plan: Volume Knob — Turn Up _and_ Down

**Branch**: `002-volume-knob-up-down` | **Spec**: this file | **Feature dir**: `specs/002-volume-knob-up-down/`

> **Audience note:** This plan is written for a developer who is still learning. Every step
> explains _why_, not just _what_. Work top-to-bottom. Don't skip the RED steps — watching a
> test fail is how you prove the test is actually testing something.

---

## 1. The problem

Today the volume knob only goes **one direction**.

`packages/frontend/src/components/VolumeKnob.tsx` renders a single invisible round button on
top of the brass VOLUME knob painted into `TV-frame.png`. Clicking it runs:

```ts
const nextStep = (step + 1) % (MAX_STEP + 1); // 0→1→…→11→0
```

So volume climbs to 11, then silently snaps back to 0. If you overshoot, your only option is
to click ten more times to come back around. That's the bug.

## 2. What we're building

| Decision             | Choice                                                                      |
| -------------------- | --------------------------------------------------------------------------- |
| Primary interaction  | Split hit-area: **click right half = up, left half = down**                  |
| Also supported       | Mouse wheel over the knob, and ArrowUp/ArrowDown/ArrowLeft/ArrowRight keys   |
| Behavior at the ends | **Clamp** — stops at 0 and stops at 11. No more wrapping.                    |
| Animation            | Rotating indicator overlay with a springy overshoot as it settles            |
| Testing              | Unit (helpers + component), App integration, Playwright E2E, reduced-motion  |

The existing step model **stays exactly the same**: 12 discrete positions (0..11), gain
emitted to the audio chain is `step / 11`. "These go to eleven." We are changing _how you
move between steps_, not what the steps mean.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19 (Vite)
**Primary Dependencies**: react, vitest, @testing-library/react, @playwright/test — **no new dependencies**
**Storage**: N/A (volume is in-memory React state; not persisted)
**Testing**: Vitest + React Testing Library (unit/integration), Playwright (E2E)
**Target Platform**: Modern evergreen browsers, desktop + mobile web
**Project Type**: Web (pnpm workspace monorepo — `packages/frontend`)
**Constraints**: Must not move the `.volume-knob` hit-area box (see §3a); must honour
`prefers-reduced-motion`; must not modify `TV-frame.png`
**Scale/Scope**: One component, one new helper module, five test files

---

## 3. The hard constraint: the knob is a painted image

This is the single most important thing to understand before you write any CSS.

The brass VOLUME knob **is not an element**. It is pixels inside
`packages/frontend/public/TV-frame.png`. You cannot rotate it, restyle it, or swap it. The
`.volume-knob` element in the DOM is an **invisible circular hit-area** floating precisely on
top of those pixels.

Two consequences you must respect:

### 3a. Do not change the size or position of `.volume-knob`

There is an existing E2E test, `tests/e2e/panel-alignment.spec.ts`, that measures the
bounding box of `.volume-knob` and asserts its centre sits within **±1.5%** of the painted
knob's centre (`PAINTED.volume = { cy: 0.41, tol: 0.015 }`) — and it re-checks this at
multiple viewport sizes.

> **Rule:** the two new half-buttons go _inside_ `.volume-knob`, using absolute positioning.
> `.volume-knob` itself keeps its class name, its `width: 55%`, and its `aspect-ratio: 1/1`.
> If you make `.volume-knob` a flex row of two buttons, or add padding, you will move the box
> and break alignment.

### 3b. The animation cannot rotate the painted knob — so don't try

The painted knob has its own highlights and shading baked in at a fixed angle. If you overlay
a second brass-looking knob and rotate it, it will look doubled and wrong.

Instead, rotate a **thin glowing pointer** anchored at the knob's centre and reaching out near
its edge, in the same cyan as the existing LED bar (`#00ffff`). Your eye reads the pointer as
"the knob turned" even though the brass underneath never moves. This is a deliberate trade-off
that works _with_ the image instead of against it.

---

## 4. Concepts you'll use (short primer)

Skim this before starting. You'll apply each one below.

**Pure functions.** A function that takes inputs and returns an output, touching nothing else.
`stepToAngle(7)` always returns the same number. Pure functions are trivial to test — no
rendering, no clicking, no mocking. We'll pull the maths out of the component into pure
helpers _specifically_ so the tricky parts get cheap, fast tests.

**Clamping.** Forcing a number to stay inside a range. `clampStep(12)` → `11`, `clampStep(-1)`
→ `0`. This is what replaces the `%` (modulo) wrap.

**Angle maths.** A real volume knob doesn't spin infinitely; it sweeps about 270°, from
roughly 7 o'clock to 5 o'clock. We map step → angle linearly:

```
angle = MIN_ANGLE + (step / MAX_STEP) * (MAX_ANGLE - MIN_ANGLE)
      = -135 + (step / 11) * 270
```

So step 0 → `-135°`, step 11 → `+135°`, and the midpoint step ≈ 5.5 → `0°` (pointing straight up).

**CSS custom properties.** Rather than writing `style={{ transform: 'rotate(42deg)' }}` in
the component, we set a variable — `style={{ '--knob-angle': '42deg' }}` — and let the
stylesheet decide what to do with it. This keeps _behaviour_ in the component and
_presentation_ in the CSS, and it makes the value easy to assert in a test.

**Easing and overshoot.** `transition: transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1)`.
The `1.56` is the trick: a control point greater than 1 makes the value travel _past_ its
target and spring back. That's the "real knob" feel. Plain `ease` won't do it.

**`prefers-reduced-motion`.** An OS-level accessibility setting meaning "animations make me
unwell or distracted". Honouring it is not optional. This codebase already has a block for it
at `App.css:725` — you'll add to it.

**Accessible names.** Screen readers announce a button by its `aria-label`. Two buttons need
two _distinct_ names: `"Volume up"` and `"Volume down"`. This matters for testing too —
`getByRole('button', { name: /volume/i })` would now match both and throw an ambiguity error.
Your tests must use precise names.

---

## 5. Design: the new component shape

```
div.volume-knob-wrapper                     ← unchanged position/layout
  div.volume-knob            (role="group", aria-label="Volume", onWheel, onKeyDown)
    div.volume-knob-indicator                ← rotating pointer; pointer-events: none
    button.volume-knob-half--down            ← left semicircle,  aria-label="Volume down"
    button.volume-knob-half--up              ← right semicircle, aria-label="Volume up"
  div.volume-led-bar                         ← unchanged, 11 LEDs
```

Notes on the choices:

- `.volume-knob` changes from a `<button>` to a `<div>`. Its **class, size and position stay
  identical**, so `panel-alignment.spec.ts` keeps passing untouched.
- Because it's no longer a `<button>`, the CSS selector `.volume-knob:hover:not(:disabled)`
  will silently stop working — `:disabled` doesn't apply to a `div`. Swap to a class such as
  `.volume-knob--disabled`. **This is an easy one to miss.**
- The two halves are real `<button>` elements. That gives you keyboard focus, Enter/Space
  activation, and screen-reader support _for free_, and it makes tests read nicely:
  `screen.getByRole('button', { name: 'Volume up' })`. No mocking of click coordinates.
- Keep both halves **enabled** at the ends and clamp inside the handler. Disabling a focused
  button yanks it out of the tab order mid-interaction, which is a poor experience.
- `onKeyDown` and `onWheel` sit on the `.volume-knob` container so they fire no matter which
  half has focus (events bubble up from the buttons).

The public prop contract — `{ volume, onVolumeChange, disabled }` — **does not change**. That
means `App.tsx:311` needs no edits at all. Preserving an interface while completely rebuilding
what's behind it is a genuinely good habit; notice how much it limits the blast radius.

### Project structure (files touched)

```text
packages/frontend/
├── src/
│   ├── config/volume.ts                    # NEW — pure helpers
│   ├── components/VolumeKnob.tsx           # REWRITTEN
│   └── App.css                             # EXTENDED (incl. reduced-motion block ~:725)
└── tests/
    ├── config/volume.test.ts               # NEW
    ├── components/VolumeKnob.test.tsx      # UPDATED
    ├── App.volume.test.tsx                 # NEW
    └── e2e/
        ├── tv-volume.spec.ts               # NEW
        └── panel-alignment.spec.ts         # MUST PASS UNCHANGED
```

`packages/frontend/src/App.tsx` and `packages/frontend/public/TV-frame.png` are **not** modified.

---

## 6. The work, as TDD cycles

Each cycle is **RED** (write a failing test) → **GREEN** (make it pass) → **REFACTOR**.

Run a single test file while iterating so feedback is fast:

```sh
cd packages/frontend
pnpm vitest run tests/config/volume.test.ts
```

### Cycle 1 — Pure helpers

**New files:** `src/config/volume.ts`, `tests/config/volume.test.ts`

Move the maths out of the component into its own module. Mirrors the existing convention
where `nextTheme` lives in `src/config/constants.ts` and is tested in
`tests/config/constants.test.ts`.

Export: `VOLUME_MAX_STEP` (11), `VOLUME_LED_COUNT` (11), `KNOB_MIN_ANGLE_DEG` (-135),
`KNOB_MAX_ANGLE_DEG` (135), `clampStep`, `gainToStep`, `stepToGain`, `stepToAngle`.

**RED** — write these assertions first and watch them fail with "does not export…":

- `clampStep(-3) === 0`, `clampStep(5) === 5`, `clampStep(99) === 11`
- `gainToStep(0) === 0`, `gainToStep(1) === 11`, `gainToStep(0.5) === 6` (rounds)
- `stepToGain(0) === 0`, `stepToGain(11) === 1`
- Round-trip: for every step 0..11, `gainToStep(stepToGain(n)) === n`
- `stepToAngle(0) === -135`, `stepToAngle(11) === 135`, `stepToAngle(6)` ≈ `12.27`
  (use `toBeCloseTo` for the fractional one — floating-point equality is a trap)

**GREEN** — implement the module. **REFACTOR** — check the names read well.

> **Learning:** notice how fast these tests are and how little setup they need. That's the
> payoff for extracting pure logic. Aim to push tricky logic into this shape.

### Cycle 2 — Click the right half to go up, left half to go down

**Files:** `tests/components/VolumeKnob.test.tsx`, `src/components/VolumeKnob.tsx`

**RED** — the existing test `'advances to the next step on click and emits gain = step/11'`
uses `getByRole('button', { name: /volume/i })`. Update the file to the new behaviour:

- Renders a button named exactly `"Volume up"` and one named exactly `"Volume down"`
- At step 3, clicking **up** calls `onVolumeChange` with `4/11`
- At step 3, clicking **down** calls `onVolumeChange` with `2/11`
- Clicking down at step 1 emits `0`
- Neither button calls `onVolumeChange` when `disabled` is true

**GREEN** — rebuild the component per the shape in §5, importing the Cycle 1 helpers.

**REFACTOR** — both handlers should funnel through one `changeStep(delta)` function.

### Cycle 3 — Clamp at both ends (this is the actual bug fix)

**RED** — the existing test `'wraps from step 11 back to step 0'` now encodes the wrong
behaviour. **Delete it** and replace with:

- At step 11, clicking **up** does **not** call `onVolumeChange` at all
- At step 0, clicking **down** does **not** call `onVolumeChange` at all
- At step 0, clicking **up** emits `1/11` (the ends still work in the other direction)

**GREEN** — route through `clampStep`, and skip the callback when the value didn't change.

> **Learning:** deleting a test is correct here. That test documented behaviour we've decided
> is wrong. A test suite is a description of intended behaviour — when intent changes, the
> description must change with it. Don't leave dead tests lying around "just in case".

### Cycle 4 — Keyboard support

**RED:**

- `keyDown` `ArrowUp` on the knob → volume up; `ArrowRight` → up
- `ArrowDown` → down; `ArrowLeft` → down
- `Home` → emits `0`; `End` → emits `1` (full)
- No key does anything when `disabled`
- Any other key (e.g. `'a'`) is ignored

**GREEN** — `onKeyDown` on `.volume-knob`, switching on `event.key`. Call
`event.preventDefault()` on the keys you handle so arrow keys don't also scroll the page.

### Cycle 5 — Mouse wheel

**RED** — `fireEvent.wheel(knob, { deltaY: -100 })` → up (scrolling _away_ from you raises
volume, matching every OS convention); `{ deltaY: 100 }` → down; `deltaY: 0` → nothing;
nothing happens when `disabled`.

**GREEN** — `onWheel` on `.volume-knob`, branching on `Math.sign(event.deltaY)`.

> **Gotcha:** React attaches wheel listeners passively, so `preventDefault()` inside `onWheel`
> is ignored and the browser may also scroll the page. This app is a fixed full-screen layout,
> so in practice there's nothing to scroll and this is fine. If it ever does become a problem,
> the fix is a native listener registered via `useEffect` with `{ passive: false }`. Note the
> limitation in a comment rather than pre-emptively adding the complexity.

### Cycle 6 — The rotating indicator (the sweet animation)

**Files:** `src/components/VolumeKnob.tsx`, `src/App.css`

**RED** — component test:

- An element `.volume-knob-indicator` exists
- At step 0, its inline style sets `--knob-angle` to `-135deg`
- At step 11, `135deg`
- The value changes when the `volume` prop changes

> To read a custom property in jsdom, use `el.style.getPropertyValue('--knob-angle')`.
> Plain `el.style.transform` won't show it.

**GREEN** — render `<div className="volume-knob-indicator" style={{ '--knob-angle': ... }} />`.
TypeScript will complain that `--knob-angle` isn't a valid CSS property; cast the style object
with `as React.CSSProperties`. That's the standard escape hatch.

**Then the CSS** (in `App.css`, near the existing `.volume-knob` rules):

```css
.volume-knob-indicator {
  position: absolute;
  inset: 0;
  pointer-events: none; /* clicks must pass through to the halves beneath */
  transform: rotate(var(--knob-angle, 0deg));
  transition: transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1); /* springy overshoot */
}
```

Draw the pointer itself as a `::after` pseudo-element: a short cyan bar near the top of the
circle, with `transform-origin` at the circle's centre so it swings around the knob's axis.
Match the LED palette (`#00ffff`, plus a `box-shadow` glow) so it looks native to the panel.

**REFACTOR** — tune the timing and the pointer's length/thickness by eye against the painted
knob. Re-read §3b: the goal is _reads as rotation_, not _replaces the brass knob_.

### Cycle 7 — Respect `prefers-reduced-motion`

**File:** `src/App.css` (the existing block at ~line 725)

```css
@media (prefers-reduced-motion: reduce) {
  .volume-knob-indicator {
    transition: none;
  }
}
```

The pointer still moves to the right angle — it just arrives instantly, with no spring. This
is the correct interpretation: reduced motion means _remove the animation_, not _remove the
information_.

Tested at the E2E layer in Cycle 9, because a CSS media query can't be meaningfully evaluated
in jsdom. (An alternative would be a `matchMedia` hook in JS, like `BackgroundCycler.tsx:31`,
but keeping a purely presentational concern in CSS is cleaner — and Playwright can emulate the
setting natively, so we lose no test coverage.)

### Cycle 8 — App-level integration

**New file:** `tests/App.volume.test.tsx` (follow the pattern in `tests/App.channel.test.tsx`)

Proves the wiring end-to-end in jsdom: power the TV on, click **Volume up**, and assert the
mocked audio chain's `setVolume` was called with the higher gain. Then click **Volume down**
and assert it goes back. Also assert both halves are disabled while `tvPower === 'off'`.

> **Learning:** unit tests prove a component behaves correctly _in isolation_; integration
> tests prove it's actually plugged in. You need both — a perfectly-tested component that
> nobody rendered still ships a broken feature.

### Cycle 9 — Playwright E2E

**New file:** `tests/e2e/tv-volume.spec.ts` (follow `tests/e2e/tv-channel.spec.ts`)

Real browser, real CSS, real layout:

1. Before power-on, both volume buttons are disabled.
2. Power on. Count `.volume-led--lit` — should be 6 (App defaults `volume = 0.5` → step 6).
3. Click **Volume up** twice → 8 lit LEDs.
4. Click **Volume down** three times → 5 lit LEDs.
5. Click **Volume up** repeatedly past the top → stays at 11, `.volume-led--max` is lit, and
   it does **not** wrap to 0. _This is the regression test for the original bug — the most
   valuable test in the file._
6. Click **Volume down** past the bottom → stays at 0 lit, never wraps up.
7. Rotation: read `--knob-angle` off `.volume-knob-indicator` at min and max and assert they
   differ (`-135deg` vs `135deg`).
8. Reduced motion:
   ```ts
   await page.emulateMedia({ reducedMotion: 'reduce' });
   ```
   then assert the indicator's computed `transitionDuration` is `'0s'`.

**Also re-run `tests/e2e/panel-alignment.spec.ts` unchanged.** It must still pass with zero
edits. If it fails, you moved `.volume-knob` — go back and re-read §3a.

---

## 7. Final validation

The repo's quality gate, from `AGENTS.md`. All five stages must pass:

```sh
pnpm run validate     # lint → format:check → typecheck → build → test
```

E2E runs separately:

```sh
cd packages/frontend && pnpm run test:e2e
```

---

## 8. Gotchas checklist

Tick these off before you call it done:

- [ ] `.volume-knob` box is unchanged — `panel-alignment.spec.ts` passes with **no edits**
- [ ] `.volume-knob:hover:not(:disabled)` updated — `:disabled` does not match a `<div>`
- [ ] `.volume-knob-indicator` has `pointer-events: none`, or it will eat every click
- [ ] The two buttons have **distinct** accessible names; no test uses the ambiguous `/volume/i`
- [ ] `--knob-angle` needs `as React.CSSProperties` to satisfy TypeScript
- [ ] Use `toBeCloseTo`, not `toBe`, for fractional angle and gain assertions
- [ ] The old `'wraps from step 11 back to step 0'` test is **deleted**, not just skipped
- [ ] `TV-frame.png` is **not** modified
- [ ] `App.tsx` needs no changes — if you're editing it, ask yourself why

## 9. Explicitly out of scope

Keep the change small and reviewable. Not doing now:

- Drag-to-rotate (press and swing the knob) — real angle maths with pointer capture; a good
  follow-up once this ships
- Touch/swipe gestures
- Persisting volume to `localStorage` across reloads
- A mute toggle
- Changing the step count or the `step / 11` gain curve
- Retrofitting the reduced-motion approach onto `BackgroundCycler`
