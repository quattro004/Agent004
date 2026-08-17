import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChannelKnob } from '../../src/components/ChannelKnob';

describe('ChannelKnob', () => {
  it('renders a channel button', () => {
    render(<ChannelKnob onChannelChange={vi.fn()} disabled={false} />);
    expect(screen.getByRole('button', { name: /channel/i })).toBeInTheDocument();
  });

  it('is wrapped in .channel-knob-wrapper containing the hit-area .channel-knob', () => {
    const { container } = render(<ChannelKnob onChannelChange={vi.fn()} disabled={false} />);
    const wrapper = container.querySelector('.channel-knob-wrapper');
    expect(wrapper).not.toBeNull();
    expect(wrapper?.querySelector('.channel-knob')).not.toBeNull();
  });

  it('calls onChannelChange when clicked', () => {
    const handleChange = vi.fn();
    render(<ChannelKnob onChannelChange={handleChange} disabled={false} />);
    fireEvent.click(screen.getByRole('button', { name: /channel/i }));
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('does not call onChannelChange when disabled', () => {
    const handleChange = vi.fn();
    render(<ChannelKnob onChannelChange={handleChange} disabled={true} />);
    fireEvent.click(screen.getByRole('button', { name: /channel/i }));
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('does not render any readout or LED element', () => {
    const { container } = render(<ChannelKnob onChannelChange={vi.fn()} disabled={false} />);
    expect(container.querySelector('.channel-readout')).toBeNull();
    expect(container.querySelector('.channel-led')).toBeNull();
  });
});
