import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { WikiPage } from './rules.js';

/**
 * Reads every top-level markdown page from a wiki clone.
 *
 * Returns `null` when the directory is absent — the `wiki/` clone is optional
 * and gitignored, so its absence is not an error.
 */
export async function readWikiPages(dir: string): Promise<WikiPage[] | null> {
  if (!existsSync(dir)) return null;

  const entries = await readdir(dir, { withFileTypes: true });
  const pages: WikiPage[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    pages.push({
      name: entry.name.slice(0, -'.md'.length),
      content: await readFile(join(dir, entry.name), 'utf8'),
    });
  }

  return pages;
}

/** Resolves a cited `sources:` path against the repository root. */
export function repoSourceExists(repoRoot: string): (path: string) => boolean {
  return (path: string) => {
    const withoutAnchor = path.split('#')[0];
    if (withoutAnchor === '') return false;
    return existsSync(resolve(repoRoot, withoutAnchor));
  };
}
