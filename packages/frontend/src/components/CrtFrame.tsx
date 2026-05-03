import type { ReactNode } from 'react';

interface CrtFrameProps {
  children: ReactNode;
  panel?: ReactNode;
}

export function CrtFrame({ children, panel }: CrtFrameProps) {
  return (
    <div data-testid="crt-bezel" className="crt-bezel">
      <img
        src="/TV-wider.png"
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
    </div>
  );
}
