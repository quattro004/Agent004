/** Duration (ms) to display greeting text before transitioning to normal state. */
export const GREETING_DISPLAY_MS = 15_000;

/**
 * Power-on tune-in sequence durations.
 * - TUNING: full-screen static + audible white noise.
 * - SETTLING: brief avatar glitch flashes while Max's "signal" locks in.
 */
export const TUNING_DURATION_MS = 3000;
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
