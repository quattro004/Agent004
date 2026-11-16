import { z } from 'zod';
import { InvokeWebSearchCommand } from '@aws-sdk/client-bedrock-agentcore';

/** `InvokeWebSearch` rejects a longer `searchQuery`. */
const MAX_QUERY_CHARS = 200;

export const webSearchToolSchema = z.object({
  query: z.string().min(1, 'Search query is required').max(MAX_QUERY_CHARS),
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

/** The AWS-managed tool. The service defaults to 25 results, so ask for fewer. */
const WEB_SEARCH_ID = 'web-search.v1';

/** The slice of `BedrockAgentCoreClient` this tool uses, so tests need no SDK mock. */
export interface WebSearchClient {
  send(
    command: InvokeWebSearchCommand,
    options?: { abortSignal?: AbortSignal },
  ): Promise<{ results?: Array<{ title?: string; text?: string; url?: string }> }>;
}

export interface WebSearchOptions {
  client: WebSearchClient;
  /** Cancels the outbound request when the friend's turn is cancelled. */
  signal?: AbortSignal;
}

/**
 * Searches through AgentCore's `InvokeWebSearch`, signed with the runtime role.
 * It needs no API key; the permission is `bedrock-agentcore:InvokeWebSearch`
 * (wiki `Source-AgentCore-Web-Search-Tool`).
 */
export async function fetchWebSearch(
  input: WebSearchInput,
  options: WebSearchOptions,
): Promise<WebSearchResult> {
  const { client, signal } = options;

  try {
    const response = await client.send(
      new InvokeWebSearchCommand({
        webSearchId: WEB_SEARCH_ID,
        searchQuery: input.query,
        maxResults: MAX_RESULTS,
      }),
      { abortSignal: signal },
    );

    // AWS's acceptable-use terms require showing the source link with each
    // result, so a result without a URL is of no use to the persona.
    const results: SearchResult[] = (response.results ?? [])
      .filter((result) => result.url !== undefined && result.url !== '')
      .slice(0, MAX_RESULTS)
      .map((result) => ({
        title: result.title ?? '',
        snippet: result.text ?? '',
        url: result.url!,
      }));

    return { success: true, results };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error performing web search',
    };
  }
}
