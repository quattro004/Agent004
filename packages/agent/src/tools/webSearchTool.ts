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

export type WebSearchResult =
  { success: true; results: SearchResult[] } | { success: false; error: string };

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

/** What the friend's screen shows for each result (AWS's terms require the link). */
export interface SearchSource {
  title: string;
  url: string;
}

export const SEARCH_LIMIT_REACHED = 'The web search limit for this session has been reached';

/** The `invocationState` key the handler stores each turn's {@link WebSearchTurn} under. */
export const WEB_SEARCH_TURN = 'maxHeight.webSearchTurn';

/**
 * One turn's share of the session's search allowance (spec 003 Session
 * 2026-11-18). It counts every search sent, since a failed one may still bill,
 * and hands each result's source to the handler for the friend's screen.
 */
export class WebSearchTurn {
  #sent = 0;

  constructor(
    private readonly allowance: number,
    private readonly onSources: (sources: SearchSource[]) => void,
  ) {}

  /** Searches this turn sent; added to the session's count and priced at settlement. */
  get sent(): number {
    return this.#sent;
  }

  /** Takes one search from the allowance, or reports that none is left. */
  claim(): boolean {
    if (this.#sent >= this.allowance) return false;
    this.#sent += 1;
    return true;
  }

  report(results: SearchResult[]): void {
    if (results.length === 0) return;
    this.onSources(results.map(({ title, url }) => ({ title, url })));
  }
}

export async function searchForTurn(
  input: WebSearchInput,
  options: WebSearchOptions & { turn: WebSearchTurn },
): Promise<WebSearchResult> {
  const { turn, ...searchOptions } = options;
  if (!turn.claim()) return { success: false, error: SEARCH_LIMIT_REACHED };

  const result = await fetchWebSearch(input, searchOptions);
  if (result.success) turn.report(result.results ?? []);
  return result;
}
