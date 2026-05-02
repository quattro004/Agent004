/**
 * AgentCore Memory adapter for Max Height.
 * Wraps the AgentCore Memory client with namespace management,
 * 30-day rolling retention, and graceful error handling.
 */

import {
  createAgentCoreMemoryClient,
  type AgentCoreMemoryClient,
} from './agentCoreMemoryClient.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface MemoryRecord {
  content: string;
  type: 'FACT' | 'PREFERENCE' | 'SUMMARY' | 'TOPIC';
  sourceSessionId: string;
}

export interface MemorySearchResult {
  memoryRecordId: string;
  content: string;
  score: number;
  namespace: string;
}

export interface MemoryListItem {
  memoryRecordId: string;
  content: string;
  namespaces: string[];
}

export interface WipeResult {
  deletedCount: number;
}

export interface MemoryAdapter {
  getNamespace(actorId: string): string;
  retrieveMemories(actorId: string, searchQuery: string): Promise<MemorySearchResult[]>;
  storeMemory(actorId: string, record: MemoryRecord): Promise<void>;
  storeMemories(actorId: string, records: MemoryRecord[]): Promise<void>;
  wipeMemories(actorId: string): Promise<WipeResult>;
  deleteMemory(memoryRecordId: string): Promise<void>;
  listMemories(actorId: string): Promise<MemoryListItem[]>;
  calculateExpiry(lastSeenAt?: Date): Date;
}

export interface MemoryAdapterConfig {
  memoryId: string;
  client?: AgentCoreMemoryClient;
}

export function createMemoryAdapter(config: MemoryAdapterConfig): MemoryAdapter {
  const { memoryId } = config;
  const client = config.client ?? createAgentCoreMemoryClient();

  function getNamespace(actorId: string): string {
    return `/max-height/${actorId}/`;
  }

  function calculateExpiry(lastSeenAt?: Date): Date {
    const base = lastSeenAt ?? new Date();
    return new Date(base.getTime() + THIRTY_DAYS_MS);
  }

  async function retrieveMemories(
    actorId: string,
    searchQuery: string,
  ): Promise<MemorySearchResult[]> {
    try {
      return await client.retrieveRecords({
        memoryId,
        namespace: getNamespace(actorId),
        searchQuery,
        topK: 10,
      });
    } catch {
      // Graceful degradation: return empty on failure
      return [];
    }
  }

  async function storeMemory(actorId: string, record: MemoryRecord): Promise<void> {
    await storeMemories(actorId, [record]);
  }

  async function storeMemories(actorId: string, records: MemoryRecord[]): Promise<void> {
    const namespace = getNamespace(actorId);
    const now = Date.now();

    await client.batchCreateRecords({
      memoryId,
      records: records.map((r, i) => ({
        content: { text: r.content },
        namespaces: [namespace],
        requestIdentifier: `${r.sourceSessionId}-${now}-${i}`,
        timestamp: Math.floor(now / 1000),
      })),
    });
  }

  async function wipeMemories(actorId: string): Promise<WipeResult> {
    const existing = await client.listRecords({
      memoryId,
      namespace: getNamespace(actorId),
    });

    if (existing.length === 0) {
      return { deletedCount: 0 };
    }

    await client.batchDeleteRecords({
      memoryId,
      records: existing.map((r) => ({ memoryRecordId: r.memoryRecordId })),
    });

    return { deletedCount: existing.length };
  }

  async function deleteMemory(memoryRecordId: string): Promise<void> {
    await client.batchDeleteRecords({
      memoryId,
      records: [{ memoryRecordId }],
    });
  }

  async function listMemories(actorId: string): Promise<MemoryListItem[]> {
    const records = await client.listRecords({
      memoryId,
      namespace: getNamespace(actorId),
    });

    return records.map((r) => ({
      memoryRecordId: r.memoryRecordId,
      content: r.content?.text ?? '',
      namespaces: r.namespaces ?? [],
    }));
  }

  return {
    getNamespace,
    retrieveMemories,
    storeMemory,
    storeMemories,
    wipeMemories,
    deleteMemory,
    listMemories,
    calculateExpiry,
  };
}
