import { describe, it, expect } from 'vitest';
import { AVATAR_THEMES, nextTheme, DEFAULT_AVATAR_THEME } from '../../src/config/constants';

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
