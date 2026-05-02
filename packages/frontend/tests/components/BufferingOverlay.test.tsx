import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BufferingOverlay } from '../../src/components/BufferingOverlay';

describe('BufferingOverlay', () => {
  it('renders nothing when neither connecting nor thinking', () => {
    const { container } = render(<BufferingOverlay isConnecting={false} isThinking={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows "Tuning in..." when connecting', () => {
    render(<BufferingOverlay isConnecting={true} isThinking={false} />);
    expect(screen.getByTestId('buffering-overlay')).toHaveTextContent('Tuning in...');
  });

  it('shows "Max is thinking..." when thinking', () => {
    render(<BufferingOverlay isConnecting={false} isThinking={true} />);
    expect(screen.getByTestId('buffering-overlay')).toHaveTextContent('Max is thinking...');
  });

  it('prioritizes connecting message over thinking', () => {
    render(<BufferingOverlay isConnecting={true} isThinking={true} />);
    expect(screen.getByTestId('buffering-overlay')).toHaveTextContent('Tuning in...');
  });
});
