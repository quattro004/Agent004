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

  it('should reflect volume level via rotation style', () => {
    render(<VolumeKnob volume={0.75} onVolumeChange={vi.fn()} disabled={false} />);
    const knob = screen.getByRole('button', { name: /volume/i });
    expect(knob.style.transform).toContain('rotate');
  });

  it('should not call onVolumeChange when disabled', () => {
    const handleChange = vi.fn();
    render(<VolumeKnob volume={0.5} onVolumeChange={handleChange} disabled={true} />);
    fireEvent.click(screen.getByRole('button', { name: /volume/i }));
    expect(handleChange).not.toHaveBeenCalled();
  });
});
