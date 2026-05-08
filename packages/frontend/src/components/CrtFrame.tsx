import type { ReactNode } from 'react';

interface CrtFrameProps {
  videoSrc?: string;
  children?: ReactNode;
  panel?: ReactNode;
  footer?: ReactNode;
}

export function CrtFrame({ videoSrc, children, panel, footer }: CrtFrameProps) {
  return (
    <div data-testid="crt-bezel" className="crt-bezel">
      <div className="crt-screen">
        {videoSrc && <video src={videoSrc} autoPlay muted loop className="crt-video" />}
        <div className="scan-lines" />
        <div className="crt-glass" />
        {children}
      </div>
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
