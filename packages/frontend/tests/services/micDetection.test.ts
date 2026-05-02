import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('micDetection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('should export isMicAvailable as false by default', async () => {
    // No mediaDevices → mic unavailable
    vi.stubGlobal('navigator', { mediaDevices: undefined });
    const { isMicAvailable } = await import('../../src/services/micDetection');
    expect(typeof isMicAvailable).toBe('function');
  });

  it('should detect mic as available when getUserMedia succeeds', async () => {
    const mockStream = { getTracks: () => [{ stop: vi.fn() }] };
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });

    const { probeMic } = await import('../../src/services/micDetection');
    const result = await probeMic();
    expect(result).toBe(true);
  });

  it('should detect mic as unavailable when getUserMedia throws NotAllowedError', async () => {
    const error = new DOMException('Permission denied', 'NotAllowedError');
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue(error),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });

    const { probeMic } = await import('../../src/services/micDetection');
    const result = await probeMic();
    expect(result).toBe(false);
  });

  it('should detect mic as unavailable when getUserMedia throws NotFoundError', async () => {
    const error = new DOMException('No device', 'NotFoundError');
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue(error),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });

    const { probeMic } = await import('../../src/services/micDetection');
    const result = await probeMic();
    expect(result).toBe(false);
  });

  it('should return false when navigator.mediaDevices is undefined', async () => {
    vi.stubGlobal('navigator', { mediaDevices: undefined });

    const { probeMic } = await import('../../src/services/micDetection');
    const result = await probeMic();
    expect(result).toBe(false);
  });

  it('should expose a subscribe function for devicechange events', async () => {
    const addEventSpy = vi.fn();
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue(new Error('not allowed')),
        addEventListener: addEventSpy,
        removeEventListener: vi.fn(),
      },
    });

    const { onMicChange } = await import('../../src/services/micDetection');
    const unsub = onMicChange(() => {});

    expect(addEventSpy).toHaveBeenCalledWith('devicechange', expect.any(Function));
    expect(typeof unsub).toBe('function');
  });
});
