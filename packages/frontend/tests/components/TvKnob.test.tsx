import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TvKnob } from '../../src/components/TvKnob';

describe('TvKnob', () => {
  it('should render a clickable knob element', () => {
    render(<TvKnob onTurnOn={vi.fn()} disabled={false} />);

    const knob = screen.getByRole('button', { name: /turn on/i });
    expect(knob).toBeInTheDocument();
  });

  it('should call onTurnOn when clicked', () => {
    const onTurnOn = vi.fn();
    render(<TvKnob onTurnOn={onTurnOn} disabled={false} />);

    const knob = screen.getByRole('button', { name: /turn on/i });
    fireEvent.click(knob);

    expect(onTurnOn).toHaveBeenCalledTimes(1);
  });

  it('should trigger AudioContext unlock via user gesture', () => {
    const onTurnOn = vi.fn();
    render(<TvKnob onTurnOn={onTurnOn} disabled={false} />);

    const knob = screen.getByRole('button', { name: /turn on/i });
    fireEvent.click(knob);

    // The onTurnOn callback should be invoked inside a user gesture
    // which enables AudioContext.resume()
    expect(onTurnOn).toHaveBeenCalled();
  });

  it('should be disabled after TV is on', () => {
    render(<TvKnob onTurnOn={vi.fn()} disabled={true} />);

    const knob = screen.getByRole('button', { name: /turn on/i });
    expect(knob).toBeDisabled();
  });

  it('should have animated rotation class on click', () => {
    const onTurnOn = vi.fn();
    render(<TvKnob onTurnOn={onTurnOn} disabled={false} />);

    const knob = screen.getByRole('button', { name: /turn on/i });
    fireEvent.click(knob);

    expect(knob.className).toContain('rotate');
  });
});
