import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  AVATAR_THEMES,
  nextTheme,
  DEFAULT_AVATAR_THEME,
  getRandomTalkFrameIndex,
  getRandomTalkFrameIntervalMs,
} from '../../src/config/constants';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('avatar theme constants', () => {
  it('exports the theme cycle in order', () => {
    expect(AVATAR_THEMES).toEqual(['retro', 'pop-art', 'cartoon']);
  });

  it('advances to the next theme and wraps back to retro', () => {
    expect(nextTheme('retro')).toBe('pop-art');
    expect(nextTheme('pop-art')).toBe('cartoon');
    expect(nextTheme('cartoon')).toBe('retro');
  });

  it('keeps the default theme on the first cycle entry', () => {
    expect(DEFAULT_AVATAR_THEME).toBe(AVATAR_THEMES[0]);
  });
});

describe('getRandomTalkFrameIntervalMs', () => {
  it('returns a random interval between 200 and 300 (inclusive)', () => {
    // Run multiple times to check the range is properly respected
    for (let i = 0; i < 20; i++) {
      const interval = getRandomTalkFrameIntervalMs();
      expect(interval).toBeGreaterThanOrEqual(200);
      expect(interval).toBeLessThanOrEqual(300);
    }
  });

  it('returns different values on successive calls', () => {
    const values = new Set<number>();
    for (let i = 0; i < 50; i++) {
      values.add(getRandomTalkFrameIntervalMs());
    }
    // With 50 calls and a range of 101 possible values (200-300), we should see variety
    // It's statistically very unlikely to get the same value every time
    expect(values.size).toBeGreaterThan(1);
  });
});

describe('getRandomTalkFrameIndex', () => {
  it('returns 0 when random value is below 0.5', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    expect(getRandomTalkFrameIndex()).toBe(0);
  });

  it('returns 1 when random value is 0.5 or higher', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    expect(getRandomTalkFrameIndex()).toBe(1);
  });
});
