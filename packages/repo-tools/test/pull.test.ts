import { describe, it, expect } from 'vitest';
import { pullWiki, WIKI_REMOTE_URL, type GitResult, type GitRunner } from '../src/wiki/pull.js';

const ok = (stdout = ''): GitResult => ({ code: 0, stdout, stderr: '' });

const WIKI_DIR = '/repo/wiki';

/** Records every git invocation and replays a canned result. */
function fakeGit(result: GitResult = ok()) {
  const calls: (readonly string[])[] = [];
  const run: GitRunner = async (args) => {
    calls.push(args);
    return result;
  };
  return {
    run,
    calls,
    ran: (subcommand: string) => calls.some((c) => c.includes(subcommand)),
  };
}

describe('pullWiki', () => {
  it('clones when there is no local wiki clone yet', async () => {
    const git = fakeGit();

    const outcome = await pullWiki({ git: git.run, wikiDir: WIKI_DIR, hasClone: false });

    expect(git.calls).toEqual([['clone', WIKI_REMOTE_URL, WIKI_DIR]]);
    expect(outcome).toEqual({ kind: 'cloned' });
  });

  it('fast-forward pulls the wiki default branch when the clone exists', async () => {
    const git = fakeGit();

    const outcome = await pullWiki({ git: git.run, wikiDir: WIKI_DIR, hasClone: true });

    expect(git.calls).toEqual([['-C', WIKI_DIR, 'pull', '--ff-only', 'origin', 'master']]);
    expect(outcome).toEqual({ kind: 'pulled' });
  });

  // The shell one-liner this replaced was
  // `git -C wiki pull --ff-only origin master || git clone <url> wiki`, so any
  // pull failure — unreachable remote, diverged history, dirty tree — fell
  // through to a clone into a directory that already existed. git's real
  // message ("Repository not found") was then buried under "destination path
  // 'wiki' already exists", and the exit code belonged to the clone.
  it('reports the pull failure itself instead of falling back to a clone', async () => {
    const git = fakeGit({
      code: 128,
      stdout: '',
      stderr: "fatal: repository 'https://example.invalid/' not found",
    });

    const outcome = await pullWiki({ git: git.run, wikiDir: WIKI_DIR, hasClone: true });

    expect(git.ran('clone')).toBe(false);
    expect(outcome).toEqual({
      kind: 'failed',
      step: 'pull',
      code: 128,
      detail: "fatal: repository 'https://example.invalid/' not found",
    });
  });

  it('reports a failed clone', async () => {
    const git = fakeGit({ code: 128, stdout: '', stderr: 'fatal: could not create work tree' });

    const outcome = await pullWiki({ git: git.run, wikiDir: WIKI_DIR, hasClone: false });

    expect(outcome).toEqual({
      kind: 'failed',
      step: 'clone',
      code: 128,
      detail: 'fatal: could not create work tree',
    });
  });
});
