import { useState } from 'react';

export interface MicButtonProps {
  onStart: () => void;
  onStop: () => void;
  disabled: boolean;
}

export function MicButton({ onStart, onStop, disabled }: MicButtonProps) {
  const [isHeld, setIsHeld] = useState(false);

  function handlePointerDown() {
    if (disabled) return;
    setIsHeld(true);
    onStart();
  }

  function handlePointerUp() {
    if (!isHeld) return;
    setIsHeld(false);
    onStop();
  }

  return (
    <button
      type="button"
      aria-label="Hold to talk"
      className={`mic-button${isHeld ? ' active' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      disabled={disabled}
    >
      {isHeld && <span className="on-air-indicator">ON AIR</span>}
      <span className="mic-icon" aria-hidden="true">
        🎙
      </span>
    </button>
  );
}
