import type { ReactNode } from 'react';

interface CrtFrameProps {
  children: ReactNode;
  panel?: ReactNode;
  footer?: ReactNode;
}

export function CrtFrame({ children, panel, footer }: CrtFrameProps) {
  return (
    <div data-testid="crt-bezel" className="crt-bezel">
      {/* Content layer — sits BEHIND the frame */}
      <div className="crt-screen">{children}</div>
      {/* TV frame overlay — sits ON TOP, transparent screen lets content show through */}
      <img
        src="/TV-frame.png"
        alt="Retro CRT Television"
        className="crt-frame-image"
        data-testid="crt-frame-image"
        draggable={false}
      />
      {panel && (
        <div data-testid="crt-panel" className="crt-panel">
          {panel}
        </div>
      )}
      {footer && (
        <div data-testid="crt-footer-overlay" className="crt-footer-overlay">
          {footer}
        </div>
      )}
    </div>
  );
}
