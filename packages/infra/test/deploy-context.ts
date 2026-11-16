/**
 * The deploy-time context values `buildMaxHeightApp` requires.
 *
 * They are not committed as constants, because the real prefix and client ID
 * are the builder's to choose and register (quickstart Prerequisites rows 8
 * and 9, deviation C33). Any test that builds the whole app supplies these.
 */
export const DEPLOY_CONTEXT = {
  budgetAlertEmail: 'owner@example.com',
  cognitoDomainPrefix: 'max-height-signin',
  googleClientId: '1234567890-abcdef.apps.googleusercontent.com',
};
