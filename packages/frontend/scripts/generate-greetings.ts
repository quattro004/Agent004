/**
 * Phase 3 (audio-plan): one-shot Polly generation of the greeting MP3 pool.
 *
 * Reads `public/greetings/manifest.json`, synthesizes each greeting from its
 * hand-tuned SSML, writes `public/greetings/audio/greeting-NNN.mp3`, then
 * rewrites the manifest with the measured `audioDurationMs` values.
 *
 * Requires temporary AWS credentials with `polly:SynthesizeSpeech` (see
 * `docs/audio-plan.md` Phase 3 — AWS CloudShell session export).
 * The region is intentionally NOT hardcoded: it resolves from the environment
 * or the active profile.
 *
 * Usage:
 *   pnpm --filter @max-height/frontend generate:greetings
 *   pnpm --filter @max-height/frontend generate:greetings -- --dry-run
 *   pnpm --filter @max-height/frontend generate:greetings -- --only greeting-003
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { parseBuffer } from 'music-metadata';
import { greetingSsml } from './greetingSsml';
import {
  measureMp3DurationMs,
  parseCliArgs,
  runGeneration,
  type GreetingManifest,
  type SynthesisInput,
} from './greetingGenCore';

const greetingsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'greetings');
const manifestPath = join(greetingsDir, 'manifest.json');

async function main(): Promise<void> {
  const { dryRun, only } = parseCliArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as GreetingManifest;
  const client = new PollyClient({});

  const updated = await runGeneration({
    manifest,
    ssmlById: greetingSsml,
    dryRun,
    only,
    log: (message) => console.log(message),
    synthesize: async (input: SynthesisInput) => {
      const response = await client.send(new SynthesizeSpeechCommand(input));
      const stream = response.AudioStream as unknown as {
        transformToByteArray(): Promise<Uint8Array>;
      };
      return await stream.transformToByteArray();
    },
    writeAudio: async (relativeAudioPath, bytes) => {
      const target = join(greetingsDir, relativeAudioPath);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes);
    },
    measure: (bytes) => measureMp3DurationMs(bytes, (buffer) => parseBuffer(buffer, 'audio/mpeg')),
  });

  if (dryRun) {
    console.log('Dry run complete — no audio written, manifest unchanged.');
    return;
  }

  await writeFile(manifestPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
  console.log(`Manifest durations recalibrated → ${manifestPath}`);
}

await main();
