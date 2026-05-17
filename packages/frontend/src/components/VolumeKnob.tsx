/**
 * VolumeKnob — rotary volume control for the TV console panel.
 * Click cycles through volume steps: 0 → 0.25 → 0.5 → 0.75 → 1.0 → 0.
 * Renders a subtle SVG indicator over the painted brass knob:
 * a single glowing notch + dot that rotates from -135° (mute) to +135° (max).
 */

const VOLUME_STEPS = [0, 0.25, 0.5, 0.75, 1.0];
const SWEEP_DEGREES = 270;
const START_ANGLE = -135;

interface VolumeKnobProps {
  volume: number;
  onVolumeChange: (volume: number) => void;
  disabled: boolean;
}

export function VolumeKnob({ volume, onVolumeChange, disabled }: VolumeKnobProps) {
  const pointerAngle = START_ANGLE + volume * SWEEP_DEGREES;

  function handleClick() {
    if (disabled) return;
    const currentIdx = VOLUME_STEPS.indexOf(volume);
    const nextIdx = currentIdx === -1 ? 1 : (currentIdx + 1) % VOLUME_STEPS.length;
    onVolumeChange(VOLUME_STEPS[nextIdx]);
  }

  return (
    <div className="volume-knob-wrapper">
      <button
        type="button"
        aria-label="Volume"
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={volume}
        className="volume-knob"
        onClick={handleClick}
        disabled={disabled}
      >
        <svg
          data-testid="volume-indicator"
          className={`volume-indicator${disabled ? ' volume-indicator--dim' : ''}`}
          viewBox="0 0 100 100"
          aria-hidden="true"
        >
          {/* Single rotating notch — line from mid-radius to inner rim, with a glowing dot */}
          <g
            data-testid="volume-pointer"
            className="volume-pointer"
            transform={`rotate(${pointerAngle} 50 50)`}
          >
            {/* Tick line — short cyan stroke from mid-radius outward */}
            <line className="volume-tick" x1="50" y1="22" x2="50" y2="34" />
            {/* Glow dot at outer tip */}
            <circle className="volume-tip" cx="50" cy="22" r="2.5" />
          </g>
        </svg>
      </button>
    </div>
  );
}
