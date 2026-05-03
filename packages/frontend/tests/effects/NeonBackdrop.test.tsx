import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NeonBackdrop } from '../../src/effects/NeonBackdrop';

describe('NeonBackdrop', () => {
  it('should render a container with data-testid="neon-backdrop"', () => {
    render(<NeonBackdrop />);
    expect(screen.getByTestId('neon-backdrop')).toBeInTheDocument();
  });

  it('should contain stripe layer elements', () => {
    render(<NeonBackdrop />);
    const container = screen.getByTestId('neon-backdrop');
    const stripes = container.querySelector('.neon-stripes');
    expect(stripes).not.toBeNull();
  });

  it('should accept an isMobile prop without error', () => {
    const { unmount } = render(<NeonBackdrop isMobile={true} />);
    expect(screen.getByTestId('neon-backdrop')).toBeInTheDocument();
    unmount();

    render(<NeonBackdrop isMobile={false} />);
    expect(screen.getByTestId('neon-backdrop')).toBeInTheDocument();
  });
});
