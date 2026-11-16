/**
 * The deploy-time context values `buildMaxHeightApp` requires.
 *
 * They are not committed as constants, because the real prefix and client ID
 * are the builder's to choose and register (quickstart Prerequisites rows 8
 * and 9, deviation C33). Any test that builds the whole app supplies these.
 *
 * `siteContentPath` keeps the infra suite independent of the frontend build:
 * `BucketDeployment` needs a directory that exists at synth time, and a real
 * deploy points it at `packages/frontend/dist`.
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const DEPLOY_CONTEXT = {
  budgetAlertEmail: 'owner@example.com',
  cognitoDomainPrefix: 'max-height-signin',
  googleClientId: '1234567890-abcdef.apps.googleusercontent.com',
  siteContentPath: path.join(here, 'fixtures', 'site'),
};
