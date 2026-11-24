/**
 * In-character copy that more than one component needs.
 *
 * It lives apart from `constants.ts` because this is the wording a friend
 * reads, not a tuning value — and because the denial line must be identical
 * everywhere it appears (FR-043).
 */

/** One constant line for every denial, so it never reveals who is invited. */
export const DENIED_MESSAGE =
  "This channel's invite-only, friend. If you think you should be on the list, ask the person who sent you the link.";

export const SIGNED_OUT_MESSAGE = "You're off the air, friend. Sign in and I'll start the show.";

export const SIGN_IN_ERROR_MESSAGE =
  "Something scrambled the signal on the way in. Give it another shot and I'll be right here.";

export const PLATFORM_BUSY_MESSAGE =
  "One c-conversation at a time, friend — I'm still on the last one. Try again in a moment.";
