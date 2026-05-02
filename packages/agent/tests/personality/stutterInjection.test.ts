import { describe, it, expect } from 'vitest';
import {
  injectStutters,
  countStutters,
  isStutter,
} from '../../src/personality/stutterInjection.js';

describe('stutterInjection', () => {
  describe('isStutter', () => {
    it('should detect name stutters like M-m-m-Max', () => {
      expect(isStutter('M-m-m-Max')).toBe(true);
      expect(isStutter('W-w-w-Welcome')).toBe(true);
    });

    it('should detect leading stutters like W-w-well', () => {
      expect(isStutter('W-w-well')).toBe(true);
      expect(isStutter('I-i-it')).toBe(true);
    });

    it('should detect syllable glitches like fan-fan-fantastic', () => {
      expect(isStutter('fan-fan-fantastic')).toBe(true);
      expect(isStutter('tele-tele-television')).toBe(true);
    });

    it('should detect word loops like really, really, really', () => {
      expect(isStutter('television-television-television')).toBe(true);
    });

    it('should detect echo tails like vision-vision-vision', () => {
      expect(isStutter('television-vision-vision')).toBe(true);
    });

    it('should not flag normal hyphenated words', () => {
      expect(isStutter('well-known')).toBe(false);
      expect(isStutter('up-to-date')).toBe(false);
    });
  });

  describe('countStutters', () => {
    it('should count stutters in text with multiple stutters', () => {
      const text =
        'M-m-m-Max Height here! W-w-well, the weather is fan-fan-fantastic today.';
      expect(countStutters(text)).toBe(3);
    });

    it('should return 0 for text with no stutters', () => {
      const text = 'The weather today is 72 degrees and sunny.';
      expect(countStutters(text)).toBe(0);
    });

    it('should count echo tails', () => {
      const text =
        'Welcome to the labyrinth of television-vision-vision.';
      expect(countStutters(text)).toBe(1);
    });
  });

  describe('injectStutters', () => {
    it('should inject stutters when below minimum threshold', () => {
      const text = 'Well, the weather in Seattle is 72 and overcast.';
      const result = injectStutters(text, { minStutters: 1, maxStutters: 3 });
      expect(result.stutterCount).toBeGreaterThanOrEqual(1);
      expect(countStutters(result.text)).toBeGreaterThanOrEqual(1);
    });

    it('should not inject stutters when already at or above minimum', () => {
      const text = 'M-m-m-Max says the weather is W-w-well, fine.';
      const result = injectStutters(text, { minStutters: 1, maxStutters: 3 });
      // Should not add more stutters when already at 2
      expect(result.text).toBe(text);
    });

    it('should format stutters as repeated syllables like M-M-Max', () => {
      const text = 'Max says hello to the viewers at home.';
      const result = injectStutters(text, { minStutters: 1, maxStutters: 3 });
      // The word "Max" should be stuttered with a recognizable pattern
      expect(result.text).toMatch(
        /[A-Z]-[a-z]-[a-z]?-?[A-Za-z]+|[a-z]-[a-z]-[a-z]?-?[a-z]+/,
      );
    });

    it('should return stutter markers with position info', () => {
      const text = 'Well hello there, friend.';
      const result = injectStutters(text, { minStutters: 1, maxStutters: 3 });
      expect(result.markers.length).toBeGreaterThanOrEqual(1);
      for (const marker of result.markers) {
        expect(marker).toHaveProperty('position');
        expect(marker).toHaveProperty('original');
        expect(marker).toHaveProperty('stuttered');
      }
    });

    it('should not stutter raw data like numbers and URLs', () => {
      const text = 'The temperature is 72 degrees at https://weather.com today.';
      const result = injectStutters(text, { minStutters: 1, maxStutters: 3 });
      expect(result.text).toContain('72');
      expect(result.text).toContain('https://weather.com');
      // Numbers and URLs should remain intact
      expect(result.text).not.toMatch(/7-7-72|h-h-https/);
    });

    it('should prefer stuttering Max as M-m-m-Max', () => {
      const text = 'Max Height reporting live from the studio.';
      const result = injectStutters(text, { minStutters: 1, maxStutters: 3 });
      expect(result.text).toMatch(/M-m-m?-?Max/i);
    });

    it('should not exceed maxStutters', () => {
      const text =
        'Hello there friend, welcome to the show, stay tuned for more.';
      const result = injectStutters(text, { minStutters: 1, maxStutters: 2 });
      expect(result.stutterCount).toBeLessThanOrEqual(2);
    });
  });
});
