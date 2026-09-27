#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createGitRunner, pushWiki } from '../src/wiki/push.js';

/**
 * Pushes the local wiki clone.
 *
 * Wiki pushes are live and public — there is no branch, no pull request and no
 * CI — so this should only run once the change has been approved. See the
 * wiki's Guide-Wiki-Contributing page.
 */
async function main(): Promise<number> {
  const repoRoot = resolve(import.meta.dirname, '..', '..', '..');
  const wikiDir = resolve(repoRoot, 'wiki');

  if (!existsSync(wikiDir)) {
    console.error(`No wiki clone at ${wikiDir}. Run \`pnpm run wiki:pull\` first.`);
    return 1;
  }

  const message = process.argv[2];
  const outcome = await pushWiki({
    git: createGitRunner(wikiDir),
    ...(message ? { message } : {}),
  });

  switch (outcome.kind) {
    case 'pushed':
      console.log(
        outcome.committed
          ? 'wiki:push — staged, committed and pushed.'
          : 'wiki:push — pushed existing commits.',
      );
      return 0;
    case 'nothing-to-push':
      console.log('wiki:push — already up to date, nothing to push.');
      return 0;
    case 'failed':
      console.error(`wiki:push — git ${outcome.step} failed (exit ${outcome.code}).`);
      if (outcome.detail) console.error(outcome.detail);
      return 1;
  }
}

process.exitCode = await main();
