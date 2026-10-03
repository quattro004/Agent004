import { isDeepStrictEqual } from 'node:util';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { BudgetStack } from '../lib/budget-stack.js';

const ALERT_EMAIL = 'owner@example.com';

interface Subscriber {
  SubscriptionType: string;
  Address: unknown;
}

interface NotificationWithSubscribers {
  Notification: { Threshold: number };
  Subscribers: Subscriber[];
}

describe('BudgetStack', () => {
  let template: Template;

  function subscribersAt(threshold: number): Subscriber[] {
    const [budget] = Object.values(template.findResources('AWS::Budgets::Budget'));
    const notifications: NotificationWithSubscribers[] =
      budget.Properties.NotificationsWithSubscribers;
    const match = notifications.find((n) => n.Notification.Threshold === threshold);
    if (!match) throw new Error(`No budget notification at ${threshold}%`);
    return match.Subscribers;
  }

  /** The topic reference the hard-stop Lambda is subscribed to, e.g. `{ Ref: '…' }`. */
  function hardStopTopic(): unknown {
    const [hardStopFnId] = Object.keys(
      template.findResources('AWS::Lambda::Function', {
        Properties: { Environment: { Variables: { UNAUTH_POLICY_NAME: Match.anyValue() } } },
      }),
    );
    const lambdaSubscriptions = Object.values(
      template.findResources('AWS::SNS::Subscription', {
        Properties: { Protocol: 'lambda', Endpoint: { 'Fn::GetAtt': [hardStopFnId, 'Arn'] } },
      }),
    );
    expect(lambdaSubscriptions).toHaveLength(1);
    return lambdaSubscriptions[0].Properties.TopicArn;
  }

  beforeAll(() => {
    const app = new cdk.App();
    // Create a dummy role to satisfy BudgetStackProps
    const helperStack = new cdk.Stack(app, 'HelperStack');
    const unauthRole = new iam.Role(helperStack, 'MockRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });
    const stack = new BudgetStack(app, 'TestBudgetStack', {
      unauthRole,
      unauthPolicyName: 'CognitoUnauthRoleDefaultPolicy',
      alertEmail: ALERT_EMAIL,
    });
    template = Template.fromStack(stack);
  });

  test('creates a $10/month budget', () => {
    template.hasResourceProperties('AWS::Budgets::Budget', {
      Budget: {
        BudgetLimit: {
          Amount: 10,
          Unit: 'USD',
        },
        TimeUnit: 'MONTHLY',
        BudgetType: 'COST',
      },
    });
  });

  test('creates an SNS topic for the hard stop', () => {
    template.hasResource('AWS::SNS::Topic', {});
  });

  test('creates alert notifications at 50%, 80%, and 100% thresholds', () => {
    template.hasResourceProperties('AWS::Budgets::Budget', {
      NotificationsWithSubscribers: Match.arrayWith([
        Match.objectLike({
          Notification: Match.objectLike({
            NotificationType: 'ACTUAL',
            ComparisonOperator: 'GREATER_THAN',
            Threshold: 50,
          }),
        }),
        Match.objectLike({
          Notification: Match.objectLike({
            NotificationType: 'ACTUAL',
            ComparisonOperator: 'GREATER_THAN',
            Threshold: 80,
          }),
        }),
        Match.objectLike({
          Notification: Match.objectLike({
            NotificationType: 'ACTUAL',
            ComparisonOperator: 'GREATER_THAN',
            Threshold: 100,
          }),
        }),
      ]),
    });
  });

  // Constitution P2: email alarms at $5 and $8. The $10 hard stop also emails,
  // so a fired hard stop is never silent.
  test.each([50, 80, 100])('%i%% threshold emails the owner', (threshold) => {
    expect(subscribersAt(threshold)).toContainEqual({
      SubscriptionType: 'EMAIL',
      Address: ALERT_EMAIL,
    });
  });

  // #56: warnings must never reach the hard stop. Find the topic the hard-stop
  // Lambda subscribes to, then check which notifications publish to it.
  test('only the 100% notification reaches the hard-stop topic', () => {
    const topic = hardStopTopic();
    const reachingHardStop = [50, 80, 100].filter((threshold) =>
      subscribersAt(threshold).some(
        (s) => s.SubscriptionType === 'SNS' && isDeepStrictEqual(s.Address, topic),
      ),
    );
    expect(reachingHardStop).toEqual([100]);
  });

  // Without a topic policy, AWS Budgets cannot publish at all, so even the $10
  // hard stop would never fire. Conditions use tokens, never a literal account.
  test('Budgets can publish to the hard-stop topic, scoped to this account', () => {
    const topic = hardStopTopic();
    template.hasResourceProperties('AWS::SNS::TopicPolicy', {
      Topics: [topic],
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Allow',
            Principal: { Service: 'budgets.amazonaws.com' },
            Action: 'sns:Publish',
            Resource: topic,
            Condition: {
              StringEquals: { 'aws:SourceAccount': { Ref: 'AWS::AccountId' } },
              ArnLike: {
                'aws:SourceArn': {
                  'Fn::Join': [
                    '',
                    [
                      'arn:',
                      { Ref: 'AWS::Partition' },
                      ':budgets::',
                      { Ref: 'AWS::AccountId' },
                      ':*',
                    ],
                  ],
                },
              },
            },
          }),
        ]),
      },
    });
  });

  // Mirrors app.node.tryGetContext('budgetAlertEmail') returning undefined, or
  // `-c budgetAlertEmail=` passed empty. No warning would ever reach a person.
  test.each([undefined, '', '   '])(
    'an alert email of %p fails loudly, naming the context key',
    (alertEmail) => {
      const app = new cdk.App();
      const helperStack = new cdk.Stack(app, 'HelperStack');
      const unauthRole = new iam.Role(helperStack, 'MockRole', {
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      });
      expect(
        () =>
          new BudgetStack(app, 'TestBudgetStack', {
            unauthRole,
            unauthPolicyName: 'CognitoUnauthRoleDefaultPolicy',
            alertEmail: alertEmail as unknown as string,
          }),
      ).toThrow(/budgetAlertEmail/);
    },
  );

  test('creates a Lambda function for hard-stop enforcement', () => {
    template.hasResource('AWS::Lambda::Function', {});
  });

  test('hard-stop Lambda has permission to detach IAM policy', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'iam:DeleteRolePolicy',
            Effect: 'Allow',
          }),
        ]),
      },
    });
  });

  test('hard-stop Lambda has role name environment variable', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: Match.objectLike({
          UNAUTH_ROLE_NAME: Match.anyValue(),
          UNAUTH_POLICY_NAME: 'CognitoUnauthRoleDefaultPolicy',
        }),
      },
    });
  });
});
