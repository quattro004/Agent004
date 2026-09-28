import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as agentcore from 'aws-cdk-lib/aws-bedrockagentcore';

const infraRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const manifest = JSON.parse(readFileSync(join(infraRoot, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const declared = {
  ...manifest.dependencies,
  ...manifest.devDependencies,
};

describe('AgentCore CDK constructs come from stable aws-cdk-lib', () => {
  // The alpha package sat declared-but-unimported from deviation C4 onward,
  // carrying a documented "API can break between versions" risk for constructs
  // we never used. Its contents have since graduated, so the pin is pure
  // supply-chain surface (constitution P6).
  test('does not declare the superseded AgentCore alpha package', () => {
    expect(declared).not.toHaveProperty('@aws-cdk/aws-bedrock-agentcore-alpha');
  });

  // Removing the alpha pin is only safe because the stable module actually
  // ships these. Asserting it here means a future aws-cdk-lib bump that drops
  // or renames one fails in CI rather than when someone starts T023b/T152.
  test.each([
    ['Runtime'],
    ['RuntimeEndpoint'],
    ['AgentRuntimeArtifact'],
    ['Memory'],
    ['MemoryStrategy'],
    ['CfnRuntime'],
  ])('exports %s from aws-cdk-lib/aws-bedrockagentcore', (name) => {
    expect(typeof (agentcore as Record<string, unknown>)[name]).toBe('function');
  });

  // T152 sets platform version V2 through `defaultChild as CfnRuntime` because
  // the typed property is absent from the L1. That escape hatch only compiles
  // while the L2 keeps an L1 underneath it.
  test('keeps the L1 escape hatch T152 depends on reachable from the L2', () => {
    expect(agentcore.Runtime.prototype).toBeInstanceOf(Object);
    expect(agentcore.CfnRuntime.CFN_RESOURCE_TYPE_NAME).toBe('AWS::BedrockAgentCore::Runtime');
  });
});
