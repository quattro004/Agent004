import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { BudgetStack } from '../lib/budget-stack.js';

describe('BudgetStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new BudgetStack(app, 'TestBudgetStack');
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
});
