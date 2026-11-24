/**
 * What Max remembers (spec 001 FR-017 / FR-018; contracts/memory-api.md).
 *
 * Memory lives only in AgentCore Memory, so list, export, delete and forget-me
 * go through the agent's memory actions (`useAgentStream().runAction`). There
 * is deliberately no localStorage fallback: a copy kept in the browser could
 * disagree with the service, and "forgotten" has to mean the service forgot.
 */

import type {
  ActionData,
  ActionOutcome,
  ActionInput,
  MemoryRecordData,
  SseErrorCode,
} from '../hooks/useAgentStream';
import { useVoiceStore } from '../stores/voiceStore';
import { useConversationStore } from '../stores/conversationStore';
import { useConnectionStore } from '../stores/connectionStore';
import { useVisitorStore } from '../stores/visitorStore';

const STORAGE_PREFIX = 'max-height-';

export type ActionRunner = (input: ActionInput) => Promise<ActionOutcome>;

export type MemoryRecord = MemoryRecordData;

export interface ForgetResult {
  recordsDeleted: number;
  eventsDeleted: number;
}

/** `code` is the SSE error code, `transport`, `signed_out`, or `malformed` for an unusable reply. */
export class MemoryActionError extends Error {
  constructor(readonly code: SseErrorCode | 'transport' | 'signed_out' | 'malformed') {
    super(`Memory action failed: ${code}`);
    this.name = 'MemoryActionError';
  }
}

async function runOrThrow(run: ActionRunner, input: ActionInput): Promise<ActionData> {
  const outcome = await run(input);
  if (!outcome.ok) throw new MemoryActionError(outcome.code);
  return outcome.data;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function recordsOf(data: unknown): MemoryRecord[] {
  if (!isObject(data) || !Array.isArray(data.records)) {
    throw new MemoryActionError('malformed');
  }
  const records: MemoryRecord[] = [];
  for (const value of data.records) {
    if (
      !isObject(value) ||
      typeof value.id !== 'string' ||
      typeof value.text !== 'string' ||
      (value.kind !== 'fact' && value.kind !== 'preference' && value.kind !== 'summary') ||
      typeof value.createdAt !== 'string'
    ) {
      throw new MemoryActionError('malformed');
    }
    records.push({
      id: value.id,
      text: value.text,
      kind: value.kind,
      createdAt: value.createdAt,
    });
  }
  return records;
}

export async function listMemories(run: ActionRunner): Promise<MemoryRecord[]> {
  return recordsOf(await runOrThrow(run, { action: 'memory.list' }));
}

/** Saves what the agent exports as a `.json` download; nothing is saved if the export fails. */
export async function exportMemories(run: ActionRunner): Promise<void> {
  const data = await runOrThrow(run, { action: 'memory.export' });
  if (
    !isObject(data) ||
    !('exportedAt' in data) ||
    typeof data.exportedAt !== 'string' ||
    !('records' in data) ||
    !Array.isArray(data.records)
  ) {
    throw new MemoryActionError('malformed');
  }
  recordsOf({ records: data.records });

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `max-height-memories-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function deleteMemory(run: ActionRunner, memoryRecordId: string): Promise<void> {
  const data = await runOrThrow(run, { action: 'memory.delete', memoryRecordId });
  if (!isObject(data) || !('deleted' in data) || data.deleted !== 1) {
    throw new MemoryActionError('malformed');
  }
}

/**
 * Wipes the service's memory first and the browser's own state only once that
 * succeeded, so a failed forget-me never looks like a finished one and the
 * friend can retry (memory-api.md: all-or-error).
 */
export async function forgetMe(run: ActionRunner): Promise<ForgetResult> {
  const data = await runOrThrow(run, { action: 'memory.forget' });
  if (
    !isObject(data) ||
    !('recordsDeleted' in data) ||
    typeof data.recordsDeleted !== 'number' ||
    !('eventsDeleted' in data) ||
    typeof data.eventsDeleted !== 'number'
  ) {
    throw new MemoryActionError('malformed');
  }

  clearLocalState();
  return { recordsDeleted: data.recordsDeleted, eventsDeleted: data.eventsDeleted };
}

function clearLocalState(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_PREFIX)) keysToRemove.push(key);
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));

  useVoiceStore.getState().reset();
  useConversationStore.getState().reset();
  useConnectionStore.getState().reset();
  useVisitorStore.getState().reset();
}
