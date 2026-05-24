/**
 * Budget degradation handler.
 * Listens for session_state_change events, handles BUDGET_CAPPED transitions.
 * $8 soft-degrade: switch to browser TTS if available, else text-only.
 * $10 hard-stop: disable all interaction.
 */

import { isAvailable as browserTtsAvailable } from './browserTts';

export type BudgetMode = 'normal' | 'browser_tts' | 'text_only' | 'hard_stop';

export interface BudgetDegradationState {
  mode: BudgetMode;
}

const FIRST_FALLBACK_MESSAGE =
  "Signal's getting weak... must be the budget cuts. But hey, I'm still here — just a little less... polished.";

export function createBudgetDegradation(): {
  getMode(): BudgetMode;
  onBudgetCapped(softDegrade: boolean): void;
  isFirstFallback(): boolean;
  getFirstFallbackMessage(): string;
} {
  let mode: BudgetMode = 'normal';
  let firstFallbackConsumed = false;

  return {
    getMode() {
      return mode;
    },

    onBudgetCapped(softDegrade: boolean) {
      if (!softDegrade) {
        mode = 'hard_stop';
        return;
      }
      mode = browserTtsAvailable() ? 'browser_tts' : 'text_only';
      firstFallbackConsumed = false;
    },

    isFirstFallback(): boolean {
      if (mode !== 'browser_tts') return false;
      if (firstFallbackConsumed) return false;
      firstFallbackConsumed = true;
      return true;
    },

    getFirstFallbackMessage(): string {
      return FIRST_FALLBACK_MESSAGE;
    },
  };
}
