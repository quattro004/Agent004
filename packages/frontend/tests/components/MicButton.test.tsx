import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

describe('MicButton', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('should render with aria-label "Hold to talk"', async () => {
    const { MicButton } = await import('../../src/components/MicButton');
    render(<MicButton onStart={vi.fn()} onStop={vi.fn()} disabled={false} />);

    expect(screen.getByRole('button', { name: /hold to talk/i })).toBeInTheDocument();
  });

  it('should show ON AIR indicator on pointerdown', async () => {
    const { MicButton } = await import('../../src/components/MicButton');
    render(<MicButton onStart={vi.fn()} onStop={vi.fn()} disabled={false} />);

    const btn = screen.getByRole('button', { name: /hold to talk/i });
    fireEvent.pointerDown(btn);

    expect(screen.getByText(/on air/i)).toBeInTheDocument();
  });

  it('should call onStart on pointerdown', async () => {
    const onStart = vi.fn();
    const { MicButton } = await import('../../src/components/MicButton');
    render(<MicButton onStart={onStart} onStop={vi.fn()} disabled={false} />);

    fireEvent.pointerDown(screen.getByRole('button', { name: /hold to talk/i }));
    expect(onStart).toHaveBeenCalled();
  });

  it('should call onStop on pointerup', async () => {
    const onStop = vi.fn();
    const { MicButton } = await import('../../src/components/MicButton');
    render(<MicButton onStart={vi.fn()} onStop={onStop} disabled={false} />);

    const btn = screen.getByRole('button', { name: /hold to talk/i });
    fireEvent.pointerDown(btn);
    fireEvent.pointerUp(btn);

    expect(onStop).toHaveBeenCalled();
  });

  it('should hide ON AIR indicator on pointerup', async () => {
    const { MicButton } = await import('../../src/components/MicButton');
    render(<MicButton onStart={vi.fn()} onStop={vi.fn()} disabled={false} />);

    const btn = screen.getByRole('button', { name: /hold to talk/i });
    fireEvent.pointerDown(btn);
    expect(screen.getByText(/on air/i)).toBeInTheDocument();

    fireEvent.pointerUp(btn);
    expect(screen.queryByText(/on air/i)).not.toBeInTheDocument();
  });

  it('should not fire events when disabled', async () => {
    const onStart = vi.fn();
    const { MicButton } = await import('../../src/components/MicButton');
    render(<MicButton onStart={onStart} onStop={vi.fn()} disabled={true} />);

    const btn = screen.getByRole('button', { name: /hold to talk/i });
    fireEvent.pointerDown(btn);

    expect(onStart).not.toHaveBeenCalled();
  });
});
