import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VolumeKnob } from '../../src/components/VolumeKnob';

// Volume gain is 0–1; the knob exposes 12 discrete integer steps (0..11) — "these go to eleven".
// gain = step / 11.
const STEP = (n: number) => n / 11;

describe('VolumeKnob', () => {
  it('renders a button with aria-label "Volume"', () => {
    render(<VolumeKnob volume={STEP(5)} onVolumeChange={vi.fn()} disabled={false} />);
    expect(screen.getByRole('button', { name: /volume/i })).toBeInTheDocument();
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

  it('advances to the next step on click and emits gain = step/11', () => {
    const handleChange = vi.fn();
    render(<VolumeKnob volume={STEP(3)} onVolumeChange={handleChange} disabled={false} />);
    fireEvent.click(screen.getByRole('button', { name: /volume/i }));
    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith(STEP(4));
  });

  it('wraps from step 11 back to step 0', () => {
    const handleChange = vi.fn();
    render(<VolumeKnob volume={STEP(11)} onVolumeChange={handleChange} disabled={false} />);
    fireEvent.click(screen.getByRole('button', { name: /volume/i }));
    expect(handleChange).toHaveBeenCalledWith(0);
  });

  it('does not call onVolumeChange when disabled', () => {
    const handleChange = vi.fn();
    render(<VolumeKnob volume={STEP(3)} onVolumeChange={handleChange} disabled={true} />);
    fireEvent.click(screen.getByRole('button', { name: /volume/i }));
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('exposes step on aria-valuenow with max=11', () => {
    render(<VolumeKnob volume={STEP(7)} onVolumeChange={vi.fn()} disabled={false} />);
    const btn = screen.getByRole('button', { name: /volume/i });
    expect(btn.getAttribute('aria-valuemin')).toBe('0');
    expect(btn.getAttribute('aria-valuemax')).toBe('11');
    expect(btn.getAttribute('aria-valuenow')).toBe('7');
  });

  it('announces "one louder" via aria-valuetext at step 11', () => {
    render(<VolumeKnob volume={STEP(11)} onVolumeChange={vi.fn()} disabled={false} />);
    const btn = screen.getByRole('button', { name: /volume/i });
    expect(btn.getAttribute('aria-valuetext')).toMatch(/one louder/i);
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
