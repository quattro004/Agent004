import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleDeleteMemory,
  handleForgetMe,
  handleListMemories,
} from '../../src/memory/memoryHandlers.js';
import { MemoryRecordNotFoundError, type MemoryAdapter } from '../../src/memory/memoryAdapter.js';

function createMockAdapter(): MemoryAdapter {
  return {
    getNamespace: vi.fn((sub: string) => `/max-height/${sub}/`),
    retrieveMemories: vi.fn().mockResolvedValue([]),
    createEvent: vi.fn().mockResolvedValue(undefined),
    wipeMemories: vi.fn().mockResolvedValue({ recordsDeleted: 2, eventsDeleted: 3 }),
    deleteMemory: vi.fn().mockResolvedValue(undefined),
    listMemories: vi.fn().mockResolvedValue([]),
  };
}

describe('Memory HTTP handlers', () => {
  let adapter: MemoryAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createMockAdapter();
  });

  it('lists only records returned for the verified subject', async () => {
    const records = [
      {
        id: 'memory-1',
        text: 'Likes sci-fi',
        kind: 'preference' as const,
        createdAt: '2026-11-16',
      },
    ];
    vi.mocked(adapter.listMemories).mockResolvedValue(records);

    const result = await handleListMemories(adapter, 'friend-1');

    expect(adapter.listMemories).toHaveBeenCalledWith('friend-1');
    expect(result).toEqual({ success: true, memories: records });
  });

  it('returns an internal failure when listing memories fails', async () => {
    vi.mocked(adapter.listMemories).mockRejectedValue(new Error('AgentCore unavailable'));

    const result = await handleListMemories(adapter, 'friend-1');

    expect(result).toMatchObject({ success: false, code: 'internal' });
  });

  it('passes the verified subject to the ownership-checked delete', async () => {
    const result = await handleDeleteMemory(adapter, 'friend-1', 'memory-1');

    expect(adapter.deleteMemory).toHaveBeenCalledWith('friend-1', 'memory-1');
    expect(result).toEqual({ success: true, deleted: 1 });
  });

  it('returns not_found for a foreign or missing record ID', async () => {
    vi.mocked(adapter.deleteMemory).mockRejectedValue(new MemoryRecordNotFoundError());

    const result = await handleDeleteMemory(adapter, 'friend-1', 'foreign-id');

    expect(result).toEqual({ success: false, code: 'not_found' });
  });

  it('reports both record and event counts after forgetting all memory', async () => {
    const result = await handleForgetMe(adapter, 'friend-1');

    expect(adapter.wipeMemories).toHaveBeenCalledWith('friend-1');
    expect(result).toEqual({ success: true, recordsDeleted: 2, eventsDeleted: 3 });
  });

  it('does not report success when the forget operation is incomplete', async () => {
    vi.mocked(adapter.wipeMemories).mockRejectedValue(new Error('event delete failed'));

    const result = await handleForgetMe(adapter, 'friend-1');

    expect(result).toMatchObject({ success: false, code: 'internal' });
  });
});
