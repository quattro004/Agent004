import React from 'react';

export type OverlayState =
  | 'ENDED'
  | 'BUDGET_CAPPED'
  | 'RATE_LIMITED'
  | 'SIGNAL_LOST'
  | 'ERROR'
  | null;

export interface SessionStateOverlayProps {
  state: OverlayState;
}

const MESSAGES: Record<Exclude<OverlayState, null>, string> = {
  ENDED: "That's a wrap, folks. Max Height, signing off.",
  BUDGET_CAPPED: 'Max is taking a break — even digital stars need downtime.',
  RATE_LIMITED: "Slow d-down, speed demon! Even I can't talk that fast.",
  SIGNAL_LOST: "We're experiencing t-technical difficulties. Please stand by.",
  ERROR: 'Something went wrong behind the scenes. Try again shortly.',
};

export function SessionStateOverlay({ state }: SessionStateOverlayProps) {
  if (!state) return null;

  return (
    <div data-testid="session-state-overlay" className="session-state-overlay" role="alert">
      <span className="overlay-message">{MESSAGES[state]}</span>
    </div>
  );
}
