import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VolumeKnob } from '../../src/components/VolumeKnob';

describe('VolumeKnob', () => {
  it('should render a button with aria-label "Volume"', () => {
    render(<VolumeKnob volume={0.5} onVolumeChange={vi.fn()} disabled={false} />);
    expect(screen.getByRole('button', { name: /volume/i })).toBeInTheDocument();
  });

  it('should call onVolumeChange when clicked', () => {
    const handleChange = vi.fn();
    render(<VolumeKnob volume={0.5} onVolumeChange={handleChange} disabled={false} />);
    fireEvent.click(screen.getByRole('button', { name: /volume/i }));
    expect(handleChange).toHaveBeenCalled();
  });

  it('should render a pointer indicator whose rotation reflects volume', () => {
    const { container } = render(
      <VolumeKnob volume={0.5} onVolumeChange={vi.fn()} disabled={false} />,
    );
    const pointer = container.querySelector('[data-testid="volume-pointer"]');
    expect(pointer).not.toBeNull();
    // Sweep is 270°, centred so 0 → -135°, 1 → +135°, 0.5 → 0°
    expect(pointer?.getAttribute('transform')).toContain('rotate(0');
  });

  it('should mark the indicator as dimmed when disabled', () => {
    const { container } = render(
      <VolumeKnob volume={0.5} onVolumeChange={vi.fn()} disabled={true} />,
    );
    const indicator = container.querySelector('[data-testid="volume-indicator"]');
    expect(indicator?.classList.contains('volume-indicator--dim')).toBe(true);
  });

  it('should be wrapped in a .volume-knob-wrapper for independent positioning', () => {
    const { container } = render(
      <VolumeKnob volume={0.5} onVolumeChange={vi.fn()} disabled={false} />,
    );
    const wrapper = container.querySelector('.volume-knob-wrapper');
    expect(wrapper).not.toBeNull();
    expect(wrapper?.querySelector('.volume-knob')).not.toBeNull();
  });
});
