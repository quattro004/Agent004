import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CrtFrame } from '../../src/components/CrtFrame';

describe('CrtFrame', () => {
  it('should render the CRT bezel container', () => {
    render(
      <CrtFrame>
        <div data-testid="screen-content">Test</div>
      </CrtFrame>,
    );

    const bezel = screen.getByTestId('crt-bezel');
    expect(bezel).toBeInTheDocument();
  });

  it('should render a screen slot for content', () => {
    render(
      <CrtFrame>
        <div data-testid="screen-content">Test Content</div>
      </CrtFrame>,
    );

    const content = screen.getByTestId('screen-content');
    expect(content).toBeInTheDocument();
    expect(content).toHaveTextContent('Test Content');
  });

  it('should apply CRT frame styling class', () => {
    render(
      <CrtFrame>
        <div>Content</div>
      </CrtFrame>,
    );

    const bezel = screen.getByTestId('crt-bezel');
    expect(bezel.className).toContain('crt');
  });

  it('should render panel content when panel prop is provided', () => {
    render(
      <CrtFrame panel={<button data-testid="panel-child">Power</button>}>
        <div>Screen</div>
      </CrtFrame>,
    );

    expect(screen.getByTestId('crt-panel')).toBeInTheDocument();
    expect(screen.getByTestId('panel-child')).toBeInTheDocument();
  });

  it('should render the TV frame image using the transparent-screen frame variant', () => {
    render(
      <CrtFrame>
        <div>Screen</div>
      </CrtFrame>,
    );

    const img = screen.getByTestId('crt-frame-image');
    expect(img).toBeInTheDocument();
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', '/TV-frame.png');
    expect(img).toHaveAttribute('alt', 'Retro CRT Television');
  });

  it('should NOT render a speaker grille element (image provides it)', () => {
    render(
      <CrtFrame panel={<button>Power</button>}>
        <div>Screen</div>
      </CrtFrame>,
    );

    expect(screen.queryByTestId('speaker-grille')).not.toBeInTheDocument();
  });

  it('should not render panel when panel prop is omitted', () => {
    render(
      <CrtFrame>
        <div>Screen</div>
      </CrtFrame>,
    );

    expect(screen.queryByTestId('crt-panel')).not.toBeInTheDocument();
  });

  it('should render footer as overlay on TV cabinet base, outside the screen', () => {
    render(
      <CrtFrame footer={<div data-testid="footer-content">Input Overlay</div>}>
        <div>Screen</div>
      </CrtFrame>,
    );

    const footer = screen.getByTestId('footer-content');
    expect(footer).toBeInTheDocument();
    expect(footer.textContent).toBe('Input Overlay');
    // Footer should be inside the bezel but NOT inside the screen
    const bezel = footer.closest('.crt-bezel');
    expect(bezel).not.toBeNull();
    const screenEl = footer.closest('.crt-screen');
    expect(screenEl).toBeNull();
    // Footer wrapper should have the overlay class
    const wrapper = screen.getByTestId('crt-footer-overlay');
    expect(wrapper.className).toContain('crt-footer-overlay');
  });

  it('should not render footer overlay when footer prop is omitted', () => {
    render(
      <CrtFrame>
        <div>Screen</div>
      </CrtFrame>,
    );

    expect(screen.queryByTestId('crt-footer-overlay')).not.toBeInTheDocument();
  });
});
