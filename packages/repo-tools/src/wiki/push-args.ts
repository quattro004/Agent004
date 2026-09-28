export type PushArgs = { kind: 'ok'; message?: string } | { kind: 'usage-error'; reason: string };

const USAGE = 'Usage: pnpm run wiki:push -- "Your commit message"';

function usageError(reason: string): PushArgs {
  return { kind: 'usage-error', reason: `${reason}\n${USAGE}` };
}

function withMessage(value: string, source: string): PushArgs {
  if (value.trim() === '') return usageError(`${source} needs a non-empty message.`);
  return { kind: 'ok', message: value };
}

/**
 * An unquoted multi-word message is the dangerous case: taking the first word
 * would commit something that looks deliberate but is not what was typed.
 */
function tooManyArguments(rest: readonly string[]): PushArgs {
  return usageError(
    `Unexpected extra argument ${JSON.stringify(rest[0])} — quote the whole message.`,
  );
}

/**
 * Parses the arguments of `wiki:push` into a commit message.
 *
 * A wiki push is live, public and un-reviewed, so an argument this cannot
 * explain is rejected rather than guessed at. The bin previously read
 * `process.argv[2]` positionally, which meant `--message "text"` committed with
 * the literal string `--message` — the flag was not understood, and nothing
 * said so until the commit was already public.
 *
 * Both `-m`/`--message` and a bare positional message are accepted, because
 * both are natural to reach for.
 */
export function parsePushArgs(argv: readonly string[]): PushArgs {
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  const [first, ...rest] = args;

  if (first === undefined) return { kind: 'ok' };

  if (first === '-m' || first === '--message') {
    const value = rest[0];
    if (value === undefined) return usageError(`${first} was given without a message.`);
    if (rest.length > 1) return tooManyArguments(rest.slice(1));
    return withMessage(value, first);
  }

  if (first.startsWith('--message=')) {
    if (rest.length > 0) return tooManyArguments(rest);
    return withMessage(first.slice('--message='.length), '--message=');
  }

  if (first.startsWith('-')) return usageError(`Unrecognised option ${first}.`);

  if (rest.length > 0) return tooManyArguments(rest);

  return withMessage(first, 'wiki:push');
}
