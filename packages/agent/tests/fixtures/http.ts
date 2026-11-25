import { PassThrough } from 'node:stream';
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';

/** The subject in `bearerHeaders()`'s default token. */
export const TEST_SUB = 'test-friend';

/**
 * A bearer token shaped like the one the runtime's inbound JWT authorizer has
 * already validated. The handler reads the payload and never the signature
 * (`src/identity/jwtClaims.ts`), so a placeholder signature is enough.
 */
export function bearerHeaders(claims: Record<string, unknown> = { sub: TEST_SUB }) {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return {
    authorization: `Bearer ${part({ alg: 'RS256' })}.${part(claims)}.signature`,
  } satisfies IncomingHttpHeaders;
}

/**
 * The header AgentCore Runtime always sets, long enough to satisfy its own
 * 33-character minimum. It routes to a microVM and never identifies a friend.
 */
export const TEST_RUNTIME_SESSION_ID = 'runtime-session-0000000000000000000';

/**
 * An `IncomingMessage` double carrying a body and headers. Every request the
 * handler serves is authenticated and arrives through AgentCore, so a token
 * and a runtime session ID are supplied by default: a test that omits one is
 * testing the refusal, not the happy path.
 */
export function makeReq(
  body: unknown,
  headers: IncomingHttpHeaders = {
    ...bearerHeaders(),
    'x-amzn-bedrock-agentcore-runtime-session-id': TEST_RUNTIME_SESSION_ID,
  },
): IncomingMessage {
  const stream = new PassThrough();
  Object.assign(stream, { headers });
  stream.end(typeof body === 'string' ? body : JSON.stringify(body));
  return stream as unknown as IncomingMessage;
}
