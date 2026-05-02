import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleForgetMe,
  handleListMemories,
  handleDeleteMemory,
} from '../../src/memory/memoryHandlers.js';
import type { MemoryAdapter } from '../../src/memory/memoryAdapter.js';

function createMockAdapter(): MemoryAdapter {
  return {
    getNamespace: vi.fn((actorId: string) => `/max-height/${actorId}/`),
    retrieveMemories: vi.fn().mockResolvedValue([]),
    storeMemory: vi.fn().mockResolvedValue(undefined),
    storeMemories: vi.fn().mockResolvedValue(undefined),
    wipeMemories: vi.fn().mockResolvedValue({ deletedCount: 5 }),
    deleteMemory: vi.fn().mockResolvedValue(undefined),
    listMemories: vi.fn().mockResolvedValue([]),
    calculateExpiry: vi.fn().mockReturnValue(new Date()),
  };
}

describe('Memory HTTP Handlers', () => {
  let adapter: MemoryAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createMockAdapter();
  });

  describe('handleForgetMe (T090)', () => {
    it('wipes all memories for given actorId', async () => {
      const result = await handleForgetMe(adapter, 'actor-123');

      expect(adapter.wipeMemories).toHaveBeenCalledWith('actor-123');
      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(5);
    });

    it('returns success with 0 count when no memories exist', async () => {
      vi.mocked(adapter.wipeMemories).mockResolvedValue({ deletedCount: 0 });

      const result = await handleForgetMe(adapter, 'new-actor');

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(0);
    });

    it('returns error result on failure', async () => {
      vi.mocked(adapter.wipeMemories).mockRejectedValue(new Error('Service down'));

      const result = await handleForgetMe(adapter, 'actor-123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Service down');
    });

    it('requires actorId', async () => {
      const result = await handleForgetMe(adapter, '');

      expect(result.success).toBe(false);
      expect(result.error).toContain('actorId');
    });
  });

  describe('handleListMemories (T091/T092)', () => {
    it('returns all memories for actorId', async () => {
      vi.mocked(adapter.listMemories).mockResolvedValue([
        {
          memoryRecordId: 'mem-001',
          content: 'Likes sci-fi',
          namespaces: ['/max-height/actor-123/'],
        },
        {
          memoryRecordId: 'mem-002',
          content: 'Works as engineer',
          namespaces: ['/max-height/actor-123/'],
        },
      ]);

      const result = await handleListMemories(adapter, 'actor-123');

      expect(result.success).toBe(true);
      expect(result.memories).toHaveLength(2);
      expect(result.memories![0].memoryRecordId).toBe('mem-001');
    });

    it('returns empty array when no memories', async () => {
      const result = await handleListMemories(adapter, 'new-actor');

      expect(result.success).toBe(true);
      expect(result.memories).toEqual([]);
    });

    it('handles errors gracefully', async () => {
      vi.mocked(adapter.listMemories).mockRejectedValue(new Error('Network error'));

      const result = await handleListMemories(adapter, 'actor-123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  describe('handleDeleteMemory (T092)', () => {
    it('deletes a single memory by ID', async () => {
      const result = await handleDeleteMemory(adapter, 'mem-001');

      expect(adapter.deleteMemory).toHaveBeenCalledWith('mem-001');
      expect(result.success).toBe(true);
    });

    it('requires memoryRecordId', async () => {
      const result = await handleDeleteMemory(adapter, '');

      expect(result.success).toBe(false);
      expect(result.error).toContain('memoryRecordId');
    });

    it('handles deletion errors', async () => {
      vi.mocked(adapter.deleteMemory).mockRejectedValue(new Error('Not found'));

      const result = await handleDeleteMemory(adapter, 'mem-999');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not found');
    });
  });
});
