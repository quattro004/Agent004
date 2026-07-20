/**
 * Phase 2 (audio-plan): pure units of the greeting generation script.
 */
import { describe, it, expect } from 'vitest';
import {
  buildGreetingSsml,
  calibrateDurations,
  type GreetingManifest,
} from '../../scripts/greetingGenCore';
import { wrapInSsml } from '../../src/services/pollyTts';

describe('buildGreetingSsml', () => {
  it('returns the custom SSML verbatim when supplied', () => {
    const custom = '<speak><break time="200ms"/>Hi there.</speak>';
    expect(buildGreetingSsml('Hi there.', custom)).toBe(custom);
  });

  it('falls back to wrapInSsml when custom SSML is undefined', () => {
    expect(buildGreetingSsml('Hello world.')).toBe(wrapInSsml('Hello world.'));
  });

  it('falls back to wrapInSsml when custom SSML is empty or whitespace', () => {
    expect(buildGreetingSsml('Hello world.', '')).toBe(wrapInSsml('Hello world.'));
    expect(buildGreetingSsml('Hello world.', '   ')).toBe(wrapInSsml('Hello world.'));
  });
});

describe('calibrateDurations', () => {
  const baseManifest: GreetingManifest = {
    version: '1.0.0',
    greetings: [
      { id: 'greeting-001', archetype: 'X', audioDurationMs: 8000, weight: 1.0 },
      { id: 'greeting-002', archetype: 'Y', audioDurationMs: 7000, weight: 1.0 },
    ],
  };

  it('updates audioDurationMs for measured greetings', () => {
    const result = calibrateDurations(baseManifest, {
      'greeting-001': 6543,
      'greeting-002': 5000,
    });
    expect(result.greetings[0].audioDurationMs).toBe(6543);
    expect(result.greetings[1].audioDurationMs).toBe(5000);
  });

  it('rounds fractional measured durations', () => {
    const result = calibrateDurations(baseManifest, { 'greeting-001': 6543.7 });
    expect(result.greetings[0].audioDurationMs).toBe(6544);
  });

  it('clamps below the minimum to MIN_DURATION_MS', () => {
    const result = calibrateDurations(baseManifest, { 'greeting-001': 250 });
    expect(result.greetings[0].audioDurationMs).toBe(1000);
  });

  it('clamps above the maximum to MAX_DURATION_MS', () => {
    const result = calibrateDurations(baseManifest, { 'greeting-001': 99000 });
    expect(result.greetings[0].audioDurationMs).toBe(15000);
  });

  it('leaves greetings absent from the measured map unchanged', () => {
    const result = calibrateDurations(baseManifest, { 'greeting-001': 5000 });
    expect(result.greetings[1].audioDurationMs).toBe(7000);
  });

  it('preserves unrelated fields and greeting order', () => {
    const result = calibrateDurations(baseManifest, { 'greeting-002': 5000 });
    expect(result.version).toBe('1.0.0');
    expect(result.greetings.map((g) => g.id)).toEqual(['greeting-001', 'greeting-002']);
    expect(result.greetings[0].archetype).toBe('X');
    expect(Object.keys(result.greetings[0])).toEqual([
      'id',
      'archetype',
      'audioDurationMs',
      'weight',
    ]);
  });

  it('does not mutate the input manifest', () => {
    calibrateDurations(baseManifest, { 'greeting-001': 250 });
    expect(baseManifest.greetings[0].audioDurationMs).toBe(8000);
  });
});
