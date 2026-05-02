import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createReEngagementHandler,
  ReEngagementHandler,
} from '../../src/handlers/reEngagement.js';

describe('reEngagement handler', () => {
  let handler: ReEngagementHandler;

  beforeEach(() => {
    vi.useFakeTimers();
    handler = createReEngagementHandler({ idleTimeoutMs: 100 });
  });

  afterEach(() => {
    handler.dispose();
    vi.useRealTimers();
  });

  it('fires a re-engagement event after idle timeout', () => {
    const onReEngage = vi.fn();
    handler.onReEngagement(onReEngage);
    handler.start();

    vi.advanceTimersByTime(100);

    expect(onReEngage).toHaveBeenCalledTimes(1);
    expect(onReEngage).toHaveBeenCalledWith(
      expect.objectContaining({ reEngagementCount: 1 }),
    );
  });

  it('fires a second re-engagement after another idle period', () => {
    const onReEngage = vi.fn();
    handler.onReEngagement(onReEngage);
    handler.start();

    vi.advanceTimersByTime(100); // 1st
    vi.advanceTimersByTime(100); // 2nd

    expect(onReEngage).toHaveBeenCalledTimes(2);
    expect(onReEngage).toHaveBeenLastCalledWith(
      expect.objectContaining({ reEngagementCount: 2 }),
    );
  });

  it('does not fire more than 2 re-engagements (max limit)', () => {
    const onReEngage = vi.fn();
    handler.onReEngagement(onReEngage);
    handler.start();

    vi.advanceTimersByTime(100); // 1st
    vi.advanceTimersByTime(100); // 2nd
    vi.advanceTimersByTime(100); // should NOT fire

    expect(onReEngage).toHaveBeenCalledTimes(2);
  });

  it('resets timer and count on user message', () => {
    const onReEngage = vi.fn();
    handler.onReEngagement(onReEngage);
    handler.start();

    vi.advanceTimersByTime(50); // half-way
    handler.onUserMessage(); // reset

    vi.advanceTimersByTime(50); // not enough after reset
    expect(onReEngage).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50); // now full timeout since reset
    expect(onReEngage).toHaveBeenCalledTimes(1);
  });

  it('resets reEngagementCount on user message', () => {
    const onReEngage = vi.fn();
    handler.onReEngagement(onReEngage);
    handler.start();

    vi.advanceTimersByTime(100); // 1st
    handler.onUserMessage(); // reset count

    vi.advanceTimersByTime(100); // fires again as count 1
    expect(onReEngage).toHaveBeenCalledTimes(2);
    expect(onReEngage).toHaveBeenLastCalledWith(
      expect.objectContaining({ reEngagementCount: 1 }),
    );
  });

  it('stops firing after dispose', () => {
    const onReEngage = vi.fn();
    handler.onReEngagement(onReEngage);
    handler.start();

    handler.dispose();
    vi.advanceTimersByTime(200);

    expect(onReEngage).not.toHaveBeenCalled();
  });

  it('uses configurable idle timeout', () => {
    const longHandler = createReEngagementHandler({ idleTimeoutMs: 500 });
    const onReEngage = vi.fn();
    longHandler.onReEngagement(onReEngage);
    longHandler.start();

    vi.advanceTimersByTime(400);
    expect(onReEngage).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(onReEngage).toHaveBeenCalledTimes(1);

    longHandler.dispose();
  });
});
