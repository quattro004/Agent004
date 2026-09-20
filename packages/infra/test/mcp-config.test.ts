import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * The two MCP configs describe the same servers in different dialects: the
 * generic one keys them under `mcpServers`, VS Code under `servers`.
 */
function readServers(file: string, key: 'mcpServers' | 'servers') {
  const config = JSON.parse(readFileSync(join(repoRoot, ...file.split('/')), 'utf8'));

  return config[key] as Record<string, { type: string; url: string }>;
}

describe('MCP server configuration', () => {
  const generic = readServers('.mcp.json', 'mcpServers');
  const vscode = readServers('.vscode/mcp.json', 'servers');

  // `.vscode/mcp.json` was left behind when `aws-mcp` was added to `.mcp.json`,
  // so VS Code users silently lost a server the rest of the team had. Neither
  // file is the source of truth; they have to be edited together.
  test('defines the same servers in .mcp.json and .vscode/mcp.json', () => {
    expect(Object.keys(vscode).sort()).toEqual(Object.keys(generic).sort());
  });

  test('points each server at the same URL in both files', () => {
    const urls = (servers: Record<string, { url: string }>) =>
      Object.fromEntries(Object.entries(servers).map(([name, { url }]) => [name, url]));

    expect(urls(vscode)).toEqual(urls(generic));
  });

  // A `stdio` entry shelling out to uvx/npx makes a package manager a new
  // onboarding prerequisite for every contributor. See AGENTS.md § MCP
  // configuration and quickstart.md § MCP servers.
  test('uses plain HTTP endpoints only', () => {
    const entries = [...Object.values(generic), ...Object.values(vscode)];

    expect(entries.length).toBeGreaterThan(0);
    expect(entries.filter(({ type }) => type !== 'http')).toEqual([]);
  });
});
