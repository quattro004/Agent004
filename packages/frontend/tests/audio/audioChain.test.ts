import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('audioChain — iOS AudioContext unlock', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should call AudioContext.resume() during init for iOS unlock', async () => {
    const resumeMock = vi.fn().mockResolvedValue(undefined);
    const mockAnalyser = {
      fftSize: 0,
      frequencyBinCount: 128,
      getByteFrequencyData: vi.fn(),
      connect: vi.fn(),
    };
    const mockAudioContext = {
      resume: resumeMock,
      audioWorklet: {
        addModule: vi.fn().mockResolvedValue(undefined),
      },
      createAnalyser: vi.fn().mockReturnValue(mockAnalyser),
      destination: {},
      close: vi.fn(),
    };

    const MockAudioWorkletNode = vi.fn().mockImplementation(() => ({
      connect: vi.fn(),
      port: { postMessage: vi.fn() },
    }));

    vi.stubGlobal(
      'AudioContext',
      vi.fn(() => mockAudioContext),
    );
    vi.stubGlobal('AudioWorkletNode', MockAudioWorkletNode);

    const { createAudioChain } = await import('../../src/audio/audioChain');
    const chain = createAudioChain();
    await chain.init();

    expect(resumeMock).toHaveBeenCalled();
  });

  it('should register a visibilitychange handler for iOS Safari audio routing', async () => {
    const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
    const mockAnalyser = {
      fftSize: 0,
      frequencyBinCount: 128,
      getByteFrequencyData: vi.fn(),
      connect: vi.fn(),
    };
    const mockAudioContext = {
      resume: vi.fn().mockResolvedValue(undefined),
      audioWorklet: {
        addModule: vi.fn().mockResolvedValue(undefined),
      },
      createAnalyser: vi.fn().mockReturnValue(mockAnalyser),
      destination: {},
      close: vi.fn(),
    };

    const MockAudioWorkletNode = vi.fn().mockImplementation(() => ({
      connect: vi.fn(),
      port: { postMessage: vi.fn() },
    }));

    vi.stubGlobal(
      'AudioContext',
      vi.fn(() => mockAudioContext),
    );
    vi.stubGlobal('AudioWorkletNode', MockAudioWorkletNode);

    const { createAudioChain } = await import('../../src/audio/audioChain');
    const chain = createAudioChain();
    await chain.init();

    expect(addEventListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });

  it('should resume AudioContext when page becomes visible again', async () => {
    const resumeMock = vi.fn().mockResolvedValue(undefined);
    let visibilityHandler: (() => void) | null = null;

    vi.spyOn(document, 'addEventListener').mockImplementation((event: string, handler: unknown) => {
      if (event === 'visibilitychange') {
        visibilityHandler = handler as () => void;
      }
    });

    const mockAnalyser = {
      fftSize: 0,
      frequencyBinCount: 128,
      getByteFrequencyData: vi.fn(),
      connect: vi.fn(),
    };
    const mockAudioContext = {
      resume: resumeMock,
      state: 'suspended' as const,
      audioWorklet: {
        addModule: vi.fn().mockResolvedValue(undefined),
      },
      createAnalyser: vi.fn().mockReturnValue(mockAnalyser),
      destination: {},
      close: vi.fn(),
    };

    const MockAudioWorkletNode = vi.fn().mockImplementation(() => ({
      connect: vi.fn(),
      port: { postMessage: vi.fn() },
    }));

    vi.stubGlobal(
      'AudioContext',
      vi.fn(() => mockAudioContext),
    );
    vi.stubGlobal('AudioWorkletNode', MockAudioWorkletNode);

    const { createAudioChain } = await import('../../src/audio/audioChain');
    const chain = createAudioChain();
    await chain.init();

    resumeMock.mockClear();

    // Simulate page becoming visible
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
    });
    visibilityHandler?.();

    expect(resumeMock).toHaveBeenCalled();
  });

  it('should remove visibilitychange handler on dispose', async () => {
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
    const mockAnalyser = {
      fftSize: 0,
      frequencyBinCount: 128,
      getByteFrequencyData: vi.fn(),
      connect: vi.fn(),
    };
    const mockAudioContext = {
      resume: vi.fn().mockResolvedValue(undefined),
      audioWorklet: {
        addModule: vi.fn().mockResolvedValue(undefined),
      },
      createAnalyser: vi.fn().mockReturnValue(mockAnalyser),
      destination: {},
      close: vi.fn(),
    };

    const MockAudioWorkletNode = vi.fn().mockImplementation(() => ({
      connect: vi.fn(),
      port: { postMessage: vi.fn() },
    }));

    vi.stubGlobal(
      'AudioContext',
      vi.fn(() => mockAudioContext),
    );
    vi.stubGlobal('AudioWorkletNode', MockAudioWorkletNode);

    const { createAudioChain } = await import('../../src/audio/audioChain');
    const chain = createAudioChain();
    await chain.init();
    chain.dispose();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });
});
