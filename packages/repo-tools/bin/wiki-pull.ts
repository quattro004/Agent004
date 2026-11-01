#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createGitRunner, pullWiki } from '../src/wiki/pull.js';

/**
 * Clones or fast-forwards the local wiki clone.
 *
 * The `wiki/` directory is optional and gitignored, so this is the one command
 * that may legitimately find it missing. Every other failure is reported as
 * itself. See the wiki's Guide-Wiki-Contributing page.
 */
async function main(): Promise<number> {
  const repoRoot = resolve(import.meta.dirname, '..', '..', '..');
  const wikiDir = resolve(repoRoot, 'wiki');

  const outcome = await pullWiki({
    git: createGitRunner(repoRoot),
    wikiDir,
    hasClone: existsSync(resolve(wikiDir, '.git')),
  });

  switch (outcome.kind) {
    case 'pulled':
      console.log('wiki:pull — up to date.');
      return 0;
    case 'cloned':
      console.log(`wiki:pull — cloned the wiki into ${wikiDir}.`);
      return 0;
    case 'failed':
      console.error(`wiki:pull — git ${outcome.step} failed (exit ${outcome.code}).`);
      if (outcome.detail) console.error(outcome.detail);
      if (outcome.step === 'pull') {
        console.error(
          'The clone was left untouched. Resolve it in `wiki/` (it is an ordinary git repo), or delete the directory to re-clone.',
        );
      }
      return 1;
  }
}

process.exitCode = await main();
