import type { StutterMarker } from '../types/index.js';

export interface StutterOptions {
  minStutters: number;
  maxStutters: number;
}

export interface StutterResult {
  text: string;
  stutterCount: number;
  markers: StutterMarker[];
}

// Patterns that indicate an existing stutter in text
const STUTTER_PATTERNS = [
  // Name/leading stutter: M-m-m-Max, W-w-well, I-i-it
  /\b([A-Za-z])-\1-(?:\1-)?[A-Za-z]+/gi,
  // Syllable glitch: fan-fan-fantastic, tele-tele-television
  /\b([a-z]{2,})-\1-[a-z]+/gi,
  // Word loop: television-television-television
  /\b([a-z]+)-\1(?:-\1)+/gi,
  // Echo tail: television-vision-vision
  /\b[a-z]+-([a-z]{3,})-\1/gi,
];

// Words/patterns that should never be stuttered
const NO_STUTTER_PATTERNS = [
  /https?:\/\/\S+/g, // URLs
  /\b\d[\d,.]*\b/g, // Numbers
  /\b[A-Z]{2,}\b/g, // Acronyms (but not single caps like emphasis)
];

// Words suitable for stuttering, prioritized
const STUTTER_TARGETS = [
  { word: /\bMax\b/, stuttered: 'M-m-m-Max', priority: 10 },
  { word: /\bWell\b/, stuttered: 'W-w-well', priority: 8 },
  { word: /\bWelcome\b/, stuttered: 'W-w-welcome', priority: 8 },
  { word: /\bHello\b/, stuttered: 'H-h-hello', priority: 7 },
  { word: /\bFriends?\b/, stuttered: 'F-f-friend', priority: 6 },
  { word: /\bFolks\b/, stuttered: 'F-f-folks', priority: 6 },
  { word: /\bThe\b/, stuttered: 'Th-th-the', priority: 3 },
  { word: /\bThat\b/, stuttered: 'Th-th-that', priority: 3 },
  { word: /\bThis\b/, stuttered: 'Th-th-this', priority: 3 },
  { word: /\bYou\b/, stuttered: 'Y-y-you', priority: 4 },
  { word: /\bI\b(?!')/, stuttered: 'I-i-I', priority: 4 },
  { word: /\bFantastic\b/i, stuttered: 'fan-fan-fantastic', priority: 5 },
  { word: /\bTelevision\b/i, stuttered: 'tele-tele-television', priority: 5 },
  { word: /\bMarvelous\b/i, stuttered: 'mar-mar-marvelous', priority: 5 },
  { word: /\bBrilliant\b/i, stuttered: 'b-b-brilliant', priority: 5 },
];

/**
 * Check if a word/phrase is a stutter pattern.
 */
export function isStutter(text: string): boolean {
  // Check if it matches any stutter pattern
  for (const pattern of STUTTER_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) return true;
  }
  return false;
}

/**
 * Count stutters present in a text string.
 */
export function countStutters(text: string): number {
  let count = 0;
  const seen = new Set<number>();

  for (const pattern of STUTTER_PATTERNS) {
    const regex = new RegExp(pattern.source, 'gi');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      // Avoid double-counting overlapping matches
      if (!seen.has(match.index)) {
        seen.add(match.index);
        count++;
      }
    }
  }

  return count;
}

/**
 * Check if a position in the text is inside a no-stutter zone (URLs, numbers).
 */
function isInNoStutterZone(text: string, position: number): boolean {
  for (const pattern of NO_STUTTER_PATTERNS) {
    const regex = new RegExp(pattern.source, 'g');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      if (position >= match.index && position < match.index + match[0].length) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Inject stutters into text if below minimum threshold.
 * Returns the modified text with stutter markers.
 */
export function injectStutters(
  text: string,
  options: StutterOptions,
): StutterResult {
  const existingCount = countStutters(text);

  // Already at or above minimum — don't modify
  if (existingCount >= options.minStutters) {
    return { text, stutterCount: existingCount, markers: [] };
  }

  const needed = Math.min(
    options.maxStutters - existingCount,
    options.maxStutters,
  );
  let result = text;
  const markers: StutterMarker[] = [];
  let injected = 0;

  // Sort targets by priority (highest first)
  const sortedTargets = [...STUTTER_TARGETS].sort(
    (a, b) => b.priority - a.priority,
  );

  for (const target of sortedTargets) {
    if (injected >= needed) break;

    const regex = new RegExp(target.word.source, '');
    const match = regex.exec(result);

    if (match && !isInNoStutterZone(text, match.index)) {
      // Preserve original case for the stuttered replacement
      const original = match[0];
      let stuttered = target.stuttered;

      // Match case of original word
      if (original[0] === original[0].toUpperCase()) {
        stuttered =
          stuttered.charAt(0).toUpperCase() + stuttered.slice(1);
      }

      // Replace first occurrence only
      result = result.replace(match[0], stuttered);

      markers.push({
        position: match.index,
        original,
        stuttered,
      });

      injected++;
    }
  }

  return {
    text: result,
    stutterCount: existingCount + injected,
    markers,
  };
}
