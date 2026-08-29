import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const declared = new Set([
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.devDependencies ?? {}),
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(join(packageRoot, dir), { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => join(entry.parentPath, entry.name));
}

/** 'aws-cdk-lib/aws-iam' -> 'aws-cdk-lib', '@scope/pkg/sub' -> '@scope/pkg' */
function packageNameOf(specifier: string): string {
  const segments = specifier.split('/');
  return specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
}

function importedPackages(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const specifiers = [
    ...source.matchAll(/(?:^|\n)\s*import\s+(?:[^'"]*?from\s*)?['"]([^'"]+)['"]/g),
  ]
    .map((match) => match[1])
    .filter((specifier) => !specifier.startsWith('.') && !specifier.startsWith('node:'));

  return [...new Set(specifiers.map(packageNameOf))];
}

const imports = [...sourceFiles('bin'), ...sourceFiles('lib')].flatMap((file) =>
  importedPackages(file).map((pkg) => ({ file: file.slice(packageRoot.length + 1), pkg })),
);

describe('infra package dependency declarations', () => {
  test('finds bare imports to inspect', () => {
    expect(imports.length).toBeGreaterThan(0);
  });

  // pnpm does not link undeclared ("phantom") packages into the package's own
  // node_modules, so an import missing here fails at runtime under Node even
  // though the package may exist in the workspace store. That is what breaks
  // `cdk synth`, and Jest's lenient resolver will not catch it.
  test.each(imports)('$file declares a dependency on "$pkg"', ({ pkg }) => {
    const isDeclared = declared.has(pkg) || declared.has(`@types/${pkg}`);
    expect(isDeclared).toBe(true);
  });
});
