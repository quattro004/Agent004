/**
 * Animated CRT static-noise SVG overlay.
 * Reusable across SIGNAL_LOST (off-air) and the power-on tune-in sequence.
 */
export function StaticNoise() {
  return (
    <svg
      data-testid="static-noise"
      className="static-noise"
      xmlns="http://www.w3.org/2000/svg"
      width="100%"
      height="100%"
      aria-hidden="true"
    >
      <filter id="static-filter">
        <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch">
          <animate attributeName="seed" from="0" to="100" dur="0.5s" repeatCount="indefinite" />
        </feTurbulence>
      </filter>
      <rect width="100%" height="100%" filter="url(#static-filter)" opacity="0.35" />
    </svg>
  );
}
