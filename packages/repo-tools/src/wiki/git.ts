import { execFile } from 'node:child_process';

export interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type GitRunner = (args: readonly string[]) => Promise<GitResult>;

/**
 * Runs git in `cwd`, reporting the exit code instead of throwing so the caller
 * can name the step that failed rather than losing it to an exception.
 */
export function createGitRunner(cwd: string): GitRunner {
  return (args) =>
    new Promise((resolve) => {
      execFile('git', [...args], { cwd }, (error, stdout, stderr) => {
        const code = typeof error?.code === 'number' ? error.code : error ? 1 : 0;
        resolve({ code, stdout, stderr });
      });
    });
}

/** Names the failing step and keeps whichever stream git explained itself on. */
export function describeFailure<Step extends string>(
  step: Step,
  result: GitResult,
): { step: Step; code: number; detail: string } {
  return {
    step,
    code: result.code,
    detail: (result.stderr || result.stdout).trim(),
  };
}
