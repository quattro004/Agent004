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
import { wrapInSsml } from '../../../agent/src/voice/ssml';

describe('buildGreetingSsml', () => {
  it('returns the custom SSML verbatim when supplied', () => {
    const custom = '<speak><break time="200ms"/>Hi there.</speak>';
    expect(buildGreetingSsml('Hi there.', custom, 'ipa-schwa', 'original')).toBe(custom);
  });

  it('falls back to wrapInSsml when custom SSML is undefined', () => {
    expect(buildGreetingSsml('Hello world.')).toBe(wrapInSsml('Hello world.'));
  });

  it('falls back to wrapInSsml when custom SSML is empty or whitespace', () => {
    expect(buildGreetingSsml('Hello world.', '')).toBe(wrapInSsml('Hello world.'));
    expect(buildGreetingSsml('Hello world.', '   ')).toBe(wrapInSsml('Hello world.'));
  });

  it('turns written stutters into phonetic onsets inside the greeting prosody', () => {
    const ssml = buildGreetingSsml(
      '',
      '<speak><prosody rate="105%">b-b-ball</prosody></speak>',
      'ipa-schwa',
      'original',
    );
    expect(ssml).toBe(
      '<speak><prosody rate="105%"><phoneme alphabet="ipa" ph="bə">b</phoneme>' +
        '<break time="100ms"/><phoneme alphabet="ipa" ph="bə">b</phoneme>' +
        '<break time="100ms"/>ball</prosody></speak>',
    );
  });

  it('also converts mixed-case stutters in the plain-text fallback', () => {
    const ssml = buildGreetingSsml('M-m-m-Max Height.');
    expect(ssml.match(/ph="mə"/g) ?? []).toHaveLength(3);
    expect(ssml).toContain('Max Height.');
    expect(ssml).not.toContain('M-m-m-Max');
  });

  it('preserves ordinary hyphens, attributes and existing pronunciation tags', () => {
    const custom =
      '<speak><sub alias="b-b-ball">BBC</sub> and well-known e-mail, ' +
      '<phoneme alphabet="ipa" ph="bə">b-b</phoneme>.</speak>';
    expect(buildGreetingSsml('', custom, 'ipa-schwa', 'original')).toBe(custom);
  });

  it('escapes plain-text XML characters rather than interpreting them as SSML', () => {
    expect(buildGreetingSsml('A & B < C > D')).toContain('A &amp; B &lt; C &gt; D');
  });

  it('leaves quoted tag attributes intact even when they contain an angle bracket', () => {
    const ssml = buildGreetingSsml('', '<speak><mark name="b > b-b-ball"/> L-l-ladies.</speak>');
    expect(ssml).toContain('<mark name="b > b-b-ball"/>');
    expect(ssml).toContain('ph="lə"');
  });

  it('does not mistake a hyphenated URL for a spoken stutter', () => {
    const ssml = buildGreetingSsml('See https://b-b-ball.example. W-w-welcome!');
    expect(ssml).toContain('https://b-b-ball.example.');
    expect(ssml).toContain('ph="wə"');
  });

  it('speeds up the greeting and shortens onset gaps without changing other prosody', () => {
    const ssml = buildGreetingSsml(
      '',
      '<speak><prosody volume="loud" rate="105%">b-b-ball<break time="200ms"/> Hi.</prosody></speak>',
      'ipa-schwa',
      'faster',
    );
    expect(ssml).toContain('<prosody volume="loud" rate="115%">');
    expect(ssml.match(/<break time="50ms"\/>/g)).toHaveLength(2);
    expect(ssml).toContain('ball<break time="200ms"/> Hi.');
    expect(ssml).not.toContain('rate="x-fast"');
  });

  it('accelerates only the repeated onsets in the snappy profile', () => {
    const ssml = buildGreetingSsml(
      '',
      '<speak><prosody rate="105%">b-b-ball and plain speech.</prosody></speak>',
      'ipa-schwa',
      'snappy',
    );
    const doc = new DOMParser().parseFromString(ssml, 'application/xml');
    expect(doc.documentElement.firstElementChild?.getAttribute('rate')).toBe('115%');
    const bursts = doc.querySelectorAll('prosody[rate="x-fast"]');
    expect(bursts).toHaveLength(1);
    expect(bursts[0].textContent).toBe('bb');
    expect(bursts[0].querySelectorAll('phoneme[ph="bə"]')).toHaveLength(2);
    expect(bursts[0].querySelectorAll('break[time="50ms"]')).toHaveLength(2);
    expect(bursts[0].nextSibling?.textContent).toBe('ball and plain speech.');
  });

  it.each([
    { pacing: 'snappier', expectedGaps: 2 },
    { pacing: 'gap5', expectedGaps: 2 },
    { pacing: 'rapid', expectedGaps: 0 },
  ] as const)(
    'tightens $pacing stutters while retaining snappy speech speed and dialogue',
    ({ pacing, expectedGaps }) => {
      const ssml = buildGreetingSsml(
        '',
        '<speak><prosody rate="105%">b-b-ball and plain speech.</prosody></speak>',
        'ipa-schwa',
        pacing,
      );
      const doc = new DOMParser().parseFromString(ssml, 'application/xml');
      expect(doc.querySelector('parsererror')).toBeNull();
      const rate = doc.documentElement.firstElementChild?.getAttribute('rate') ?? '';
      expect(rate).toMatch(/^\d+%$/);
      expect(rate).toBe('115%');
      const burst = doc.querySelector('prosody[rate="x-fast"]');
      expect(burst, 'new profiles must keep x-fast onset-only prosody').not.toBeNull();
      expect(burst?.querySelectorAll('phoneme[ph="bə"]')).toHaveLength(2);
      expect(burst?.textContent).toBe('bb');
      const gaps = [...(burst?.querySelectorAll('break') ?? [])];
      expect(gaps).toHaveLength(expectedGaps);
      expect(gaps.every((gap) => Number.parseFloat(gap.getAttribute('time') ?? '') < 50)).toBe(
        true,
      );
      expect(burst?.nextSibling?.textContent).toBe('ball and plain speech.');
      const fallback = new DOMParser().parseFromString(
        buildGreetingSsml('b-b-ball and plain speech.', undefined, 'ipa-schwa', pacing),
        'application/xml',
      );
      expect(fallback.documentElement.firstElementChild?.getAttribute('rate')).toBe(rate);
    },
  );

  it.each([undefined, '<speak>b-b-ball &amp; more.</speak>'])(
    'also applies faster pacing when an outer prosody is absent (%s)',
    (custom) => {
      const ssml = buildGreetingSsml('b-b-ball & more.', custom, 'ipa-schwa', 'faster');
      expect(ssml).toContain('<prosody rate="115%">');
      expect(ssml).toContain('<break time="50ms"/>ball &amp; more.');
    },
  );
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

  it('accepts an isolated experiment on a selected greeting', () => {
    expect(parseCliArgs(['--experiment', '--only', 'greeting-015', '--dry-run'])).toEqual({
      dryRun: true,
      only: 'greeting-015',
      experiment: true,
    });
  });

  it('requires a single greeting for the pronunciation experiment', () => {
    expect(() => parseCliArgs(['--experiment'])).toThrow(/--only/);
  });

  it('selects a pacing experiment on a single greeting', () => {
    expect(parseCliArgs(['--pace-experiment', '--only', 'greeting-015', '--dry-run'])).toEqual({
      dryRun: true,
      only: 'greeting-015',
      experiment: 'pacing',
    });
  });

  it('requires a greeting and rejects mixing the two experiment modes', () => {
    expect(() => parseCliArgs(['--pace-experiment'])).toThrow(/--only/);
    expect(() =>
      parseCliArgs(['--experiment', '--pace-experiment', '--only', 'greeting-015']),
    ).toThrow(/cannot combine/i);
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
      synthesize: vi.fn(async (_input: SynthesisInput) => audioById[order[index++]]),
      writeAudio: vi.fn(async (_path: string, _bytes: Uint8Array) => {}),
      measure: vi.fn(async (bytes: Uint8Array) => (bytes[0] === 1 ? 6543 : 5000)),
      ...overrides,
    };
  }

  it('synthesizes each greeting with its hand-tuned SSML', async () => {
    const deps = makeDeps();
    await runGeneration(deps);
    expect(deps.synthesize).toHaveBeenCalledTimes(2);
    expect((deps.synthesize.mock.calls[0][0] as SynthesisInput).Text).toBe(
      '<speak><prosody rate="115%">Hello there.</prosody></speak>',
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

  it('experiments with all three pronunciations without changing the production manifest', async () => {
    const deps = makeDeps({
      experiment: true,
      only: 'greeting-001',
      ssmlById: { 'greeting-001': '<speak>b-b-ball</speak>' },
      synthesize: vi.fn(async (_input: SynthesisInput) => new Uint8Array([1])),
    });
    const result = await runGeneration(deps);
    expect(deps.synthesize).toHaveBeenCalledTimes(3);
    expect(deps.synthesize.mock.calls.map(([input]) => input.Text)).toEqual([
      expect.stringContaining('ph="bə"'),
      expect.stringContaining('ph="bʌ"'),
      expect.stringContaining('<sub alias="buh">b</sub>'),
    ]);
    expect(deps.writeAudio.mock.calls.map(([path]) => path)).toEqual([
      'ipa-schwa/audio/greeting-001.mp3',
      'ipa-strut/audio/greeting-001.mp3',
      'alias/audio/greeting-001.mp3',
    ]);
    expect(result).toBe(manifest);
  });

  it('prints the three experiment requests in a dry run without synthesis or writes', async () => {
    const log = vi.fn();
    const deps = makeDeps({
      experiment: true,
      only: 'greeting-001',
      dryRun: true,
      ssmlById: { 'greeting-001': '<speak>b-b-ball</speak>' },
      log,
    });
    await runGeneration(deps);
    expect(deps.synthesize).not.toHaveBeenCalled();
    expect(deps.writeAudio).not.toHaveBeenCalled();
    const output = log.mock.calls.flat().join('\n');
    expect(output).toContain('ipa-schwa');
    expect(output).toContain('ipa-strut');
    expect(output).toContain('alias');
    expect(output).toContain('ph="bə"');
    expect(output).toContain('ph="bʌ"');
    expect(output).toContain('<sub alias="buh">');
  });

  it('defaults to rapid pacing: 115% speech, x-fast onsets and no inserted gaps', () => {
    const ssml = buildGreetingSsml('', '<speak><prosody rate="105%">b-b-ball</prosody></speak>');
    expect(ssml).toBe(
      '<speak><prosody rate="115%"><prosody rate="x-fast">' +
        '<phoneme alphabet="ipa" ph="bə">b</phoneme>' +
        '<phoneme alphabet="ipa" ph="bə">b</phoneme></prosody>ball</prosody></speak>',
    );
    expect(buildGreetingSsml('b-b-ball')).toBe(wrapInSsml('b-b-ball'));
  });

  it('auditions the 5 ms candidate without changing speech speed or overwriting prior trials', async () => {
    const deps = makeDeps({
      experiment: 'pacing',
      only: 'greeting-001',
      ssmlById: { 'greeting-001': '<speak><prosody rate="105%">b-b-ball</prosody></speak>' },
      synthesize: vi.fn(async (_input: SynthesisInput) => new Uint8Array([1])),
    });
    expect(await runGeneration(deps)).toBe(manifest);
    expect(deps.synthesize).toHaveBeenCalledTimes(1);
    const [request] = deps.synthesize.mock.calls.map(([input]) => input.Text);
    const doc = new DOMParser().parseFromString(request, 'application/xml');
    expect(doc.documentElement.firstElementChild?.getAttribute('rate')).toBe('115%');
    expect(request).toContain('ph="bə"');
    expect(request).toContain('rate="x-fast"');
    expect(doc.querySelectorAll('break[time="5ms"]')).toHaveLength(2);
    expect(deps.writeAudio.mock.calls.map(([path]) => path)).toEqual([
      'pace-gap-5ms/audio/greeting-001.mp3',
    ]);
  });

  it('previews the pacing request without synthesis, measurement or writes', async () => {
    const log = vi.fn();
    const deps = makeDeps({ experiment: 'pacing', only: 'greeting-001', dryRun: true, log });
    expect(await runGeneration(deps)).toBe(manifest);
    expect(deps.synthesize).not.toHaveBeenCalled();
    expect(deps.measure).not.toHaveBeenCalled();
    expect(deps.writeAudio).not.toHaveBeenCalled();
    const output = log.mock.calls.flat().join('\n');
    expect(output).toContain('pace-gap-5ms');
    expect(output).not.toContain('ipa-strut');
  });

  it('rejects a full-pool experiment before making a Polly call', async () => {
    const deps = makeDeps({ experiment: true });
    await expect(runGeneration(deps)).rejects.toThrow(/single greeting/);
    expect(deps.synthesize).not.toHaveBeenCalled();
    expect(deps.writeAudio).not.toHaveBeenCalled();
  });

  it('keeps overlong audition clips for listening without updating production durations', async () => {
    const log = vi.fn();
    const deps = makeDeps({
      experiment: true,
      only: 'greeting-001',
      synthesize: vi.fn(async (_input: SynthesisInput) => new Uint8Array([1])),
      measure: vi.fn(async () => 16272),
      log,
    });
    expect(await runGeneration(deps)).toBe(manifest);
    expect(deps.writeAudio).toHaveBeenCalledTimes(3);
    expect(log.mock.calls.flat().join('\n')).toMatch(/16272.*re-tune/i);
  });

  it('does not overwrite production audio when a retuned greeting exceeds the duration ceiling', async () => {
    const deps = makeDeps({ measure: vi.fn(async () => 16272) });
    await expect(runGeneration(deps)).rejects.toThrow(/16272/);
    expect(deps.writeAudio).not.toHaveBeenCalled();
  });
});
