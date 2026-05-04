import type { ReactNode } from 'react';

interface CrtFrameProps {
  videoSrc?: string;
  children?: ReactNode;
}

export function CrtFrame({ videoSrc, children }: CrtFrameProps) {
  return (
    <div data-testid="crt-bezel" className="crt-bezel">
      <div className="crt-screen">
        {videoSrc && <video src={videoSrc} autoPlay muted loop className="crt-video" />}
        <div className="scan-lines" />
        <div className="crt-glass" />
        {children}
      </div>
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
