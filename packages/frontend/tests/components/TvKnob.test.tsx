import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TvKnob } from '../../src/components/TvKnob';

describe('TvKnob', () => {
  it('should render a clickable button', () => {
    render(<TvKnob onToggle={vi.fn()} isOn={false} />);

    const knob = screen.getByRole('button', { name: /turn on/i });
    expect(knob).toBeInTheDocument();
    expect(knob).toBeEnabled();
  });

  it('should call onToggle when clicked', () => {
    const onToggle = vi.fn();
    render(<TvKnob onToggle={onToggle} isOn={false} />);

    const knob = screen.getByRole('button', { name: /turn on/i });
    fireEvent.click(knob);

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('should always be enabled regardless of isOn state', () => {
    const { rerender } = render(<TvKnob onToggle={vi.fn()} isOn={false} />);
    expect(screen.getByRole('button')).toBeEnabled();

    rerender(<TvKnob onToggle={vi.fn()} isOn={true} />);
    expect(screen.getByRole('button')).toBeEnabled();
  });

  it('should have aria-label "Turn off" when TV is on', () => {
    render(<TvKnob onToggle={vi.fn()} isOn={true} />);

    expect(screen.getByRole('button', { name: /turn off/i })).toBeInTheDocument();
  });

  it('should have aria-label "Turn on" when TV is off', () => {
    render(<TvKnob onToggle={vi.fn()} isOn={false} />);

    expect(screen.getByRole('button', { name: /turn on/i })).toBeInTheDocument();
  });

  it('should have "on" class when TV is on (no glow)', () => {
    render(<TvKnob onToggle={vi.fn()} isOn={true} />);

    const knob = screen.getByRole('button');
    expect(knob.className).toContain('on');
    expect(knob.className).not.toContain('rotate');
  });

  it('should not have "on" class when TV is off (shows glow)', () => {
    render(<TvKnob onToggle={vi.fn()} isOn={false} />);

    const knob = screen.getByRole('button');
    expect(knob.className).not.toContain('on');
    expect(knob.className).not.toContain('rotate');
  });

  it('should not rotate on click', () => {
    render(<TvKnob onToggle={vi.fn()} isOn={false} />);

    const knob = screen.getByRole('button');
    fireEvent.click(knob);

    expect(knob.className).not.toContain('rotate');
  });
});
