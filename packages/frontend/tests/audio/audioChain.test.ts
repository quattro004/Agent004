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

    const MockAudioWorkletNode = vi.fn(function () {
      return {
        connect: vi.fn(),
        port: { postMessage: vi.fn() },
      };
    });

    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        return mockAudioContext;
      }),
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

    const MockAudioWorkletNode = vi.fn(function () {
      return { connect: vi.fn(), port: { postMessage: vi.fn() } };
    });

    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        return mockAudioContext;
      }),
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

    const MockAudioWorkletNode = vi.fn(function () {
      return { connect: vi.fn(), port: { postMessage: vi.fn() } };
    });

    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        return mockAudioContext;
      }),
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

    const MockAudioWorkletNode = vi.fn(function () {
      return { connect: vi.fn(), port: { postMessage: vi.fn() } };
    });

    const audioContextCtor = vi.fn(function () {
      return mockAudioContext;
    });
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

    const MockAudioWorkletNode = vi.fn(function () {
      return { connect: vi.fn(), port: { postMessage: vi.fn() } };
    });

    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        return mockAudioContext;
      }),
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
    const MockAudioWorkletNode = vi.fn(function () {
      return { connect: vi.fn(), port: { postMessage: vi.fn() } };
    });
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        return mockAudioContext;
      }),
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

describe('audioChain — static noise (tune-in)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function makeMockChainWithBuffers() {
    const gainParam = { value: 1, linearRampToValueAtTime: vi.fn(), setValueAtTime: vi.fn() };
    const gainNode = { gain: gainParam, connect: vi.fn() };
    const mockAnalyser = {
      fftSize: 0,
      frequencyBinCount: 128,
      getByteFrequencyData: vi.fn(),
      connect: vi.fn(),
    };
    const noiseSource = {
      buffer: null as AudioBuffer | null,
      loop: false,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as null | (() => void),
    };
    const sampleData = new Float32Array(44100);
    const noiseBuffer = {
      length: 44100,
      sampleRate: 44100,
      numberOfChannels: 1,
      getChannelData: vi.fn(() => sampleData),
    };
    const mockAudioContext = {
      currentTime: 0,
      sampleRate: 44100,
      resume: vi.fn().mockResolvedValue(undefined),
      audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
      createAnalyser: vi.fn().mockReturnValue(mockAnalyser),
      createGain: vi.fn().mockReturnValue(gainNode),
      createBuffer: vi.fn().mockReturnValue(noiseBuffer),
      createBufferSource: vi.fn().mockReturnValue(noiseSource),
      destination: {},
      close: vi.fn(),
    };
    const MockAudioWorkletNode = vi.fn(function () {
      return { connect: vi.fn(), port: { postMessage: vi.fn() } };
    });
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        return mockAudioContext;
      }),
    );
    vi.stubGlobal('AudioWorkletNode', MockAudioWorkletNode);
    return { gainNode, noiseSource, noiseBuffer, sampleData, mockAudioContext };
  }

  it('exposes playStatic and stopStatic methods', async () => {
    makeMockChainWithBuffers();
    const { createAudioChain } = await import('../../src/audio/audioChain');
    const chain = createAudioChain();
    expect(typeof chain.playStatic).toBe('function');
    expect(typeof chain.stopStatic).toBe('function');
  });

  it('creates an AudioBuffer filled with non-zero noise samples', async () => {
    const { mockAudioContext, sampleData } = makeMockChainWithBuffers();
    const { createAudioChain } = await import('../../src/audio/audioChain');
    const chain = createAudioChain();
    await chain.init();
    chain.playStatic(3000);
    expect(mockAudioContext.createBuffer).toHaveBeenCalled();
    // The implementation must populate channel data with random noise
    const nonZero = Array.from(sampleData).some((v) => v !== 0);
    expect(nonZero).toBe(true);
  });

  it('routes the noise source through the gain node (so volume knob applies)', async () => {
    const { gainNode, noiseSource } = makeMockChainWithBuffers();
    const { createAudioChain } = await import('../../src/audio/audioChain');
    const chain = createAudioChain();
    await chain.init();
    chain.playStatic(3000);
    expect(noiseSource.start).toHaveBeenCalled();
    expect(noiseSource.connect).toHaveBeenCalledWith(gainNode);
  });

  it('loops the buffer so a short sample fills the full duration', async () => {
    const { noiseSource } = makeMockChainWithBuffers();
    const { createAudioChain } = await import('../../src/audio/audioChain');
    const chain = createAudioChain();
    await chain.init();
    chain.playStatic(3000);
    expect(noiseSource.loop).toBe(true);
  });

  it('automatically stops the noise source after durationMs', async () => {
    vi.useFakeTimers();
    const { noiseSource } = makeMockChainWithBuffers();
    const { createAudioChain } = await import('../../src/audio/audioChain');
    const chain = createAudioChain();
    await chain.init();
    chain.playStatic(3000);
    expect(noiseSource.stop).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(noiseSource.stop).toHaveBeenCalled();
  });

  it('keeps playing static until stopStatic is called when no duration is provided', async () => {
    vi.useFakeTimers();
    const { noiseSource } = makeMockChainWithBuffers();
    const { createAudioChain } = await import('../../src/audio/audioChain');
    const chain = createAudioChain();
    await chain.init();
    chain.playStatic();
    vi.advanceTimersByTime(5000);
    expect(noiseSource.stop).not.toHaveBeenCalled();
    chain.stopStatic();
    expect(noiseSource.stop).toHaveBeenCalledTimes(1);
  });

  it('stopStatic stops the noise source immediately and cancels the auto-stop timer', async () => {
    vi.useFakeTimers();
    const { noiseSource } = makeMockChainWithBuffers();
    const { createAudioChain } = await import('../../src/audio/audioChain');
    const chain = createAudioChain();
    await chain.init();
    chain.playStatic(3000);
    chain.stopStatic();
    expect(noiseSource.stop).toHaveBeenCalledTimes(1);
    // Advance past the would-be auto-stop time — must not call stop again
    vi.advanceTimersByTime(5000);
    expect(noiseSource.stop).toHaveBeenCalledTimes(1);
  });

  it('stopStatic before playStatic is a no-op', async () => {
    makeMockChainWithBuffers();
    const { createAudioChain } = await import('../../src/audio/audioChain');
    const chain = createAudioChain();
    await chain.init();
    expect(() => chain.stopStatic()).not.toThrow();
  });

  it('playStatic before init is a no-op (does not throw)', async () => {
    makeMockChainWithBuffers();
    const { createAudioChain } = await import('../../src/audio/audioChain');
    const chain = createAudioChain();
    expect(() => chain.playStatic(3000)).not.toThrow();
  });
});
