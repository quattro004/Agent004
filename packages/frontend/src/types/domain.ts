// Domain types per data-model.md

export type SessionState =
  | 'INITIALIZING'
  | 'GREETING'
  | 'ACTIVE'
  | 'ENDED'
  | 'BUDGET_CAPPED'
  | 'RATE_LIMITED'
  | 'SIGNAL_LOST'
  | 'ERROR';

export type GreetingArchetype =
  | 'TV_PRESENTER_INTRO'
  | 'MID_MONOLOGUE'
  | 'MOCK_ANNOYANCE'
  | 'SPONSOR_BREAK'
  | 'TIME_OF_DAY_RIFF'
  | 'SELF_CONGRATULATION'
  | 'FAKE_NEWS_FLASH'
  | 'GLITCH_COLD_OPEN';

export interface Greeting {
  id: string;
  archetype: GreetingArchetype;
  text: string;
  audioPath: string;
  audioDurationMs: number;
  videoPath: string;
  weight: number;
  tags: string[];
}

export interface RateLimitState {
  hourlyCount: number;
  hourlyWindowStart: string;
  dailyCount: number;
  dailyWindowStart: string;
}

export interface Visitor {
  actorId: string;
  displayAlias: string | null;
  greetingHistory: string[];
  rateLimitCounters: RateLimitState;
}
