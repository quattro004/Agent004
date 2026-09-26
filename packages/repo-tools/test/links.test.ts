import { describe, it, expect } from 'vitest';
import { extractWikiLinks } from '../src/wiki/links.js';

describe('extractWikiLinks', () => {
  it('finds every [[wikilink]] on a page', () => {
    const page = 'See [[Home]] and [[Concept-Budget-Ceiling]], then [[Home]] again.';
    expect(extractWikiLinks(page)).toEqual(['Home', 'Concept-Budget-Ceiling', 'Home']);
  });

  it('returns an empty array when there are no links', () => {
    expect(extractWikiLinks('# Heading\n\nNo links here.')).toEqual([]);
  });

  it('trims surrounding whitespace from a link target', () => {
    expect(extractWikiLinks('[[ Index ]]')).toEqual(['Index']);
  });

  it('ignores links inside fenced code blocks, which are examples not references', () => {
    const page = ['Real: [[Index]]', '', '```text', 'Example: [[Not-A-Page]]', '```'].join('\n');
    expect(extractWikiLinks(page)).toEqual(['Index']);
  });

  it('ignores links inside inline code spans, which are notation not references', () => {
    const page = 'Every `[[wikilink]]` must resolve, so link [[Index]] properly.';
    expect(extractWikiLinks(page)).toEqual(['Index']);
  });
});
