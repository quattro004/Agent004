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
    it('should default to retro theme', () => {
      render(<AvatarFrameCycler isMouthOpen={false} />);
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
    it('should show blink frame after scheduled delay', () => {
      // Math.random=0 → blink delay: 2000 + 0*2000 = 2000ms (fires before glitch at 3000ms)
      render(<AvatarFrameCycler isMouthOpen={false} />);

      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('src', '/avatar/retro/blink.png');
    });

    it('should return to idle after blink duration (300ms)', () => {
      render(<AvatarFrameCycler isMouthOpen={false} />);

      act(() => {
        vi.advanceTimersByTime(2000);
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
      // Engineer collision: glitch at 4000ms, blink at 4000ms
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.2) // glitch delay: 3000 + 0.2*5000 = 4000ms
        .mockReturnValueOnce(1) // blink delay: 2000 + 1*2000 = 4000ms
        .mockReturnValueOnce(0.5) // laugh delay (don't care)
        .mockReturnValueOnce(0.5) // side-eye delay (don't care)
        .mockReturnValueOnce(0) // glitch duration: 100 + 0*100 = 100ms
        .mockReturnValue(0.5); // subsequent

      render(<AvatarFrameCycler isMouthOpen={false} />);

      // Both fire at 4000ms — glitch should win
      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(screen.getByTestId('avatar-frame')).toHaveAttribute('data-frame', 'glitch');
    });

    it('should show blink after glitch ends when both were active', () => {
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.2) // glitch delay: 4000ms
        .mockReturnValueOnce(1) // blink delay: 4000ms (2000 + 1*2000)
        .mockReturnValueOnce(0.5) // laugh delay (don't care)
        .mockReturnValueOnce(0.5) // side-eye delay (don't care)
        .mockReturnValueOnce(0) // glitch duration: 100ms
        .mockReturnValue(0.5);

      render(<AvatarFrameCycler isMouthOpen={false} />);

      act(() => {
        vi.advanceTimersByTime(4000);
      });
      // Glitch ends at 4100ms, blink still active (ends at 4300ms with 300ms duration)
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
});
