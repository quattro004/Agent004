// Agent-side types per data-model.md

export interface AgentConfig {
  modelId: string;
  maxOutputTokens: number;
  systemPromptPath: string;
}

export interface PersonalityConfig {
  stutterMinPerResponse: number;
  stutterMaxPerResponse: number;
  editorialSandwichEnabled: boolean;
  evasivenessCheckEnabled: boolean;
}

export interface StutterMarker {
  position: number;
  original: string;
  stuttered: string;
}

export type MemoryType = 'FACT' | 'PREFERENCE' | 'SUMMARY' | 'TOPIC';

export interface Memory {
  memoryId: string;
  actorId: string;
  type: MemoryType;
  content: string;
  sourceSessionId: string;
  extractedAt: string;
  expiresAt: string;
}

export interface SessionMetadata {
  sessionId: string;
  actorId: string;
  agentCoreSessionId: string;
  startedAt: string;
  turnCount: number;
  tokenCount: number;
  idleNudgeDelivered: boolean;
  reEngagementCount: number;
}
