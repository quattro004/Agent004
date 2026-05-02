import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  newsToolSchema,
  fetchNews,
} from '../../src/tools/newsTool.js';
import {
  weatherToolSchema,
  fetchWeather,
} from '../../src/tools/weatherTool.js';

describe('newsTool', () => {
  describe('schema validation', () => {
    it('should accept a valid topic parameter', () => {
      const result = newsToolSchema.safeParse({ topic: 'technology' });
      expect(result.success).toBe(true);
    });

    it('should accept empty input (topic is optional)', () => {
      const result = newsToolSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept null topic', () => {
      const result = newsToolSchema.safeParse({ topic: undefined });
      expect(result.success).toBe(true);
    });
  });

  describe('fetchNews', () => {
    beforeEach(() => { process.env.NEWS_API_KEY = 'test-key'; });
    afterEach(() => { delete process.env.NEWS_API_KEY; });

    it('should return structured news data on success', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            articles: [
              {
                title: 'Test Headline',
                description: 'Test summary',
                source: { name: 'Test Source' },
                url: 'https://example.com/article',
              },
            ],
          }),
      });

      const result = await fetchNews({ topic: 'technology' }, mockFetch);
      expect(result.success).toBe(true);
      expect(result.headlines).toBeDefined();
      expect(result.headlines!.length).toBeGreaterThan(0);
      expect(result.headlines![0]).toHaveProperty('title');
      expect(result.headlines![0]).toHaveProperty('summary');
      expect(result.headlines![0]).toHaveProperty('source');
    });

    it('should return structured error on API failure', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await fetchNews({ topic: 'tech' }, mockFetch);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.headlines).toBeUndefined();
    });

    it('should return structured error on network failure', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await fetchNews({ topic: 'tech' }, mockFetch);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error when NEWS_API_KEY is not configured', async () => {
      delete process.env.NEWS_API_KEY;
      const result = await fetchNews({ topic: 'tech' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('NEWS_API_KEY');
    });
  });
});

describe('weatherTool', () => {
  describe('schema validation', () => {
    it('should accept a valid location parameter', () => {
      const result = weatherToolSchema.safeParse({ location: 'Seattle' });
      expect(result.success).toBe(true);
    });

    it('should reject missing location', () => {
      const result = weatherToolSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('fetchWeather', () => {
    beforeEach(() => { process.env.WEATHER_API_KEY = 'test-key'; });
    afterEach(() => { delete process.env.WEATHER_API_KEY; });

    it('should return structured weather data on success', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            main: { temp: 72 },
            weather: [{ description: 'overcast clouds' }],
            name: 'Seattle',
          }),
      });

      const result = await fetchWeather({ location: 'Seattle' }, mockFetch);
      expect(result.success).toBe(true);
      expect(result.temperature).toBeDefined();
      expect(result.conditions).toBeDefined();
      expect(result.location).toBe('Seattle');
    });

    it('should return structured error on API failure', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const result = await fetchWeather({ location: 'Nonexistent' }, mockFetch);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return structured error on network failure', async () => {
      const mockFetch = vi
        .fn()
        .mockRejectedValue(new Error('Network timeout'));

      const result = await fetchWeather({ location: 'Seattle' }, mockFetch);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error when WEATHER_API_KEY is not configured', async () => {
      delete process.env.WEATHER_API_KEY;
      const result = await fetchWeather({ location: 'Seattle' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('WEATHER_API_KEY');
    });
  });
});
