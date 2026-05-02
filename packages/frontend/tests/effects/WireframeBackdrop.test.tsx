import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock react-three/fiber since jsdom can't run WebGL
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="r3f-canvas">{children}</div>
  ),
  useFrame: vi.fn(),
}));

// Mock three.js geometries used in the component
vi.mock('three', () => ({
  BoxGeometry: vi.fn(),
  ConeGeometry: vi.fn(),
  IcosahedronGeometry: vi.fn(),
  EdgesGeometry: vi.fn(),
  Vector2: vi.fn(),
}));

describe('WireframeBackdrop', () => {
  it('should render a container with data-testid="wireframe-backdrop"', async () => {
    const { WireframeBackdrop } = await import('../../src/effects/WireframeBackdrop');
    render(<WireframeBackdrop isMobile={false} />);

    const container = screen.getByTestId('wireframe-backdrop');
    expect(container).toBeInTheDocument();
  });

  it('should accept an isMobile prop', async () => {
    const { WireframeBackdrop } = await import('../../src/effects/WireframeBackdrop');

    // Should not throw for either value
    const { unmount } = render(<WireframeBackdrop isMobile={true} />);
    expect(screen.getByTestId('wireframe-backdrop')).toBeInTheDocument();
    unmount();

    render(<WireframeBackdrop isMobile={false} />);
    expect(screen.getByTestId('wireframe-backdrop')).toBeInTheDocument();
  });
});
