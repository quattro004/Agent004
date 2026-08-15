import React from 'react';
import { StaticNoise } from './StaticNoise';

export type OverlayState =
  'ENDED' | 'BUDGET_CAPPED' | 'RATE_LIMITED' | 'SIGNAL_LOST' | 'ERROR' | null;

export interface SessionStateOverlayProps {
  state: OverlayState;
}

const MESSAGES: Record<Exclude<OverlayState, null | 'SIGNAL_LOST'>, string> = {
  ENDED: "That's a wrap, folks. Max Height, signing off.",
  BUDGET_CAPPED: 'Max is taking a break — even digital stars need downtime.',
  RATE_LIMITED: "Slow d-down, speed demon! Even I can't talk that fast.",
  ERROR: 'Something went wrong behind the scenes. Try again shortly.',
};

function SignalLostOverlay() {
  return (
    <div
      data-testid="session-state-overlay"
      className="session-state-overlay signal-lost"
      role="alert"
    >
      {/* SMPTE color bars */}
      <div className="color-bars" aria-hidden="true" />

      <StaticNoise />
      <div className="standby-banner">
        <span className="standby-text">PLEASE STAND BY</span>
        <span className="standby-subtext">Max Is Off Air</span>
      </div>
    </div>
  );
}

export function SessionStateOverlay({ state }: SessionStateOverlayProps) {
  if (!state) return null;

  if (state === 'SIGNAL_LOST') {
    return <SignalLostOverlay />;
  }

  return (
    <div data-testid="session-state-overlay" className="session-state-overlay" role="alert">
      <span className="overlay-message">{MESSAGES[state]}</span>
    </div>
  );
}
