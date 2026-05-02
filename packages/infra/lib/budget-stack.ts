import * as cdk from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';

export interface BudgetStackProps extends cdk.StackProps {
  /** The IAM role whose inline policies will be removed on budget breach. */
  unauthRole: iam.Role;
  /** Name of the inline policy to detach. */
  unauthPolicyName: string;
}

export class BudgetStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BudgetStackProps) {
    super(scope, id, props);

    const alertTopic = new sns.Topic(this, 'BudgetAlertTopic', {
      displayName: 'Max Height Budget Alerts',
    });

    const hardStopFn = new lambda.Function(this, 'BudgetHardStopFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
const { IAMClient, DeleteRolePolicyCommand } = require('@aws-sdk/client-iam');
const iam = new IAMClient();

exports.handler = async (event) => {
  console.log('Budget hard-stop triggered', JSON.stringify(event));
  const roleName = process.env.UNAUTH_ROLE_NAME;
  const policyName = process.env.UNAUTH_POLICY_NAME;
  if (!roleName || !policyName) {
    console.error('Missing UNAUTH_ROLE_NAME or UNAUTH_POLICY_NAME env vars');
    return;
  }
  try {
    await iam.send(new DeleteRolePolicyCommand({
      RoleName: roleName,
      PolicyName: policyName,
    }));
    console.log('Successfully detached policy', policyName, 'from role', roleName);
  } catch (err) {
    if (err.name === 'NoSuchEntityException') {
      console.log('Policy already detached');
    } else {
      console.error('Failed to detach policy:', err);
      throw err;
    }
  }
};
      `),
      timeout: cdk.Duration.seconds(30),
      environment: {
        UNAUTH_ROLE_NAME: props.unauthRole.roleName,
        UNAUTH_POLICY_NAME: props.unauthPolicyName,
      },
    });

    // Grant the hard-stop Lambda permission to detach the specific inline policy
    hardStopFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['iam:DeleteRolePolicy'],
        resources: [props.unauthRole.roleArn],
      }),
    );

    alertTopic.addSubscription(new snsSubscriptions.LambdaSubscription(hardStopFn));

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
          subscribers: [{ subscriptionType: 'SNS', address: alertTopic.topicArn }],
        },
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 80,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [{ subscriptionType: 'SNS', address: alertTopic.topicArn }],
        },
      ],
    });

    new cdk.CfnOutput(this, 'AlertTopicArn', {
      value: alertTopic.topicArn,
    });
  }
}
