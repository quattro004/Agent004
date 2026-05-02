import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MemoryAdapter,
  createMemoryAdapter,
  type MemoryRecord,
  type MemorySearchResult,
} from '../../src/memory/memoryAdapter.js';

// Mock AgentCore Memory client
const mockCreateEvent = vi.fn();
const mockListRecords = vi.fn();
const mockRetrieveRecords = vi.fn();
const mockBatchDeleteRecords = vi.fn();
const mockBatchCreateRecords = vi.fn();

vi.mock('../../src/memory/agentCoreMemoryClient.js', () => ({
  createAgentCoreMemoryClient: () => ({
    createEvent: mockCreateEvent,
    listRecords: mockListRecords,
    retrieveRecords: mockRetrieveRecords,
    batchDeleteRecords: mockBatchDeleteRecords,
    batchCreateRecords: mockBatchCreateRecords,
  }),
}));

describe('MemoryAdapter', () => {
  let adapter: MemoryAdapter;
  const actorId = 'test-actor-123';
  const memoryId = 'test-memory-resource-id';

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createMemoryAdapter({ memoryId });
  });

  describe('namespace creation', () => {
    it('creates namespace as /max-height/{actorId}/', () => {
      const namespace = adapter.getNamespace(actorId);
      expect(namespace).toBe(`/max-height/${actorId}/`);
    });

    it('handles actorId with special characters', () => {
      const ns = adapter.getNamespace('abc-def-123');
      expect(ns).toBe('/max-height/abc-def-123/');
    });
  });

  describe('retrieve', () => {
    it('retrieves memories within 30-day window via semantic search', async () => {
      const mockMemories: MemorySearchResult[] = [
        {
          memoryRecordId: 'mem-001',
          content: 'Visitor likes sci-fi movies',
          score: 0.95,
          namespace: `/max-height/${actorId}/`,
        },
        {
          memoryRecordId: 'mem-002',
          content: 'Discussed the 80s at length',
          score: 0.85,
          namespace: `/max-height/${actorId}/`,
        },
      ];
      mockRetrieveRecords.mockResolvedValue(mockMemories);

      const result = await adapter.retrieveMemories(actorId, 'conversation context');

      expect(mockRetrieveRecords).toHaveBeenCalledWith({
        memoryId,
        namespace: `/max-height/${actorId}/`,
        searchQuery: 'conversation context',
        topK: 10,
      });
      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('Visitor likes sci-fi movies');
    });

    it('returns empty array when no memories found', async () => {
      mockRetrieveRecords.mockResolvedValue([]);

      const result = await adapter.retrieveMemories(actorId, 'anything');
      expect(result).toEqual([]);
    });

    it('handles retrieval errors gracefully', async () => {
      mockRetrieveRecords.mockRejectedValue(new Error('Service unavailable'));

      const result = await adapter.retrieveMemories(actorId, 'test');
      expect(result).toEqual([]);
    });
  });

  describe('store', () => {
    it('stores a memory record with correct namespace and metadata', async () => {
      const record: MemoryRecord = {
        content: 'Visitor enjoys Depeche Mode',
        type: 'PREFERENCE',
        sourceSessionId: 'session-abc',
      };

      mockBatchCreateRecords.mockResolvedValue({ successful: 1, failed: 0 });

      await adapter.storeMemory(actorId, record);

      expect(mockBatchCreateRecords).toHaveBeenCalledWith({
        memoryId,
        records: [
          expect.objectContaining({
            content: { text: 'Visitor enjoys Depeche Mode' },
            namespaces: [`/max-height/${actorId}/`],
          }),
        ],
      });
    });

    it('stores multiple memories in batch', async () => {
      const records: MemoryRecord[] = [
        { content: 'Likes sci-fi', type: 'PREFERENCE', sourceSessionId: 'session-1' },
        { content: 'Works as engineer', type: 'FACT', sourceSessionId: 'session-1' },
      ];

      mockBatchCreateRecords.mockResolvedValue({ successful: 2, failed: 0 });

      await adapter.storeMemories(actorId, records);

      expect(mockBatchCreateRecords).toHaveBeenCalledWith({
        memoryId,
        records: expect.arrayContaining([
          expect.objectContaining({
            content: { text: 'Likes sci-fi' },
          }),
          expect.objectContaining({
            content: { text: 'Works as engineer' },
          }),
        ]),
      });
    });
  });

  describe('wipe', () => {
    it('clears all memory entries for an actorId namespace', async () => {
      const existingRecords = [
        { memoryRecordId: 'mem-001' },
        { memoryRecordId: 'mem-002' },
        { memoryRecordId: 'mem-003' },
      ];
      mockListRecords.mockResolvedValue(existingRecords);
      mockBatchDeleteRecords.mockResolvedValue({ successful: 3, failed: 0 });

      const result = await adapter.wipeMemories(actorId);

      expect(mockListRecords).toHaveBeenCalledWith({
        memoryId,
        namespace: `/max-height/${actorId}/`,
      });
      expect(mockBatchDeleteRecords).toHaveBeenCalledWith({
        memoryId,
        records: [
          { memoryRecordId: 'mem-001' },
          { memoryRecordId: 'mem-002' },
          { memoryRecordId: 'mem-003' },
        ],
      });
      expect(result.deletedCount).toBe(3);
    });

    it('handles empty namespace (no memories to wipe)', async () => {
      mockListRecords.mockResolvedValue([]);

      const result = await adapter.wipeMemories(actorId);
      expect(result.deletedCount).toBe(0);
      expect(mockBatchDeleteRecords).not.toHaveBeenCalled();
    });
  });

  describe('delete single memory', () => {
    it('deletes a single memory by ID', async () => {
      mockBatchDeleteRecords.mockResolvedValue({ successful: 1, failed: 0 });

      await adapter.deleteMemory('mem-001');

      expect(mockBatchDeleteRecords).toHaveBeenCalledWith({
        memoryId,
        records: [{ memoryRecordId: 'mem-001' }],
      });
    });
  });

  describe('list memories', () => {
    it('lists all memories for an actorId', async () => {
      const records = [
        {
          memoryRecordId: 'mem-001',
          content: { text: 'Likes sci-fi' },
          namespaces: [`/max-height/${actorId}/`],
        },
        {
          memoryRecordId: 'mem-002',
          content: { text: 'Works as engineer' },
          namespaces: [`/max-height/${actorId}/`],
        },
      ];
      mockListRecords.mockResolvedValue(records);

      const result = await adapter.listMemories(actorId);

      expect(result).toHaveLength(2);
      expect(result[0].memoryRecordId).toBe('mem-001');
    });
  });

  describe('30-day expiry calculation', () => {
    it('calculates expiry as 30 days from lastSeenAt', () => {
      const lastSeenAt = new Date('2026-04-01T00:00:00Z');
      const expiry = adapter.calculateExpiry(lastSeenAt);
      const expected = new Date('2026-05-01T00:00:00Z');
      expect(expiry.getTime()).toBe(expected.getTime());
    });

    it('uses current date when lastSeenAt not provided', () => {
      const before = Date.now();
      const expiry = adapter.calculateExpiry();
      const after = Date.now();

      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      expect(expiry.getTime()).toBeGreaterThanOrEqual(before + thirtyDaysMs);
      expect(expiry.getTime()).toBeLessThanOrEqual(after + thirtyDaysMs);
    });
  });
});
