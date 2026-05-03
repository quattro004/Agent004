/**
 * VolumeKnob — rotary volume control for the TV console panel.
 * Click cycles through volume steps: 0 → 0.25 → 0.5 → 0.75 → 1.0 → 0.
 * Visual rotation reflects current volume level.
 */

const VOLUME_STEPS = [0, 0.25, 0.5, 0.75, 1.0];
const MAX_ROTATION = 270; // degrees of rotation for full volume

interface VolumeKnobProps {
  volume: number;
  onVolumeChange: (volume: number) => void;
  disabled: boolean;
}

export function VolumeKnob({ volume, onVolumeChange, disabled }: VolumeKnobProps) {
  const rotation = volume * MAX_ROTATION;

  function handleClick() {
    if (disabled) return;
    const currentIdx = VOLUME_STEPS.indexOf(volume);
    const nextIdx = currentIdx === -1 ? 1 : (currentIdx + 1) % VOLUME_STEPS.length;
    onVolumeChange(VOLUME_STEPS[nextIdx]);
  }

  return (
    <button
      type="button"
      aria-label="Volume"
      className="volume-knob"
      style={{ transform: `rotate(${rotation}deg)` }}
      onClick={handleClick}
      disabled={disabled}
    />
  );
}
