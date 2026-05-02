import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SessionStateOverlay } from '../../src/components/SessionStateOverlay';

describe('SessionStateOverlay', () => {
  it('renders nothing when state is null', () => {
    const { container } = render(<SessionStateOverlay state={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders sign-off message for ENDED state', () => {
    render(<SessionStateOverlay state="ENDED" />);
    expect(screen.getByTestId('session-state-overlay')).toHaveTextContent('signing off');
  });

  it('renders budget message for BUDGET_CAPPED state', () => {
    render(<SessionStateOverlay state="BUDGET_CAPPED" />);
    expect(screen.getByTestId('session-state-overlay')).toHaveTextContent('taking a break');
  });

  it('renders rate limit message for RATE_LIMITED state', () => {
    render(<SessionStateOverlay state="RATE_LIMITED" />);
    expect(screen.getByTestId('session-state-overlay')).toHaveTextContent('Slow d-down');
  });

  it('renders signal lost message for SIGNAL_LOST state', () => {
    render(<SessionStateOverlay state="SIGNAL_LOST" />);
    expect(screen.getByTestId('session-state-overlay')).toHaveTextContent('technical difficulties');
  });

  it('renders error message for ERROR state', () => {
    render(<SessionStateOverlay state="ERROR" />);
    expect(screen.getByTestId('session-state-overlay')).toHaveTextContent('Something went wrong');
  });
});
