export const VOLUME_MAX_STEP = 11;
export const VOLUME_LED_COUNT = 11;
export const KNOB_MIN_ANGLE_DEG = -135;
export const KNOB_MAX_ANGLE_DEG = 135;

export function clampStep(step: number): number {
  return Math.min(VOLUME_MAX_STEP, Math.max(0, Math.round(step)));
}

export function gainToStep(gain: number): number {
  return clampStep(gain * VOLUME_MAX_STEP);
}

export function stepToGain(step: number): number {
  return clampStep(step) / VOLUME_MAX_STEP;
}

export function stepToAngle(step: number): number {
  const progress = Math.min(VOLUME_MAX_STEP, Math.max(0, step)) / VOLUME_MAX_STEP;
  return KNOB_MIN_ANGLE_DEG + progress * (KNOB_MAX_ANGLE_DEG - KNOB_MIN_ANGLE_DEG);
}
