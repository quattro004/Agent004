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
 * An `IncomingMessage` double carrying a body and headers. Every request the
 * handler serves is authenticated, so a token is supplied by default: a test
 * that omits one is testing the refusal, not the happy path.
 */
export function makeReq(
  body: unknown,
  headers: IncomingHttpHeaders = bearerHeaders(),
): IncomingMessage {
  const stream = new PassThrough();
  Object.assign(stream, { headers });
  stream.end(typeof body === 'string' ? body : JSON.stringify(body));
  return stream as unknown as IncomingMessage;
}
