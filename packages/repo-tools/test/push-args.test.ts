import { describe, it, expect } from 'vitest';
import { parsePushArgs } from '../src/wiki/push-args.js';

describe('parsePushArgs', () => {
  it('uses the default message when given no arguments', () => {
    expect(parsePushArgs([])).toEqual({ kind: 'ok' });
  });

  it('accepts a quoted positional message', () => {
    expect(parsePushArgs(['Record the AgentCore decision'])).toEqual({
      kind: 'ok',
      message: 'Record the AgentCore decision',
    });
  });

  // The bug this module exists for: `--message "text"` silently committed with
  // the literal string "--message" as the wiki commit message, because the bin
  // read argv[2] positionally. A live, public push is the wrong place to learn
  // that a flag was not understood.
  it.each([['--message'], ['-m']])('accepts %s followed by the message', (flag) => {
    expect(parsePushArgs([flag, 'Record the AgentCore decision'])).toEqual({
      kind: 'ok',
      message: 'Record the AgentCore decision',
    });
  });

  it('accepts --message=text', () => {
    expect(parsePushArgs(['--message=Record the AgentCore decision'])).toEqual({
      kind: 'ok',
      message: 'Record the AgentCore decision',
    });
  });

  it('ignores the -- separator that pnpm may pass through', () => {
    expect(parsePushArgs(['--', 'Record the AgentCore decision'])).toEqual({
      kind: 'ok',
      message: 'Record the AgentCore decision',
    });
  });

  it.each([['--message'], ['-m'], ['--message=']])(
    'rejects %s with no message rather than committing an empty one',
    (arg) => {
      expect(parsePushArgs([arg])).toMatchObject({ kind: 'usage-error' });
    },
  );

  it('rejects a whitespace-only message', () => {
    expect(parsePushArgs(['   '])).toMatchObject({ kind: 'usage-error' });
  });

  it('rejects an unknown flag instead of treating it as the message', () => {
    expect(parsePushArgs(['--force'])).toMatchObject({ kind: 'usage-error' });
  });

  // `pnpm run wiki:push -- record the decision` would otherwise commit the
  // single word "record" and look like it worked.
  it('rejects an unquoted multi-word message', () => {
    const result = parsePushArgs(['record', 'the', 'decision']);

    expect(result).toMatchObject({ kind: 'usage-error' });
    if (result.kind === 'usage-error') {
      expect(result.reason).toMatch(/quote/i);
    }
  });

  it('names the offending argument so the fix is obvious', () => {
    const result = parsePushArgs(['--force']);

    if (result.kind !== 'usage-error') throw new Error('expected a usage error');
    expect(result.reason).toContain('--force');
  });
});
