import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StaticNoise } from '../../src/components/StaticNoise';

describe('StaticNoise', () => {
  it('renders an SVG with data-testid="static-noise"', () => {
    render(<StaticNoise />);
    expect(screen.getByTestId('static-noise')).toBeInTheDocument();
  });

  it('renders an feTurbulence filter for animated noise', () => {
    const { container } = render(<StaticNoise />);
    const turbulence = container.querySelector('feTurbulence');
    expect(turbulence).not.toBeNull();
    expect(turbulence?.getAttribute('type')).toBe('fractalNoise');
  });

  it('animates the turbulence seed for continuous motion', () => {
    const { container } = render(<StaticNoise />);
    const animate = container.querySelector('feTurbulence animate');
    expect(animate).not.toBeNull();
    expect(animate?.getAttribute('attributeName')).toBe('seed');
  });

  it('carries the static-noise CSS class so existing styling applies', () => {
    render(<StaticNoise />);
    expect(screen.getByTestId('static-noise')).toHaveClass('static-noise');
  });

  it('is marked aria-hidden because it is purely decorative', () => {
    render(<StaticNoise />);
    expect(screen.getByTestId('static-noise')).toHaveAttribute('aria-hidden', 'true');
  });
});
