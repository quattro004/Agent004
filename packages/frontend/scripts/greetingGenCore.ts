import { wrapInSsml } from '../src/services/pollyTts';

export interface GreetingManifestEntry {
  id: string;
  audioDurationMs: number;
  [key: string]: unknown;
}

export interface GreetingManifest {
  greetings: GreetingManifestEntry[];
  [key: string]: unknown;
}

export const MIN_DURATION_MS = 1000;
export const MAX_DURATION_MS = 15000;

/**
 * Return the hand-tuned SSML when supplied, otherwise fall back to the shared
 * `wrapInSsml` wrapper used by the conversation TTS path.
 */
export function buildGreetingSsml(text: string, customSsml?: string): string {
  if (customSsml !== undefined && customSsml.trim().length > 0) {
    return customSsml;
  }
  return wrapInSsml(text);
}

/**
 * Return a new manifest with each greeting's `audioDurationMs` set to its
 * measured value, rounded and clamped to [MIN_DURATION_MS, MAX_DURATION_MS].
 * Greetings absent from `measuredMsById` are left untouched.
 */
export function calibrateDurations(
  manifest: GreetingManifest,
  measuredMsById: Record<string, number>,
): GreetingManifest {
  return {
    ...manifest,
    greetings: manifest.greetings.map((greeting) => {
      const measured = measuredMsById[greeting.id];
      if (measured === undefined) {
        return greeting;
      }
      const clamped = Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, Math.round(measured)));
      return { ...greeting, audioDurationMs: clamped };
    }),
  };
}
