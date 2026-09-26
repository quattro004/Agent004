import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readWikiPages, repoSourceExists } from '../src/wiki/load.js';

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'wiki-load-'));
  await writeFile(join(dir, 'Home.md'), '# Home', 'utf8');
  await writeFile(join(dir, '_Sidebar.md'), '- [[Home]]', 'utf8');
  await writeFile(join(dir, 'notes.txt'), 'not a page', 'utf8');
  await mkdir(join(dir, '.git'), { recursive: true });
  await writeFile(join(dir, '.git', 'HEAD.md'), '# not a page', 'utf8');
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('readWikiPages', () => {
  it('reads every top-level markdown file, stripping the .md extension', async () => {
    const pages = await readWikiPages(dir);
    expect(pages.map((p) => p.name).sort()).toEqual(['Home', '_Sidebar']);
  });

  it('returns the file content alongside the page name', async () => {
    const pages = await readWikiPages(dir);
    expect(pages.find((p) => p.name === 'Home')?.content).toBe('# Home');
  });

  it('returns null when the wiki directory does not exist, because the clone is optional', async () => {
    expect(await readWikiPages(join(dir, 'missing'))).toBeNull();
  });
});

describe('repoSourceExists', () => {
  it('resolves a path relative to the repo root', () => {
    expect(repoSourceExists(dir)('Home.md')).toBe(true);
  });

  it('is false for a path that is not in the repo', () => {
    expect(repoSourceExists(dir)('nope/never.md')).toBe(false);
  });

  it('ignores an anchor fragment, which points within a file rather than at another file', () => {
    expect(repoSourceExists(dir)('Home.md#a-heading')).toBe(true);
  });
});
