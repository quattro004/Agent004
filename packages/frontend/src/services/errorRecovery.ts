/**
 * Error recovery service.
 * Auto-retry once within 3s, SIGNAL_LOST on failure, text-only on Polly failure,
 * token timeout warning at 3s and SIGNAL_LOST at 10s.
 */

import { useConnectionStore } from '../stores/connectionStore';

export interface ErrorRecoveryOptions {
  retryDelayMs?: number;
  tokenWarningMs?: number;
  tokenTimeoutMs?: number;
}

export interface ErrorRecovery {
  handleMessageError(retry: () => void): void;
  startTokenTimer(onWarning: () => void): void;
  clearTokenTimer(): void;
  dispose(): void;
}

export function createErrorRecovery(options?: ErrorRecoveryOptions): ErrorRecovery {
  const retryDelayMs = options?.retryDelayMs ?? 3000;
  const tokenWarningMs = options?.tokenWarningMs ?? 3000;
  const tokenTimeoutMs = options?.tokenTimeoutMs ?? 10000;

  let retried = false;
  let warningTimer: ReturnType<typeof setTimeout> | null = null;
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

  function clearTimers() {
    if (warningTimer) {
      clearTimeout(warningTimer);
      warningTimer = null;
    }
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
  }

  return {
    handleMessageError(retry) {
      if (!retried) {
        retried = true;
        setTimeout(retry, retryDelayMs);
      } else {
        useConnectionStore.getState().setSessionState('SIGNAL_LOST');
      }
    },

    startTokenTimer(onWarning) {
      clearTimers();
      warningTimer = setTimeout(onWarning, tokenWarningMs);
      timeoutTimer = setTimeout(() => {
        useConnectionStore.getState().setSessionState('SIGNAL_LOST');
      }, tokenTimeoutMs);
    },

    clearTokenTimer() {
      clearTimers();
      retried = false;
    },

    dispose() {
      clearTimers();
    },
  };
}
