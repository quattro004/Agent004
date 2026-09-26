/** Strips fenced blocks and inline code so that examples are not read as references. */
function stripCode(content: string): string {
  return content.replace(/^```[\s\S]*?^```/gm, '').replace(/`[^`\n]*`/g, '');
}

export function extractWikiLinks(content: string): string[] {
  const links: string[] = [];
  const pattern = /\[\[([^\]]+)\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(stripCode(content))) !== null) {
    links.push(match[1].trim());
  }
  return links;
}
