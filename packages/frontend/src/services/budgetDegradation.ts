/**
 * Budget degradation handler.
 * Listens for session_state_change events, handles BUDGET_CAPPED transitions.
 * $8 soft-degrade: disable Polly TTS, continue text-only.
 * $10 hard-stop: disable all interaction.
 */

export type BudgetMode = 'normal' | 'text_only' | 'hard_stop';

export interface BudgetDegradationState {
  mode: BudgetMode;
}

export function createBudgetDegradation(): {
  getMode(): BudgetMode;
  onBudgetCapped(softDegrade: boolean): void;
} {
  let mode: BudgetMode = 'normal';

  return {
    getMode() {
      return mode;
    },

    onBudgetCapped(softDegrade: boolean) {
      mode = softDegrade ? 'text_only' : 'hard_stop';
    },
  };
}
