import { parseMetaBlock } from './meta.js';
import { extractWikiLinks } from './links.js';

export type WikiPage = {
  name: string;
  content: string;
};

export type LintOptions = {
  sourceExists: (repoRelativePath: string) => boolean;
};

export type LintRule =
  | 'indexed'
  | 'orphan'
  | 'broken-link'
  | 'metadata'
  | 'source-path'
  | 'filename'
  | 'page-length'
  | 'log-freshness'
  | 'secret';

export type Finding = {
  page: string;
  rule: LintRule;
  message: string;
};

export const ALLOWED_PREFIXES = [
  'Concept-',
  'Component-',
  'Contract-',
  'Decision-',
  'Feature-',
  'Guide-',
  'Source-',
] as const;

/** Spine pages carry no prefix. */
export const SPINE_PAGES = ['Home', '_Sidebar', 'Index', 'Log', 'Wiki-Conventions', 'Gotchas'];

export const ALLOWED_TYPES = [
  'concept',
  'component',
  'contract',
  'decision',
  'feature',
  'guide',
  'source',
];

export const ALLOWED_STATUSES = ['current', 'draft', 'superseded', 'deferred'];

export const MAX_PAGE_LINES = 300;

/** Reached by navigation rather than by an inbound link. */
const ORPHAN_EXEMPT = ['Home', '_Sidebar'];

const SECRET_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, 'an AWS access key id'],
  [/(?<![\d.-])\d{12}(?![\d.-])/, 'a bare twelve-digit AWS account id'],
];

const PERMALINK = /^(.+)@[0-9a-f]{7,40}$/;
const ISO_DATE = /\d{4}-\d{2}-\d{2}/g;

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isListedIn(indexContent: string, name: string): boolean {
  const boundary = new RegExp(`(^|[^A-Za-z0-9_-])${escapeForRegExp(name)}([^A-Za-z0-9_-]|$)`);
  return boundary.test(indexContent);
}

function newestDate(content: string): string | undefined {
  const matches = content.match(ISO_DATE);
  return matches?.sort().at(-1);
}

export function lintWiki(pages: WikiPage[], options: LintOptions): Finding[] {
  const findings: Finding[] = [];
  const add = (page: string, rule: LintRule, message: string) =>
    findings.push({ page, rule, message });

  const names = new Set(pages.map((p) => p.name));
  const indexContent = pages.find((p) => p.name === 'Index')?.content ?? '';
  const logPage = pages.find((p) => p.name === 'Log');

  const inbound = new Map<string, number>();
  for (const p of pages) {
    for (const target of extractWikiLinks(p.content)) {
      if (target === p.name) continue;
      inbound.set(target, (inbound.get(target) ?? 0) + 1);
    }
  }

  const seen = new Set<string>();
  let newestUpdated: string | undefined;

  for (const p of pages) {
    // filename — allowed prefix, and unique in the flat namespace
    const prefixed = ALLOWED_PREFIXES.some((prefix) => p.name.startsWith(prefix));
    if (!prefixed && !SPINE_PAGES.includes(p.name)) {
      add(p.name, 'filename', `"${p.name}" uses no allowed prefix and is not a spine page.`);
    }
    if (seen.has(p.name)) {
      add(p.name, 'filename', `"${p.name}" collides with another page in the flat namespace.`);
    }
    seen.add(p.name);

    // indexed
    if (p.name !== '_Sidebar' && !isListedIn(indexContent, p.name)) {
      add(p.name, 'indexed', `"${p.name}" is not listed in Index.`);
    }

    // orphan
    if (!ORPHAN_EXEMPT.includes(p.name) && !inbound.has(p.name)) {
      add(p.name, 'orphan', `Nothing links to "${p.name}".`);
    }

    // broken-link
    for (const target of extractWikiLinks(p.content)) {
      if (!names.has(target)) {
        add(p.name, 'broken-link', `[[${target}]] does not resolve to a page.`);
      }
    }

    // metadata
    const meta = parseMetaBlock(p.content);
    if (!meta) {
      add(p.name, 'metadata', 'Missing a <!--meta ... --> block.');
    } else {
      if (!meta.type || !ALLOWED_TYPES.includes(meta.type)) {
        add(p.name, 'metadata', `Unknown type "${meta.type ?? '(none)'}".`);
      }
      if (!meta.status || !ALLOWED_STATUSES.includes(meta.status)) {
        add(p.name, 'metadata', `Unknown status "${meta.status ?? '(none)'}".`);
      }
      if (meta.updated && (!newestUpdated || meta.updated > newestUpdated)) {
        newestUpdated = meta.updated;
      }

      // source-path — a live repo path, a pinned `path@sha` permalink for a
      // source that has left the tree, or an absolute URL (issues, PRs, docs).
      for (const source of meta.sources) {
        if (/^https?:\/\//.test(source)) continue;
        if (PERMALINK.test(source)) continue;
        if (!options.sourceExists(source)) {
          add(p.name, 'source-path', `Cited source "${source}" does not exist in the repo.`);
        }
      }
    }

    // page-length
    const lines = p.content.split('\n').length;
    if (lines > MAX_PAGE_LINES) {
      add(p.name, 'page-length', `${lines} lines exceeds the ${MAX_PAGE_LINES}-line maximum.`);
    }

    // secret
    for (const [pattern, label] of SECRET_PATTERNS) {
      if (pattern.test(p.content)) {
        add(p.name, 'secret', `Page appears to contain ${label}.`);
      }
    }
  }

  // log-freshness
  if (!logPage) {
    add('Log', 'log-freshness', 'There is no Log page.');
  } else if (newestUpdated) {
    const newestLogEntry = newestDate(logPage.content);
    if (!newestLogEntry || newestLogEntry < newestUpdated) {
      add(
        'Log',
        'log-freshness',
        `Newest Log entry (${newestLogEntry ?? 'none'}) is older than the newest page update (${newestUpdated}).`,
      );
    }
  }

  return findings;
}
