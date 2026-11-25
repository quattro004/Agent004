/**
 * Budget degradation (T071).
 *
 * The soft-degrade is text-only. There is no browser-TTS mode: browser speech
 * synthesis would itself breach P1's cloud-only rule, so spec 001 FR-016's
 * browser-TTS fallback is recorded as unmet rather than implemented
 * (research Q1, P-15). The degrade is announced once, in character.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createBudgetDegradation } from '../../src/services/budgetDegradation';

describe('createBudgetDegradation', () => {
  let budget: ReturnType<typeof createBudgetDegradation>;

  beforeEach(() => {
    budget = createBudgetDegradation();
  });

  it('starts in normal mode with nothing to announce', () => {
    expect(budget.getMode()).toBe('normal');
    expect(budget.takeAnnouncement()).toBeNull();
  });

  describe('soft-degrade', () => {
    it('goes text-only when the server answers voice off', () => {
      budget.onSessionVoice('off');
      expect(budget.getMode()).toBe('text_only');
    });

    it('stays normal while the server still answers voice on', () => {
      budget.onSessionVoice('on');
      expect(budget.getMode()).toBe('normal');
      expect(budget.takeAnnouncement()).toBeNull();
    });

    it('announces the degrade once, in character', () => {
      budget.onSessionVoice('off');
      const message = budget.takeAnnouncement();
      expect(message).toBeTruthy();
      expect(message!.toLowerCase()).toContain('signal');
      expect(message!.length).toBeGreaterThan(10);
    });

    it('does not announce the same degrade twice', () => {
      budget.onSessionVoice('off');
      budget.takeAnnouncement();
      expect(budget.takeAnnouncement()).toBeNull();
    });

    it('does not re-announce when later turns are still voice off', () => {
      budget.onSessionVoice('off');
      budget.takeAnnouncement();
      budget.onSessionVoice('off');
      expect(budget.takeAnnouncement()).toBeNull();
    });

    it('announces again if voice comes back and is lost a second time', () => {
      budget.onSessionVoice('off');
      budget.takeAnnouncement();
      budget.onSessionVoice('on');
      expect(budget.getMode()).toBe('normal');
      budget.onSessionVoice('off');
      expect(budget.takeAnnouncement()).toBeTruthy();
    });
  });

  describe('hard stop', () => {
    it('goes to hard_stop and never returns to text-only on its own', () => {
      budget.onHardStop();
      expect(budget.getMode()).toBe('hard_stop');
      budget.onSessionVoice('on');
      expect(budget.getMode()).toBe('hard_stop');
    });

    it('has no announcement of its own, because the overlay carries that copy', () => {
      budget.onHardStop();
      expect(budget.takeAnnouncement()).toBeNull();
    });
  });

  it('offers no browser-TTS mode', () => {
    budget.onSessionVoice('off');
    expect(budget.getMode()).not.toBe('browser_tts');
  });
});
