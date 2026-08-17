/**
 * Phase 2 (audio-plan): pure units of the greeting generation script.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  buildGreetingSsml,
  buildSynthesisInput,
  calibrateDurations,
  measureMp3DurationMs,
  parseCliArgs,
  runGeneration,
  type GreetingManifest,
  type SynthesisInput,
} from '../../scripts/greetingGenCore';
import { wrapInSsml } from '../../src/services/pollyTts';

describe('buildGreetingSsml', () => {
  it('returns the custom SSML verbatim when supplied', () => {
    const custom = '<speak><break time="200ms"/>Hi there.</speak>';
    expect(buildGreetingSsml('Hi there.', custom)).toBe(custom);
  });

  it('falls back to wrapInSsml when custom SSML is undefined', () => {
    expect(buildGreetingSsml('Hello world.')).toBe(wrapInSsml('Hello world.'));
  });

  it('falls back to wrapInSsml when custom SSML is empty or whitespace', () => {
    expect(buildGreetingSsml('Hello world.', '')).toBe(wrapInSsml('Hello world.'));
    expect(buildGreetingSsml('Hello world.', '   ')).toBe(wrapInSsml('Hello world.'));
  });
});

describe('calibrateDurations', () => {
  const baseManifest: GreetingManifest = {
    version: '1.0.0',
    greetings: [
      { id: 'greeting-001', archetype: 'X', audioDurationMs: 8000, weight: 1.0 },
      { id: 'greeting-002', archetype: 'Y', audioDurationMs: 7000, weight: 1.0 },
    ],
  };

  it('updates audioDurationMs for measured greetings', () => {
    const result = calibrateDurations(baseManifest, {
      'greeting-001': 6543,
      'greeting-002': 5000,
    });
    expect(result.greetings[0].audioDurationMs).toBe(6543);
    expect(result.greetings[1].audioDurationMs).toBe(5000);
  });

  it('rounds fractional measured durations', () => {
    const result = calibrateDurations(baseManifest, { 'greeting-001': 6543.7 });
    expect(result.greetings[0].audioDurationMs).toBe(6544);
  });

  // An out-of-range measurement means the SSML is mistuned. Coercing it into
  // range would silently break greeting-manifest.md rule 6 (audioDurationMs
  // must be within +/-500ms of the actual MP3 duration), so it must fail loudly.
  it('throws when a measured duration exceeds MAX_DURATION_MS', () => {
    expect(() => calibrateDurations(baseManifest, { 'greeting-001': 16272 })).toThrow();
  });

  it('throws when a measured duration is below MIN_DURATION_MS', () => {
    expect(() => calibrateDurations(baseManifest, { 'greeting-001': 250 })).toThrow();
  });

  it('names the offending greeting and its measured duration in the error', () => {
    expect(() => calibrateDurations(baseManifest, { 'greeting-001': 16272 })).toThrow(
      /greeting-001.*16272/s,
    );
  });

  it('reports every out-of-range greeting, not just the first', () => {
    let message = '';
    try {
      calibrateDurations(baseManifest, { 'greeting-001': 16272, 'greeting-002': 250 });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('greeting-001');
    expect(message).toContain('greeting-002');
  });

  it('accepts measured durations exactly at the bounds', () => {
    const result = calibrateDurations(baseManifest, {
      'greeting-001': 15000,
      'greeting-002': 1000,
    });
    expect(result.greetings[0].audioDurationMs).toBe(15000);
    expect(result.greetings[1].audioDurationMs).toBe(1000);
  });

  it('leaves greetings absent from the measured map unchanged', () => {
    const result = calibrateDurations(baseManifest, { 'greeting-001': 5000 });
    expect(result.greetings[1].audioDurationMs).toBe(7000);
  });

  it('preserves unrelated fields and greeting order', () => {
    const result = calibrateDurations(baseManifest, { 'greeting-002': 5000 });
    expect(result.version).toBe('1.0.0');
    expect(result.greetings.map((g) => g.id)).toEqual(['greeting-001', 'greeting-002']);
    expect(result.greetings[0].archetype).toBe('X');
    expect(Object.keys(result.greetings[0])).toEqual([
      'id',
      'archetype',
      'audioDurationMs',
      'weight',
    ]);
  });

  it('does not mutate the input manifest', () => {
    calibrateDurations(baseManifest, { 'greeting-001': 5000 });
    expect(baseManifest.greetings[0].audioDurationMs).toBe(8000);
  });
});

describe('measureMp3DurationMs', () => {
  it('converts the parsed duration from seconds to milliseconds', async () => {
    const parse = vi.fn().mockResolvedValue({ format: { duration: 6.5437 } });
    await expect(measureMp3DurationMs(new Uint8Array([1, 2, 3]), parse)).resolves.toBeCloseTo(
      6543.7,
      3,
    );
    expect(parse).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
  });

  it('throws when the parser reports no duration', async () => {
    const parse = vi.fn().mockResolvedValue({ format: {} });
    await expect(measureMp3DurationMs(new Uint8Array([1]), parse)).rejects.toThrow(/duration/i);
  });
});

describe('parseCliArgs', () => {
  it('defaults to a full, non-dry run', () => {
    expect(parseCliArgs([])).toEqual({ dryRun: false, only: undefined });
  });

  it('enables dry-run mode with --dry-run', () => {
    expect(parseCliArgs(['--dry-run'])).toEqual({ dryRun: true, only: undefined });
  });

  it('reads the greeting id from --only', () => {
    expect(parseCliArgs(['--only', 'greeting-003'])).toEqual({
      dryRun: false,
      only: 'greeting-003',
    });
  });

  it('throws when --only has no value', () => {
    expect(() => parseCliArgs(['--only'])).toThrow(/--only/);
  });

  it('throws on an unrecognized argument', () => {
    expect(() => parseCliArgs(['--wat'])).toThrow(/--wat/);
  });
});

describe('buildSynthesisInput', () => {
  it('requests neural Matthew mp3 audio at 24 kHz from SSML', () => {
    expect(buildSynthesisInput('<speak>Hi.</speak>')).toEqual({
      Engine: 'neural',
      VoiceId: 'Matthew',
      LanguageCode: 'en-US',
      OutputFormat: 'mp3',
      SampleRate: '24000',
      TextType: 'ssml',
      Text: '<speak>Hi.</speak>',
    });
  });
});

describe('runGeneration', () => {
  const manifest: GreetingManifest = {
    version: '1.0.0',
    greetings: [
      {
        id: 'greeting-001',
        text: 'Hello there.',
        audioPath: 'audio/greeting-001.mp3',
        audioDurationMs: 8000,
      },
      {
        id: 'greeting-002',
        text: 'Goodbye now.',
        audioPath: 'audio/greeting-002.mp3',
        audioDurationMs: 7500,
      },
    ],
  };
  const ssmlById = { 'greeting-001': '<speak>Hello there.</speak>' };

  function makeDeps(overrides: Record<string, unknown> = {}) {
    const audioById: Record<string, Uint8Array> = {
      'greeting-001': new Uint8Array([1]),
      'greeting-002': new Uint8Array([2]),
    };
    let index = 0;
    const order = ['greeting-001', 'greeting-002'];
    return {
      manifest,
      ssmlById,
      synthesize: vi.fn(async () => audioById[order[index++]]),
      writeAudio: vi.fn(async () => {}),
      measure: vi.fn(async (bytes: Uint8Array) => (bytes[0] === 1 ? 6543 : 5000)),
      ...overrides,
    };
  }

  it('synthesizes each greeting with its hand-tuned SSML', async () => {
    const deps = makeDeps();
    await runGeneration(deps);
    expect(deps.synthesize).toHaveBeenCalledTimes(2);
    expect((deps.synthesize.mock.calls[0][0] as SynthesisInput).Text).toBe(
      '<speak>Hello there.</speak>',
    );
  });

  it('falls back to wrapInSsml for greetings without hand-tuned SSML', async () => {
    const deps = makeDeps();
    await runGeneration(deps);
    expect((deps.synthesize.mock.calls[1][0] as SynthesisInput).Text).toBe(
      wrapInSsml('Goodbye now.'),
    );
  });

  it('writes each synthesized greeting to its manifest audioPath', async () => {
    const deps = makeDeps();
    await runGeneration(deps);
    expect(deps.writeAudio).toHaveBeenCalledWith('audio/greeting-001.mp3', new Uint8Array([1]));
    expect(deps.writeAudio).toHaveBeenCalledWith('audio/greeting-002.mp3', new Uint8Array([2]));
  });

  it('returns a manifest calibrated to the measured audio durations', async () => {
    const result = await runGeneration(makeDeps());
    expect(result.greetings[0].audioDurationMs).toBe(6543);
    expect(result.greetings[1].audioDurationMs).toBe(5000);
  });

  it('restricts work to a single greeting when only is set', async () => {
    const deps = makeDeps({ only: 'greeting-002' });
    const result = await runGeneration(deps);
    expect(deps.synthesize).toHaveBeenCalledTimes(1);
    expect(deps.writeAudio).toHaveBeenCalledWith('audio/greeting-002.mp3', expect.anything());
    expect(result.greetings[0].audioDurationMs).toBe(8000);
  });

  it('throws when only names a greeting missing from the manifest', async () => {
    await expect(runGeneration(makeDeps({ only: 'greeting-999' }))).rejects.toThrow(/greeting-999/);
  });

  it('performs no synthesis or writes in dry-run mode', async () => {
    const deps = makeDeps({ dryRun: true });
    const result = await runGeneration(deps);
    expect(deps.synthesize).not.toHaveBeenCalled();
    expect(deps.writeAudio).not.toHaveBeenCalled();
    expect(result).toEqual(manifest);
  });

  it('throws when a greeting has no audioPath', async () => {
    const broken: GreetingManifest = {
      version: '1.0.0',
      greetings: [{ id: 'greeting-001', text: 'Hello there.', audioDurationMs: 8000 }],
    };
    await expect(runGeneration(makeDeps({ manifest: broken }))).rejects.toThrow(/audioPath/);
  });
});
