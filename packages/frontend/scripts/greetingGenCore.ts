import { wrapInSsml } from '../src/services/pollyTts';

export interface GreetingManifestEntry {
  id: string;
  audioDurationMs: number;
  text?: string;
  audioPath?: string;
  [key: string]: unknown;
}

export interface GreetingManifest {
  greetings: GreetingManifestEntry[];
  [key: string]: unknown;
}

export const MIN_DURATION_MS = 1000;
export const MAX_DURATION_MS = 15000;

/**
 * Return the hand-tuned SSML when supplied, otherwise fall back to the shared
 * `wrapInSsml` wrapper used by the conversation TTS path.
 */
export function buildGreetingSsml(text: string, customSsml?: string): string {
  if (customSsml !== undefined && customSsml.trim().length > 0) {
    return customSsml;
  }
  return wrapInSsml(text);
}

/**
 * Return a new manifest with each greeting's `audioDurationMs` set to its
 * measured value, rounded. Greetings absent from `measuredMsById` are left
 * untouched.
 *
 * Measurements outside [MIN_DURATION_MS, MAX_DURATION_MS] are rejected rather
 * than clamped: the bounds assert a property of the generated asset, so an
 * out-of-range value means the greeting's SSML is mistuned. Coercing it into
 * range would silently violate greeting-manifest.md validation rule 6
 * (`audioDurationMs` within ±500ms of the actual MP3 duration) and would skew
 * greeting playback timing.
 */
export function calibrateDurations(
  manifest: GreetingManifest,
  measuredMsById: Record<string, number>,
): GreetingManifest {
  const outOfRange: string[] = [];

  const greetings = manifest.greetings.map((greeting) => {
    const measured = measuredMsById[greeting.id];
    if (measured === undefined) {
      return greeting;
    }
    const rounded = Math.round(measured);
    if (rounded < MIN_DURATION_MS) {
      outOfRange.push(`${greeting.id}: ${rounded}ms is below the ${MIN_DURATION_MS}ms minimum`);
    } else if (rounded > MAX_DURATION_MS) {
      outOfRange.push(`${greeting.id}: ${rounded}ms exceeds the ${MAX_DURATION_MS}ms maximum`);
    }
    return { ...greeting, audioDurationMs: rounded };
  });

  if (outOfRange.length > 0) {
    throw new Error(
      `Measured audio duration out of contract range for ${outOfRange.length} greeting(s):\n` +
        `${outOfRange.map((entry) => `  - ${entry}`).join('\n')}\n` +
        'Re-tune the SSML in scripts/greetingSsml.ts (adjust <break> times or prosody rate) ' +
        'and regenerate the affected greeting(s).',
    );
  }

  return { ...manifest, greetings };
}

// --- Duration measurement ---

export interface Mp3Metadata {
  format: { duration?: number };
}

/** Parses an MP3 buffer; supplied by the caller (`music-metadata` in the CLI shell). */
export type Mp3Parser = (buffer: Uint8Array) => Promise<Mp3Metadata>;

/**
 * Measure an MP3's duration in milliseconds. The parser is injected so the core
 * stays free of Node-only dependencies (and testable in the browser test env).
 */
export async function measureMp3DurationMs(buffer: Uint8Array, parse: Mp3Parser): Promise<number> {
  const metadata = await parse(buffer);
  const seconds = metadata.format.duration;
  if (seconds === undefined) {
    throw new Error('Unable to measure MP3 duration: parser reported no duration.');
  }
  return seconds * 1000;
}

// --- CLI arguments ---

export interface GenerationCliOptions {
  dryRun: boolean;
  only: string | undefined;
}

/** Parse the generation script's supported flags: `--dry-run` and `--only <greetingId>`. */
export function parseCliArgs(argv: string[]): GenerationCliOptions {
  let dryRun = false;
  let only: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--only') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error('--only requires a greeting id, e.g. --only greeting-003');
      }
      only = value;
      i += 1;
    } else {
      throw new Error(`Unrecognized argument: ${arg}`);
    }
  }

  return { dryRun, only };
}

// --- Polly synthesis ---

export interface SynthesisInput {
  Engine: 'neural';
  VoiceId: 'Matthew';
  LanguageCode: 'en-US';
  OutputFormat: 'mp3';
  SampleRate: '24000';
  TextType: 'ssml';
  Text: string;
}

/** Build the Polly request for a greeting, matching the manifest's `voiceConfig`. */
export function buildSynthesisInput(ssml: string): SynthesisInput {
  return {
    Engine: 'neural',
    VoiceId: 'Matthew',
    LanguageCode: 'en-US',
    OutputFormat: 'mp3',
    SampleRate: '24000',
    TextType: 'ssml',
    Text: ssml,
  };
}

// --- Orchestration ---

export interface RunGenerationDeps {
  manifest: GreetingManifest;
  ssmlById: Record<string, string>;
  synthesize: (input: SynthesisInput) => Promise<Uint8Array>;
  writeAudio: (relativeAudioPath: string, bytes: Uint8Array) => Promise<void>;
  measure: (bytes: Uint8Array) => Promise<number>;
  dryRun?: boolean;
  only?: string;
  log?: (message: string) => void;
}

/**
 * Synthesize, write and measure the selected greetings, returning the manifest
 * with `audioDurationMs` recalibrated to the generated audio.
 *
 * Greetings are processed sequentially to keep Polly request rates modest.
 */
export async function runGeneration(deps: RunGenerationDeps): Promise<GreetingManifest> {
  const { manifest, ssmlById, synthesize, writeAudio, measure, dryRun, only, log } = deps;

  const selected = only ? manifest.greetings.filter((g) => g.id === only) : manifest.greetings;
  if (only && selected.length === 0) {
    throw new Error(`No greeting with id "${only}" exists in the manifest.`);
  }

  if (dryRun) {
    for (const greeting of selected) {
      log?.(
        `[dry-run] would synthesize ${greeting.id} → ${greeting.audioPath ?? '(no audioPath)'}`,
      );
    }
    return manifest;
  }

  const measuredMsById: Record<string, number> = {};

  for (const greeting of selected) {
    if (!greeting.audioPath) {
      throw new Error(`Greeting "${greeting.id}" has no audioPath in the manifest.`);
    }
    const ssml = buildGreetingSsml(greeting.text ?? '', ssmlById[greeting.id]);
    const audio = await synthesize(buildSynthesisInput(ssml));
    await writeAudio(greeting.audioPath, audio);
    measuredMsById[greeting.id] = await measure(audio);
    log?.(`${greeting.id} → ${greeting.audioPath} (${Math.round(measuredMsById[greeting.id])} ms)`);
  }

  return calibrateDurations(manifest, measuredMsById);
}
