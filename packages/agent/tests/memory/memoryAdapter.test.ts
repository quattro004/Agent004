import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryAdapter } from '../../src/memory/memoryAdapter.js';
import type {
  AgentCoreMemoryClient,
  MemoryRecordSummary,
} from '../../src/memory/agentCoreMemoryClient.js';

const MEMORY_ID = 'test-memory-resource';
const SUB = 'friend-1';
const NAMESPACE = `/max-height/${SUB}/`;
const NOW = new Date('2026-11-16T12:00:00.000Z');

function record(
  memoryRecordId: string,
  overrides: Partial<MemoryRecordSummary> = {},
): MemoryRecordSummary {
  return {
    memoryRecordId,
    content: { text: `${memoryRecordId} text` },
    namespaces: [`${NAMESPACE}facts/`],
    createdAt: NOW,
    ...overrides,
  };
}

function createClient(): AgentCoreMemoryClient {
  return {
    createEvent: vi.fn().mockResolvedValue(undefined),
    listRecords: vi.fn().mockResolvedValue([]),
    retrieveRecords: vi.fn().mockResolvedValue([]),
    getRecord: vi.fn().mockResolvedValue(undefined),
    deleteRecord: vi.fn().mockResolvedValue(undefined),
    batchDeleteRecords: vi.fn().mockResolvedValue({ successfulRecords: [], failedRecords: [] }),
    listSessions: vi.fn().mockResolvedValue([]),
    listEvents: vi.fn().mockResolvedValue([]),
    deleteEvent: vi.fn().mockResolvedValue(undefined),
  };
}

describe('MemoryAdapter', () => {
  let client: AgentCoreMemoryClient;
  let adapter: ReturnType<typeof createMemoryAdapter>;

  beforeEach(() => {
    client = createClient();
    adapter = createMemoryAdapter({ memoryId: MEMORY_ID, client });
  });

  it('uses the verified subject namespace for hierarchical retrieval and maps memory kinds', async () => {
    vi.mocked(client.retrieveRecords).mockResolvedValue([
      record('fact-1'),
      record('pref-1', { namespaces: [`${NAMESPACE}preferences/`] }),
      record('summary-1', { namespaces: [`${NAMESPACE}summaries/session-1/`] }),
    ]);

    const memories = await adapter.retrieveMemories(SUB, 'the show', 10);

    expect(client.retrieveRecords).toHaveBeenCalledWith({
      memoryId: MEMORY_ID,
      namespace: NAMESPACE,
      searchQuery: 'the show',
      topK: 10,
    });
    expect(memories.map(({ type }) => type)).toEqual(['FACT', 'PREFERENCE', 'SUMMARY']);
  });

  it('propagates retrieval failures so the runtime can report the failed span', async () => {
    vi.mocked(client.retrieveRecords).mockRejectedValue(new Error('AgentCore unavailable'));

    await expect(adapter.retrieveMemories(SUB, 'query', 10)).rejects.toThrow(
      'AgentCore unavailable',
    );
  });

  it('lists owned records in the friend-facing response shape', async () => {
    vi.mocked(client.listRecords).mockResolvedValue([
      record('fact-1'),
      record('pref-1', { namespaces: [`${NAMESPACE}preferences/`] }),
    ]);

    const records = await adapter.listMemories(SUB);

    expect(client.listRecords).toHaveBeenCalledWith({ memoryId: MEMORY_ID, namespace: NAMESPACE });
    expect(records).toEqual([
      { id: 'fact-1', text: 'fact-1 text', kind: 'fact', createdAt: NOW.toISOString() },
      { id: 'pref-1', text: 'pref-1 text', kind: 'preference', createdAt: NOW.toISOString() },
    ]);
  });

  it('does not expose a record whose namespaces include another subject', async () => {
    vi.mocked(client.listRecords).mockResolvedValue([
      record('shared', { namespaces: [`${NAMESPACE}facts/`, '/max-height/friend-2/facts/'] }),
    ]);

    await expect(adapter.listMemories(SUB)).rejects.toThrow('outside the caller namespace');
  });

  it('checks ownership before deleting a record and hides foreign IDs as not found', async () => {
    vi.mocked(client.getRecord).mockResolvedValue(
      record('foreign', { namespaces: ['/max-height/friend-2/facts/'] }),
    );

    await expect(adapter.deleteMemory(SUB, 'foreign')).rejects.toMatchObject({
      name: 'MemoryRecordNotFoundError',
    });
    expect(client.deleteRecord).not.toHaveBeenCalled();
  });

  it('deletes an owned record only after resolving its namespace', async () => {
    vi.mocked(client.getRecord).mockResolvedValue(record('owned'));

    await adapter.deleteMemory(SUB, 'owned');

    expect(client.getRecord).toHaveBeenCalledWith({
      memoryId: MEMORY_ID,
      memoryRecordId: 'owned',
    });
    expect(client.deleteRecord).toHaveBeenCalledWith({
      memoryId: MEMORY_ID,
      memoryRecordId: 'owned',
      namespace: `${NAMESPACE}facts/`,
    });
  });

  it('forgets every owned record and every event in every session', async () => {
    vi.mocked(client.listRecords).mockResolvedValue([record('fact-1')]);
    vi.mocked(client.batchDeleteRecords).mockResolvedValue({
      successfulRecords: [{ memoryRecordId: 'fact-1' }],
      failedRecords: [],
    });
    vi.mocked(client.listSessions).mockResolvedValue([
      { sessionId: 'session-1' },
      { sessionId: 'session-2' },
    ]);
    vi.mocked(client.listEvents)
      .mockResolvedValueOnce([{ eventId: 'event-1' }])
      .mockResolvedValueOnce([{ eventId: 'event-2' }, { eventId: 'event-3' }]);

    const result = await adapter.wipeMemories(SUB);

    expect(client.listRecords).toHaveBeenCalledWith({ memoryId: MEMORY_ID, namespace: NAMESPACE });
    expect(client.batchDeleteRecords).toHaveBeenCalledWith({
      memoryId: MEMORY_ID,
      records: [{ memoryRecordId: 'fact-1', namespace: `${NAMESPACE}facts/` }],
    });
    expect(client.listSessions).toHaveBeenCalledWith({ memoryId: MEMORY_ID, actorId: SUB });
    expect(client.deleteEvent).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ recordsDeleted: 1, eventsDeleted: 3 });
  });

  it('fails the forget operation when a batch deletion is partial', async () => {
    vi.mocked(client.listRecords).mockResolvedValue([record('fact-1'), record('fact-2')]);
    vi.mocked(client.batchDeleteRecords).mockResolvedValue({
      successfulRecords: [{ memoryRecordId: 'fact-1' }],
      failedRecords: [{ memoryRecordId: 'fact-2', errorMessage: 'denied' }],
    });

    await expect(adapter.wipeMemories(SUB)).rejects.toThrow('left 1 record');
    expect(client.listSessions).not.toHaveBeenCalled();
  });

  it('writes one event containing both sides of the delivered turn', async () => {
    await adapter.createEvent(SUB, 'counted-session', 'hello Max', 'Hello, friend.', NOW);

    expect(client.createEvent).toHaveBeenCalledWith({
      memoryId: MEMORY_ID,
      actorId: SUB,
      sessionId: 'counted-session',
      eventTimestamp: NOW,
      messages: [
        { role: 'USER', text: 'hello Max' },
        { role: 'ASSISTANT', text: 'Hello, friend.' },
      ],
    });
  });
});
