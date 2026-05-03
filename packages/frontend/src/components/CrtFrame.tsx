import type { ReactNode } from 'react';

interface CrtFrameProps {
  children: ReactNode;
  panel?: ReactNode;
}

export function CrtFrame({ children, panel }: CrtFrameProps) {
  return (
    <div data-testid="crt-bezel" className="crt-bezel">
      <div className="crt-screen">{children}</div>
      {panel && (
        <div data-testid="crt-panel" className="crt-panel">
          {panel}
          <div data-testid="speaker-grille" className="speaker-grille" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
