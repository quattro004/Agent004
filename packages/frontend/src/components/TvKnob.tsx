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
    <div className="tv-knob-wrapper">
      <span className="tv-knob-label">ON / OFF</span>
      <button
        type="button"
        aria-label="Turn on"
        className={`tv-knob${rotated ? ' rotate' : ''}`}
        onClick={handleClick}
        disabled={disabled}
      />
    </div>
  );
}
