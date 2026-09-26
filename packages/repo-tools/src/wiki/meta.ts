export type PageMeta = {
  type?: string;
  status?: string;
  updated?: string;
  verified?: string;
  sources: string[];
  related: string[];
};

const OPEN = '<!--meta';
const CLOSE = '-->';

const SCALAR_KEYS = ['type', 'status', 'updated', 'verified'] as const;

function parseInlineList(value: string): string[] {
  const inner = value.trim().replace(/^\[/, '').replace(/\]$/, '');
  if (inner.trim() === '') return [];
  return inner
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

/**
 * Reads the leading `<!--meta ... -->` block.
 *
 * Deliberately not YAML frontmatter: the GitHub wiki does not strip `---`
 * frontmatter, it renders it as a horizontal rule and a stray paragraph.
 */
export function parseMetaBlock(content: string): PageMeta | null {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith(OPEN)) return null;

  const end = trimmed.indexOf(CLOSE);
  if (end === -1) return null;

  const body = trimmed.slice(OPEN.length, end);
  const meta: PageMeta = { sources: [], related: [] };
  let inSources = false;

  for (const rawLine of body.split('\n')) {
    const line = rawLine.trimEnd();
    if (line.trim() === '') continue;

    const listItem = /^\s+-\s+(.*)$/.exec(line);
    if (listItem && inSources) {
      meta.sources.push(listItem[1].trim());
      continue;
    }

    const pair = /^([A-Za-z_]+):\s*(.*)$/.exec(line.trim());
    if (!pair) continue;

    const [, key, value] = pair;
    inSources = key === 'sources';

    if (key === 'related') {
      meta.related = parseInlineList(value);
    } else if ((SCALAR_KEYS as readonly string[]).includes(key)) {
      meta[key as (typeof SCALAR_KEYS)[number]] = value.trim();
    }
  }

  return meta;
}
