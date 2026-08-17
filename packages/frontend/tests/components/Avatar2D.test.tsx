import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Avatar2D } from '../../src/components/Avatar2D';

describe('Avatar2D', () => {
  it('should render an SVG element', () => {
    render(<Avatar2D isMouthOpen={false} />);

    const svg = screen.getByTestId('avatar-svg');
    expect(svg).toBeInTheDocument();
    expect(svg.tagName.toLowerCase()).toBe('svg');
  });

  it('should show mouth-closed path when isMouthOpen is false', () => {
    render(<Avatar2D isMouthOpen={false} />);

    const closedPath = screen.getByTestId('mouth-closed');
    expect(closedPath).toBeVisible();
  });

  it('should show mouth-open path when isMouthOpen is true', () => {
    render(<Avatar2D isMouthOpen={true} />);

    const openPath = screen.getByTestId('mouth-open');
    expect(openPath).toBeVisible();
  });

  it('should toggle between mouth states based on prop', () => {
    const { rerender } = render(<Avatar2D isMouthOpen={false} />);

    expect(screen.getByTestId('mouth-closed')).toBeVisible();

    rerender(<Avatar2D isMouthOpen={true} />);

    expect(screen.getByTestId('mouth-open')).toBeVisible();
  });
});
