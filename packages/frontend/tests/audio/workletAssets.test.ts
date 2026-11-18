// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

/**
 * `audioChain.init()` hands each processor URL to `audioWorklet.addModule`.
 * A production build must emit those processors as compiled, same-origin
 * JavaScript files: a `data:` URL is refused by CSP `script-src 'self'`, and
 * raw TypeScript is not a script a browser can run (#76, spec 003 T177).
 */
const PROCESSORS = ['stutter-processor', 'eq-processor', 'static-processor'];

const root = resolve(__dirname, '../..');
let outDir: string;
let files: Map<string, string>;

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).replaceAll('\\', '/'));
}

beforeAll(async () => {
  outDir = await mkdtemp(join(tmpdir(), 'max-height-worklets-'));
  await build({
    root,
    configFile: join(root, 'vite.config.ts'),
    mode: 'production',
    logLevel: 'silent',
    build: { outDir, emptyOutDir: true, sourcemap: false },
  });
  files = new Map();
  for (const name of await listFiles(outDir)) {
    files.set(name, await readFile(join(outDir, name), 'utf8'));
  }
}, 180_000);

afterAll(async () => {
  if (outDir) await rm(outDir, { recursive: true, force: true });
});

describe('production build — audio worklets', () => {
  it('inlines no worklet as a data: URL', () => {
    const inlined = [...files]
      .filter(([, content]) => content.includes('data:video/mp2t'))
      .map(([name]) => name);
    expect(inlined).toEqual([]);
  });

  it('ships no TypeScript source', () => {
    expect([...files.keys()].filter((name) => name.endsWith('.ts'))).toEqual([]);
  });

  it.each(PROCESSORS)('emits %s as its own compiled script that the app references', (name) => {
    const registration = new RegExp(`registerProcessor\\(\\s*["'\`]${name}["'\`]`);
    const worklets = [...files].filter(
      ([file, content]) => file.endsWith('.js') && registration.test(content),
    );
    expect(worklets.map(([file]) => file)).toHaveLength(1);

    const [file, content] = worklets[0];
    expect(content, `${file} still holds TypeScript`).not.toMatch(/\bprivate\s+\w/);

    const fileName = file.split('/').pop()!;
    const referencedBy = [...files].filter(
      ([other, source]) => other !== file && other.endsWith('.js') && source.includes(fileName),
    );
    expect(referencedBy.length, `${fileName} is not referenced by the app`).toBeGreaterThan(0);
  });
});
