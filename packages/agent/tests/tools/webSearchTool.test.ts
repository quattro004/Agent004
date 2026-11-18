import { describe, it, expect, vi } from 'vitest';
import { InvokeWebSearchCommand } from '@aws-sdk/client-bedrock-agentcore';
import {
  webSearchToolSchema,
  fetchWebSearch,
  searchForTurn,
  WebSearchTurn,
  SEARCH_LIMIT_REACHED,
} from '../../src/tools/webSearchTool.js';

/**
 * Web search is AgentCore's AWS-managed `InvokeWebSearch` operation, signed
 * with the runtime role: no API key, no engine ID, nothing in SSM
 * (wiki `Decision-Web-Search-Provider`). Google Custom Search closes on
 * 2027-01-01.
 */
function clientReturning(response: unknown) {
  return { send: vi.fn().mockResolvedValue(response) };
}

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

    it('rejects a query over the 200 characters the API accepts', () => {
      expect(webSearchToolSchema.safeParse({ query: 'q'.repeat(200) }).success).toBe(true);
      expect(webSearchToolSchema.safeParse({ query: 'q'.repeat(201) }).success).toBe(false);
    });
  });

  describe('fetchWebSearch', () => {
    it('asks the AWS-managed web search tool for the query, capped at five results', async () => {
      const client = clientReturning({ results: [] });

      await fetchWebSearch({ query: 'AI news 2026' }, { client });

      const command = client.send.mock.calls[0]![0];
      expect(command).toBeInstanceOf(InvokeWebSearchCommand);
      expect(command.input).toEqual({
        webSearchId: 'web-search.v1',
        searchQuery: 'AI news 2026',
        maxResults: 5,
      });
    });

    it('returns title, url and the text extract as the snippet', async () => {
      const client = clientReturning({
        results: [
          {
            title: 'AI breakthrough 2026',
            text: 'Major advancement in artificial intelligence.',
            url: 'https://example.com/ai',
            publishedAt: new Date('2026-11-01T00:00:00Z'),
          },
          { title: 'Tech news today', text: 'Latest in technology.', url: 'https://example.com/t' },
        ],
      });

      const result = await fetchWebSearch({ query: 'AI news 2026' }, { client });

      expect(result).toEqual({
        success: true,
        results: [
          {
            title: 'AI breakthrough 2026',
            snippet: 'Major advancement in artificial intelligence.',
            url: 'https://example.com/ai',
          },
          {
            title: 'Tech news today',
            snippet: 'Latest in technology.',
            url: 'https://example.com/t',
          },
        ],
      });
    });

    it('forwards the cancellation signal so a cancelled turn stops the search', async () => {
      const controller = new AbortController();
      const client = clientReturning({ results: [] });

      await fetchWebSearch({ query: 'max height' }, { client, signal: controller.signal });

      expect(client.send.mock.calls[0]![1]).toEqual({ abortSignal: controller.signal });
    });

    it('drops a result with no URL, since the persona must cite what it relays', async () => {
      const client = clientReturning({
        results: [
          { title: 'No link', text: 'Cannot be attributed.' },
          { title: 'Has link', text: 'Can be attributed.', url: 'https://example.com/ok' },
        ],
      });

      const result = await fetchWebSearch({ query: 'test' }, { client });

      expect(result.results).toEqual([
        { title: 'Has link', snippet: 'Can be attributed.', url: 'https://example.com/ok' },
      ]);
    });

    it('tolerates a result with no title', async () => {
      const client = clientReturning({
        results: [{ text: 'Body.', url: 'https://example.com/x' }],
      });

      const result = await fetchWebSearch({ query: 'test' }, { client });

      expect(result.results).toEqual([
        { title: '', snippet: 'Body.', url: 'https://example.com/x' },
      ]);
    });

    it('returns the service error message when the call fails', async () => {
      const client = {
        send: vi.fn().mockRejectedValue(new Error('ThrottlingException: slow down')),
      };

      const result = await fetchWebSearch({ query: 'test' }, { client });

      expect(result.success).toBe(false);
      expect(result.error).toContain('ThrottlingException');
    });

    it('handles empty results', async () => {
      const result = await fetchWebSearch(
        { query: 'obscure' },
        { client: clientReturning({ results: [] }) },
      );

      expect(result).toEqual({ success: true, results: [] });
    });

    it('handles a response with no results field', async () => {
      const result = await fetchWebSearch({ query: 'test' }, { client: clientReturning({}) });

      expect(result).toEqual({ success: true, results: [] });
    });

    it('never returns more than 5 results, whatever the service sends', async () => {
      const results = Array.from({ length: 10 }, (_, i) => ({
        title: `Result ${i}`,
        text: `Text ${i}`,
        url: `https://example.com/${i}`,
      }));

      const result = await fetchWebSearch(
        { query: 'test' },
        { client: clientReturning({ results }) },
      );

      expect(result.results).toHaveLength(5);
    });
  });

  // Spec 003 Session 2026-11-18 (T181): searches are capped per session, and
  // every result's source link reaches the friend's screen.
  describe('searchForTurn', () => {
    const hit = { title: 'Example', text: 'Snippet', url: 'https://example.com/a' };

    it('sends the search, counts it, and reports each source shown to the model', async () => {
      const client = clientReturning({ results: [hit] });
      const onSources = vi.fn();
      const turn = new WebSearchTurn(10, onSources);

      const result = await searchForTurn({ query: 'news' }, { client, turn });

      expect(result.success).toBe(true);
      expect(turn.sent).toBe(1);
      expect(onSources).toHaveBeenCalledWith([{ title: 'Example', url: 'https://example.com/a' }]);
    });

    it('refuses without sending once the session allowance is spent', async () => {
      const client = clientReturning({ results: [hit] });
      const turn = new WebSearchTurn(1, vi.fn());

      await searchForTurn({ query: 'one' }, { client, turn });
      const refused = await searchForTurn({ query: 'two' }, { client, turn });

      expect(refused).toEqual({ success: false, error: SEARCH_LIMIT_REACHED });
      expect(client.send).toHaveBeenCalledTimes(1);
      expect(turn.sent).toBe(1);
    });

    it('refuses the first search when the session has none left', async () => {
      const client = clientReturning({ results: [hit] });
      const turn = new WebSearchTurn(0, vi.fn());

      const refused = await searchForTurn({ query: 'news' }, { client, turn });

      expect(refused.success).toBe(false);
      expect(client.send).not.toHaveBeenCalled();
    });

    it('counts a search that failed, because it was sent', async () => {
      const client = { send: vi.fn().mockRejectedValue(new Error('throttled')) };
      const onSources = vi.fn();
      const turn = new WebSearchTurn(10, onSources);

      const result = await searchForTurn({ query: 'news' }, { client, turn });

      expect(result.success).toBe(false);
      expect(turn.sent).toBe(1);
      expect(onSources).not.toHaveBeenCalled();
    });

    it('reports nothing when the search found no usable result', async () => {
      const onSources = vi.fn();
      const turn = new WebSearchTurn(10, onSources);

      await searchForTurn({ query: 'news' }, { client: clientReturning({ results: [] }), turn });

      expect(onSources).not.toHaveBeenCalled();
    });
  });
});
