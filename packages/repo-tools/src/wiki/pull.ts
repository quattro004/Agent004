import { createGitRunner, describeFailure, type GitResult, type GitRunner } from './git.js';

export { createGitRunner };
export type { GitResult, GitRunner };

export interface PullOptions {
  git: GitRunner;
  wikiDir: string;
  hasClone: boolean;
  remoteUrl?: string;
}

export type PullOutcome =
  | { kind: 'pulled' }
  | { kind: 'cloned' }
  | { kind: 'failed'; step: 'pull' | 'clone'; code: number; detail: string };

export const WIKI_REMOTE_URL = 'https://github.com/quattro004/Agent004.wiki.git';

const REMOTE = 'origin';
const BRANCH = 'master';

/** Wraps a failed git step as a pull outcome. */
function failed(step: 'pull' | 'clone', result: GitResult): PullOutcome {
  return { kind: 'failed', ...describeFailure(step, result) };
}

/**
 * Updates the local wiki clone, cloning it first if it is absent.
 *
 * A failed pull is reported as itself and never falls back to cloning. The
 * shell one-liner this replaced ended in `|| git clone <url> wiki`, so every
 * pull failure — unreachable remote, diverged history, dirty tree — produced
 * a clone into a directory that already existed. git's real message was then
 * buried under "destination path 'wiki' already exists", and the exit code
 * reported belonged to the clone rather than the pull.
 *
 * The wiki's default branch is `master`, not `main`.
 */
export async function pullWiki({
  git,
  wikiDir,
  hasClone,
  remoteUrl = WIKI_REMOTE_URL,
}: PullOptions): Promise<PullOutcome> {
  if (hasClone) {
    const pull = await git(['-C', wikiDir, 'pull', '--ff-only', REMOTE, BRANCH]);
    if (pull.code !== 0) return failed('pull', pull);

    return { kind: 'pulled' };
  }

  const clone = await git(['clone', remoteUrl, wikiDir]);
  if (clone.code !== 0) return failed('clone', clone);

  return { kind: 'cloned' };
}
