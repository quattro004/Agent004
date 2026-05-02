import type { ReactNode } from 'react';

interface CrtFrameProps {
  children: ReactNode;
}

export function CrtFrame({ children }: CrtFrameProps) {
  return (
    <div data-testid="crt-bezel" className="crt-bezel">
      <div className="crt-screen">
        {children}
      </div>
    </div>
  );
}
