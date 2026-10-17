import type { CSSProperties, KeyboardEvent, WheelEvent } from 'react';
import {
  clampStep,
  gainToStep,
  stepToAngle,
  stepToGain,
  VOLUME_LED_COUNT,
  VOLUME_MAX_STEP,
} from '../config/volume';

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
 * Gain emitted to the audio chain is `step / 11`, preserving the external
 * 0..1 contract.
 */

interface VolumeKnobProps {
  volume: number;
  onVolumeChange: (volume: number) => void;
  disabled: boolean;
}

export function VolumeKnob({ volume, onVolumeChange, disabled }: VolumeKnobProps) {
  const step = gainToStep(volume);

  function changeStep(nextStep: number) {
    if (disabled) return;
    const clampedStep = clampStep(nextStep);
    if (clampedStep === step) return;
    onVolumeChange(stepToGain(clampedStep));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;

    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        event.preventDefault();
        changeStep(step + 1);
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        event.preventDefault();
        changeStep(step - 1);
        break;
      case 'Home':
        event.preventDefault();
        changeStep(0);
        break;
      case 'End':
        event.preventDefault();
        changeStep(VOLUME_MAX_STEP);
        break;
    }
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (disabled || event.deltaY === 0) return;
    // This fixed console does not need to cancel the browser's passive wheel event.
    changeStep(step + (event.deltaY < 0 ? 1 : -1));
  }

  const valueText =
    step === VOLUME_MAX_STEP
      ? `${VOLUME_MAX_STEP} of ${VOLUME_MAX_STEP} — one louder`
      : `${step} of ${VOLUME_MAX_STEP}`;

  return (
    <div className="volume-knob-wrapper">
      <div
        role="group"
        aria-label="Volume"
        aria-valuemin={0}
        aria-valuemax={VOLUME_MAX_STEP}
        aria-valuenow={step}
        aria-valuetext={valueText}
        className={`volume-knob${disabled ? ' volume-knob--disabled' : ''}`}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={handleKeyDown}
        onWheel={handleWheel}
      >
        <div
          className="volume-knob-indicator"
          aria-hidden="true"
          style={{ '--knob-angle': `${stepToAngle(step)}deg` } as CSSProperties}
        />
        <button
          type="button"
          aria-label="Volume down"
          className="volume-knob-half volume-knob-half--down"
          onClick={() => changeStep(step - 1)}
          disabled={disabled}
        />
        <button
          type="button"
          aria-label="Volume up"
          className="volume-knob-half volume-knob-half--up"
          onClick={() => changeStep(step + 1)}
          disabled={disabled}
        />
      </div>
      <div className="volume-led-bar" data-testid="volume-led-bar" aria-hidden="true">
        {Array.from({ length: VOLUME_LED_COUNT }, (_, i) => {
          const ledStep = i + 1;
          const isLit = !disabled && ledStep <= step;
          const isMax = ledStep === VOLUME_MAX_STEP;
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
