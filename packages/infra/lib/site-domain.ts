/**
 * The one site domain (contracts/csp-and-hosting.md § One site domain).
 *
 * It lives in its own module because both the app and the stacks that build
 * URLs from it need it, and a stack importing the app would be a cycle.
 */
export const SITE_DOMAIN = 'max.recipieces.com';
