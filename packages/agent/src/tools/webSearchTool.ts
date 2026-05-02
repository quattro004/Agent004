import { z } from 'zod';

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

type FetchFn = (url: string | URL | Request, init?: RequestInit) => Promise<Response>;

export async function fetchWebSearch(
  input: WebSearchInput,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<WebSearchResult> {
  const apiKey = process.env.SEARCH_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'SEARCH_API_KEY is not configured' };
  }

  const engineId = process.env.SEARCH_ENGINE_ID;
  if (!engineId) {
    return { success: false, error: 'SEARCH_ENGINE_ID is not configured' };
  }

  const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${engineId}&q=${encodeURIComponent(input.query)}&num=${MAX_RESULTS}`;

  try {
    const response = await fetchFn(url);
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
