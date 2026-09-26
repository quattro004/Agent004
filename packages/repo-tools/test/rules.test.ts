import { describe, it, expect } from 'vitest';
import { lintWiki, type WikiPage } from '../src/wiki/rules.js';

const META = [
  '<!--meta',
  'type: guide',
  'status: current',
  'updated: 2026-09-26',
  'verified: 2026-09-26',
  'sources:',
  '  - README.md',
  'related: [Home]',
  '-->',
  '',
].join('\n');

function page(name: string, body: string, meta = META): WikiPage {
  return { name, content: meta + body };
}

/** A minimal but valid wiki: every rule satisfied. */
function baseWiki(): WikiPage[] {
  return [
    page('Home', '# Home\n\nSee [[Index]], [[Log]] and [[Guide-Local-Setup]].'),
    page('Index', '# Index\n\n- [[Home]]\n- [[Log]]\n- [[Guide-Local-Setup]]\n- Index'),
    page('Log', '# Log\n\n| 1 | 2026-09-26 | Created [[Home]] and [[Index]]. |'),
    page('Guide-Local-Setup', '# Guide: Local Setup\n\nBack to [[Home]] and [[Index]].'),
  ];
}

const ok = { sourceExists: () => true };

function rulesFired(pages: WikiPage[]) {
  return lintWiki(pages, ok).map((f) => f.rule);
}

