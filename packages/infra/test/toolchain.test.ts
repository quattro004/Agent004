import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const rootManifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
  devEngines?: {
    runtime?: { name?: string; version?: string; onFail?: string };
  };
};

const runtime = rootManifest.devEngines?.runtime;

/** '^24.14.0' -> 24, '24' -> 24 */
function majorOf(range: string): number {
  const match = /(\d+)/.exec(range);
  return match ? Number(match[1]) : Number.NaN;
}

describe('root toolchain declarations', () => {
  // pnpm 10.14+ treats devEngines.runtime as actionable rather than advisory:
  // `pnpm install` resolves the range, pins the exact version by checksum in
  // pnpm-lock.yaml, and runs scripts against it. Without it the Node version is
  // whatever happens to be on the contributor's PATH.
  test('pins the Node.js runtime so pnpm manages it', () => {
    expect(runtime?.name).toBe('node');
  });

  test('instructs pnpm to download the runtime when it is missing', () => {
    expect(runtime?.onFail).toBe('download');
  });

  // CI resolves Node from .nvmrc via actions/setup-node while pnpm resolves it
  // from devEngines. Drift between the two would build and test on one major
  // while contributors run another.
  test('declares the same Node major as .nvmrc', () => {
    const nvmrc = readFileSync(join(repoRoot, '.nvmrc'), 'utf8').trim();

    expect(majorOf(runtime?.version ?? '')).toBe(majorOf(nvmrc));
  });
});
