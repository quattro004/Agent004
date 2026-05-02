import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

describe('SpeechDisclosure', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    localStorage.clear();
  });

  it('should render with provider name when visible', async () => {
    const { SpeechDisclosure } = await import('../../src/components/SpeechDisclosure');
    render(<SpeechDisclosure provider="Google" visible={true} onDismiss={vi.fn()} />);

    expect(screen.getByText(/google/i)).toBeInTheDocument();
  });

  it('should not render when visible is false', async () => {
    const { SpeechDisclosure } = await import('../../src/components/SpeechDisclosure');
    const { container } = render(
      <SpeechDisclosure provider="Google" visible={false} onDismiss={vi.fn()} />,
    );

    expect(container.textContent).toBe('');
  });

  it('should call onDismiss when dismiss button is clicked', async () => {
    const onDismiss = vi.fn();
    const { SpeechDisclosure } = await import('../../src/components/SpeechDisclosure');
    render(<SpeechDisclosure provider="Apple" visible={true} onDismiss={onDismiss} />);

    const dismissBtn = screen.getByRole('button', { name: /dismiss|ok|got it/i });
    fireEvent.click(dismissBtn);

    expect(onDismiss).toHaveBeenCalled();
  });

  it('should display a message about speech recognition provider', async () => {
    const { SpeechDisclosure } = await import('../../src/components/SpeechDisclosure');
    render(<SpeechDisclosure provider="Apple" visible={true} onDismiss={vi.fn()} />);

    expect(screen.getByText(/speech recognition/i)).toBeInTheDocument();
    expect(screen.getByText(/apple/i)).toBeInTheDocument();
  });
});
