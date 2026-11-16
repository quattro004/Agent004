/**
 * Build-time configuration (contracts/runtime-config.md § Frontend build).
 *
 * The deploy step writes these from stack outputs. A production build with
 * any of them missing fails rather than shipping a client that cannot reach
 * the runtime or the sign-in domain — the fail-closed precedent the deleted
 * `config/wsUrl.ts` set for the WebSocket URL.
 */

export const REQUIRED_VITE_VARS = [
  'VITE_RUNTIME_ARN',
  'VITE_COGNITO_DOMAIN',
  'VITE_COGNITO_CLIENT_ID',
  'VITE_REDIRECT_URI',
  'VITE_SIGN_OUT_URI',
] as const;

export type RequiredViteVar = (typeof REQUIRED_VITE_VARS)[number];

export interface BuildConfig {
  runtimeArn: string;
  cognitoDomain: string;
  cognitoClientId: string;
  redirectUri: string;
  signOutUri: string;
}

type EnvLike = Record<string, string | undefined>;

export function missingViteVars(env: EnvLike): RequiredViteVar[] {
  return REQUIRED_VITE_VARS.filter((name) => (env[name] ?? '').trim() === '');
}

/**
 * Whether this build is one that has to be deployable.
 *
 * CI builds the client with no configuration at all as a compile check, and
 * failing that would say nothing about a deployment. A build is a deploy
 * build when the deploy step says so, or when it carries some of the
 * configuration but not all of it — a half-written `.env` is always a
 * mistake.
 */
export function isDeployBuild(env: EnvLike, mode: string): boolean {
  if (mode !== 'production') return false;
  if (env.MAX_HEIGHT_DEPLOY === '1') return true;
  return REQUIRED_VITE_VARS.some((name) => (env[name] ?? '').trim() !== '');
}

/** Written into `dist` by every build, so the infra publisher can tell the kinds apart. */
export const BUILD_MARKER_FILE = 'max-height-build.json';

export interface BuildMarker {
  deploy: boolean;
}

/**
 * Whether the finished build may be published. `pnpm run validate` leaves a
 * compile-check `dist` behind with no runtime or sign-in configuration, and
 * uploading that would ship a client that cannot reach anything. Only a
 * production deploy build that passed `assertBuildConfig` says `deploy: true`.
 */
export function buildMarker(env: EnvLike, mode: string): BuildMarker {
  return { deploy: isDeployBuild(env, mode) };
}
export function assertBuildConfig(env: EnvLike, isProd: boolean): void {
  if (!isProd) return;
  const missing = missingViteVars(env);
  if (missing.length === 0) return;

  throw new Error(
    `Refusing to build Max Height for production: ${missing.join(', ')} ` +
      `${missing.length === 1 ? 'is' : 'are'} missing. The deploy step writes these ` +
      `from stack outputs (contracts/runtime-config.md § Frontend build).`,
  );
}

export function readBuildConfig(env: EnvLike): BuildConfig {
  return {
    runtimeArn: env.VITE_RUNTIME_ARN ?? '',
    cognitoDomain: env.VITE_COGNITO_DOMAIN ?? '',
    cognitoClientId: env.VITE_COGNITO_CLIENT_ID ?? '',
    redirectUri: env.VITE_REDIRECT_URI ?? '',
    signOutUri: env.VITE_SIGN_OUT_URI ?? '',
  };
}
