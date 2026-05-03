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
        src="/TV-wider.png"
        alt="Retro CRT Television"
        className="crt-frame-image"
        data-testid="crt-frame-image"
        draggable={false}
      />
      <div className="crt-screen">
        {children}
        {footer && (
          <div data-testid="crt-screen-footer" className="crt-screen-footer">
            {footer}
          </div>
        )}
      </div>
      {panel && (
        <div data-testid="crt-panel" className="crt-panel">
          {panel}
        </div>
      )}
    </div>
  );
}
