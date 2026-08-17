import type { ReactNode } from 'react';

interface CrtFrameProps {
  children?: ReactNode;
  panel?: ReactNode;
  footer?: ReactNode;
}

export function CrtFrame({ children, panel, footer }: CrtFrameProps) {
  return (
    <div data-testid="crt-bezel" className="crt-bezel">
      <div className="crt-screen">{children}</div>
      {panel && <div className="crt-panel">{panel}</div>}
      {footer && <div className="crt-footer-overlay">{footer}</div>}
      <img
        src="/TV-frame.png"
        className="crt-frame-image"
        data-testid="crt-frame-image"
        alt="Retro CRT Television"
        draggable={false}
      />
    </div>
  );
}
