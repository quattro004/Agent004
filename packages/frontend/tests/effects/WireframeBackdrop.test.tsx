import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('WireframeBackdrop', () => {
  beforeEach(() => {
    vi.resetModules();
    // Default: no reduced motion
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  it('should render a container with data-testid="wireframe-backdrop"', async () => {
    const { WireframeBackdrop } = await import('../../src/effects/WireframeBackdrop');
    render(<WireframeBackdrop />);
    expect(screen.getByTestId('wireframe-backdrop')).toBeInTheDocument();
  });

  it('should contain the rays element for the sunburst pattern', async () => {
    const { WireframeBackdrop } = await import('../../src/effects/WireframeBackdrop');
    render(<WireframeBackdrop />);
    const backdrop = screen.getByTestId('wireframe-backdrop');
    expect(backdrop.querySelector('.wireframe-backdrop__rays')).not.toBeNull();
  });

  it('should set data-mobile attribute when isMobile is true', async () => {
    const { WireframeBackdrop } = await import('../../src/effects/WireframeBackdrop');
    render(<WireframeBackdrop isMobile={true} />);
    const backdrop = screen.getByTestId('wireframe-backdrop');
    expect(backdrop).toHaveAttribute('data-mobile', 'true');
  });

  it('should not set data-mobile attribute when isMobile is false', async () => {
    const { WireframeBackdrop } = await import('../../src/effects/WireframeBackdrop');
    render(<WireframeBackdrop isMobile={false} />);
    const backdrop = screen.getByTestId('wireframe-backdrop');
    expect(backdrop).not.toHaveAttribute('data-mobile');
  });

  it('should set data-reduced-motion when prefers-reduced-motion is active', async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    const { WireframeBackdrop } = await import('../../src/effects/WireframeBackdrop');
    render(<WireframeBackdrop />);
    const backdrop = screen.getByTestId('wireframe-backdrop');
    expect(backdrop).toHaveAttribute('data-reduced-motion', 'true');
  });

  it('should render glow overlay when motion is not reduced', async () => {
    const { WireframeBackdrop } = await import('../../src/effects/WireframeBackdrop');
    render(<WireframeBackdrop />);
    const backdrop = screen.getByTestId('wireframe-backdrop');
    expect(backdrop.querySelector('.wireframe-backdrop__glow')).not.toBeNull();
  });

  it('should NOT render glow overlay when motion is reduced', async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    const { WireframeBackdrop } = await import('../../src/effects/WireframeBackdrop');
    render(<WireframeBackdrop />);
    const backdrop = screen.getByTestId('wireframe-backdrop');
    expect(backdrop.querySelector('.wireframe-backdrop__glow')).toBeNull();
  });

  it('should add --static class when motion is reduced', async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    const { WireframeBackdrop } = await import('../../src/effects/WireframeBackdrop');
    render(<WireframeBackdrop />);
    const backdrop = screen.getByTestId('wireframe-backdrop');
    expect(backdrop.className).toContain('wireframe-backdrop--static');
  });
});
