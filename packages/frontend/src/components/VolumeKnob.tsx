/**
 * VolumeKnob — vintage LED segment volume meter for the TV console panel.
 *
 * "These go to eleven." (This Is Spinal Tap, 1984)
 *
 * The painted brass knob in TV-frame.png is purely decorative. This component
 * overlays an invisible click hit-area on top of it and renders an 11-segment
 * LED bar beneath as the actual volume readout.
 *
 * Internally the volume is a discrete integer step 0..11 (12 positions).
 * Click cycles 0 → 1 → … → 11 → 0. Gain emitted to the audio chain is
 * `step / 11`, so the external 0..1 contract is preserved.
 */

const MAX_STEP = 11;
const LED_COUNT = 11;

interface VolumeKnobProps {
  volume: number;
  onVolumeChange: (volume: number) => void;
  disabled: boolean;
}

function gainToStep(volume: number): number {
  // Round to nearest integer step, clamped to [0, MAX_STEP].
  const step = Math.round(volume * MAX_STEP);
  if (step < 0) return 0;
  if (step > MAX_STEP) return MAX_STEP;
  return step;
}

function stepToGain(step: number): number {
  return step === 0 ? 0 : step / MAX_STEP;
}

export function VolumeKnob({ volume, onVolumeChange, disabled }: VolumeKnobProps) {
  const step = gainToStep(volume);

  function handleClick() {
    if (disabled) return;
    const nextStep = (step + 1) % (MAX_STEP + 1);
    onVolumeChange(stepToGain(nextStep));
  }

  const valueText =
    step === MAX_STEP ? `${MAX_STEP} of ${MAX_STEP} — one louder` : `${step} of ${MAX_STEP}`;

  return (
    <div className="volume-knob-wrapper">
      <button
        type="button"
        aria-label="Volume"
        aria-valuemin={0}
        aria-valuemax={MAX_STEP}
        aria-valuenow={step}
        aria-valuetext={valueText}
        className="volume-knob"
        onClick={handleClick}
        disabled={disabled}
      />
      <div className="volume-led-bar" data-testid="volume-led-bar" aria-hidden="true">
        {Array.from({ length: LED_COUNT }, (_, i) => {
          const ledStep = i + 1;
          const isLit = !disabled && ledStep <= step;
          const isMax = ledStep === MAX_STEP;
          const classes = ['volume-led'];
          if (isLit) classes.push('volume-led--lit');
          else classes.push('volume-led--dim');
          if (isMax) classes.push('volume-led--max');
          return <span key={ledStep} className={classes.join(' ')} />;
        })}
      </div>
    </div>
  );
}
