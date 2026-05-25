/**
 * WireframeBackdrop — Max Headroom–style radiating lines (sunburst)
 * on black. Pure CSS implementation using repeating-conic-gradient.
 *
 * The lines radiate outward from center (where the avatar's head sits),
 * colored in cyan and yellow/gold sections — just like the original show.
 */
import { useReducedMotion } from '../hooks/useReducedMotion';

interface WireframeBackdropProps {
  isMobile?: boolean;
}

export function WireframeBackdrop({ isMobile = false }: WireframeBackdropProps) {
  const reducedMotion = useReducedMotion();

  return (
    <div
      data-testid="wireframe-backdrop"
      data-mobile={isMobile || undefined}
      data-reduced-motion={reducedMotion || undefined}
      className={`wireframe-backdrop${reducedMotion ? ' wireframe-backdrop--static' : ''}`}
    >
      <div className="wireframe-backdrop__rays" aria-hidden="true" />
      {!reducedMotion && <div className="wireframe-backdrop__glow" aria-hidden="true" />}
    </div>
  );
}
