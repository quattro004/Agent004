/**
 * Shared shape for the tools' outbound calls.
 *
 * Credentials are arguments rather than `process.env` reads: the container
 * loads its secrets from SSM at startup (contracts/runtime-config.md), so a
 * tool reaching for the environment would silently use whatever the process
 * inherited — usually nothing, which looks like an outage rather than the
 * misconfiguration it is.
 */
export type FetchFn = (url: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface ToolCallOptions {
  /** The API key for this tool's provider, from `RuntimeConfig.secrets`; absent when not configured. */
  apiKey: string | undefined;
  /** Injected for tests; defaults to the global `fetch`. */
  fetch?: FetchFn;
  /** Cancels the outbound request when the friend's turn is cancelled. */
  signal?: AbortSignal;
}

/** A refusal shaped like every tool's result, for a credential that is absent. */
export function missingCredential(name: string): { success: false; error: string } {
  return { success: false, error: `${name} is not configured` };
}
