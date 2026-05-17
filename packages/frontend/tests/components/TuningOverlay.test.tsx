import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TuningOverlay } from '../../src/components/TuningOverlay';

describe('TuningOverlay', () => {
  it('renders nothing when visible is false', () => {
    const { container } = render(<TuningOverlay visible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a full-screen overlay containing the static noise when visible', () => {
    render(<TuningOverlay visible={true} />);
    const overlay = screen.getByTestId('tuning-overlay');
    expect(overlay).toBeInTheDocument();
    // The static noise SVG is the visible "snow" effect.
    expect(screen.getByTestId('static-noise')).toBeInTheDocument();
  });

  it('carries the tuning-overlay CSS class for positioning', () => {
    render(<TuningOverlay visible={true} />);
    expect(screen.getByTestId('tuning-overlay')).toHaveClass('tuning-overlay');
  });

  it('is announced as a status region for assistive tech', () => {
    render(<TuningOverlay visible={true} />);
    expect(screen.getByTestId('tuning-overlay')).toHaveAttribute('role', 'status');
  });
});
