import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { newsToolSchema, fetchNews } from '../../src/tools/newsTool.js';
import { weatherToolSchema, fetchWeather } from '../../src/tools/weatherTool.js';

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

      const result = await fetchNews(
        { topic: 'technology' },
        { apiKey: 'test-key', fetch: mockFetch },
      );
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

      const result = await fetchNews({ topic: 'tech' }, { apiKey: 'test-key', fetch: mockFetch });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.headlines).toBeUndefined();
    });

    it('should return structured error on network failure', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await fetchNews({ topic: 'tech' }, { apiKey: 'test-key', fetch: mockFetch });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error when the news API key is not configured', async () => {
      const result = await fetchNews({ topic: 'tech' }, { apiKey: '' });
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

      const result = await fetchWeather(
        { location: 'Seattle' },
        { apiKey: 'test-key', fetch: mockFetch },
      );
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

      const result = await fetchWeather(
        { location: 'Nonexistent' },
        { apiKey: 'test-key', fetch: mockFetch },
      );
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return structured error on network failure', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network timeout'));

      const result = await fetchWeather(
        { location: 'Seattle' },
        { apiKey: 'test-key', fetch: mockFetch },
      );
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error when the weather API key is not configured', async () => {
      const result = await fetchWeather({ location: 'Seattle' }, { apiKey: '' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('WEATHER_API_KEY');
    });
  });
});

describe('cancellation signal forwarding', () => {
  // Without this, cancelling an invocation leaves the tool's HTTP request
  // in flight — the guest has gone but the upstream call still completes.
  const okResponse = { ok: true, json: () => Promise.resolve({}) };

  it('fetchNews forwards the signal to fetch', async () => {
    const controller = new AbortController();
    const mockFetch = vi.fn().mockResolvedValue(okResponse);
    await fetchNews(
      { topic: 'tech' },
      { apiKey: 'k', fetch: mockFetch, signal: controller.signal },
    );
    expect(mockFetch.mock.calls[0]?.[1]).toMatchObject({ signal: controller.signal });
  });

  it('fetchWeather forwards the signal to fetch', async () => {
    const controller = new AbortController();
    const mockFetch = vi.fn().mockResolvedValue(okResponse);
    await fetchWeather(
      { location: 'Seattle' },
      { apiKey: 'k', fetch: mockFetch, signal: controller.signal },
    );
    expect(mockFetch.mock.calls[0]?.[1]).toMatchObject({ signal: controller.signal });
  });
});

describe('tool credentials come from arguments, not the environment', () => {
  // T038: the container reads its secrets from SSM at startup
  // (contracts/runtime-config.md). A tool that reaches for process.env would
  // silently use whatever the process happened to inherit — including nothing
  // at all, which looks like an outage rather than a misconfiguration.
  const okJson = (body: unknown) => vi.fn().mockResolvedValue({ ok: true, json: async () => body });

  beforeEach(() => {
    process.env.NEWS_API_KEY = 'stale-env-key';
    process.env.WEATHER_API_KEY = 'stale-env-key';
  });

  afterEach(() => {
    delete process.env.NEWS_API_KEY;
    delete process.env.WEATHER_API_KEY;
  });

  it('fetchNews calls the API with the key it was given', async () => {
    const mockFetch = okJson({ articles: [] });
    await fetchNews({ topic: 'tech' }, { apiKey: 'configured-key', fetch: mockFetch });

    expect(String(mockFetch.mock.calls[0]![0])).toContain('apiKey=configured-key');
    expect(String(mockFetch.mock.calls[0]![0])).not.toContain('stale-env-key');
  });

  it('fetchWeather calls the API with the key it was given', async () => {
    const mockFetch = okJson({ main: { temp: 1 }, weather: [{ description: 'x' }], name: 'S' });
    await fetchWeather({ location: 'Seattle' }, { apiKey: 'configured-key', fetch: mockFetch });

    expect(String(mockFetch.mock.calls[0]![0])).toContain('appid=configured-key');
    expect(String(mockFetch.mock.calls[0]![0])).not.toContain('stale-env-key');
  });
});
