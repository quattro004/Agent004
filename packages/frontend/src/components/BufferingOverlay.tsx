import React from 'react';

export interface BufferingOverlayProps {
  isConnecting: boolean;
  isThinking: boolean;
}

export function BufferingOverlay({ isConnecting, isThinking }: BufferingOverlayProps) {
  if (!isConnecting && !isThinking) return null;

  const message = isConnecting ? 'Tuning in...' : 'Max is thinking...';

  return (
    <div data-testid="buffering-overlay" className="buffering-overlay" aria-live="polite">
      <span className="buffering-message">{message}</span>
    </div>
  );
}
