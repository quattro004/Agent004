import { useState } from 'react';

interface TvKnobProps {
  onTurnOn: () => void;
  disabled: boolean;
}

export function TvKnob({ onTurnOn, disabled }: TvKnobProps) {
  const [rotated, setRotated] = useState(false);

  function handleClick() {
    if (disabled) return;
    setRotated(true);
    onTurnOn();
  }

  return (
    <button
      type="button"
      aria-label="Turn on"
      className={`tv-knob${rotated ? ' rotate' : ''}`}
      onClick={handleClick}
      disabled={disabled}
    />
  );
}
