/**
 * T016 (spec 003, FR-010, #55): the friend's identity comes only from the
 * Cognito access token the runtime's inbound JWT authorizer has already
 * validated — never from fields in the request body.
 */
import { describe, it, expect } from 'vitest';
import type { IncomingHttpHeaders } from 'node:http';
import { readVerifiedClaims, InvalidTokenError } from '../../src/identity/jwtClaims.js';

function base64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function tokenWith(payload: unknown): string {
  return `${base64url({ kid: 'k', alg: 'RS256' })}.${base64url(payload)}.signature`;
}

function headersWith(authorization: string | undefined): IncomingHttpHeaders {
  return authorization === undefined ? {} : { authorization };
}

describe('readVerifiedClaims', () => {
  it('reads sub from the bearer token in the Authorization header', () => {
    const headers = headersWith(`Bearer ${tokenWith({ sub: 'sub-123', token_use: 'access' })}`);

    expect(readVerifiedClaims(headers).sub).toBe('sub-123');
  });

  it('lowercases and trims email when the token carries one', () => {
    const headers = headersWith(
      `Bearer ${tokenWith({ sub: 'sub-123', email: '  Friend@Example.COM ' })}`,
    );

    expect(readVerifiedClaims(headers).email).toBe('friend@example.com');
  });

  it('leaves email undefined when the token carries none (Cognito access tokens do not)', () => {
    const headers = headersWith(`Bearer ${tokenWith({ sub: 'sub-123' })}`);

    expect(readVerifiedClaims(headers)).toEqual({ sub: 'sub-123' });
  });

  it.each([
    ['a missing Authorization header', undefined],
    ['an empty Authorization header', ''],
    ['a non-bearer scheme', `Basic ${tokenWith({ sub: 'sub-123' })}`],
    ['a bearer with no token', 'Bearer '],
    ['a token without three segments', 'Bearer abc.def'],
    [
      'a payload that is not JSON',
      `Bearer ${base64url({})}.${Buffer.from('nope').toString('base64url')}.sig`,
    ],
    ['a payload that is not an object', `Bearer ${tokenWith('text')}`],
    ['a payload without sub', `Bearer ${tokenWith({ email: 'a@b.c' })}`],
    ['a payload with an empty sub', `Bearer ${tokenWith({ sub: '' })}`],
    ['a payload with a non-string sub', `Bearer ${tokenWith({ sub: 42 })}`],
    ['a payload with a non-string email', `Bearer ${tokenWith({ sub: 's', email: 7 })}`],
  ])('refuses %s', (_label, authorization) => {
    expect(() => readVerifiedClaims(headersWith(authorization))).toThrow(InvalidTokenError);
  });
});
