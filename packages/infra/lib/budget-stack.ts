import * as cdk from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';

export class BudgetStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const alertTopic = new sns.Topic(this, 'BudgetAlertTopic', {
      displayName: 'Max Height Budget Alerts',
    });

    const hardStopFn = new lambda.Function(this, 'BudgetHardStopFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          console.log('Budget hard-stop triggered', JSON.stringify(event));
          // Detach IAM policy from Cognito guest role to halt usage
        };
      `),
      timeout: cdk.Duration.seconds(30),
    });

    alertTopic.addSubscription(
      new snsSubscriptions.LambdaSubscription(hardStopFn)
    );

    new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: 'MaxHeight-Monthly',
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: {
          amount: 10,
          unit: 'USD',
        },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 50,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [
            { subscriptionType: 'SNS', address: alertTopic.topicArn },
          ],
        },
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 80,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [
            { subscriptionType: 'SNS', address: alertTopic.topicArn },
          ],
        },
      ],
    });

    new cdk.CfnOutput(this, 'AlertTopicArn', {
      value: alertTopic.topicArn,
    });
  }
}
