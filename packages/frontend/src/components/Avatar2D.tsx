interface Avatar2DProps {
  isMouthOpen: boolean;
}

export function Avatar2D({ isMouthOpen }: Avatar2DProps) {
  return (
    <svg
      data-testid="avatar-svg"
      viewBox="0 0 200 260"
      xmlns="http://www.w3.org/2000/svg"
      className="avatar-2d"
    >
      {/* Head outline */}
      <ellipse cx="100" cy="90" rx="60" ry="70" fill="none" stroke="cyan" strokeWidth="2" />

      {/* Eyes */}
      <circle cx="75" cy="75" r="8" fill="none" stroke="cyan" strokeWidth="1.5" />
      <circle cx="125" cy="75" r="8" fill="none" stroke="cyan" strokeWidth="1.5" />

      {/* Mouth - toggled by isMouthOpen prop */}
      {isMouthOpen ? (
        <ellipse
          data-testid="mouth-open"
          cx="100"
          cy="115"
          rx="15"
          ry="10"
          fill="none"
          stroke="magenta"
          strokeWidth="2"
        />
      ) : (
        <line
          data-testid="mouth-closed"
          x1="85"
          y1="115"
          x2="115"
          y2="115"
          stroke="magenta"
          strokeWidth="2"
        />
      )}

      {/* Shoulders */}
      <path
        d="M 40 180 Q 100 160 160 180 L 170 260 L 30 260 Z"
        fill="none"
        stroke="cyan"
        strokeWidth="2"
      />
    </svg>
  );
}
