import React from 'react';

export interface BroadcastTextProps {
  tokens: string[];
  fullText: string | null;
}

export function BroadcastText({ tokens, fullText }: BroadcastTextProps) {
  const displayText = fullText ?? tokens.join('');

  return (
    <div data-testid="broadcast-text" className="broadcast-text" aria-live="polite">
      {displayText}
    </div>
  );
}
