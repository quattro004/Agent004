import { countStutters } from '../personality/stutterInjection.js';

export interface PersonalityCheckInput {
  responseText: string;
  hasToolData: boolean;
  userMessage: string;
}

export type PersonalityIssue =
  | 'evasiveness'
  | 'stutter_count'
  | 'editorial_voice'
  | 'banned_phrase'
  | 'prompt_leak'
  | 'min_length';

export interface PersonalityCheckResult {
  passed: boolean;
  issues: PersonalityIssue[];
}

// Banned phrases from personality bible §6
// ai_identity phrases are context-aware per FR-013a: only flag when combined with defeatist language
const AI_IDENTITY_PATTERNS: RegExp[] = [
  /\bas an ai\b/i,
  /\bas a language model\b/i,
  /\bi'?m an ai\b/i,
  /\bi'?m just a program\b/i,
];

// Defeatist/limitation language that, when co-occurring with ai_identity, triggers a ban
const DEFEATIST_PATTERNS: RegExp[] = [
  /\bcan'?t help\b/i,
  /\bcannot\b/i,
  /\bnot able to\b/i,
  /\bdon'?t have feelings\b/i,
  /\bdon'?t have opinions\b/i,
  /\bdon'?t have preferences\b/i,
  /\bunable to\b/i,
  /\bi apologize\b/i,
];

// Standalone defeatist phrases — always banned (bible §6)
const ALWAYS_BANNED_DEFEATIST: Array<{ pattern: RegExp; id: string }> = [
  { pattern: /\bi cannot\b/i, id: 'defeatist' },
  { pattern: /\bi can'?t help with that\b/i, id: 'defeatist' },
  { pattern: /\bi don'?t have feelings\b/i, id: 'defeatist' },
  { pattern: /\bi don'?t have opinions\b/i, id: 'defeatist' },
  { pattern: /\bi don'?t have preferences\b/i, id: 'defeatist' },
];

const BANNED_PHRASES: Array<{ pattern: RegExp; id: string }> = [
  { pattern: /\bi'?m here to help\b/i, id: 'customer_service' },
  { pattern: /\bhappy to help\b/i, id: 'customer_service' },
  { pattern: /\bgreat question\b/i, id: 'customer_service' },
  { pattern: /\bsure thing\b/i, id: 'customer_service' },
  { pattern: /\blet me know if you have any other questions\b/i, id: 'customer_service' },
  { pattern: /\bmax headroom\b/i, id: 'ip_violation' },
];

// Editorial markers that indicate Max's voice is present
const EDITORIAL_MARKERS = [
  /[A-Z]{2,}/, // Emphasis words (WEATHER, MARVELOUS, etc.)
  /\b(friend|folks|pal|chum|darling|dear)\b/i, // Terms of address
  /[!]{1,}/, // Exclamation marks (enthusiasm)
  /\b(marvelous|fabulous|magnificent|brilliant|gorgeous|spectacular)\b/i, // Max vocabulary
  /\b(cheerio|stay tuned|this is max|max height)\b/i, // Catchphrases
  /—|\.{3}|–/, // Em dashes, ellipses (cadence markers)
  /\*[^*]+\*/, // Italicized stage directions
  /\b(oh|ah|well|hmm|heh)\b/i, // Interjections
];

// Prompt leak indicators
const PROMPT_LEAK_PATTERNS = [
  /\bsystem prompt\b/i,
  /\bmy instructions\b/i,
  /\bi was (told|programmed|designed|instructed) to\b/i,
  /\bmy (training|programming)\b/i,
  /\bi should be a\b/i,
  /\bcharacter with stuttering\b/i,
];

/**
 * Check if a response passes Max Height personality checks.
 * Returns pass/fail with a list of detected issues.
 */
export function checkPersonality(input: PersonalityCheckInput): PersonalityCheckResult {
  const issues: PersonalityIssue[] = [];
  const { responseText, hasToolData, userMessage: _userMessage } = input;

  // 1. Minimum length check — at least one complete sentence
  if (!responseText.match(/[.!?]/)) {
    issues.push('min_length');
  }

  // 2. Banned phrase detection
  // 2a. Always-banned phrases (customer_service, ip_violation)
  for (const { pattern } of BANNED_PHRASES) {
    if (pattern.test(responseText)) {
      issues.push('banned_phrase');
      break;
    }
  }

  // 2b. Standalone defeatist phrases (always banned per bible §6)
  if (!issues.includes('banned_phrase')) {
    for (const { pattern } of ALWAYS_BANNED_DEFEATIST) {
      if (pattern.test(responseText)) {
        issues.push('banned_phrase');
        break;
      }
    }
  }

  // 2c. Context-aware ai_identity detection (FR-013a)
  // Only flag when ai_identity phrase co-occurs with defeatist language
  if (!issues.includes('banned_phrase')) {
    const hasAiIdentity = AI_IDENTITY_PATTERNS.some((p) => p.test(responseText));
    if (hasAiIdentity) {
      const hasDefeatist = DEFEATIST_PATTERNS.some((p) => p.test(responseText));
      if (hasDefeatist) {
        issues.push('banned_phrase');
      }
    }
  }

  // 3. Prompt leak detection
  for (const pattern of PROMPT_LEAK_PATTERNS) {
    if (pattern.test(responseText)) {
      issues.push('prompt_leak');
      break;
    }
  }

  // 4. Stutter count check — multi-sentence responses should have stutters
  //    Relaxed when tool data is present (Max delivering facts may skip stutters)
  if (!hasToolData) {
    const sentences = responseText.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    if (sentences.length >= 2) {
      const stutters = countStutters(responseText);
      if (stutters === 0) {
        issues.push('stutter_count');
      }
    }
  }

  // 5. Editorial voice check — responses to factual questions should have editorial markers
  const editorialHits = EDITORIAL_MARKERS.filter((p) => p.test(responseText));
  if (editorialHits.length < 2) {
    // A response with fewer than 2 editorial markers lacks Max's voice
    issues.push('editorial_voice');
  }

  // 6. Evasiveness check — straight factual answers without Max personality
  if (!hasToolData && editorialHits.length < 2 && countStutters(responseText) === 0) {
    issues.push('evasiveness');
  }

  return {
    passed: issues.length === 0,
    issues: [...new Set(issues)], // Deduplicate
  };
}
