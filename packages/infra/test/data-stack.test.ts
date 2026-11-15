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
  });

  test('outputs what later stacks consume', () => {
    for (const name of ['ControlTableName', 'ControlTableArn', 'MemoryId', 'MemoryArn']) {
      template.hasOutput(name, {});
    }
  });
});
