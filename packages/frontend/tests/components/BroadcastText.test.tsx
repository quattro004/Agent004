import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BroadcastText } from '../../src/components/BroadcastText';

describe('BroadcastText', () => {
  it('renders tokens joined when fullText is null', () => {
    render(<BroadcastText tokens={['Hello', ' world']} fullText={null} />);
    expect(screen.getByTestId('broadcast-text')).toHaveTextContent('Hello world');
  });

  it('renders fullText when provided (overrides tokens)', () => {
    render(<BroadcastText tokens={['partial']} fullText="Complete response" />);
    expect(screen.getByTestId('broadcast-text')).toHaveTextContent('Complete response');
  });

  it('renders empty when no tokens and no fullText', () => {
    render(<BroadcastText tokens={[]} fullText={null} />);
    expect(screen.getByTestId('broadcast-text')).toHaveTextContent('');
  });

  it('links each web search source beside the reply, opening outside the app', () => {
    render(
      <BroadcastText
        tokens={[]}
        fullText="Here is the news."
        sources={[{ title: 'Example story', url: 'https://example.com/story' }]}
      />,
    );

    const link = screen.getByRole('link', { name: 'Example story' });
    expect(link).toHaveAttribute('href', 'https://example.com/story');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('never makes a link of a source that is not http or https', () => {
    render(
      <BroadcastText
        tokens={[]}
        fullText="Reply"
        sources={[{ title: 'Bad', url: 'javascript:alert(1)' }]}
      />,
    );

    expect(screen.queryByRole('link')).toBeNull();
  });
});
