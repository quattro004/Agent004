/**
 * Budget degradation (FR-023, spec 001 FR-016).
 *
 * The runtime's breaker owns the threshold: when the month's tally reaches
 * `BREAKER_DEGRADE_MICRO_USD` it answers the `session` event with
 * `voice: "off"` and synthesizes nothing (contracts/spend-control.md
 * § Breaker). The browser's only job is to notice that and say so once.
 *
 * The degrade is text-only. Browser speech synthesis is deliberately not a
 * fallback: it would run a model in the browser and breach P1's cloud-only
 * rule, so spec 001 FR-016's browser-TTS SHOULD is recorded as unmet
 * (research Q1, P-15).
 */

export type BudgetMode = 'normal' | 'text_only' | 'hard_stop';

const DEGRADE_MESSAGE =
  "Signal's thinning out — budget cuts hit the voice booth first. I'm still here, just reading the cue cards.";

export interface BudgetDegradation {
  getMode(): BudgetMode;
  /** The `voice` field of a `session` event. */
  onSessionVoice(voice: 'on' | 'off'): void;
  /** A `halted` or `breaker_tripped` error. Terminal for the session. */
  onHardStop(): void;
  /** The in-character line, once per degrade, or null when there is none. */
  takeAnnouncement(): string | null;
}

export function createBudgetDegradation(): BudgetDegradation {
  let mode: BudgetMode = 'normal';
  let pendingAnnouncement: string | null = null;

  return {
    getMode() {
      return mode;
    },

    onSessionVoice(voice) {
      // A hard stop is terminal; a later turn cannot talk its way out of it.
      if (mode === 'hard_stop') return;

      if (voice === 'off') {
        if (mode !== 'text_only') {
          mode = 'text_only';
          pendingAnnouncement = DEGRADE_MESSAGE;
        }
        return;
      }

      mode = 'normal';
    },

    onHardStop() {
      mode = 'hard_stop';
      // The hard stop is carried by the session overlay, not by a line of
      // dialogue, so any unsaid degrade line is dropped.
      pendingAnnouncement = null;
    },

    takeAnnouncement() {
      const message = pendingAnnouncement;
      pendingAnnouncement = null;
      return message;
    },
  };
}
