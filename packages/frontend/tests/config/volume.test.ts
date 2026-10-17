import { describe, expect, it } from 'vitest';
import { clampStep, gainToStep, stepToAngle, stepToGain } from '../../src/config/volume';

describe('volume helpers', () => {
  it('clamps volume steps to the supported range', () => {
    expect(clampStep(-1)).toBe(0);
    expect(clampStep(12)).toBe(11);
  });

  it('preserves the 12-step gain curve', () => {
    expect(gainToStep(0.5)).toBe(6);
    expect(stepToGain(11)).toBe(1);
  });

  it('maps the minimum, midpoint, and maximum to the indicator arc', () => {
    expect(stepToAngle(0)).toBeCloseTo(-135);
    expect(stepToAngle(5.5)).toBeCloseTo(0);
    expect(stepToAngle(11)).toBeCloseTo(135);
  });
});
