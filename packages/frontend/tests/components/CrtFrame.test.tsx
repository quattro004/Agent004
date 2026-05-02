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
});
