import { z } from 'zod';
import { missingCredential, type ToolCallOptions } from './toolCall.js';

export const newsToolSchema = z.object({
  topic: z.string().optional(),
});

export type NewsInput = z.infer<typeof newsToolSchema>;

export interface NewsHeadline {
  title: string;
  summary: string;
  source: string;
}

export type NewsResult =
  { success: true; headlines: NewsHeadline[] } | { success: false; error: string };

export async function fetchNews(input: NewsInput, options: ToolCallOptions): Promise<NewsResult> {
  const topic = input.topic ?? 'general';
  const { apiKey, fetch: fetchFn = globalThis.fetch, signal } = options;
  if (!apiKey) {
    return missingCredential('NEWS_API_KEY');
  }
  const url = `https://newsapi.org/v2/top-headlines?category=${encodeURIComponent(topic)}&country=us&pageSize=5&apiKey=${apiKey}`;

  try {
    const response = await fetchFn(url, { signal });
    if (!response.ok) {
      return {
        success: false,
        error: `News API returned ${response.status} ${response.statusText}`,
      };
    }

    const data = (await response.json()) as {
      articles: Array<{
        title: string;
        description: string;
        source: { name: string };
        url: string;
      }>;
    };

    const headlines: NewsHeadline[] = data.articles.map((article) => ({
      title: article.title,
      summary: article.description ?? '',
      source: article.source?.name ?? 'Unknown',
    }));

    return { success: true, headlines };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error fetching news',
    };
  }
}
