import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * `.specify/extensions.yml` is generated from each installed extension's own
 * `extension.yml`, so we never hand-edit it — `specify extension update`
 * removes and reinstalls the extension and regenerates this file wholesale.
 *
 * That makes it drift silently when upstream retires a core command: the hook
 * stanzas for the dead command survive in our copy, referencing an event
 * nothing emits any more. Parsed with a regex rather than a YAML dependency,
 * since all we need are the two key levels.
 */
function readHookConfig() {
  const yaml = readFileSync(join(repoRoot, '.specify', 'extensions.yml'), 'utf8');
  const hooksSection = yaml.split(/^hooks:$/m)[1] ?? '';

  const events = [...hooksSection.matchAll(/^ {2}(\w+):$/gm)].map(([, event]) => event);
  const commands = [...hooksSection.matchAll(/^\s+command:\s*(\S+)$/gm)].map(
    ([, command]) => command,
  );

  return { events, commands: [...new Set(commands)] };
}

/** Commands the active integration actually installed, by agent file. */
function installedCommands(): string[] {
  return readdirSync(join(repoRoot, '.github', 'agents'))
    .filter((name) => name.startsWith('speckit.') && name.endsWith('.agent.md'))
    .map((name) => name.slice(0, -'.agent.md'.length));
}

/** `before_plan` and `after_plan` are both emitted by `speckit.plan`. */
function owningCommand(event: string): string {
  return `speckit.${event.replace(/^(before|after)_/, '')}`;
}

describe('Spec Kit extension hooks', () => {
  const { events, commands } = readHookConfig();
  const installed = installedCommands();

  test('parses the hook config it is meant to be guarding', () => {
    expect(events.length).toBeGreaterThan(0);
    expect(commands.length).toBeGreaterThan(0);
  });

  // Upstream has slated `taskstoissues` for removal (github/spec-kit#4422,
  // #4423), which would leave `before_taskstoissues` and `after_taskstoissues`
  // in this file pointing at an event no command emits. That is inert rather
  // than broken — each hook is read by the very command being removed — but it
  // is still dead config, and nothing would tell us it had happened. This
  // fails at upgrade time instead, which is when it can be acted on.
  test('registers hooks only for commands that are installed', () => {
    const orphaned = events.filter((event) => !installed.includes(owningCommand(event)));

    expect(orphaned).toEqual([]);
  });

  // The other direction: a hook whose `command:` no longer resolves would fail
  // loudly mid-workflow, because the owning command does still run and does
  // still try to invoke it.
  test('invokes only commands that are installed', () => {
    const missing = commands.filter((command) => !installed.includes(command));

    expect(missing).toEqual([]);
  });
});
