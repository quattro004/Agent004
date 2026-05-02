import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { BudgetStack } from '../lib/budget-stack.js';

describe('BudgetStack', () => {
  let template: Template;

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

  test('creates an SNS topic for budget alerts', () => {
    template.hasResource('AWS::SNS::Topic', {});
  });

  test('creates alert notifications at $5 and $8 thresholds', () => {
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
      ]),
    });
  });

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
