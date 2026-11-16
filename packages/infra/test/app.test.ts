import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cdk from 'aws-cdk-lib';
import { IConstruct } from 'constructs';
import { buildMaxHeightApp } from '../lib/max-height-app.js';
import { DEPLOY_CONTEXT } from './deploy-context.js';

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

// research § R-deploy (Region, cost-allocation tag) and § R-obs (14-day logs).
describe('Max Height app', () => {
  const CERTIFICATE_STACK = 'MaxHeight-Certificate';
  let app: cdk.App;
  let stacks: cdk.Stack[];

  beforeAll(() => {
    app = new cdk.App({ context: DEPLOY_CONTEXT });
    buildMaxHeightApp(app);
    app.synth();
    stacks = app.node.children.filter((c): c is cdk.Stack => cdk.Stack.isStack(c));
  });

  test('builds stacks to inspect', () => {
    expect(stacks.length).toBeGreaterThan(0);
  });

  // Deviation C32: Ops was unreachable until the pruner existed, which made
  // the hard stop unreachable with it — the one thing that must be deployed
  // before a friend can spend anything (contracts/spend-control.md).
  test('includes every stack, Ops among them', () => {
    expect(stacks.map((s) => s.stackName).sort()).toEqual([
      'MaxHeight-Agent',
      'MaxHeight-Budget',
      'MaxHeight-Certificate',
      'MaxHeight-Cognito',
      'MaxHeight-Data',
      'MaxHeight-Frontend',
      'MaxHeight-Ops',
    ]);
  });

  test('Ops deploys after the stacks whose resources it acts on', () => {
    const ops = stacks.find((s) => s.stackName === 'MaxHeight-Ops');
    const dependencies = ops!.dependencies.map((s) => s.stackName).sort();
    expect(dependencies).toEqual(
      expect.arrayContaining(['MaxHeight-Agent', 'MaxHeight-Budget', 'MaxHeight-Data']),
    );
  });

  test('every stack except Certificate is pinned to us-west-2', () => {
    const regions = stacks
      .filter((s) => s.stackName !== CERTIFICATE_STACK)
      .map((s) => ({ stack: s.stackName, region: s.region }));
    expect(regions).toEqual(regions.map(({ stack }) => ({ stack, region: 'us-west-2' })));
  });

  test('every taggable resource carries project=max-height', () => {
    const untagged = app.node
      .findAll()
      .filter((c: IConstruct) => cdk.CfnResource.isCfnResource(c))
      .flatMap((c) => {
        const manager = cdk.TagManager.isTaggable(c)
          ? c.tags
          : cdk.TagManager.isTaggableV2(c)
            ? c.cdkTagManager
            : undefined;
        return manager && manager.tagValues().project !== 'max-height' ? [c.node.path] : [];
      });
    expect(untagged).toEqual([]);
  });

  // Lambda creates a missing /aws/lambda/<name> group on first invoke, and that
  // group never expires. CDK's own provider Lambdas included (SC-011).
  test('every Lambda function logs to a 14-day log group', () => {
    const offenders = stacks.flatMap((stack) => {
      const template = app.synth().getStackArtifact(stack.artifactId).template as {
        Resources: Record<string, { Type: string; Properties?: Record<string, unknown> }>;
      };
      return Object.entries(template.Resources)
        .filter(([, r]) => r.Type === 'AWS::Lambda::Function')
        .flatMap(([id, r]) => {
          const ref = (r.Properties?.LoggingConfig as { LogGroup?: { Ref?: string } } | undefined)
            ?.LogGroup?.Ref;
          const group = ref ? template.Resources[ref] : undefined;
          const ok =
            group?.Type === 'AWS::Logs::LogGroup' && group.Properties?.RetentionInDays === 14;
          return ok ? [] : [`${stack.stackName}/${id}`];
        });
    });
    expect(offenders).toEqual([]);
  });
});
