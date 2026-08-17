/**
 * Mid-session idle re-engagement handler.
 * Fires up to 2 re-engagement events when the user is idle for 90-120s.
 * Resets on user message. Per personality bible §5.1 and message-protocol.md.
 */

const MAX_RE_ENGAGEMENTS = 2;
const DEFAULT_IDLE_TIMEOUT_MS = 100_000; // ~100s midpoint of 90-120s range

export interface ReEngagementEvent {
  reEngagementCount: number;
}

export interface ReEngagementHandler {
  start(): void;
  onUserMessage(): void;
  onReEngagement(cb: (event: ReEngagementEvent) => void): void;
  dispose(): void;
}

export interface ReEngagementOptions {
  idleTimeoutMs?: number;
}

export function createReEngagementHandler(options?: ReEngagementOptions): ReEngagementHandler {
  const idleTimeoutMs = options?.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let reEngagementCount = 0;
  let listener: ((event: ReEngagementEvent) => void) | null = null;

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function scheduleNext(): void {
    clearTimer();
    if (reEngagementCount >= MAX_RE_ENGAGEMENTS) return;

    timer = setTimeout(() => {
      reEngagementCount++;
      listener?.({ reEngagementCount });
      scheduleNext();
    }, idleTimeoutMs);
  }

  return {
    start() {
      reEngagementCount = 0;
      scheduleNext();
    },

    onUserMessage() {
      reEngagementCount = 0;
      scheduleNext();
    },

    onReEngagement(cb) {
      listener = cb;
    },

    dispose() {
      clearTimer();
      listener = null;
    },
  };
}
