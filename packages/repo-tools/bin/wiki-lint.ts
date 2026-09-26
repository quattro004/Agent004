#!/usr/bin/env node
import { resolve } from 'node:path';
import { readWikiPages, repoSourceExists } from '../src/wiki/load.js';
import { lintWiki } from '../src/wiki/rules.js';

/**
 * Lints the local wiki clone.
 *
 * Deliberately not part of `pnpm run validate`: the `wiki/` clone is optional
 * and gitignored, so `validate` must pass on a checkout that has never cloned
 * it. See the wiki's Wiki-Conventions page.
 */
async function main(): Promise<number> {
  const repoRoot = resolve(import.meta.dirname, '..', '..', '..');
  const wikiDir = process.argv[2] ? resolve(process.argv[2]) : resolve(repoRoot, 'wiki');

  const pages = await readWikiPages(wikiDir);
  if (pages === null) {
    console.log(`No wiki clone at ${wikiDir}. Run \`pnpm run wiki:pull\` first. Skipping.`);
    return 0;
  }

  const findings = lintWiki(pages, { sourceExists: repoSourceExists(repoRoot) });

  if (findings.length === 0) {
    console.log(`wiki:lint — ${pages.length} pages, no findings.`);
    return 0;
  }

  for (const finding of findings) {
    console.error(`${finding.page}: [${finding.rule}] ${finding.message}`);
  }
  console.error(`\nwiki:lint — ${findings.length} finding(s) across ${pages.length} pages.`);
  return 1;
}

process.exitCode = await main();
