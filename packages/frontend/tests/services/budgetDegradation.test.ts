/**
 * Budget degradation handler tests.
 * T138: Verify browser TTS fallback wiring on budget soft-degrade.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createBudgetDegradation } from '../../src/services/budgetDegradation';

// Mock browserTts
vi.mock('../../src/services/browserTts', () => ({
  isAvailable: vi.fn(() => true),
}));

import { isAvailable } from '../../src/services/browserTts';
const mockIsAvailable = vi.mocked(isAvailable);

describe('createBudgetDegradation', () => {
  let budget: ReturnType<typeof createBudgetDegradation>;

  beforeEach(() => {
    budget = createBudgetDegradation();
    mockIsAvailable.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts in normal mode', () => {
    expect(budget.getMode()).toBe('normal');
  });

  describe('onBudgetCapped with softDegrade=true', () => {
    it('transitions to browser_tts mode when browser TTS is available', () => {
      mockIsAvailable.mockReturnValue(true);
      budget.onBudgetCapped(true);
      expect(budget.getMode()).toBe('browser_tts');
    });

    it('transitions to text_only mode when browser TTS is unavailable', () => {
      mockIsAvailable.mockReturnValue(false);
      budget.onBudgetCapped(true);
      expect(budget.getMode()).toBe('text_only');
    });
  });

  describe('onBudgetCapped with softDegrade=false', () => {
    it('transitions to hard_stop regardless of TTS availability', () => {
      mockIsAvailable.mockReturnValue(true);
      budget.onBudgetCapped(false);
      expect(budget.getMode()).toBe('hard_stop');
    });
  });

  describe('first fallback tracking', () => {
    it('isFirstFallback returns true on first call after entering browser_tts mode', () => {
      budget.onBudgetCapped(true);
      expect(budget.isFirstFallback()).toBe(true);
    });

    it('isFirstFallback returns false on subsequent calls', () => {
      budget.onBudgetCapped(true);
      budget.isFirstFallback(); // consume first
      expect(budget.isFirstFallback()).toBe(false);
    });

    it('isFirstFallback returns false when not in browser_tts mode', () => {
      expect(budget.isFirstFallback()).toBe(false);
    });
  });

  describe('getFirstFallbackMessage', () => {
    it('returns an in-character degradation message', () => {
      const msg = budget.getFirstFallbackMessage();
      expect(msg.toLowerCase()).toContain('signal');
      expect(msg.length).toBeGreaterThan(10);
    });
  });
});
