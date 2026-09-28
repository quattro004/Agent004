import { BedrockRuntimeClient, ListAsyncInvokesCommand } from '@aws-sdk/client-bedrock-runtime';

/**
 * AgentCore Runtime V2 supports five Regions; this project deploys to
 * `us-west-2` (Decision-AgentCore-Runtime-V2). The container always sets
 * `AWS_REGION`, so the default only matters for local runs.
 */
const DEFAULT_REGION = 'us-west-2';

function resolveRegion(env: NodeJS.ProcessEnv): string {
  return env.AWS_REGION ?? env.AWS_DEFAULT_REGION ?? DEFAULT_REGION;
}

let client: BedrockRuntimeClient | undefined;

function getClient(): BedrockRuntimeClient {
  client ??= new BedrockRuntimeClient({ region: resolveRegion(process.env) });
  return client;
}

/**
 * Drive one real, signed request against the Bedrock runtime endpoint so the
 * V2 snapshot captures the setup an idle client only allocates lazily:
 * credential resolution, endpoint-ruleset evaluation, SigV4 signing, protocol
 * serde and the TLS connection pool.
 *
 * `ListAsyncInvokes` is chosen over an inference call on budget grounds
 * (constitution P2). It runs no model and bills nothing, yet reaches the same
 * `bedrock-runtime` host over the same client as `Converse`. The alternatives
 * were rejected: `CountTokens` is free but AWS documents Claude models offered
 * only through cross-Region inference — which is what
 * `global.anthropic.claude-haiku-4-5-*` is — as unsupported on
 * `bedrock-runtime`, and a small `maxTokens` invocation bills on every
 * container start, which this scale-to-zero project pays often.
 *
 * Errors propagate. A degraded snapshot is inherited by every later instance,
 * so a failed warm-up must stop the process rather than serve traffic.
 *
 * Requires `bedrock:ListAsyncInvokes` on the runtime execution role.
 */
export async function probeBedrockRuntime(): Promise<void> {
  await getClient().send(new ListAsyncInvokesCommand({ maxResults: 1 }));
}

// Exposed for tests. The client is a module-level singleton on purpose: the
// warmed socket pool is the thing being captured, and a per-call client would
// throw it away.
export const __test = {
  getClient,
  resolveRegion,
  resetClient: (): void => {
    client = undefined;
  },
};
