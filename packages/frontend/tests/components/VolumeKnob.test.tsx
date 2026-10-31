import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, createEvent } from '@testing-library/react';
import { VolumeKnob } from '../../src/components/VolumeKnob';

// Volume gain is 0–1; the knob exposes 12 discrete integer steps (0..11) — "these go to eleven".
// gain = step / 11.
const STEP = (n: number) => n / 11;

describe('VolumeKnob', () => {
  it('renders distinct volume up and down controls', () => {
    render(<VolumeKnob volume={STEP(5)} onVolumeChange={vi.fn()} disabled={false} />);
    expect(screen.getByRole('button', { name: 'Volume down' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volume up' })).toBeInTheDocument();
  });

  it('renders exactly 11 LED segments', () => {
    const { container } = render(
      <VolumeKnob volume={STEP(5)} onVolumeChange={vi.fn()} disabled={false} />,
    );
    expect(container.querySelectorAll('.volume-led')).toHaveLength(11);
  });

  it('lights N LEDs for step N (volume = N/11)', () => {
    const { container } = render(
      <VolumeKnob volume={STEP(7)} onVolumeChange={vi.fn()} disabled={false} />,
    );
    expect(container.querySelectorAll('.volume-led--lit')).toHaveLength(7);
    expect(container.querySelectorAll('.volume-led--dim')).toHaveLength(4);
  });

  it('lights all 11 LEDs at max and marks the 11th with --max', () => {
    const { container } = render(
      <VolumeKnob volume={STEP(11)} onVolumeChange={vi.fn()} disabled={false} />,
    );
    const leds = container.querySelectorAll('.volume-led');
    expect(container.querySelectorAll('.volume-led--lit')).toHaveLength(11);
    expect(leds[10].classList.contains('volume-led--max')).toBe(true);
    // Earlier LEDs are lit but not max-styled
    expect(leds[9].classList.contains('volume-led--max')).toBe(false);
  });

  it('dims all LEDs (no --lit) when disabled', () => {
    const { container } = render(
      <VolumeKnob volume={STEP(7)} onVolumeChange={vi.fn()} disabled={true} />,
    );
    expect(container.querySelectorAll('.volume-led--lit')).toHaveLength(0);
    expect(container.querySelectorAll('.volume-led--dim')).toHaveLength(11);
  });

  it('raises one step from the right half and emits gain = step/11', () => {
    const handleChange = vi.fn();
    render(<VolumeKnob volume={STEP(3)} onVolumeChange={handleChange} disabled={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Volume up' }));
    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith(STEP(4));
  });

  it('lowers one step from the left half', () => {
    const handleChange = vi.fn();
    render(<VolumeKnob volume={STEP(3)} onVolumeChange={handleChange} disabled={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Volume down' }));
    expect(handleChange).toHaveBeenCalledExactlyOnceWith(STEP(2));
  });

  it('does not notify when raising at maximum', () => {
    const handleChange = vi.fn();
    render(<VolumeKnob volume={STEP(11)} onVolumeChange={handleChange} disabled={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Volume up' }));
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('does not notify when lowering at zero', () => {
    const handleChange = vi.fn();
    render(<VolumeKnob volume={0} onVolumeChange={handleChange} disabled={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Volume down' }));
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('does not call onVolumeChange when disabled', () => {
    const handleChange = vi.fn();
    render(<VolumeKnob volume={STEP(3)} onVolumeChange={handleChange} disabled={true} />);
    expect(screen.getByRole('button', { name: 'Volume up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Volume down' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Volume up' }));
    expect(handleChange).not.toHaveBeenCalled();
  });

  it.each([
    ['ArrowUp', 4],
    ['ArrowRight', 4],
    ['ArrowDown', 2],
    ['ArrowLeft', 2],
    ['Home', 0],
    ['End', 11],
  ])('maps %s to volume step %s', (key, expectedStep) => {
    const handleChange = vi.fn();
    render(<VolumeKnob volume={STEP(3)} onVolumeChange={handleChange} disabled={false} />);
    const group = screen.getByRole('group', { name: 'Volume' });
    const event = createEvent.keyDown(group, { key });
    fireEvent(group, event);
    expect(handleChange).toHaveBeenCalledExactlyOnceWith(STEP(expectedStep));
    expect(event.defaultPrevented).toBe(true);
  });

  it('ignores unrelated keys', () => {
    const handleChange = vi.fn();
    render(<VolumeKnob volume={STEP(3)} onVolumeChange={handleChange} disabled={false} />);
    const group = screen.getByRole('group', { name: 'Volume' });
    const event = createEvent.keyDown(group, { key: 'Escape' });
    fireEvent(group, event);
    expect(handleChange).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('changes volume by wheel direction and ignores a zero delta', () => {
    const handleChange = vi.fn();
    render(<VolumeKnob volume={STEP(3)} onVolumeChange={handleChange} disabled={false} />);
    const group = screen.getByRole('group', { name: 'Volume' });
    fireEvent.wheel(group, { deltaY: -100 });
    fireEvent.wheel(group, { deltaY: 0 });
    fireEvent.wheel(group, { deltaY: 100 });
    expect(handleChange.mock.calls).toEqual([[STEP(4)], [STEP(2)]]);
  });

  it('ignores keyboard and wheel input while disabled', () => {
    const handleChange = vi.fn();
    render(<VolumeKnob volume={STEP(3)} onVolumeChange={handleChange} disabled={true} />);
    const group = screen.getByRole('group', { name: 'Volume' });
    fireEvent.keyDown(group, { key: 'ArrowUp' });
    fireEvent.wheel(group, { deltaY: -100 });
    expect(handleChange).not.toHaveBeenCalled();
    expect(group).toHaveAttribute('tabindex', '-1');
  });

  it('keeps the group focusable for keyboard control', () => {
    render(<VolumeKnob volume={STEP(3)} onVolumeChange={vi.fn()} disabled={false} />);
    expect(screen.getByRole('group', { name: 'Volume' })).toHaveAttribute('tabindex', '0');
  });

  it('exposes step on aria-valuenow with max=11', () => {
    render(<VolumeKnob volume={STEP(7)} onVolumeChange={vi.fn()} disabled={false} />);
    const btn = screen.getByRole('group', { name: 'Volume' });
    expect(btn.getAttribute('aria-valuemin')).toBe('0');
    expect(btn.getAttribute('aria-valuemax')).toBe('11');
    expect(btn.getAttribute('aria-valuenow')).toBe('7');
  });

  it('announces "one louder" via aria-valuetext at step 11', () => {
    render(<VolumeKnob volume={STEP(11)} onVolumeChange={vi.fn()} disabled={false} />);
    const btn = screen.getByRole('group', { name: 'Volume' });
    expect(btn.getAttribute('aria-valuetext')).toMatch(/one louder/i);
  });

  it('positions the indicator from the bottom-left off marker to the right-side max marker', () => {
    const { container, rerender } = render(
      <VolumeKnob volume={0} onVolumeChange={vi.fn()} disabled={false} />,
    );
    const indicator = container.querySelector('.volume-knob-indicator');
    expect(indicator).toHaveStyle({ '--knob-angle': '-235deg' });
    rerender(<VolumeKnob volume={1} onVolumeChange={vi.fn()} disabled={false} />);
    expect(indicator).toHaveStyle({ '--knob-angle': '45deg' });
  });

  it('is wrapped in .volume-knob-wrapper containing the hit-area .volume-knob', () => {
    const { container } = render(
      <VolumeKnob volume={STEP(5)} onVolumeChange={vi.fn()} disabled={false} />,
    );
    const wrapper = container.querySelector('.volume-knob-wrapper');
    expect(wrapper).not.toBeNull();
    expect(wrapper?.querySelector('.volume-knob')).not.toBeNull();
    expect(wrapper?.querySelector('.volume-led-bar')).not.toBeNull();
  });
});
