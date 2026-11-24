import {
  createAgentCoreMemoryClient,
  type AgentCoreMemoryClient,
  type MemoryRecordDeleteInput,
  type MemoryRecordSummary,
} from './agentCoreMemoryClient.js';

export type MemoryKind = 'fact' | 'preference' | 'summary';

export interface MemorySearchResult {
  memoryRecordId: string;
  content: string;
  type: 'FACT' | 'PREFERENCE' | 'SUMMARY';
  namespace: string;
  score?: number;
}

export interface MemoryListItem {
  id: string;
  text: string;
  kind: MemoryKind;
  createdAt: string;
}

export interface WipeResult {
  recordsDeleted: number;
  eventsDeleted: number;
}

export interface MemoryAdapter {
  getNamespace(sub: string): string;
  retrieveMemories(
    sub: string,
    searchQuery: string,
    topK: number,
    signal?: AbortSignal,
  ): Promise<MemorySearchResult[]>;
  createEvent(
    sub: string,
    sessionId: string,
    userMessage: string,
    assistantMessage: string,
    eventTimestamp: Date,
  ): Promise<void>;
  wipeMemories(sub: string): Promise<WipeResult>;
  deleteMemory(sub: string, memoryRecordId: string): Promise<void>;
  listMemories(sub: string): Promise<MemoryListItem[]>;
}

export interface MemoryAdapterConfig {
  memoryId: string;
  client?: AgentCoreMemoryClient;
}

export class MemoryRecordNotFoundError extends Error {
  constructor() {
    super('Memory record not found');
    this.name = 'MemoryRecordNotFoundError';
  }
}

export function createMemoryAdapter(config: MemoryAdapterConfig): MemoryAdapter {
  const { memoryId } = config;
  const client = config.client ?? createAgentCoreMemoryClient();

  function getNamespace(sub: string): string {
    return `/max-height/${sub}/`;
  }

  async function retrieveMemories(
    sub: string,
    searchQuery: string,
    topK: number,
    signal?: AbortSignal,
  ): Promise<MemorySearchResult[]> {
    const namespace = getNamespace(sub);
    const records = await client.retrieveRecords({
      memoryId,
      namespace,
      searchQuery,
      topK,
      ...(signal ? { abortSignal: signal } : {}),
    });

    return records.map((record) => {
      const recordNamespace = ownedNamespace(record, namespace);
      return {
        memoryRecordId: record.memoryRecordId,
        content: requiredContent(record),
        type: memoryType(recordNamespace, namespace),
        namespace: recordNamespace,
        score: record.score,
      };
    });
  }

  async function createEvent(
    sub: string,
    sessionId: string,
    userMessage: string,
    assistantMessage: string,
    eventTimestamp: Date,
  ): Promise<void> {
    await client.createEvent({
      memoryId,
      actorId: sub,
      sessionId,
      eventTimestamp,
      messages: [
        { role: 'USER', text: userMessage },
        { role: 'ASSISTANT', text: assistantMessage },
      ],
    });
  }

  async function listMemories(sub: string): Promise<MemoryListItem[]> {
    const namespace = getNamespace(sub);
    const records = await client.listRecords({ memoryId, namespace });

    return records.map((record) => {
      const recordNamespace = ownedNamespace(record, namespace);
      return {
        id: record.memoryRecordId,
        text: requiredContent(record),
        kind: memoryKind(memoryType(recordNamespace, namespace)),
        createdAt: requiredDate(record.createdAt, 'createdAt').toISOString(),
      };
    });
  }

  async function deleteMemory(sub: string, memoryRecordId: string): Promise<void> {
    const record = await client.getRecord({ memoryId, memoryRecordId });
    if (!record) throw new MemoryRecordNotFoundError();

    const recordNamespace = namespaceForOwnedRecord(record, getNamespace(sub));
    if (!recordNamespace) throw new MemoryRecordNotFoundError();
    await client.deleteRecord({ memoryId, memoryRecordId, namespace: recordNamespace });
  }

  async function wipeMemories(sub: string): Promise<WipeResult> {
    const namespace = getNamespace(sub);
    const records = await client.listRecords({ memoryId, namespace });
    const deletions: MemoryRecordDeleteInput[] = records.map((record) => ({
      memoryRecordId: record.memoryRecordId,
      namespace: ownedNamespace(record, namespace),
    }));

    if (deletions.length > 0) {
      const deleted = await client.batchDeleteRecords({ memoryId, records: deletions });
      assertCompleteDeletion(
        deleted.successfulRecords.length,
        deleted.failedRecords.length,
        records.length,
      );
    }

    let eventsDeleted = 0;
    const sessions = await client.listSessions({ memoryId, actorId: sub });
    for (const { sessionId } of sessions) {
      const events = await client.listEvents({ memoryId, actorId: sub, sessionId });
      for (const { eventId } of events) {
        await client.deleteEvent({ memoryId, actorId: sub, sessionId, eventId });
        eventsDeleted += 1;
      }
    }

    return { recordsDeleted: records.length, eventsDeleted };
  }

  return {
    getNamespace,
    retrieveMemories,
    createEvent,
    listMemories,
    deleteMemory,
    wipeMemories,
  };
}

function ownedNamespace(record: MemoryRecordSummary, namespace: string): string {
  const recordNamespace = namespaceForOwnedRecord(record, namespace);
  if (!recordNamespace) throw new Error('Memory record is outside the caller namespace');
  return recordNamespace;
}

function namespaceForOwnedRecord(
  record: MemoryRecordSummary,
  namespace: string,
): string | undefined {
  const namespaces = record.namespaces ?? [];
  if (namespaces.length === 0 || namespaces.some((item) => !item.startsWith(namespace))) {
    return undefined;
  }
  return namespaces[0];
}

function memoryType(recordNamespace: string, namespace: string): MemorySearchResult['type'] {
  const strategy = recordNamespace.slice(namespace.length).split('/')[0];
  if (strategy === 'facts') return 'FACT';
  if (strategy === 'preferences') return 'PREFERENCE';
  if (strategy === 'summaries') return 'SUMMARY';
  throw new Error(`Memory record has an unknown strategy namespace: ${strategy}`);
}

function memoryKind(type: MemorySearchResult['type']): MemoryKind {
  switch (type) {
    case 'FACT':
      return 'fact';
    case 'PREFERENCE':
      return 'preference';
    case 'SUMMARY':
      return 'summary';
  }
}

function requiredContent(record: MemoryRecordSummary): string {
  const text = record.content?.text;
  if (text === undefined) throw new Error('AgentCore Memory record has no text content');
  return text;
}

function requiredDate(value: Date | undefined, name: string): Date {
  if (value === undefined || Number.isNaN(value.getTime())) {
    throw new Error(`AgentCore Memory record has no valid ${name}`);
  }
  return value;
}

function assertCompleteDeletion(successful: number, failed: number, requested: number): void {
  const remaining = requested - successful;
  if (failed > 0 || successful !== requested) {
    throw new Error(
      `BatchDeleteMemoryRecords left ${Math.max(failed, remaining, 1)} record(s) undeleted`,
    );
  }
}
