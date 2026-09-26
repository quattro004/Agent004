import { describe, it, expect } from 'vitest';
import { parseMetaBlock } from '../src/wiki/meta.js';

describe('parseMetaBlock', () => {
  it('extracts a well-formed metadata block', () => {
    const page = [
      '<!--meta',
      'type: concept',
      'status: current',
      'updated: 2026-09-26',
      'verified: 2026-09-26',
      'sources:',
      '  - README.md',
      '  - package.json',
      'related: [Home, Index]',
      '-->',
      '',
      '# A Page',
    ].join('\n');

    const result = parseMetaBlock(page);

    expect(result).toEqual({
      type: 'concept',
      status: 'current',
      updated: '2026-09-26',
      verified: '2026-09-26',
      sources: ['README.md', 'package.json'],
      related: ['Home', 'Index'],
    });
  });

  it('returns null when the page has no metadata block', () => {
    expect(parseMetaBlock('# Just a heading\n\nSome prose.')).toBeNull();
  });

  it('returns null when the block is never closed', () => {
    expect(parseMetaBlock('<!--meta\ntype: guide\n\n# Heading')).toBeNull();
  });

  it('treats an empty sources list as an empty array, not undefined', () => {
    const page = ['<!--meta', 'type: guide', 'sources:', 'related: [Home]', '-->'].join('\n');
    expect(parseMetaBlock(page)?.sources).toEqual([]);
  });

  it('ignores YAML frontmatter, which the wiki renders as visible junk', () => {
    const page = ['---', 'type: concept', '---', '', '# A Page'].join('\n');
    expect(parseMetaBlock(page)).toBeNull();
  });
});
