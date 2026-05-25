# Plan: Max Headroom–style Wireframe Backdrop

## Problem

The current backdrop (`packages/frontend/src/effects/NeonBackdrop.tsx`) is a CSS-only stack of three `repeating-linear-gradient` stripe layers at 8–12% opacity. In practice it's nearly invisible behind the avatar PNG and looks nothing like the iconic Max Headroom backdrop (rotating wireframe geometry, diagonal color bars, palette shifts on black).

The spec already calls for the right thing — but it was never built:

- `specs/001-max-height-ai-character/spec.md:215` — "rotating or scrolling polygonal/grid pattern, period-appropriate palette (e.g., magenta/cyan on black)"
- `specs/001-max-height-ai-character/research.md:176` (R3e — Wireframe Backdrop) and `plan.md:95` (`effects/` houses the wireframe backdrop)
- `specs/001-max-height-ai-character/tasks.md:189` — T065: "Implement wireframe backdrop in `packages/frontend/src/effects/WireframeBackdrop.tsx` (React Three Fiber 9.x component with Three.js LineSegments + EdgesGeometry for rotating cubes and pyramids, cyan/magenta glowing line material on black background, continuous slow rotation, reduced object count on mobile viewport)"

`three@0.175.0` and `@react-three/fiber@9.6.1` are already installed (verified via `pnpm ls`), so no new dependencies are needed.

## Approach (per user choices)

- **Build the spec'd R3F `WireframeBackdrop`** and replace `NeonBackdrop` usage in `App.tsx`.
- **Visual elements:** rotating wireframe polyhedra + diagonal sliding color bars + occasional palette shift (cyan ↔ magenta ↔ yellow).
- **Investigate avatar PNGs first** before touching avatar composition. Only if they are transparent do we proceed; if they are opaque, surface the finding and stop short of asset work (out of scope).
- **Honor `prefers-reduced-motion`** — rotation slows/stops, diagonal bars and palette shifts disable; static wireframe + scanlines remain (per spec §Visual Presentation lines 222–223).
- **Mobile reduction** — fewer polyhedra, slower animation, lower bar opacity (per T074).

## Design

### `effects/WireframeBackdrop.tsx` (new)

- R3F `<Canvas>` filling the CRT screen area (`position:absolute; inset:0; z-index:0`).
- Scene contents:
  - **Polyhedra group**: 4–6 wireframe meshes (cubes, tetrahedra, octahedrons) using `THREE.EdgesGeometry` + `THREE.LineSegments` with `LineBasicMaterial` (no fill). Cyan / magenta tint per object. Each rotates slowly on its own axis at unique rates.
  - **Camera**: perspective, slight slow orbit (very subtle, <2°/s) so the geometry feels like it's drifting through space.
  - **Glow**: cheap glow via additive blending on the line material + post-processing-free CSS `filter: drop-shadow` on the canvas (avoid bringing in `@react-three/postprocessing`).
- Mobile prop reduces object count (4 → 2) and disables camera orbit.
- `useReducedMotion()` hook (matchMedia `prefers-reduced-motion: reduce`) sets a `paused` mode: render once, no `useFrame` mutations.

### `effects/WireframeBackdrop.css` (or fold into `App.css`)

- `.wireframe-backdrop` wrapper: absolute fill, black background, z-index 0.
- `.wireframe-backdrop__bars` overlay: 2–3 thick diagonal gradient bars sliding across via `@keyframes` (opacity ~0.15–0.25 so they read but don't drown the avatar). Disabled under `prefers-reduced-motion`.
- `.wireframe-backdrop__palette` overlay: thin full-bleed color tint that animates between cyan / magenta / yellow at ~12–20s cycle (opacity ~0.05–0.08). Disabled under `prefers-reduced-motion`.

### `App.tsx`

- Replace `import { NeonBackdrop }` with `WireframeBackdrop`.
- Replace usage at line 229: `<NeonBackdrop isMobile={isMobile} />` → `<WireframeBackdrop isMobile={isMobile} />`.

### Avatar PNG investigation (read-only)

Use sharp (already used historically per memory) or pixel inspection to check whether `/avatar/retro/idle.png` has a transparent background or an opaque fill. Three outcomes:

1. **Transparent** → no changes needed; backdrop will show through.
2. **Opaque** → document the finding in the plan file under "Findings" and stop. Avatar asset regeneration is out of scope for this plan.
3. **Partially opaque** (e.g., dark fill matching black) → backdrop hidden in practice; document and stop.

## Tests (TDD — required per repo constitution)

1. **`WireframeBackdrop.test.tsx`** (Vitest + RTL):
   - Renders a `<canvas>` element with `data-testid="wireframe-backdrop"`.
   - Receives `isMobile` prop and exposes a `data-mobile` attribute we can assert on (to verify reduced-object-count branch is taken).
   - When `matchMedia('(prefers-reduced-motion: reduce)')` is mocked to `matches:true`, exposes `data-reduced-motion="true"`.
2. **`App.test.tsx` (or extend existing)**:
   - When TV is in `settling` or `on` state, `wireframe-backdrop` is in the document and `neon-backdrop` is not.
3. **Playwright E2E** (`packages/frontend/tests/e2e/tv-experience.spec.ts` — extend existing):
   - After powering TV on, `[data-testid="wireframe-backdrop"]` is visible inside the CRT screen.

Each test follows RED → GREEN → REFACTOR. Tests are written first and must fail for the intended reason before implementation.

## Cleanup

- Delete `effects/NeonBackdrop.tsx` and its CSS block (`App.css:310–385`) plus the `prefers-reduced-motion` override block (`App.css:796–800`).
- Remove `NeonBackdrop` references from any tests / Storybook (if present).

## Todos (tracked in SQL)

1. `investigate-avatar-png` — Check transparency of avatar PNGs; gate further work on the result.
2. `write-failing-tests` — Author Vitest tests for `WireframeBackdrop` (RED).
3. `implement-r3f-backdrop` — Build `WireframeBackdrop.tsx` with polyhedra + camera + reduced-motion handling (GREEN).
4. `add-css-overlays` — Diagonal bars + palette shift CSS overlays with reduced-motion guards.
5. `wire-into-app` — Replace `NeonBackdrop` usage in `App.tsx`.
6. `remove-neon-backdrop` — Delete `NeonBackdrop.tsx` + dead CSS.
7. `update-e2e` — Extend Playwright test to assert backdrop presence.
8. `validate` — Run `pnpm run validate` (lint + format:check + typecheck + build + test). All must pass.

## Out of scope

- Avatar PNG regeneration / transparency rework (will be reported, not fixed).
- WebGL/WebGPU post-processing pipelines (kept lean to avoid bundle bloat per T105).
- Migrating glitch overlays, scanlines, or CRT shader behavior — those already exist and aren't part of this request.

## Open questions (none blocking)

- Final palette: stick with spec's "magenta/cyan on black" plus optional yellow for palette shifts. Open to tweaks after first visual review.
