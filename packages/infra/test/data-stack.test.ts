import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { DataStack } from '../lib/data-stack.js';

// data-model.md § Control table and contracts/memory-api.md § Resource.
describe('MaxHeight-Data', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    template = Template.fromStack(
      new DataStack(app, 'MaxHeight-Data', { env: { region: 'us-west-2' } }),
    );
  });

  describe('control table', () => {
    test('is keyed by string pk alone, with TTL on ttl', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
        AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
        TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
      });
    });

    // research § R-cost prices the table on demand (F line "DynamoDB", about
    // $0.01 a month); no provisioned capacity is recorded (deviation C14).
    test('bills on demand, as the approved F line prices it', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        BillingMode: 'PAY_PER_REQUEST',
        ProvisionedThroughput: Match.absent(),
      });
    });

    test('is retained when the stack is deleted', () => {
      template.hasResource('AWS::DynamoDB::Table', {
        DeletionPolicy: 'Retain',
        UpdateReplacePolicy: 'Retain',
      });
    });
  });

  describe('memory', () => {
    test('keeps short-term events for 7 days, the service minimum', () => {
      template.hasResourceProperties('AWS::BedrockAgentCore::Memory', {
        EventExpiryDuration: 7,
      });
    });

    test('has the three built-in strategies, each under the friend’s namespace', () => {
      template.hasResourceProperties('AWS::BedrockAgentCore::Memory', {
        MemoryStrategies: Match.arrayWith([
          {
            SemanticMemoryStrategy: Match.objectLike({
              Namespaces: ['/max-height/{actorId}/facts/'],
            }),
          },
          {
            UserPreferenceMemoryStrategy: Match.objectLike({
              Namespaces: ['/max-height/{actorId}/preferences/'],
            }),
          },
          {
            SummaryMemoryStrategy: Match.objectLike({
              Namespaces: ['/max-height/{actorId}/summaries/{sessionId}/'],
            }),
          },
        ]),
      });
      const [memory] = Object.values(template.findResources('AWS::BedrockAgentCore::Memory'));
      expect(memory.Properties.MemoryStrategies).toHaveLength(3);
      // No customer-managed key: it is a fixed monthly cost (FR-052).
      expect(memory.Properties.EncryptionKeyArn).toBeUndefined();
    });

    // T172: the service TTL cannot be the retention mechanism — 31 days is
    // the service minimum, deletion lags by days, and consolidation resets
    // the clock. It is here only to catch the case where the pruner has been
    // broken for a month and nobody noticed.
    test('carries a 31-day record TTL on every strategy as a backstop', () => {
      const [memory] = Object.values(template.findResources('AWS::BedrockAgentCore::Memory'));
      const strategies = memory.Properties.MemoryStrategies as Array<
        Record<string, { RecordExpirySpecification?: { RecordExpiryDurationDays?: number } }>
      >;
      for (const strategy of strategies) {
        const [configuration] = Object.values(strategy);
        expect(configuration.RecordExpirySpecification?.RecordExpiryDurationDays).toBe(31);
      }
    });
  });

  // contracts/memory-api.md § Pruner. The daily run is what delivers the
  // 30-day promise; the TTL above only bounds the damage if it stops running.
  describe('memory pruner', () => {
    test('runs once a day on a schedule', () => {
      template.hasResourceProperties('AWS::Events::Rule', {
        ScheduleExpression: 'rate(1 day)',
        State: 'ENABLED',
        Targets: Match.arrayWith([
          Match.objectLike({
            Arn: { 'Fn::GetAtt': [Match.stringLikeRegexp('MemoryPruner'), 'Arn'] },
          }),
        ]),
      });
    });

    test('knows the table, the memory and the retention window', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: Match.objectLike({
            CONTROL_TABLE_NAME: Match.anyValue(),
            MEMORY_ID: Match.anyValue(),
            RETENTION_DAYS: '30',
          }),
        },
      });
    });

    // A friend's whole memory is deleted by this role, so it reaches exactly
    // one memory and one table, and cannot write a memory record of its own.
    test('reaches only this memory, and only to read and delete', () => {
      const policies = Object.values(template.findResources('AWS::IAM::Policy'));
      const statements = policies.flatMap(
        (policy) =>
          policy.Properties.PolicyDocument.Statement as Array<{
            Action: string | string[];
            Resource: unknown;
          }>,
      );
      const memoryStatements = statements.filter((statement) =>
        [statement.Action].flat().some((action) => action.startsWith('bedrock-agentcore:')),
      );
      expect(memoryStatements.length).toBeGreaterThan(0);

      const actions = memoryStatements.flatMap((statement) => [statement.Action].flat());
      expect(new Set(actions)).toEqual(
        new Set([
          'bedrock-agentcore:ListMemoryRecords',
          'bedrock-agentcore:BatchDeleteMemoryRecords',
        ]),
      );
      for (const statement of memoryStatements) {
        expect(JSON.stringify(statement.Resource)).toContain('MemoryArn');
      }
    });

    test('may scan and stamp the control table, but not delete from it', () => {
      const policies = Object.values(template.findResources('AWS::IAM::Policy'));
      const statements = policies.flatMap(
        (policy) =>
          policy.Properties.PolicyDocument.Statement as Array<{ Action: string | string[] }>,
      );
      const tableActions = new Set(
        statements.flatMap((statement) =>
          [statement.Action].flat().filter((action) => action.startsWith('dynamodb:')),
        ),
      );
      expect(tableActions).toEqual(new Set(['dynamodb:Scan', 'dynamodb:UpdateItem']));
    });
  });

  test('outputs what later stacks consume', () => {
    for (const name of ['ControlTableName', 'ControlTableArn', 'MemoryId', 'MemoryArn']) {
      template.hasOutput(name, {});
    }
  });
});
