import React from 'react';
import type { SearchSource } from '../stores/conversationStore';

export interface BroadcastTextProps {
  tokens: string[];
  fullText: string | null;
  sources?: SearchSource[];
}

function isWebLink(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

export function BroadcastText({ tokens, fullText, sources = [] }: BroadcastTextProps) {
  const displayText = fullText ?? tokens.join('');
  const links = sources.filter((source) => isWebLink(source.url));

  return (
    <div data-testid="broadcast-text" className="broadcast-text" aria-live="polite">
      {displayText}
      {links.length > 0 && (
        <ul className="broadcast-sources" aria-label="Sources">
          {links.map((source, index) => (
            <li key={`${index}-${source.url}`}>
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                {source.title || source.url}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
