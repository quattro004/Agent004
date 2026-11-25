import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createAuthService,
  REFRESH_TOKEN_STORAGE_KEY,
  PKCE_STORAGE_KEY,
  type AuthConfig,
} from '../../src/services/auth';

/**
 * The browser half of contracts/auth-and-allowlist.md § Browser flow.
 * Authorization code + PKCE, no third-party auth library: the access and ID
 * tokens live in memory, the refresh token lives in sessionStorage, and
 * nothing is written to localStorage or a cookie.
 */

const config: AuthConfig = {
  cognitoDomain: 'https://max-height.auth.us-west-2.amazoncognito.com',
  clientId: 'client-abc',
  redirectUri: 'https://max.recipieces.com/auth/callback',
  signOutUri: 'https://max.recipieces.com/',
};

function tokenResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        access_token: 'access-1',
        id_token: 'id-1',
        refresh_token: 'refresh-1',
        expires_in: 3600,
        token_type: 'Bearer',
        ...overrides,
      }),
  } as unknown as Response;
}

describe('auth service', () => {
  let fetchImpl: ReturnType<typeof vi.fn>;
  let redirect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-16T12:00:00Z'));
    sessionStorage.clear();
    localStorage.clear();
    fetchImpl = vi.fn().mockResolvedValue(tokenResponse());
    redirect = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function make(overrides: Partial<Parameters<typeof createAuthService>[0]> = {}) {
    return createAuthService({ config, fetchImpl, redirect, ...overrides });
  }

  describe('signIn — the authorize redirect', () => {
    it('sends the friend straight to Google with a S256 challenge', async () => {
      await make().signIn();

      const url = new URL(redirect.mock.calls[0][0] as string);
      expect(url.origin + url.pathname).toBe(`${config.cognitoDomain}/oauth2/authorize`);
      expect(url.searchParams.get('identity_provider')).toBe('Google');
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('client_id')).toBe(config.clientId);
      expect(url.searchParams.get('redirect_uri')).toBe(config.redirectUri);
      expect(url.searchParams.get('scope')).toBe('openid email');
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('code_challenge')).toBeTruthy();
      expect(url.searchParams.get('state')).toBeTruthy();
    });

    it('keeps the verifier out of the URL and the challenge out of storage', async () => {
      await make().signIn();

      const url = new URL(redirect.mock.calls[0][0] as string);
      const stored = JSON.parse(sessionStorage.getItem(PKCE_STORAGE_KEY) ?? '{}');
      expect(stored.verifier).toBeTruthy();
      expect(url.toString()).not.toContain(stored.verifier);
      expect(stored.state).toBe(url.searchParams.get('state'));
    });

    it('generates a fresh verifier and state on every attempt', async () => {
      const auth = make();
      await auth.signIn();
      const first = JSON.parse(sessionStorage.getItem(PKCE_STORAGE_KEY) ?? '{}');
      await auth.signIn();
      const second = JSON.parse(sessionStorage.getItem(PKCE_STORAGE_KEY) ?? '{}');

      expect(second.verifier).not.toBe(first.verifier);
      expect(second.state).not.toBe(first.state);
    });
  });

  describe('handleCallback — the code exchange', () => {
    async function startedAuth() {
      const auth = make();
      await auth.signIn();
      const state = JSON.parse(sessionStorage.getItem(PKCE_STORAGE_KEY) ?? '{}').state as string;
      return { auth, state };
    }

    it('exchanges the code at the token endpoint with the verifier', async () => {
      const { auth, state } = await startedAuth();
      const verifier = JSON.parse(sessionStorage.getItem(PKCE_STORAGE_KEY) ?? '{}')
        .verifier as string;

      const result = await auth.handleCallback(new URLSearchParams({ code: 'code-1', state }));

      expect(result.status).toBe('signed-in');
      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe(`${config.cognitoDomain}/oauth2/token`);
      expect((init as RequestInit).method).toBe('POST');
      const body = new URLSearchParams((init as RequestInit).body as string);
      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('code')).toBe('code-1');
      expect(body.get('code_verifier')).toBe(verifier);
      expect(body.get('client_id')).toBe(config.clientId);
      expect(body.get('redirect_uri')).toBe(config.redirectUri);
    });

    it('keeps the access token in memory and the refresh token in sessionStorage', async () => {
      const { auth, state } = await startedAuth();

      await auth.handleCallback(new URLSearchParams({ code: 'code-1', state }));

      await expect(auth.getAccessToken()).resolves.toBe('access-1');
      expect(sessionStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBe('refresh-1');
      expect(localStorage.length).toBe(0);
      expect(JSON.stringify(sessionStorage)).not.toContain('access-1');
    });

    it('clears the PKCE values once they have been spent', async () => {
      const { auth, state } = await startedAuth();

      await auth.handleCallback(new URLSearchParams({ code: 'code-1', state }));

      expect(sessionStorage.getItem(PKCE_STORAGE_KEY)).toBeNull();
    });

    it('discards the code when state does not match', async () => {
      const { auth } = await startedAuth();

      const result = await auth.handleCallback(
        new URLSearchParams({ code: 'code-1', state: 'not-the-state' }),
      );

      expect(result.status).toBe('error');
      expect(fetchImpl).not.toHaveBeenCalled();
      await expect(auth.getAccessToken()).resolves.toBeNull();
    });

    it('discards the code when no sign-in was started in this tab', async () => {
      const result = await make().handleCallback(
        new URLSearchParams({ code: 'code-1', state: 'whatever' }),
      );

      expect(result.status).toBe('error');
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('reports a denial when Cognito returns an error instead of a code', async () => {
      const { auth, state } = await startedAuth();

      const result = await auth.handleCallback(
        new URLSearchParams({ error: 'access_denied', error_description: 'DENIED', state }),
      );

      expect(result.status).toBe('denied');
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('reports an error when the token endpoint refuses the exchange', async () => {
      const { auth, state } = await startedAuth();
      fetchImpl.mockResolvedValue({ ok: false, status: 400, json: () => Promise.resolve({}) });

      const result = await auth.handleCallback(new URLSearchParams({ code: 'code-1', state }));

      expect(result.status).toBe('error');
      await expect(auth.getAccessToken()).resolves.toBeNull();
    });
  });

  describe('getAccessToken — silent refresh (FR-047)', () => {
    async function signedIn(expiresIn = 3600) {
      const auth = make();
      await auth.signIn();
      const state = JSON.parse(sessionStorage.getItem(PKCE_STORAGE_KEY) ?? '{}').state as string;
      fetchImpl.mockResolvedValue(tokenResponse({ expires_in: expiresIn }));
      await auth.handleCallback(new URLSearchParams({ code: 'code-1', state }));
      fetchImpl.mockClear();
      return auth;
    }

    it('returns the held token without a network call while it is fresh', async () => {
      const auth = await signedIn();

      await expect(auth.getAccessToken()).resolves.toBe('access-1');
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('refreshes before the token expires', async () => {
      const auth = await signedIn(3600);
      fetchImpl.mockResolvedValue(tokenResponse({ access_token: 'access-2' }));

      vi.setSystemTime(new Date('2026-11-16T12:56:00Z'));

      await expect(auth.getAccessToken()).resolves.toBe('access-2');
      const body = new URLSearchParams(fetchImpl.mock.calls[0][1].body as string);
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('refresh_token')).toBe('refresh-1');
    });

    it('keeps the stored refresh token when the response omits a new one', async () => {
      const auth = await signedIn(3600);
      fetchImpl.mockResolvedValue(tokenResponse({ access_token: 'access-2', refresh_token: null }));
      vi.setSystemTime(new Date('2026-11-16T12:56:00Z'));

      await auth.getAccessToken();

      expect(sessionStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBe('refresh-1');
    });

    it('signs the friend out when the refresh is refused', async () => {
      const auth = await signedIn(3600);
      fetchImpl.mockResolvedValue({ ok: false, status: 400, json: () => Promise.resolve({}) });
      vi.setSystemTime(new Date('2026-11-16T12:56:00Z'));

      await expect(auth.getAccessToken()).resolves.toBeNull();
      expect(sessionStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBeNull();
      expect(auth.isSignedIn()).toBe(false);
    });

    it('refreshes once on demand after a 401, and reports failure the second time', async () => {
      const auth = await signedIn();
      fetchImpl.mockResolvedValue(tokenResponse({ access_token: 'access-2' }));

      await expect(auth.refreshAccessToken()).resolves.toBe('access-2');

      fetchImpl.mockResolvedValue({ ok: false, status: 400, json: () => Promise.resolve({}) });
      await expect(auth.refreshAccessToken()).resolves.toBeNull();
    });

    it('recovers a session from the refresh token left by a reload', async () => {
      sessionStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, 'refresh-from-reload');
      const auth = make();
      fetchImpl.mockResolvedValue(tokenResponse({ access_token: 'access-reloaded' }));

      await expect(auth.getAccessToken()).resolves.toBe('access-reloaded');
    });

    it('returns null without a network call when nothing is stored', async () => {
      const auth = make();

      await expect(auth.getAccessToken()).resolves.toBeNull();
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('does not fire two refreshes for two concurrent callers', async () => {
      const auth = await signedIn(3600);
      fetchImpl.mockResolvedValue(tokenResponse({ access_token: 'access-2' }));
      vi.setSystemTime(new Date('2026-11-16T12:56:00Z'));

      const [first, second] = await Promise.all([auth.getAccessToken(), auth.getAccessToken()]);

      expect(first).toBe('access-2');
      expect(second).toBe('access-2');
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
  });

  describe('signOut', () => {
    async function signedIn() {
      const auth = make();
      await auth.signIn();
      const state = JSON.parse(sessionStorage.getItem(PKCE_STORAGE_KEY) ?? '{}').state as string;
      await auth.handleCallback(new URLSearchParams({ code: 'code-1', state }));
      fetchImpl.mockClear();
      redirect.mockClear();
      return auth;
    }

    it('revokes the refresh token, clears both tokens and redirects to logout', async () => {
      const auth = await signedIn();

      await auth.signOut();

      const [revokeUrl, revokeInit] = fetchImpl.mock.calls[0];
      expect(revokeUrl).toBe(`${config.cognitoDomain}/oauth2/revoke`);
      const body = new URLSearchParams(revokeInit.body as string);
      expect(body.get('token')).toBe('refresh-1');
      expect(body.get('client_id')).toBe(config.clientId);

      expect(sessionStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBeNull();
      await expect(auth.getAccessToken()).resolves.toBeNull();

      const logout = new URL(redirect.mock.calls[0][0] as string);
      expect(logout.origin + logout.pathname).toBe(`${config.cognitoDomain}/logout`);
      expect(logout.searchParams.get('client_id')).toBe(config.clientId);
      expect(logout.searchParams.get('logout_uri')).toBe(config.signOutUri);
    });

    it('still clears tokens and redirects when revocation fails', async () => {
      const auth = await signedIn();
      fetchImpl.mockRejectedValue(new Error('offline'));

      await auth.signOut();

      expect(sessionStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBeNull();
      expect(redirect).toHaveBeenCalledTimes(1);
    });
  });
});
