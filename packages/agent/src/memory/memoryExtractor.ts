/**
 * Memory extraction pipeline for Max Height.
 * Extracts facts, preferences, topics, summaries, and displayAlias
 * from conversation turns using pattern matching.
 */

const MAX_CONTENT_LENGTH = 500;
const MIN_TURNS_FOR_SUMMARY = 5;

export interface TurnContent {
  role: 'user' | 'assistant';
  text: string;
}

export interface ExtractedMemory {
  content: string;
  type: 'FACT' | 'PREFERENCE' | 'SUMMARY' | 'TOPIC';
  sourceSessionId: string;
}

export interface ExtractionResult {
  memories: ExtractedMemory[];
  displayAlias: string | null;
}

// Patterns that indicate the assistant just asked for the user's name
const NAME_QUESTION_PATTERNS = [
  /what(?:'s| is) your name/i,
  /what (?:do|should|shall) (?:they|i|we) call you/i,
  /who am i (?:speaking|talking) (?:to|with)/i,
  /and you are\??/i,
  /your name,?\s*friend/i,
  /what shall i call/i,
];

// Patterns to extract a name from the user's response
const NAME_RESPONSE_PATTERNS = [
  /(?:my name is|i'm|i am|they call me|it's)\s+([A-Z][a-z]+)/i,
  /(?:just )?call me\s+([A-Z][a-z]+)/i,
];

// Patterns for preferences (likes, dislikes)
const PREFERENCE_PATTERNS = [
  /i (?:really )?(?:love|like|enjoy|adore|prefer|am (?:a )?fan of|am into)\s+(.+)/i,
  /i (?:can't stand|hate|dislike|don't like|am not (?:a )?fan of|detest)\s+(.+)/i,
  /my (?:favorite|favourite) (?:\w+ )?(?:is|are)\s+(.+)/i,
];

// Patterns for factual statements about the user
const FACT_PATTERNS = [
  /i (?:work|am working) (?:as|at|in|for)\s+(.+)/i,
  /i live (?:in|at|near)\s+(.+)/i,
  /i (?:have|'ve got)\s+(.+)/i,
  /i(?:'m| am) (?:a |an )?(?!not\b)([a-z]+ ?(?:engineer|teacher|doctor|designer|developer|artist|writer|musician|chef|nurse|student|manager|scientist|lawyer|programmer|journalist|professor|pilot|photographer|accountant|architect|therapist|consultant))/i,
  /i(?:'m| am) from\s+(.+)/i,
  /i(?:'m| am) (\d+)(?: years old)?/i,
];

// Topic keywords that indicate sustained discussion
const TOPIC_KEYWORDS = [
  'artificial intelligence',
  'ai',
  'technology',
  'music',
  'movies',
  'film',
  'television',
  'tv',
  'politics',
  'science',
  'space',
  'gaming',
  'video games',
  'sports',
  'cooking',
  'travel',
  'history',
  'philosophy',
  'art',
  'programming',
  'coding',
  'climate',
  'environment',
  'books',
  'literature',
  'fashion',
  'health',
  'fitness',
  'cryptocurrency',
  'blockchain',
];

function truncate(text: string): string {
  return text.length > MAX_CONTENT_LENGTH
    ? text.substring(0, MAX_CONTENT_LENGTH - 3) + '...'
    : text;
}

function extractDisplayAlias(turns: TurnContent[]): string | null {
  for (let i = 0; i < turns.length - 1; i++) {
    const current = turns[i];
    const next = turns[i + 1];

    if (current.role !== 'assistant' || next.role !== 'user') continue;

    // Check if assistant just asked for the name
    const askedForName = NAME_QUESTION_PATTERNS.some((p) => p.test(current.text));
    if (!askedForName) continue;

    const userResponse = next.text.trim();

    // Check for refusal
    if (/rather not|don't want to|prefer not|no thanks|nah/i.test(userResponse)) {
      return null;
    }

    // Try structured name patterns first
    for (const pattern of NAME_RESPONSE_PATTERNS) {
      const match = userResponse.match(pattern);
      if (match?.[1]) {
        return match[1].trim();
      }
    }

    // Bare name response (single capitalized word, 2-20 chars)
    if (/^[A-Z][a-z]{1,19}$/.test(userResponse)) {
      return userResponse;
    }
  }

  return null;
}

function extractFacts(turns: TurnContent[], sessionId: string): ExtractedMemory[] {
  const facts: ExtractedMemory[] = [];

  for (const turn of turns) {
    if (turn.role !== 'user') continue;

    // Split compound sentences on " and " to catch multiple facts
    const clauses = turn.text.split(/\s+and\s+/i);

    for (const clause of clauses) {
      for (const pattern of FACT_PATTERNS) {
        const match = clause.match(pattern);
        if (match) {
          const content = truncate(clause.trim());
          facts.push({ content, type: 'FACT', sourceSessionId: sessionId });
          break;
        }
      }
    }
  }

  return facts;
}

function extractPreferences(turns: TurnContent[], sessionId: string): ExtractedMemory[] {
  const prefs: ExtractedMemory[] = [];

  for (const turn of turns) {
    if (turn.role !== 'user') continue;

    for (const pattern of PREFERENCE_PATTERNS) {
      const match = turn.text.match(pattern);
      if (match) {
        const content = truncate(turn.text);
        prefs.push({ content, type: 'PREFERENCE', sourceSessionId: sessionId });
        break;
      }
    }
  }

  return prefs;
}

function extractTopics(turns: TurnContent[], sessionId: string): ExtractedMemory[] {
  const topicCounts = new Map<string, number>();

  for (const turn of turns) {
    if (turn.role !== 'user') continue;

    const lowerText = turn.text.toLowerCase();
    for (const keyword of TOPIC_KEYWORDS) {
      if (lowerText.includes(keyword)) {
        topicCounts.set(keyword, (topicCounts.get(keyword) ?? 0) + 1);
      }
    }
  }

  // Only return topics mentioned 2+ times (sustained discussion)
  const topics: ExtractedMemory[] = [];
  for (const [keyword, count] of topicCounts) {
    if (count >= 2) {
      topics.push({
        content: truncate(`Discussed ${keyword} at length`),
        type: 'TOPIC',
        sourceSessionId: sessionId,
      });
    }
  }

  // Also detect topics from single mentions in multi-turn context
  if (topics.length === 0 && turns.filter((t) => t.role === 'user').length >= 3) {
    for (const [keyword] of topicCounts) {
      topics.push({
        content: truncate(`Touched on ${keyword}`),
        type: 'TOPIC',
        sourceSessionId: sessionId,
      });
    }
  }

  return topics;
}

function generateSummary(turns: TurnContent[], sessionId: string): ExtractedMemory[] {
  const userTurns = turns.filter((t) => t.role === 'user');
  if (userTurns.length < MIN_TURNS_FOR_SUMMARY) {
    return [];
  }

  const keyPoints = userTurns
    .map((t) => t.text)
    .filter((t) => t.length > 10) // Skip trivial messages
    .slice(0, 5) // Cap at 5 key points
    .join('; ');

  const summary = truncate(`Conversation covered: ${keyPoints}`);
  return [{ content: summary, type: 'SUMMARY', sourceSessionId: sessionId }];
}

function deduplicateMemories(memories: ExtractedMemory[]): ExtractedMemory[] {
  const seen = new Set<string>();
  const result: ExtractedMemory[] = [];

  for (const memory of memories) {
    // Normalize for dedup: lowercase, strip extra whitespace
    const key = `${memory.type}:${memory.content.toLowerCase().replace(/\s+/g, ' ').trim()}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(memory);
    }
  }

  return result;
}

/**
 * Extract memories from a set of conversation turns.
 * Returns extracted memories and an optional displayAlias.
 */
export function extractMemories(turns: TurnContent[], sessionId: string): ExtractionResult {
  const displayAlias = extractDisplayAlias(turns);

  const facts = extractFacts(turns, sessionId);
  const preferences = extractPreferences(turns, sessionId);
  const topics = extractTopics(turns, sessionId);
  const summaries = generateSummary(turns, sessionId);

  // If displayAlias was found, also store as a FACT
  if (displayAlias) {
    facts.push({
      content: `Visitor name: ${displayAlias}`,
      type: 'FACT',
      sourceSessionId: sessionId,
    });
  }

  const allMemories = [...facts, ...preferences, ...topics, ...summaries];
  const deduped = deduplicateMemories(allMemories);

  return {
    memories: deduped,
    displayAlias,
  };
}
