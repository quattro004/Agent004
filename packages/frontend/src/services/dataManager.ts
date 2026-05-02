/**
 * Data manager service for FR-017 (Forget Me) and FR-018 (Export Data).
 * Clears all max-height-* localStorage and resets Zustand stores.
 */

import { useVoiceStore } from '../stores/voiceStore';
import { useConversationStore } from '../stores/conversationStore';
import { useConnectionStore } from '../stores/connectionStore';
import { useVisitorStore } from '../stores/visitorStore';

const STORAGE_PREFIX = 'max-height-';

export function forgetMe(): void {
  // Remove all max-height-* keys from localStorage
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));

  // Reset all Zustand stores
  useVoiceStore.getState().reset();
  useConversationStore.getState().reset();
  useConnectionStore.getState().reset();
  useVisitorStore.getState().reset();
}

export function exportData(): void {
  const visitor = useVisitorStore.getState();

  const payload = {
    actorId: visitor.actorId,
    displayAlias: visitor.displayAlias,
    greetingHistory: visitor.greetingHistory,
    exportedAt: new Date().toISOString(),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `max-height-data-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
