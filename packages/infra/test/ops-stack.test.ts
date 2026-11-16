import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sns from 'aws-cdk-lib/aws-sns';
import { OpsStack } from '../lib/ops-stack.js';

/**
 * The operations stack (T068; contracts/spend-control.md § Stack split and
 * § Operations alarms). It deploys after Data and Agent and owns the hard-stop
 * Lambda, the operations alarm topic, and the seven alarms.
 */

const env = { account: '111122223333', region: 'us-west-2' };

interface Fixtures {
  app: cdk.App;
  ops: OpsStack;
  template: Template;
  runtimeRoleName: string;
}

function synth(alertEmail?: string): Fixtures {
  const app = new cdk.App();

  const upstream = new cdk.Stack(app, 'Upstream', { env });
  const hardStopTopic = new sns.Topic(upstream, 'HardStopTopic');
  const controlTable = new dynamodb.Table(upstream, 'ControlTable', {
    partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
  });
  const runtimeRole = new iam.Role(upstream, 'RuntimeRole', {
    assumedBy: new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com'),
  });
  const prunerFunction = new lambda.Function(upstream, 'Pruner', {
    runtime: lambda.Runtime.NODEJS_22_X,
    handler: 'index.handler',
    code: lambda.Code.fromInline('exports.handler = async () => {};'),
  });

  const ops = new OpsStack(app, 'MaxHeight-Ops', {
    env,
    hardStopTopic,
    controlTable,
    runtimeRole,
    prunerFunction,
    alertEmail,
  });

  return {
    app,
    ops,
    template: Template.fromStack(ops),
    runtimeRoleName: upstream.resolve(runtimeRole.roleName) as unknown as string,
  };
}

describe('OpsStack', () => {
  describe('the hard-stop Lambda', () => {
    test('is subscribed to the budget stack hard-stop topic', () => {
      const { template } = synth();

      // CDK puts a Lambda subscription in the function's stack
      // (aws-sns-subscriptions/lib/lambda.js), so the subscription is here.
      template.hasResourceProperties('AWS::SNS::Subscription', {
        Protocol: 'lambda',
        TopicArn: { 'Fn::ImportValue': Match.anyValue() },
      });
      template.hasResourceProperties('AWS::Lambda::Permission', {
        Action: 'lambda:InvokeFunction',
        Principal: 'sns.amazonaws.com',
      });
    });

    test('is told the table, role and policy names rather than guessing them (#61)', () => {
      const { template } = synth();

      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: {
            CONTROL_TABLE_NAME: Match.anyValue(),
            RUNTIME_ROLE_NAME: Match.anyValue(),
            DENY_POLICY_NAME: Match.anyValue(),
          },
        },
      });
    });

    test('can write the control table and put a policy on the runtime role, and nothing else', () => {
      const { template } = synth();

      const policies = Object.values(
        template.findResources('AWS::IAM::Policy') as Record<
          string,
          { Properties: { PolicyDocument: { Statement: Array<Record<string, unknown>> } } }
        >,
      );
      const statements = policies.flatMap((p) => p.Properties.PolicyDocument.Statement);
      const actions = statements.flatMap((s) =>
        Array.isArray(s.Action) ? (s.Action as string[]) : [s.Action as string],
      );

      expect(actions).toContain('dynamodb:PutItem');
      expect(actions).toContain('iam:PutRolePolicy');
      expect(actions.filter((a) => a.startsWith('iam:'))).toEqual(['iam:PutRolePolicy']);
      expect(actions).not.toContain('dynamodb:DeleteItem');
      expect(actions).not.toContain('iam:DeleteRolePolicy');
      expect(actions.some((a) => a === '*' || a.endsWith(':*'))).toBe(false);
    });
  });

  describe('the operations alarm topic', () => {
    test('is a second topic, never the hard-stop topic', () => {
      const { template } = synth('ops@example.com');

      // The hard-stop topic lives in the budget stack; this stack owns exactly
      // one topic of its own.
      template.resourceCountIs('AWS::SNS::Topic', 1);
      template.hasResourceProperties('AWS::SNS::Subscription', {
        Protocol: 'email',
        Endpoint: 'ops@example.com',
      });
    });

    test('has no email subscription when no address was given', () => {
      const { template } = synth();

      const subscriptions = template.findResources('AWS::SNS::Subscription', {
        Properties: { Protocol: 'email' },
      });
      expect(Object.keys(subscriptions)).toHaveLength(0);
    });
  });

  describe('the operations alarms', () => {
    test('there are exactly seven, and all of them notify the operations topic', () => {
      const { template } = synth();

      const alarms = Object.values(
        template.findResources('AWS::CloudWatch::Alarm') as Record<
          string,
          { Properties: Record<string, unknown> }
        >,
      );
      expect(alarms).toHaveLength(7);

      for (const alarm of alarms) {
        expect(alarm.Properties.AlarmActions).toEqual([{ Ref: expect.any(String) }]);
        expect(alarm.Properties.Threshold).toBe(1);
        expect(alarm.Properties.ComparisonOperator).toBe('GreaterThanOrEqualToThreshold');
        expect(alarm.Properties.Statistic).toBe('Sum');
        // Missing data is not a breach: silence means nothing went wrong.
        expect(alarm.Properties.TreatMissingData).toBe('notBreaching');
      }
    });

    test('a failed hard stop raises an alarm', () => {
      const { template } = synth();

      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        MetricName: 'Errors',
        Namespace: 'AWS/Lambda',
        Dimensions: [{ Name: 'FunctionName', Value: Match.anyValue() }],
        AlarmDescription: Match.stringLikeRegexp('hard stop'),
      });
    });

    test('a failed prune raises an alarm, because retention is a promise', () => {
      const { template } = synth();

      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        MetricName: 'Errors',
        Namespace: 'AWS/Lambda',
        AlarmDescription: Match.stringLikeRegexp('prun'),
      });
    });

    test('a failed breaker write raises an alarm on the runtime custom metric', () => {
      const { template } = synth();

      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        MetricName: 'BreakerWriteFailures',
        Namespace: 'MaxHeight',
      });
    });

    test.each(['SettlementFailures', 'UnmeteredRequests', 'SessionWriteFailures'])(
      '%s raises an alarm on the runtime custom metric',
      (metricName) => {
        const { template } = synth();

        template.hasResourceProperties('AWS::CloudWatch::Alarm', {
          MetricName: metricName,
          Namespace: 'MaxHeight',
        });
      },
    );

    test('runtime server errors raise an alarm', () => {
      const { template } = synth();

      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        MetricName: 'SystemErrors',
        Namespace: 'AWS/Bedrock-AgentCore',
      });
    });
  });
});
