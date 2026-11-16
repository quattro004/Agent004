import {
  MemoryRecordNotFoundError,
  type MemoryAdapter,
  type MemoryListItem,
} from './memoryAdapter.js';

export type MemoryActionErrorCode = 'invalid_request' | 'not_found' | 'internal';

export interface ForgetMeResult {
  success: boolean;
  recordsDeleted?: number;
  eventsDeleted?: number;
  code?: MemoryActionErrorCode;
  error?: string;
}

export interface ListMemoriesResult {
  success: boolean;
  memories?: MemoryListItem[];
  code?: MemoryActionErrorCode;
  error?: string;
}

export interface DeleteMemoryResult {
  success: boolean;
  deleted?: 1;
  code?: MemoryActionErrorCode;
  error?: string;
}

export async function handleForgetMe(adapter: MemoryAdapter, sub: string): Promise<ForgetMeResult> {
  if (!sub) return { success: false, code: 'invalid_request' };

  try {
    const result = await adapter.wipeMemories(sub);
    return { success: true, ...result };
  } catch (error) {
    return { success: false, code: 'internal', error: errorMessage(error) };
  }
}

export async function handleListMemories(
  adapter: MemoryAdapter,
  sub: string,
): Promise<ListMemoriesResult> {
  if (!sub) return { success: false, code: 'invalid_request' };

  try {
    const memories = await adapter.listMemories(sub);
    return { success: true, memories };
  } catch (error) {
    return { success: false, code: 'internal', error: errorMessage(error) };
  }
}

export async function handleDeleteMemory(
  adapter: MemoryAdapter,
  sub: string,
  memoryRecordId: string,
): Promise<DeleteMemoryResult> {
  if (!sub || !memoryRecordId) return { success: false, code: 'invalid_request' };

  try {
    await adapter.deleteMemory(sub, memoryRecordId);
    return { success: true, deleted: 1 };
  } catch (error) {
    if (error instanceof MemoryRecordNotFoundError) {
      return { success: false, code: 'not_found' };
    }
    return { success: false, code: 'internal', error: errorMessage(error) };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
