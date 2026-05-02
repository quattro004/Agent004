import type { Greeting } from '../types/domain';

// --- Types ---

export interface GreetingManifest {
  version: string;
  voiceConfig: {
    voiceId: string;
    engine: string;
    ssmlPitch: string;
    ssmlRate: string;
  };
  greetings: Greeting[];
}

// --- Constants ---

/** Number of recent sessions to exclude greetings from */
const NO_REPEAT_SESSIONS = 3;

/** Maximum greeting history entries to track */
const _MAX_HISTORY_LENGTH = 20;

/** Fallback no-repeat window when pool is exhausted */
const EXHAUSTION_FALLBACK_SESSIONS = 1;

// --- Time of Day ---

type TimeOfDay = 'morning' | 'afternoon' | 'evening';

function getCurrentTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

// --- Weighted Random Selection ---

function weightedRandomSelect(greetings: Greeting[]): Greeting {
  const totalWeight = greetings.reduce((sum, g) => sum + g.weight, 0);

  if (totalWeight === 0) {
    // Fallback to uniform random if all weights are 0
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  let random = Math.random() * totalWeight;

  for (const greeting of greetings) {
    random -= greeting.weight;
    if (random <= 0) {
      return greeting;
    }
  }

  // Fallback (shouldn't reach here due to floating point)
  return greetings[greetings.length - 1];
}

// --- Manifest Loading ---

/**
 * Parse and validate a greeting manifest from raw JSON string.
 * Throws if the manifest is malformed or missing required fields.
 */
export function loadManifest(raw: string): GreetingManifest {
  const parsed = JSON.parse(raw);

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid manifest: not an object');
  }

  if (!parsed.version || typeof parsed.version !== 'string') {
    throw new Error('Invalid manifest: missing or invalid version');
  }

  if (!Array.isArray(parsed.greetings)) {
    throw new Error('Invalid manifest: missing greetings array');
  }

  return parsed as GreetingManifest;
}

// --- Selection ---

/**
 * Select a greeting from the manifest pool using weighted random selection,
 * filtering out recently used greetings and preferring time-of-day tags.
 *
 * @param manifest - The loaded greeting manifest
 * @param greetingHistory - Array of recently used greeting IDs (last 20, most recent last)
 * @returns The selected greeting
 */
export function selectGreeting(
  manifest: GreetingManifest,
  greetingHistory: string[],
): Greeting {
  const { greetings } = manifest;
  const timeOfDay = getCurrentTimeOfDay();

  // Filter out greetings used in last 3 sessions
  let recentIds = new Set(greetingHistory.slice(-NO_REPEAT_SESSIONS));
  let available = greetings.filter((g) => !recentIds.has(g.id));

  // Pool exhaustion fallback: reduce to 1-session window
  if (available.length === 0) {
    recentIds = new Set(greetingHistory.slice(-EXHAUSTION_FALLBACK_SESSIONS));
    available = greetings.filter((g) => !recentIds.has(g.id));

    // If still exhausted, allow any greeting
    if (available.length === 0) {
      available = [...greetings];
    }
  }

  // Prefer time-of-day matching tags
  const timeMatched = available.filter((g) => g.tags.includes(timeOfDay));

  // If there are time-matched greetings, prefer them (80% of the time)
  if (timeMatched.length > 0 && Math.random() < 0.8) {
    return weightedRandomSelect(timeMatched);
  }

  return weightedRandomSelect(available);
}
