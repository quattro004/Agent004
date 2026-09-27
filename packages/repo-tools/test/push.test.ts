import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pushWiki, createGitRunner, type GitResult, type GitRunner } from '../src/wiki/push.js';

const ok = (stdout = ''): GitResult => ({ code: 0, stdout, stderr: '' });

/** Records every git invocation and replays canned results per subcommand. */
function fakeGit(responses: Record<string, GitResult> = {}) {
  const calls: (readonly string[])[] = [];
  const run: GitRunner = async (args) => {
    calls.push(args);
    return responses[args[0] ?? ''] ?? ok();
  };
  return {
    run,
    calls,
    ran: (subcommand: string) => calls.some((c) => c[0] === subcommand),
    argsFor: (subcommand: string) => calls.find((c) => c[0] === subcommand),
  };
}

/** A clone whose work is already committed: clean tree, one commit ahead. */
const alreadyCommitted = {
  status: ok(''),
  'rev-list': ok('1\n'),
  commit: { code: 1, stdout: 'nothing to commit, working tree clean', stderr: '' },
};

describe('pushWiki', () => {
  it('pushes commits that already exist when the working tree is clean', async () => {
    const git = fakeGit(alreadyCommitted);

    const outcome = await pushWiki({ git: git.run });

    expect(git.ran('push')).toBe(true);
    expect(outcome.kind).toBe('pushed');
  });

  it('does not commit when the working tree is clean, so no empty commit is created', async () => {
    const git = fakeGit(alreadyCommitted);

    await pushWiki({ git: git.run });

    expect(git.ran('commit')).toBe(false);
  });

  it('stages and commits before pushing when the working tree is dirty', async () => {
    const git = fakeGit({ status: ok(' M Index.md\n') });

    const outcome = await pushWiki({ git: git.run });

    expect(git.calls.map((c) => c[0])).toEqual(['status', 'add', 'commit', 'push']);
    expect(outcome).toEqual({ kind: 'pushed', committed: true });
  });

  it('uses a caller-supplied commit message', async () => {
    const git = fakeGit({ status: ok(' M Log.md\n') });

    await pushWiki({ git: git.run, message: 'Record the CRLF trap' });

    expect(git.argsFor('commit')).toEqual(['commit', '-m', 'Record the CRLF trap']);
  });

  it('reports nothing-to-push, without pushing, when the tree is clean and up to date', async () => {
    const git = fakeGit({ status: ok(''), 'rev-list': ok('0\n') });

    const outcome = await pushWiki({ git: git.run });

    expect(outcome).toEqual({ kind: 'nothing-to-push' });
    expect(git.ran('push')).toBe(false);
  });

  it('attempts the push when the upstream count cannot be read, rather than skipping silently', async () => {
    const git = fakeGit({
      status: ok(''),
      'rev-list': { code: 128, stdout: '', stderr: 'no upstream configured' },
    });

    await pushWiki({ git: git.run });

    expect(git.ran('push')).toBe(true);
  });

  it('surfaces a failing push with the step that failed, rather than swallowing it', async () => {
    const git = fakeGit({
      ...alreadyCommitted,
      push: { code: 1, stdout: '', stderr: 'rejected: non-fast-forward' },
    });

    const outcome = await pushWiki({ git: git.run });

    expect(outcome).toEqual({
      kind: 'failed',
      step: 'push',
      code: 1,
      detail: 'rejected: non-fast-forward',
    });
  });
});

describe('createGitRunner', () => {
  it('surfaces a non-zero exit code rather than throwing, so callers can report the failing step', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wiki-push-'));
    try {
      const result = await createGitRunner(dir)(['status', '--porcelain']);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toMatch(/not a git repository/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
