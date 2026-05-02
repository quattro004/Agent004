import { z } from 'zod';

export const newsToolSchema = z.object({
  topic: z.string().optional(),
});

export type NewsInput = z.infer<typeof newsToolSchema>;

export interface NewsHeadline {
  title: string;
  summary: string;
  source: string;
}

export interface NewsResult {
  success: boolean;
  headlines?: NewsHeadline[];
  error?: string;
}

type FetchFn = (url: string | URL | Request, init?: RequestInit) => Promise<Response>;

export async function fetchNews(
  input: NewsInput,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<NewsResult> {
  const topic = input.topic ?? 'general';
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'NEWS_API_KEY is not configured' };
  }
  const url = `https://newsapi.org/v2/top-headlines?category=${encodeURIComponent(topic)}&country=us&pageSize=5&apiKey=${apiKey}`;

  try {
    const response = await fetchFn(url);
    if (!response.ok) {
      return {
        success: false,
        error: `News API returned ${response.status} ${response.statusText}`,
      };
    }

    const data = await response.json() as {
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
