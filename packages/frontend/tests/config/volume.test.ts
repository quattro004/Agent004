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

  it('maps each volume step proportionally across the full indicator arc', () => {
    expect(stepToAngle(0)).toBe(-235);
    expect(stepToAngle(2)).toBeCloseTo(-235 + (2 / 11) * 280);
    expect(stepToAngle(5.5)).toBeCloseTo(-95);
    expect(stepToAngle(11)).toBe(45);
  });
});
