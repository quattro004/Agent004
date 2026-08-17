/**
 * Resolves the WebSocket URL for the agent and decides whether the app
 * should attempt to connect.
 *
 * Constitution P8 ("Failure modes") requires a friendly, in-character error
 * instead of an infinite reconnect loop. In production builds, falling back
 * to `ws://localhost:8080` (the dev default) would do exactly that, so we
 * refuse to connect and signal a lost-signal state to the UI.
 */
export interface WsUrlResolution {
  /** The URL to use if connect is true; otherwise empty string. */
  url: string;
  /** Whether the app should attempt to open a WebSocket. */
  connect: boolean;
  /** When connect=false, the reason — used to drive the UI overlay. */
  reason: 'ok' | 'missing-prod-url' | 'localhost-in-prod';
}

const LOCALHOST_PATTERNS = [/^wss?:\/\/localhost\b/i, /^wss?:\/\/127\.0\.0\.1\b/];

/**
 * @param rawUrl   The URL from `import.meta.env.VITE_WS_URL` (may be undefined).
 * @param isProd   `import.meta.env.PROD` — true for production builds.
 */
export function resolveWsUrl(rawUrl: string | undefined, isProd: boolean): WsUrlResolution {
  if (isProd) {
    if (!rawUrl) {
      return { url: '', connect: false, reason: 'missing-prod-url' };
    }
    if (LOCALHOST_PATTERNS.some((re) => re.test(rawUrl))) {
      return { url: '', connect: false, reason: 'localhost-in-prod' };
    }
    return { url: rawUrl, connect: true, reason: 'ok' };
  }
  return { url: rawUrl ?? 'ws://localhost:8080', connect: true, reason: 'ok' };
}
