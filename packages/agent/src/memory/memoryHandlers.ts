/**
 * Memory HTTP handlers for Max Height agent.
 * Handles forget-me wipe, memory listing, and per-item deletion.
 */

import type { MemoryAdapter, MemoryListItem } from './memoryAdapter.js';

export interface ForgetMeResult {
  success: boolean;
  deletedCount?: number;
  error?: string;
}

export interface ListMemoriesResult {
  success: boolean;
  memories?: MemoryListItem[];
  error?: string;
}

export interface DeleteMemoryResult {
  success: boolean;
  error?: string;
}

export async function handleForgetMe(
  adapter: MemoryAdapter,
  actorId: string,
): Promise<ForgetMeResult> {
  if (!actorId) {
    return { success: false, error: 'actorId is required' };
  }

  try {
    const result = await adapter.wipeMemories(actorId);
    return { success: true, deletedCount: result.deletedCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}

export async function handleListMemories(
  adapter: MemoryAdapter,
  actorId: string,
): Promise<ListMemoriesResult> {
  if (!actorId) {
    return { success: false, error: 'actorId is required' };
  }

  try {
    const memories = await adapter.listMemories(actorId);
    return { success: true, memories };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}

export async function handleDeleteMemory(
  adapter: MemoryAdapter,
  memoryRecordId: string,
): Promise<DeleteMemoryResult> {
  if (!memoryRecordId) {
    return { success: false, error: 'memoryRecordId is required' };
  }

  try {
    await adapter.deleteMemory(memoryRecordId);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}
