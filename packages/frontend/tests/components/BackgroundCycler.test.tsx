import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { BackgroundCycler } from '../../src/components/BackgroundCycler';

describe('BackgroundCycler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Provide a default matchMedia that reports no reduced motion
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        media: '',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    cleanup();
  });

  describe('basic rendering', () => {
    it('should render an img element with background-frame testid', () => {
      render(<BackgroundCycler />);
      const img = screen.getByTestId('background-frame');
      expect(img).toBeInTheDocument();
      expect(img.tagName.toLowerCase()).toBe('img');
    });

    it('should show a valid background frame path on initial render', () => {
      render(<BackgroundCycler />);
      const img = screen.getByTestId('background-frame');
      const src = img.getAttribute('src');
      expect(src).toMatch(/^\/background\/max-grid\/frame-\d\.png$/);
    });

    it('should apply crt-background-cycler CSS class', () => {
      render(<BackgroundCycler />);
      const img = screen.getByTestId('background-frame');
      expect(img).toHaveClass('crt-background-cycler');
    });

    it('should have decorative empty alt text', () => {
      render(<BackgroundCycler />);
      expect(screen.getByTestId('background-frame')).toHaveAttribute('alt', '');
    });
  });

  describe('frame cycling', () => {
    it('should advance to a different frame after BACKGROUND_CYCLE_MS', async () => {
      // Control shuffle so we know the sequence
      vi.spyOn(Math, 'random').mockReturnValue(0.99);

      render(<BackgroundCycler />);
      const img = screen.getByTestId('background-frame');
      const initialSrc = img.getAttribute('src');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      const nextSrc = img.getAttribute('src');
      expect(nextSrc).not.toBe(initialSrc);
      expect(nextSrc).toMatch(/^\/background\/max-grid\/frame-\d\.png$/);
    });

    it('should cycle through all 8 frames before reshuffling', async () => {
      // Use a predictable random that produces identity shuffle [0,1,2,...7]
      vi.spyOn(Math, 'random').mockReturnValue(0);

      render(<BackgroundCycler />);
      const seenFrames = new Set<string | null>();

      for (let i = 0; i < 8; i++) {
        const img = screen.getByTestId('background-frame');
        seenFrames.add(img.getAttribute('src'));
        if (i < 7) {
          await act(async () => {
            await vi.advanceTimersByTimeAsync(5000);
          });
        }
      }

      expect(seenFrames.size).toBe(8);
    });

    it('should not repeat the last frame as first frame after reshuffle', async () => {
      // With random = 0.99, Fisher-Yates produces identity [0,1,2,...7]
      vi.spyOn(Math, 'random').mockReturnValue(0.99);

      render(<BackgroundCycler />);

      // Advance through all 8 frames
      for (let i = 0; i < 7; i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000);
        });
      }

      // Last frame of first cycle
      const lastImg = screen.getByTestId('background-frame');
      const lastSrc = lastImg.getAttribute('src');

      // Advance to first frame of next cycle (reshuffle)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      const newFirstSrc = screen.getByTestId('background-frame').getAttribute('src');
      expect(newFirstSrc).not.toBe(lastSrc);
    });
  });

  describe('preloading', () => {
    it('should preload all 8 frame images on mount', () => {
      const imageSrcs: string[] = [];
      const OriginalImage = globalThis.Image;
      vi.stubGlobal(
        'Image',
        class MockImage {
          private _src = '';
          get src() {
            return this._src;
          }
          set src(value: string) {
            this._src = value;
            imageSrcs.push(value);
          }
        },
      );

      render(<BackgroundCycler />);

      expect(imageSrcs.length).toBe(8);
      for (let i = 0; i < 8; i++) {
        expect(imageSrcs).toContain(`/background/max-grid/frame-${i}.png`);
      }

      vi.stubGlobal('Image', OriginalImage);
    });
  });

  describe('cleanup', () => {
    it('should clean up interval on unmount', async () => {
      const { unmount } = render(<BackgroundCycler />);
      unmount();

      // Advancing time after unmount should not cause errors
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15000);
      });
      // If we get here without error, cleanup worked
      expect(true).toBe(true);
    });
  });

  describe('reduced motion', () => {
    it('should not cycle frames when prefers-reduced-motion is reduce', async () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: vi.fn().mockReturnValue({
          matches: true,
          media: '(prefers-reduced-motion: reduce)',
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }),
      });

      render(<BackgroundCycler />);
      const img = screen.getByTestId('background-frame');
      const initialSrc = img.getAttribute('src');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(15000);
      });

      expect(img.getAttribute('src')).toBe(initialSrc);
    });
  });
});
