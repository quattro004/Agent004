import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CrtFrame } from '../../src/components/CrtFrame';

describe('CrtFrame', () => {
  it('should render the CRT bezel container', () => {
    render(<CrtFrame />);

    const bezel = screen.getByTestId('crt-bezel');
    expect(bezel).toBeInTheDocument();
    expect(bezel.className).toContain('crt-bezel');
  });

  it('should render children inside crt-screen', () => {
    render(
      <CrtFrame>
        <div data-testid="screen-content">Test Content</div>
      </CrtFrame>,
    );

    const content = screen.getByTestId('screen-content');
    expect(content).toBeInTheDocument();
    expect(content).toHaveTextContent('Test Content');
    // Children should be inside .crt-screen
    const screenEl = content.closest('.crt-screen');
    expect(screenEl).not.toBeNull();
  });

  it('should render the TV frame image with correct src and alt', () => {
    render(<CrtFrame />);

    const img = screen.getByTestId('crt-frame-image');
    expect(img).toBeInTheDocument();
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', '/TV-frame.png');
    expect(img).toHaveAttribute('alt', 'Retro CRT Television');
  });

  it('should render CRT scan-lines effect layer', () => {
    render(<CrtFrame />);

    expect(document.querySelector('.scan-lines')).not.toBeNull();
  });

  it('should NOT render a speaker grille element (image provides it)', () => {
    render(<CrtFrame />);

    expect(screen.queryByTestId('speaker-grille')).not.toBeInTheDocument();
  });

  it('should render bezel as viewport-filling container (no aspect-ratio constraint)', () => {
    render(<CrtFrame />);

    const bezel = screen.getByTestId('crt-bezel');
    // The bezel should NOT have inline aspect-ratio — relies on CSS class for full viewport fill
    expect(bezel.style.aspectRatio).toBe('');
    // No inline width/height constraints — CSS class handles viewport sizing
    expect(bezel.style.maxWidth).toBe('');
  });

  it('should render frame image that covers viewport (no inline object-fit override)', () => {
    render(<CrtFrame />);

    const img = screen.getByTestId('crt-frame-image');
    // Uses CSS class for object-fit: cover; no inline style override
    expect(img.style.objectFit).toBe('');
    expect(img).toHaveClass('crt-frame-image');
  });

  it('should render panel slot when provided', () => {
    render(<CrtFrame panel={<div data-testid="panel-content">Panel</div>} />);

    const panel = document.querySelector('.crt-panel');
    expect(panel).not.toBeNull();
    expect(screen.getByTestId('panel-content')).toBeInTheDocument();
  });

  it('should NOT render panel slot when not provided', () => {
    render(<CrtFrame />);

    const panel = document.querySelector('.crt-panel');
    expect(panel).toBeNull();
  });

  it('should render footer slot when provided', () => {
    render(<CrtFrame footer={<div data-testid="footer-content">Footer</div>} />);

    const footer = document.querySelector('.crt-footer-overlay');
    expect(footer).not.toBeNull();
    expect(screen.getByTestId('footer-content')).toBeInTheDocument();
  });

  it('should NOT render footer slot when not provided', () => {
    render(<CrtFrame />);

    const footer = document.querySelector('.crt-footer-overlay');
    expect(footer).toBeNull();
  });
});
