/**
 * The single auth service and runtime ARN the app uses, built from the
 * deploy-time configuration (contracts/runtime-config.md § Frontend build).
 *
 * It lives in its own module so the browser flow in `auth.ts` stays a pure
 * factory that tests can drive with their own config.
 */

import { readBuildConfig } from '../config/buildConfig';
import { createAuthService } from './auth';

const build = readBuildConfig(import.meta.env as unknown as Record<string, string | undefined>);

export const RUNTIME_ARN = build.runtimeArn;

export const authService = createAuthService({
  config: {
    cognitoDomain: build.cognitoDomain,
    clientId: build.cognitoClientId,
    redirectUri: build.redirectUri,
    signOutUri: build.signOutUri,
  },
});
