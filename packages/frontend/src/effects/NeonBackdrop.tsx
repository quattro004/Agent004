/**
 * NeonBackdrop — CSS-based horizontal neon stripe effect.
 * Inspired by the Max Headroom show's signature backdrop:
 * bold colored bars in cyan, magenta, and green on black.
 */

interface NeonBackdropProps {
  isMobile?: boolean;
}

export function NeonBackdrop({ isMobile }: NeonBackdropProps) {
  return (
    <div
      data-testid="neon-backdrop"
      className={`neon-backdrop${isMobile ? ' neon-backdrop--mobile' : ''}`}
    >
      <div className="neon-stripes neon-stripes--cyan" />
      <div className="neon-stripes neon-stripes--magenta" />
      <div className="neon-stripes neon-stripes--green" />
    </div>
  );
}
