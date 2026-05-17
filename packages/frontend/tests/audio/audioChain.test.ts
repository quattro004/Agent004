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
      createGain: vi.fn().mockReturnValue({
        gain: { value: 1, linearRampToValueAtTime: vi.fn(), setValueAtTime: vi.fn() },
        connect: vi.fn(),
      }),
      currentTime: 0,
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
      createGain: vi.fn().mockReturnValue({
        gain: { value: 1, linearRampToValueAtTime: vi.fn(), setValueAtTime: vi.fn() },
        connect: vi.fn(),
      }),
      currentTime: 0,
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
      createGain: vi.fn().mockReturnValue({
        gain: { value: 1, linearRampToValueAtTime: vi.fn(), setValueAtTime: vi.fn() },
        connect: vi.fn(),
      }),
      currentTime: 0,
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

  it('should be idempotent — multiple init() calls create only one AudioContext', async () => {
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
      createGain: vi.fn().mockReturnValue({
        gain: { value: 1, linearRampToValueAtTime: vi.fn(), setValueAtTime: vi.fn() },
        connect: vi.fn(),
      }),
      currentTime: 0,
      destination: {},
      close: vi.fn(),
    };

    const MockAudioWorkletNode = vi.fn().mockImplementation(() => ({
      connect: vi.fn(),
      port: { postMessage: vi.fn() },
    }));

    const audioContextCtor = vi.fn(() => mockAudioContext);
    vi.stubGlobal('AudioContext', audioContextCtor);
    vi.stubGlobal('AudioWorkletNode', MockAudioWorkletNode);

    const { createAudioChain } = await import('../../src/audio/audioChain');
    const chain = createAudioChain();
    await chain.init();
    await chain.init();
    await chain.init();

    expect(audioContextCtor).toHaveBeenCalledTimes(1);
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
      createGain: vi.fn().mockReturnValue({
        gain: { value: 1, linearRampToValueAtTime: vi.fn(), setValueAtTime: vi.fn() },
        connect: vi.fn(),
      }),
      currentTime: 0,
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

describe('audioChain — volume control', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function makeMockChain() {
    const gainParam = { value: 1, linearRampToValueAtTime: vi.fn(), setValueAtTime: vi.fn() };
    const gainNode = { gain: gainParam, connect: vi.fn() };
    const mockAnalyser = {
      fftSize: 0,
      frequencyBinCount: 128,
      getByteFrequencyData: vi.fn(),
      connect: vi.fn(),
    };
    const mockAudioContext = {
      currentTime: 0,
      resume: vi.fn().mockResolvedValue(undefined),
      audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
      createAnalyser: vi.fn().mockReturnValue(mockAnalyser),
      createGain: vi.fn().mockReturnValue(gainNode),
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
    return { gainParam, gainNode, mockAudioContext };
  }

  it('should expose a setVolume method', async () => {
    makeMockChain();
    const { createAudioChain } = await import('../../src/audio/audioChain');
    const chain = createAudioChain();
    expect(typeof chain.setVolume).toBe('function');
  });

  it('should create a GainNode during init', async () => {
    const { mockAudioContext } = makeMockChain();
    const { createAudioChain } = await import('../../src/audio/audioChain');
    const chain = createAudioChain();
    await chain.init();
    expect(mockAudioContext.createGain).toHaveBeenCalled();
  });

  it('should set the gain value when setVolume is called', async () => {
    const { gainParam } = makeMockChain();
    const { createAudioChain } = await import('../../src/audio/audioChain');
    const chain = createAudioChain();
    await chain.init();
    chain.setVolume(0);
    expect(gainParam.linearRampToValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
    chain.setVolume(1);
    expect(gainParam.linearRampToValueAtTime).toHaveBeenCalledWith(1, expect.any(Number));
  });

  it('should clamp setVolume input to [0, 1]', async () => {
    const { gainParam } = makeMockChain();
    const { createAudioChain } = await import('../../src/audio/audioChain');
    const chain = createAudioChain();
    await chain.init();
    chain.setVolume(-0.5);
    expect(gainParam.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, expect.any(Number));
    chain.setVolume(2.5);
    expect(gainParam.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, expect.any(Number));
  });

  it('should buffer setVolume calls made before init() resolves', async () => {
    const { gainParam } = makeMockChain();
    const { createAudioChain } = await import('../../src/audio/audioChain');
    const chain = createAudioChain();
    // Call before init — must not throw and must apply after init
    chain.setVolume(0.25);
    await chain.init();
    expect(gainParam.linearRampToValueAtTime).toHaveBeenCalledWith(0.25, expect.any(Number));
  });
});
