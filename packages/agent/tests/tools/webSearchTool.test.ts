import { describe, it, expect, vi } from 'vitest';
import { webSearchToolSchema, fetchWebSearch } from '../../src/tools/webSearchTool.js';

describe('webSearchTool', () => {
  describe('schema validation', () => {
    it('accepts a valid query string', () => {
      const result = webSearchToolSchema.safeParse({ query: 'latest AI news' });
      expect(result.success).toBe(true);
    });

    it('rejects empty query', () => {
      const result = webSearchToolSchema.safeParse({ query: '' });
      expect(result.success).toBe(false);
    });

    it('rejects missing query', () => {
      const result = webSearchToolSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('fetchWebSearch', () => {
    it('returns search results on success', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            {
              title: 'AI breakthrough 2026',
              snippet: 'Major advancement in artificial intelligence.',
              link: 'https://example.com/ai',
            },
            {
              title: 'Tech news today',
              snippet: 'Latest in technology.',
              link: 'https://example.com/tech',
            },
          ],
        }),
      });

      const result = await fetchWebSearch(
        { query: 'AI news 2026' },
        { apiKey: 'test-search-key', engineId: 'test-engine-id', fetch: mockFetch },
      );

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results![0].title).toBe('AI breakthrough 2026');
      expect(result.results![0].snippet).toContain('artificial intelligence');
      expect(result.results![0].url).toBe('https://example.com/ai');
    });

    it('returns error when the search API key is missing', async () => {
      const result = await fetchWebSearch({ query: 'test' }, { apiKey: '', engineId: 'e' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('SEARCH_API_KEY');
    });

    it('returns error when the search engine ID is missing', async () => {
      const result = await fetchWebSearch({ query: 'test' }, { apiKey: 'k', engineId: '' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('SEARCH_ENGINE_ID');
    });

    it('handles API error responses', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      });

      const result = await fetchWebSearch(
        { query: 'test' },
        { apiKey: 'test-search-key', engineId: 'test-engine-id', fetch: mockFetch },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('429');
    });

    it('handles network errors', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network timeout'));

      const result = await fetchWebSearch(
        { query: 'test' },
        { apiKey: 'test-search-key', engineId: 'test-engine-id', fetch: mockFetch },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network timeout');
    });

    it('handles empty results', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [] }),
      });

      const result = await fetchWebSearch(
        { query: 'obscure query' },
        { apiKey: 'test-search-key', engineId: 'test-engine-id', fetch: mockFetch },
      );

      expect(result.success).toBe(true);
      expect(result.results).toEqual([]);
    });

    it('handles missing items field in response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const result = await fetchWebSearch(
        { query: 'test' },
        { apiKey: 'test-search-key', engineId: 'test-engine-id', fetch: mockFetch },
      );

      expect(result.success).toBe(true);
      expect(result.results).toEqual([]);
    });

    it('limits results to 5', async () => {
      const items = Array.from({ length: 10 }, (_, i) => ({
        title: `Result ${i}`,
        snippet: `Snippet ${i}`,
        link: `https://example.com/${i}`,
      }));

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items }),
      });

      const result = await fetchWebSearch(
        { query: 'test' },
        { apiKey: 'test-search-key', engineId: 'test-engine-id', fetch: mockFetch },
      );

      expect(result.success).toBe(true);
      expect(result.results!.length).toBeLessThanOrEqual(5);
    });
  });
});
