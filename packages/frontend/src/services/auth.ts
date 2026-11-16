/**
 * auth.ts — Cognito hosted sign-in with Google, authorization code + PKCE.
 *
 * Implements contracts/auth-and-allowlist.md § Browser flow with no
 * third-party auth library. The access and ID tokens are held in memory, the
 * refresh token lives in `sessionStorage` so it survives a reload and dies
 * with the tab, and nothing is written to `localStorage` or a cookie.
 */

export const REFRESH_TOKEN_STORAGE_KEY = 'maxHeight.refreshToken';
export const PKCE_STORAGE_KEY = 'maxHeight.pkce';

/**
 * Refresh this far ahead of expiry so a turn never starts on a dying token:
 * a reply can take tens of seconds, and a mid-turn expiry would surface as a
 * 401 the friend never asked for (FR-047).
 */
const REFRESH_SKEW_MS = 300_000;

export interface AuthConfig {
  cognitoDomain: string;
  clientId: string;
  redirectUri: string;
  signOutUri: string;
}

export interface AuthDeps {
  config: AuthConfig;
  fetchImpl?: typeof fetch;
  /** Replaced in tests; the browser navigates. */
  redirect?: (url: string) => void;
}

export type CallbackResult =
  { status: 'signed-in' } | { status: 'denied' } | { status: 'error'; reason: string };

export interface AuthService {
  signIn: () => Promise<void>;
  handleCallback: (params: URLSearchParams) => Promise<CallbackResult>;
  getAccessToken: () => Promise<string | null>;
  refreshAccessToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
  isSignedIn: () => boolean;
}

interface PkceRecord {
  verifier: string;
  state: string;
}

interface TokenResponse {
  access_token?: string;
  id_token?: string;
  refresh_token?: string | null;
  expires_in?: number;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export function createAuthService(deps: AuthDeps): AuthService {
  const { config } = deps;
  const doFetch = deps.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const go = deps.redirect ?? ((url: string) => window.location.assign(url));

  let accessToken: string | null = null;
  let expiresAtMs = 0;
  let inFlightRefresh: Promise<string | null> | null = null;

  function storedRefreshToken(): string | null {
    return sessionStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  }

  function clearTokens(): void {
    accessToken = null;
    expiresAtMs = 0;
    sessionStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  }

  function acceptTokens(tokens: TokenResponse): string | null {
    if (!tokens.access_token) return null;
    accessToken = tokens.access_token;
    expiresAtMs = Date.now() + (tokens.expires_in ?? 0) * 1000;
    if (tokens.refresh_token) {
      sessionStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, tokens.refresh_token);
    }
    return accessToken;
  }

  async function postForm(path: string, body: URLSearchParams): Promise<TokenResponse | null> {
    let response: Response;
    try {
      response = await doFetch(`${config.cognitoDomain}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
    } catch {
      return null;
    }
    if (!response.ok) return null;
    try {
      return (await response.json()) as TokenResponse;
    } catch {
      return null;
    }
  }

  async function signIn(): Promise<void> {
    const verifier = randomBase64Url(64);
    const state = randomBase64Url(16);
    const challenge = await challengeFor(verifier);

    sessionStorage.setItem(PKCE_STORAGE_KEY, JSON.stringify({ verifier, state } as PkceRecord));

    const url = new URL(`${config.cognitoDomain}/oauth2/authorize`);
    url.searchParams.set('identity_provider', 'Google');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', config.redirectUri);
    url.searchParams.set('scope', 'openid email');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('code_challenge', challenge);

    go(url.toString());
  }

  function takePkce(): PkceRecord | null {
    const raw = sessionStorage.getItem(PKCE_STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as PkceRecord;
      return parsed.verifier && parsed.state ? parsed : null;
    } catch {
      return null;
    }
  }

  async function handleCallback(params: URLSearchParams): Promise<CallbackResult> {
    const pkce = takePkce();
    // A callback with no started sign-in, or a state that does not match, is
    // not ours: the code is discarded unspent.
    if (!pkce || params.get('state') !== pkce.state) {
      return { status: 'error', reason: 'state_mismatch' };
    }
    sessionStorage.removeItem(PKCE_STORAGE_KEY);

    // Every denial carries the same message by design, so the cause is not
    // read here (auth-and-allowlist.md § Denial copy).
    if (params.get('error')) return { status: 'denied' };

    const code = params.get('code');
    if (!code) return { status: 'error', reason: 'no_code' };

    const tokens = await postForm(
      '/oauth2/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        code,
        code_verifier: pkce.verifier,
        redirect_uri: config.redirectUri,
      }),
    );

    if (!tokens || !acceptTokens(tokens)) return { status: 'error', reason: 'exchange_failed' };
    return { status: 'signed-in' };
  }

  async function refreshNow(): Promise<string | null> {
    const refreshToken = storedRefreshToken();
    if (!refreshToken) return null;

    const tokens = await postForm(
      '/oauth2/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: config.clientId,
        refresh_token: refreshToken,
      }),
    );

    if (!tokens || !acceptTokens(tokens)) {
      // A refused refresh is a dead session, not a transient failure: the
      // friend sees the in-character signed-out state.
      clearTokens();
      return null;
    }
    return accessToken;
  }

  function refreshAccessToken(): Promise<string | null> {
    if (inFlightRefresh) return inFlightRefresh;
    const attempt = refreshNow().finally(() => {
      inFlightRefresh = null;
    });
    inFlightRefresh = attempt;
    return attempt;
  }

  async function getAccessToken(): Promise<string | null> {
    if (accessToken && Date.now() < expiresAtMs - REFRESH_SKEW_MS) return accessToken;
    if (!storedRefreshToken()) return null;
    return refreshAccessToken();
  }

  async function signOut(): Promise<void> {
    const refreshToken = storedRefreshToken();
    if (refreshToken) {
      await postForm(
        '/oauth2/revoke',
        new URLSearchParams({ token: refreshToken, client_id: config.clientId }),
      );
    }
    clearTokens();
    sessionStorage.removeItem(PKCE_STORAGE_KEY);

    const url = new URL(`${config.cognitoDomain}/logout`);
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('logout_uri', config.signOutUri);
    go(url.toString());
  }

  return {
    signIn,
    handleCallback,
    getAccessToken,
    refreshAccessToken,
    signOut,
    isSignedIn: () => accessToken !== null || storedRefreshToken() !== null,
  };
}
