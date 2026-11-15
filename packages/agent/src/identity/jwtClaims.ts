import type { IncomingHttpHeaders } from 'node:http';

/** The request carried no usable token; the caller must refuse it. */
export class InvalidTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTokenError';
  }
}

export interface VerifiedClaims {
  sub: string;
  /** Lowercased and trimmed. Cognito access tokens carry no `email`, so it is usually absent. */
  email?: string;
}

const BEARER = /^Bearer (\S+)$/;

/**
 * Reads the friend's identity from the bearer token in the `Authorization`
 * header (FR-010, #55). The signature is not checked here: the runtime's
 * inbound JWT authorizer has already validated it before the request reached
 * the container (research.md § Q4). Identity never comes from the body.
 */
export function readVerifiedClaims(headers: IncomingHttpHeaders): VerifiedClaims {
  const match = BEARER.exec(headers.authorization ?? '');
  if (!match) throw new InvalidTokenError('Authorization header must carry a bearer token');

  const segments = match[1]!.split('.');
  if (segments.length !== 3) throw new InvalidTokenError('Bearer token is not a JWT');

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(segments[1]!, 'base64url').toString('utf-8'));
  } catch {
    throw new InvalidTokenError('Bearer token payload is not JSON');
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new InvalidTokenError('Bearer token payload is not an object');
  }

  const { sub, email } = payload as { sub?: unknown; email?: unknown };
  if (typeof sub !== 'string' || sub.length === 0) {
    throw new InvalidTokenError('Bearer token has no sub claim');
  }
  if (email === undefined) return { sub };
  if (typeof email !== 'string') throw new InvalidTokenError('Bearer token email is not a string');
  return { sub, email: email.trim().toLowerCase() };
}
