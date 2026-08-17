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

  it('renders error message for ERROR state', () => {
    render(<SessionStateOverlay state="ERROR" />);
    expect(screen.getByTestId('session-state-overlay')).toHaveTextContent('Something went wrong');
  });

  describe('SIGNAL_LOST – retro TV off-air experience', () => {
    it('renders animated static noise SVG with feTurbulence', () => {
      const { container } = render(<SessionStateOverlay state="SIGNAL_LOST" />);
      const turbulence = container.querySelector('feTurbulence');
      expect(turbulence).not.toBeNull();
    });

    it('renders SMPTE color bars', () => {
      const { container } = render(<SessionStateOverlay state="SIGNAL_LOST" />);
      const colorBars = container.querySelector('.color-bars');
      expect(colorBars).not.toBeNull();
    });

    it('renders PLEASE STAND BY and Max Is Off Air text', () => {
      render(<SessionStateOverlay state="SIGNAL_LOST" />);
      expect(screen.getByTestId('session-state-overlay')).toHaveTextContent('PLEASE STAND BY');
      expect(screen.getByTestId('session-state-overlay')).toHaveTextContent('Max Is Off Air');
    });

    it('preserves the data-testid for integration tests', () => {
      render(<SessionStateOverlay state="SIGNAL_LOST" />);
      expect(screen.getByTestId('session-state-overlay')).toBeInTheDocument();
    });

    it('has the signal-lost CSS class for styling', () => {
      render(<SessionStateOverlay state="SIGNAL_LOST" />);
      expect(screen.getByTestId('session-state-overlay')).toHaveClass('signal-lost');
    });
  });
});
