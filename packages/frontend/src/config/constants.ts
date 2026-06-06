/** Duration (ms) to display greeting text before transitioning to normal state. */
export const GREETING_DISPLAY_MS = 15_000;

/** Min/max interval (ms) for randomized frame swaps in timed talking animation during greeting. */
const TALK_FRAME_INTERVAL_MIN_MS = 200;
const TALK_FRAME_INTERVAL_MAX_MS = 300;

/** Returns a random interval between TALK_FRAME_INTERVAL_MIN_MS and TALK_FRAME_INTERVAL_MAX_MS (inclusive). */
export function getRandomTalkFrameIntervalMs(): number {
  return (
    Math.floor(Math.random() * (TALK_FRAME_INTERVAL_MAX_MS - TALK_FRAME_INTERVAL_MIN_MS + 1)) +
    TALK_FRAME_INTERVAL_MIN_MS
  );
}

/** Returns a random talking frame index: 0 -> talk-1, 1 -> talk-2. */
export function getRandomTalkFrameIndex(): 0 | 1 {
  return Math.random() < 0.5 ? 0 : 1;
}

export const AVATAR_THEMES = ['retro', 'pop-art', 'cartoon'] as const;

export type AvatarTheme = (typeof AVATAR_THEMES)[number];

export function nextTheme(theme: AvatarTheme): AvatarTheme {
  const currentIndex = AVATAR_THEMES.indexOf(theme);
  const nextIndex = (currentIndex + 1) % AVATAR_THEMES.length;
  return AVATAR_THEMES[nextIndex];
}

/** Default avatar theme applied when no explicit theme prop is passed. */
export const DEFAULT_AVATAR_THEME = AVATAR_THEMES[0];

/** Background cycler configuration. */
export const BACKGROUND_CYCLE_MS = 5_000;
export const BACKGROUND_FRAME_COUNT = 8;
export const BACKGROUND_ASSET_BASE = '/background/max-grid';

/**
 * Power-on tune-in sequence durations.
 * - TUNING: full-screen static + audible white noise.
 * - SETTLING: brief avatar glitch flashes while Max's "signal" locks in.
 */
export const TUNING_MIN_MS = 3000;
export const TUNING_MAX_MS = 8000;
export const SETTLING_DURATION_MS = 900;

/**
 * Tune-in glitch flash sequence during settling. Each entry is a duration (ms)
 * the avatar holds the corresponding frame for. The pattern alternates:
 *   glitch → idle → glitch → idle → glitch → idle
 * so the user sees Max's signal locking in over ~900ms.
 */
export const TUNE_IN_GLITCH_PATTERN: ReadonlyArray<{
  frame: 'glitch' | 'idle';
  durationMs: number;
}> = [
  { frame: 'glitch', durationMs: 180 },
  { frame: 'idle', durationMs: 90 },
  { frame: 'glitch', durationMs: 180 },
  { frame: 'idle', durationMs: 90 },
  { frame: 'glitch', durationMs: 220 },
  { frame: 'idle', durationMs: 140 },
];
