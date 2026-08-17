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
});
