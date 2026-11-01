import { createGitRunner, describeFailure, type GitResult, type GitRunner } from './git.js';

export { createGitRunner };
export type { GitResult, GitRunner };

export interface PushOptions {
  git: GitRunner;
  message?: string;
}

export type PushOutcome =
  | { kind: 'pushed'; committed: boolean }
  | { kind: 'nothing-to-push' }
  | { kind: 'failed'; step: string; code: number; detail: string };

export const DEFAULT_MESSAGE = 'Update wiki';

const REMOTE = 'origin';
const BRANCH = 'master';

/** Wraps a failed git step as a push outcome. */
function failed(step: string, result: GitResult): PushOutcome {
  return { kind: 'failed', ...describeFailure(step, result) };
}

/**
 * Stages, commits and pushes the local wiki clone.
 *
 * Committing is conditional on the working tree being dirty, and pushing is
 * independent of whether this run committed anything. The previous shell
 * one-liner chained `add && commit && push`, so a clone whose work was already
 * committed by hand produced "nothing to commit", a non-zero exit, and a push
 * that never ran — the wiki looked published when it was not.
 *
 * The wiki's default branch is `master`, not `main`.
 */
export async function pushWiki({
  git,
  message = DEFAULT_MESSAGE,
}: PushOptions): Promise<PushOutcome> {
  const status = await git(['status', '--porcelain']);
  if (status.code !== 0) return failed('status', status);

  const isDirty = status.stdout.trim() !== '';

  if (isDirty) {
    const add = await git(['add', '-A']);
    if (add.code !== 0) return failed('add', add);

    const commit = await git(['commit', '-m', message]);
    if (commit.code !== 0) return failed('commit', commit);
  }

  if (!isDirty && !(await hasUnpushedCommits(git))) {
    return { kind: 'nothing-to-push' };
  }

  const push = await git(['push', REMOTE, BRANCH]);
  if (push.code !== 0) return failed('push', push);

  return { kind: 'pushed', committed: isDirty };
}

/**
 * Whether the branch is ahead of its upstream.
 *
 * An unreadable count means the upstream is not configured yet, so the push is
 * attempted rather than skipped: a push that should not have run reports its
 * own error, whereas a push wrongly skipped is silent.
 */
async function hasUnpushedCommits(git: GitRunner): Promise<boolean> {
  const revList = await git(['rev-list', '--count', '@{upstream}..HEAD']);
  if (revList.code !== 0) return true;

  const count = Number.parseInt(revList.stdout.trim(), 10);
  return Number.isNaN(count) ? true : count > 0;
}