describe('lintWiki', () => {
  it('reports nothing for a wiki that satisfies every rule', () => {
    expect(lintWiki(baseWiki(), ok)).toEqual([]);
  });

  describe('rule: indexed', () => {
    it('fails when a page is missing from Index', () => {
      const pages = baseWiki();
      pages.push(page('Guide-Deployment', '# Guide: Deployment\n\n[[Home]] [[Index]]'));
      pages[0] = page(
        'Home',
        '# Home\n\n[[Index]] [[Log]] [[Guide-Local-Setup]] [[Guide-Deployment]]',
      );
      const found = lintWiki(pages, ok);
      expect(found).toContainEqual(
        expect.objectContaining({ page: 'Guide-Deployment', rule: 'indexed' }),
      );
    });

    it('does not require _Sidebar to be listed in Index', () => {
      const pages = baseWiki();
      pages.push(page('_Sidebar', '- [[Home]]\n- [[Index]]'));
      expect(rulesFired(pages)).not.toContain('indexed');
    });
  });

  describe('rule: orphan', () => {
    it('fails when no other page links to a page', () => {
      const pages = baseWiki();
      pages.push(page('Guide-Deployment', '# Guide: Deployment\n\n[[Home]] [[Index]]'));
      pages[1] = page(
        'Index',
        '# Index\n\n- [[Home]]\n- [[Log]]\n- [[Guide-Local-Setup]]\n- Index',
      );
      const found = lintWiki(pages, ok);
      expect(found).toContainEqual(
        expect.objectContaining({ page: 'Guide-Deployment', rule: 'orphan' }),
      );
    });

    it('exempts Home and _Sidebar, which are reached by navigation', () => {
      const pages = [
        page('Home', '# Home\n\n[[Index]] [[Log]]'),
        page('_Sidebar', '- [[Home]]\n- [[Index]]\n- [[Log]]'),
        page('Index', '# Index\n\n- [[Home]]\n- [[Log]]\n- Index'),
        page('Log', '# Log\n\n[[Home]] [[Index]]'),
      ];
      expect(rulesFired(pages)).not.toContain('orphan');
    });
  });

  describe('rule: broken-link', () => {
    it('fails when a wikilink points at a page that does not exist', () => {
      const pages = baseWiki();
      pages[0] = page('Home', '# Home\n\n[[Index]] [[Log]] [[Guide-Local-Setup]] [[Nope]]');
      expect(lintWiki(pages, ok)).toContainEqual(
        expect.objectContaining({ page: 'Home', rule: 'broken-link' }),
      );
    });
  });

  describe('rule: metadata', () => {
    it('fails when the metadata block is missing entirely', () => {
      const pages = baseWiki();
      pages[3] = {
        name: 'Guide-Local-Setup',
        content: '# Guide: Local Setup\n\n[[Home]] [[Index]]',
      };
      expect(lintWiki(pages, ok)).toContainEqual(
        expect.objectContaining({ page: 'Guide-Local-Setup', rule: 'metadata' }),
      );
    });

    it('fails on an unknown type', () => {
      const pages = baseWiki();
      pages[3] = page(
        'Guide-Local-Setup',
        '# Guide: Local Setup\n\n[[Home]] [[Index]]',
        META.replace('type: guide', 'type: musing'),
      );
      expect(lintWiki(pages, ok)).toContainEqual(
        expect.objectContaining({ page: 'Guide-Local-Setup', rule: 'metadata' }),
      );
    });

    it('fails on an unknown status', () => {
      const pages = baseWiki();
      pages[3] = page(
        'Guide-Local-Setup',
        '# Guide: Local Setup\n\n[[Home]] [[Index]]',
        META.replace('status: current', 'status: probably-fine'),
      );
      expect(lintWiki(pages, ok)).toContainEqual(
        expect.objectContaining({ page: 'Guide-Local-Setup', rule: 'metadata' }),
      );
    });

    it('accepts every documented type and status', () => {
      for (const type of [
        'concept',
        'component',
        'contract',
        'decision',
        'feature',
        'guide',
        'source',
      ]) {
        for (const status of ['current', 'draft', 'superseded', 'deferred']) {
          const pages = baseWiki();
          pages[3] = page(
            'Guide-Local-Setup',
            '# Guide: Local Setup\n\n[[Home]] [[Index]]',
            META.replace('type: guide', `type: ${type}`).replace(
              'status: current',
              `status: ${status}`,
            ),
          );
          expect(rulesFired(pages), `${type}/${status}`).not.toContain('metadata');
        }
      }
    });
  });

  describe('rule: source-path', () => {
    it('fails when a cited repo path does not exist', () => {
      const found = lintWiki(baseWiki(), { sourceExists: () => false });
      expect(found).toContainEqual(expect.objectContaining({ rule: 'source-path' }));
    });

    it('accepts a pinned permalink for a source that has left the tree', () => {
      const meta = META.replace(
        '  - README.md',
        '  - specs/002-volume-knob-up-down/spec.md@d3cf582',
      );
      const pages = baseWiki();
      pages[3] = page('Guide-Local-Setup', '# Guide: Local Setup\n\n[[Home]] [[Index]]', meta);
      const found = lintWiki(pages, {
        sourceExists: (p) => p !== 'specs/002-volume-knob-up-down/spec.md',
      });
      expect(
        found.filter((f) => f.page === 'Guide-Local-Setup' && f.rule === 'source-path'),
      ).toEqual([]);
    });

    it('accepts an absolute URL, because GitHub issues are a raw source too', () => {
      const meta = META.replace(
        '  - README.md',
        '  - https://github.com/quattro004/Agent004/issues/10',
      );
      const pages = baseWiki();
      pages[3] = page('Guide-Local-Setup', '# Guide: Local Setup\n\n[[Home]] [[Index]]', meta);
      const found = lintWiki(pages, { sourceExists: (p) => p === 'README.md' });
      expect(
        found.filter((f) => f.page === 'Guide-Local-Setup' && f.rule === 'source-path'),
      ).toEqual([]);
    });
  });

  describe('rule: filename', () => {
    it('fails when a page name uses no allowed prefix', () => {
      const pages = baseWiki();
      pages.push(page('Random-Thoughts', '# Random\n\n[[Home]] [[Index]]'));
      pages[1] = page(
        'Index',
        '# Index\n\n[[Home]] [[Log]] [[Guide-Local-Setup]] [[Random-Thoughts]]',
      );
      expect(lintWiki(pages, ok)).toContainEqual(
        expect.objectContaining({ page: 'Random-Thoughts', rule: 'filename' }),
      );
    });

    it('fails when two pages collide in the flat namespace', () => {
      const pages = baseWiki();
      pages.push(page('Guide-Local-Setup', '# Dup\n\n[[Home]] [[Index]]'));
      expect(rulesFired(pages)).toContain('filename');
    });
  });

  describe('rule: page-length', () => {
    it('fails above 300 lines', () => {
      const pages = baseWiki();
      const long = '# Long\n\n[[Home]] [[Index]]\n' + 'filler\n'.repeat(310);
      pages[3] = page('Guide-Local-Setup', long);
      expect(lintWiki(pages, ok)).toContainEqual(
        expect.objectContaining({ page: 'Guide-Local-Setup', rule: 'page-length' }),
      );
    });
  });

  describe('rule: log-freshness', () => {
    it('fails when a page is updated more recently than the newest Log entry', () => {
      const pages = baseWiki();
      pages[3] = page(
        'Guide-Local-Setup',
        '# Guide: Local Setup\n\n[[Home]] [[Index]]',
        META.replace('updated: 2026-09-26', 'updated: 2026-10-05'),
      );
      expect(lintWiki(pages, ok)).toContainEqual(
        expect.objectContaining({ page: 'Log', rule: 'log-freshness' }),
      );
    });
  });

  describe('rule: secret', () => {
    it.each([
      ['an access key id', 'AKIAIOSFODNN7EXAMPLE'],
      ['a temporary access key id', 'ASIAIOSFODNN7EXAMPLE'],
      ['a bare AWS account id', 'Account 123456789012 owns the stack.'],
    ])('fails on %s', (_label, secret) => {
      const pages = baseWiki();
      pages[3] = page(
        'Guide-Local-Setup',
        `# Guide: Local Setup\n\n${secret}\n\n[[Home]] [[Index]]`,
      );
      expect(lintWiki(pages, ok)).toContainEqual(
        expect.objectContaining({ page: 'Guide-Local-Setup', rule: 'secret' }),
      );
    });

    it('does not flag an ordinary twelve-digit-looking date or version string', () => {
      const pages = baseWiki();
      pages[3] = page(
        'Guide-Local-Setup',
        '# Guide: Local Setup\n\nBuilt 2026-09-26 with pnpm 11.24.0.\n\n[[Home]] [[Index]]',
      );
      expect(rulesFired(pages)).not.toContain('secret');
    });
  });
});
