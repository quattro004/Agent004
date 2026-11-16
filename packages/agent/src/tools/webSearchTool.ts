import { z } from 'zod';
import { missingCredential, type ToolCallOptions } from './toolCall.js';

export const webSearchToolSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
});

export type WebSearchInput = z.infer<typeof webSearchToolSchema>;

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

export interface WebSearchResult {
  success: boolean;
  results?: SearchResult[];
  error?: string;
}

const MAX_RESULTS = 5;

/** Google Custom Search needs a programmable-search engine ID as well as a key. */
export interface WebSearchOptions extends ToolCallOptions {
  engineId: string;
}

export async function fetchWebSearch(
  input: WebSearchInput,
  options: WebSearchOptions,
): Promise<WebSearchResult> {
  const { apiKey, engineId, fetch: fetchFn = globalThis.fetch, signal } = options;
  if (!apiKey) {
    return missingCredential('SEARCH_API_KEY');
  }

  if (!engineId) {
    return missingCredential('SEARCH_ENGINE_ID');
  }

  const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${engineId}&q=${encodeURIComponent(input.query)}&num=${MAX_RESULTS}`;

  try {
    const response = await fetchFn(url, { signal });
    if (!response.ok) {
      return {
        success: false,
        error: `Search API returned ${response.status} ${response.statusText}`,
      };
    }

    const data = (await response.json()) as {
      items?: Array<{
        title: string;
        snippet: string;
        link: string;
      }>;
    };

    const results: SearchResult[] = (data.items ?? []).slice(0, MAX_RESULTS).map((item) => ({
      title: item.title,
      snippet: item.snippet ?? '',
      url: item.link,
    }));

    return { success: true, results };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error performing web search',
    };
  }
}
