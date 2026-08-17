import { StaticNoise } from './StaticNoise';

export interface TuningOverlayProps {
  visible: boolean;
}

/**
 * Full-screen "untuned signal" overlay shown during the TV power-on
 * tune-in sequence. Pure analog snow — no avatar, no UI chrome behind.
 */
export function TuningOverlay({ visible }: TuningOverlayProps) {
  if (!visible) return null;
  return (
    <div data-testid="tuning-overlay" className="tuning-overlay" role="status">
      <StaticNoise />
    </div>
  );
}
