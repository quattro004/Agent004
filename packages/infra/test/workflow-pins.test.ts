import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const workflowDir = join(repoRoot, '.github', 'workflows');

/** Every `uses:` reference across all workflows, as `file -> ref` pairs. */
function actionRefs(): { file: string; ref: string }[] {
  return readdirSync(workflowDir)
    .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
    .flatMap((file) => {
      const source = readFileSync(join(workflowDir, file), 'utf8');

      return [...source.matchAll(/uses:\s*(\S+)/g)].map((match) => ({ file, ref: match[1] }));
    });
}

describe('workflow action pins', () => {
  // A tag is mutable: whoever owns the action can repoint `@v7` at any commit,
  // so a tag pin trusts the publisher forever. A 40-character commit SHA cannot
  // be moved. Dependabot's `github-actions` entry keeps these SHAs current.
  test('pins every action to an immutable commit SHA', () => {
    const refs = actionRefs();

    expect(refs.length).toBeGreaterThan(0);
    expect(refs.filter(({ ref }) => !/@[0-9a-f]{40}$/.test(ref))).toEqual([]);
  });
});
