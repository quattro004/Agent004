# Plan: Mobile UI Improvements

## Problem Statement

Three mobile UI issues to fix:

1. **Landscape positioning**: TV frame is too low in mobile landscape mode (e.g., Galaxy S24 Ultra at 844×452 CSS pixels) — there's dead space above the TV frame.
2. **Cursor visibility**: On hover-capable devices (tablets with trackpads, Chromebooks, stylus), cursor should remain visible when hovering over the TV viewport.
3. **Chat input auto-focus**: After TV powers on and the greeting finishes, auto-focus the text input so users can immediately type.

## Approach

### 1. Fix Landscape TV Positioning

**Root cause**: The landscape media query (`max-height: 500px`) sets `align-items: flex-start` on `.tv-wrapper`, but the app's full-height layout (`100vh`) doesn't account for the mobile browser chrome (URL bar). On mobile, `100vh` includes the hidden URL bar height, creating a mismatch. Additionally, the chat-bar's vertical footprint reduces the tv-wrapper height, and the bezel may not be oversized enough to fill the wrapper in certain landscape breakpoints.

**Fix**:

- Use `100dvh` (dynamic viewport height) with `100vh` fallback for the app height
- Add a combined `orientation: landscape` + `max-height` media query to catch mobile landscape more reliably
- Increase bezel scale in landscape so the TV always overflows the wrapper (fully immersive top-crop)
- Reduce chat-bar vertical footprint in landscape

### 2. Add Cursor for Hover-Capable Devices

**Root cause**: On mobile/touch emulation, the browser hides the cursor (expected). But for hybrid devices that DO have a hover-capable pointer, we should ensure cursor remains visible.

**Fix**:

- Add a `@media (hover: hover)` rule to ensure `cursor: default` is applied to the TV viewport area
- This only activates on devices with an actual pointer (mouse/trackpad), not touch-only

### 3. Auto-Focus Chat Input After Greeting

**Fix**:

- Add a `ref` to the `TextInput` component's `<input>` element
- Expose an `inputRef` prop or use `React.forwardRef`
- In `App.tsx`, use an effect that fires when `isGreetingDone` becomes `true` → call `inputRef.current?.focus()`
- On mobile, consider using `focus({ preventScroll: true })` to avoid viewport jumping

## Files to Modify

| File | Changes |
|------|---------|
| `packages/frontend/src/App.css` | Landscape media queries, `dvh` fallback, cursor rules |
| `packages/frontend/src/index.css` | Root `dvh` fallback for html/body/#root |
| `packages/frontend/src/components/TextInput.tsx` | Add `forwardRef` to expose input element |
| `packages/frontend/src/App.tsx` | Add ref + effect for auto-focus after greeting |

## Testing

- Update/add E2E tests for landscape viewport alignment
- Add unit test for TextInput forwarding ref
- Add unit test verifying focus is called after greeting completes
- Run `pnpm run validate` to ensure all gates pass

## Notes

- All changes are CSS-only or minimal React (no new dependencies)
- `dvh` has excellent browser support (Chrome 108+, Safari 15.4+, Firefox 101+)
- The `(hover: hover)` media query correctly distinguishes mouse/trackpad from touch
