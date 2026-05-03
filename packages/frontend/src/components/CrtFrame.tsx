import type { ReactNode } from 'react';

interface CrtFrameProps {
  children: ReactNode;
  panel?: ReactNode;
  footer?: ReactNode;
}

export function CrtFrame({ children, panel, footer }: CrtFrameProps) {
  return (
    <div data-testid="crt-bezel" className="crt-bezel">
      <img
        src="/TV.png"
        alt="Retro CRT Television"
        className="crt-frame-image"
        data-testid="crt-frame-image"
        draggable={false}
      />
      <div className="crt-screen">{children}</div>
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
