import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('useIsMobile', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('should return true when matchMedia matches mobile query', async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });

    const { isMobileQuery } = await import('../../src/hooks/useIsMobile');
    expect(isMobileQuery()).toBe(true);
  });

  it('should return false on desktop viewport', async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });

    const { isMobileQuery } = await import('../../src/hooks/useIsMobile');
    expect(isMobileQuery()).toBe(false);
  });
});
