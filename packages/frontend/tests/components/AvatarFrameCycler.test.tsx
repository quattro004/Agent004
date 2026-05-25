import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AvatarFrameCycler } from '../../src/components/AvatarFrameCycler';

describe('AvatarFrameCycler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('basic rendering', () => {
    it('should render an image with idle frame by default', () => {
      render(<AvatarFrameCycler isMouthOpen={false} />);
      const img = screen.getByTestId('avatar-frame');
      expect(img).toBeInTheDocument();
      expect(img.tagName.toLowerCase()).toBe('img');
      expect(img).toHaveAttribute('src', '/avatar/retro/idle.png');
    });

    it('should apply avatar-frame-cycler CSS class', () => {
      render(<AvatarFrameCycler isMouthOpen={false} />);
      expect(screen.getByTestId('avatar-frame')).toHaveClass('avatar-frame-cycler');
    });

    it('should have decorative empty alt text', () => {
      render(<AvatarFrameCycler isMouthOpen={false} />);
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('alt', '');
    });

    it('should expose current frame via data-frame attribute', () => {
      render(<AvatarFrameCycler isMouthOpen={false} />);
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('data-frame', 'idle');
    });
  });

  describe('theme support', () => {
    it('should default to the theme from config (DEFAULT_AVATAR_THEME)', () => {
      render(<AvatarFrameCycler isMouthOpen={false} />);
      // DEFAULT_AVATAR_THEME is 'retro' in real config
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('src', '/avatar/retro/idle.png');
    });

    it('should use pop-art theme when specified', () => {
      render(<AvatarFrameCycler isMouthOpen={false} theme="pop-art" />);
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('src', '/avatar/pop-art/idle.png');
    });

    it('should use cartoon theme when specified', () => {
      render(<AvatarFrameCycler isMouthOpen={false} theme="cartoon" />);
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('src', '/avatar/cartoon/idle.png');
    });
  });

  describe('talk animation', () => {
    it('should show talk-1 when isMouthOpen first becomes true', () => {
      const { rerender } = render(<AvatarFrameCycler isMouthOpen={false} />);
      rerender(<AvatarFrameCycler isMouthOpen={true} />);
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('src', '/avatar/retro/talk-1.png');
    });

    it('should alternate between talk-1 and talk-2 on successive mouth opens', () => {
      const { rerender } = render(<AvatarFrameCycler isMouthOpen={false} />);

      // First open → talk-1
      rerender(<AvatarFrameCycler isMouthOpen={true} />);
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('src', '/avatar/retro/talk-1.png');

      // Close then open → talk-2
      rerender(<AvatarFrameCycler isMouthOpen={false} />);
      rerender(<AvatarFrameCycler isMouthOpen={true} />);
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('src', '/avatar/retro/talk-2.png');

      // Close then open → talk-1 again
      rerender(<AvatarFrameCycler isMouthOpen={false} />);
      rerender(<AvatarFrameCycler isMouthOpen={true} />);
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('src', '/avatar/retro/talk-1.png');
    });

    it('should return to idle when isMouthOpen becomes false', () => {
      const { rerender } = render(<AvatarFrameCycler isMouthOpen={false} />);
      rerender(<AvatarFrameCycler isMouthOpen={true} />);
      rerender(<AvatarFrameCycler isMouthOpen={false} />);
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('src', '/avatar/retro/idle.png');
    });
  });

  describe('glitch effect', () => {
    it('should show glitch frame after scheduled delay', () => {
      // Math.random=0 → glitch delay: 3000 + 0*5000 = 3000ms
      render(<AvatarFrameCycler isMouthOpen={false} />);

      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('src', '/avatar/retro/idle.png');

      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('src', '/avatar/retro/glitch.png');
    });

    it('should return to base frame after glitch duration', () => {
      // Math.random=0 → glitch at 3000ms, duration 100ms
      render(<AvatarFrameCycler isMouthOpen={false} />);

      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('data-frame', 'glitch');

      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('data-frame', 'idle');
    });

    it('should return to talk frame after glitch ends during speech', () => {
      const { rerender } = render(<AvatarFrameCycler isMouthOpen={false} />);
      rerender(<AvatarFrameCycler isMouthOpen={true} />);

      // Glitch at 3000ms
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('data-frame', 'glitch');

      // Glitch ends at 3100ms → back to talk frame
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('data-frame', 'talk-1');
    });
  });

  describe('blink effect', () => {
    it('should show blink frame after scheduled delay (>=5s for calm cadence)', () => {
      // Math.random=0 → blink delay: 5000 + 0*4000 = 5000ms
      render(<AvatarFrameCycler isMouthOpen={false} />);

      // Should NOT have blinked yet at the OLD short delay
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.getByTestId('avatar-frame')).not.toHaveAttribute('data-frame', 'blink');

      // Glitch fires at 3000ms (100ms duration) — advance past it.
      act(() => {
        vi.advanceTimersByTime(1100);
      });

      // Now reach 5000ms total → blink fires.
      act(() => {
        vi.advanceTimersByTime(1900);
      });
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('src', '/avatar/retro/blink.png');
    });

    it('should return to idle after blink duration (300ms)', () => {
      render(<AvatarFrameCycler isMouthOpen={false} />);

      // Advance past glitch (3000+100ms) and to blink time (5000ms total)
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('data-frame', 'blink');

      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('data-frame', 'idle');
    });
  });

  describe('priority and collisions', () => {
    it('should show glitch over blink when both are active', () => {
      // Engineer collision at 5000ms with the slowed-down blink cadence.
      // glitch: 3000 + 0.4*5000 = 5000ms
      // blink:  5000 + 0*4000   = 5000ms
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.4) // glitch delay
        .mockReturnValueOnce(0) // blink delay
        .mockReturnValueOnce(0.5) // laugh delay (don't care)
        .mockReturnValueOnce(0.5) // side-eye delay (don't care)
        .mockReturnValueOnce(0) // glitch duration: 100ms
        .mockReturnValue(0.5); // subsequent

      render(<AvatarFrameCycler isMouthOpen={false} />);

      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('data-frame', 'glitch');
    });

    it('should show blink after glitch ends when both were active', () => {
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.4) // glitch delay: 5000ms
        .mockReturnValueOnce(0) // blink delay: 5000ms
        .mockReturnValueOnce(0.5) // laugh delay (don't care)
        .mockReturnValueOnce(0.5) // side-eye delay (don't care)
        .mockReturnValueOnce(0) // glitch duration: 100ms
        .mockReturnValue(0.5);

      render(<AvatarFrameCycler isMouthOpen={false} />);

      act(() => {
        vi.advanceTimersByTime(5000);
      });
      // Glitch ends at 5100ms; blink still active (ends at 5300ms).
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('data-frame', 'blink');
    });

    it('should show glitch over talk frame when speaking', () => {
      const { rerender } = render(<AvatarFrameCycler isMouthOpen={false} />);
      rerender(<AvatarFrameCycler isMouthOpen={true} />);

      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('data-frame', 'talk-1');

      // Glitch at 3000ms overrides talk
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('data-frame', 'glitch');
    });
  });

  describe('laugh expression', () => {
    it('should show laugh frame after scheduled delay when idle', () => {
      // With Math.random=0: laugh delay = 8000ms, but glitch fires at 3000ms (100ms),
      // blink at 4000ms (150ms), side-eye at 10000ms. Laugh at 8000ms.
      render(<AvatarFrameCycler isMouthOpen={false} />);

      // Advance past glitch (3000+100ms) and blink (4000+150ms)
      act(() => {
        vi.advanceTimersByTime(8000);
      });
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('data-frame', 'laugh');
    });

    it('should return to idle after laugh duration (800ms)', () => {
      render(<AvatarFrameCycler isMouthOpen={false} />);

      act(() => {
        vi.advanceTimersByTime(8000);
      });
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('data-frame', 'laugh');

      act(() => {
        vi.advanceTimersByTime(800);
      });
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('data-frame', 'idle');
    });
  });

  describe('side-eye expression', () => {
    it('should show side-eye frame after scheduled delay when idle', () => {
      // With Math.random=0: side-eye delay = 10000ms
      render(<AvatarFrameCycler isMouthOpen={false} />);

      act(() => {
        vi.advanceTimersByTime(10000);
      });
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('data-frame', 'side-eye');
    });

    it('should clear side-eye flag after side-eye duration (1200ms)', () => {
      // Note: we assert side-eye ENDS rather than asserting a specific
      // resting frame, because the periodic blink/glitch/laugh timers
      // continue to fire and may briefly overlay other frames after
      // side-eye ends. The behavior under test is the side-eye duration.
      render(<AvatarFrameCycler isMouthOpen={false} />);

      act(() => {
        vi.advanceTimersByTime(10000);
      });
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('data-frame', 'side-eye');

      act(() => {
        vi.advanceTimersByTime(1200);
      });
      expect(screen.getByTestId('avatar-frame')).not.toHaveAttribute('data-frame', 'side-eye');
    });

    it('should not show laugh or side-eye during talk (talk takes priority)', () => {
      const { rerender } = render(<AvatarFrameCycler isMouthOpen={false} />);
      rerender(<AvatarFrameCycler isMouthOpen={true} />);

      // Advance to laugh time
      act(() => {
        vi.advanceTimersByTime(8000);
      });
      // Talk should take priority over laugh
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('data-frame', 'talk-1');
    });
  });

  describe('cleanup', () => {
    it('should not throw when timers fire after unmount', () => {
      const { unmount } = render(<AvatarFrameCycler isMouthOpen={false} />);
      unmount();

      expect(() => {
        act(() => {
          vi.advanceTimersByTime(10000);
        });
      }).not.toThrow();
    });
  });

  describe('forceFrame override', () => {
    it('renders the forced frame regardless of internal state', () => {
      render(<AvatarFrameCycler isMouthOpen={false} forceFrame="glitch" />);
      const img = screen.getByTestId('avatar-frame');
      expect(img).toHaveAttribute('data-frame', 'glitch');
      expect(img).toHaveAttribute('src', '/avatar/retro/glitch.png');
    });

    it('forceFrame overrides talk frame even when mouth is open', () => {
      const { rerender } = render(<AvatarFrameCycler isMouthOpen={false} />);
      rerender(<AvatarFrameCycler isMouthOpen={true} forceFrame="glitch" />);
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('data-frame', 'glitch');
    });

    it('forceFrame overrides scheduled blink', () => {
      render(<AvatarFrameCycler isMouthOpen={false} forceFrame="idle" />);
      act(() => {
        vi.advanceTimersByTime(10000);
      });
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('data-frame', 'idle');
    });

    it('clearing forceFrame returns control to internal state', () => {
      const { rerender } = render(<AvatarFrameCycler isMouthOpen={false} forceFrame="glitch" />);
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('data-frame', 'glitch');
      rerender(<AvatarFrameCycler isMouthOpen={false} />);
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('data-frame', 'idle');
    });
  });
});
