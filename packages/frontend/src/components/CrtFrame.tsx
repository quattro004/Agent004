interface CrtFrameProps {
  src: string;
}

export function CrtFrame({ src }: CrtFrameProps) {
  return (
    <div className="tv-root">
      <video
        src={src}
        autoPlay
        muted
        loop
        className="crt-video"
      />
      <div className="glow" />
      <div className="scan-lines" />
      <div className="crt-glass" />

      <img
        src="/TV-frame.png"
        className="tv-frame"
        alt=""
      />
    </div>
  );
}
