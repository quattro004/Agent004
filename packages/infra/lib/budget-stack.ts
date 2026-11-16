import * as cdk from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

/** Constitution 1.9.0 P2: the monthly hard cap, in USD. */
const MONTHLY_CEILING_USD = 20;

export interface BudgetStackProps extends cdk.StackProps {
  /** Owner address emailed at every budget threshold (CDK context `budgetAlertEmail`). */
  alertEmail: string;
}

/**
 * The budget, its notifications and the hard-stop topic (FR-033).
 *
 * This stack deploys first, before anything that can spend, so it takes no
 * props from another stack. The hard-stop Lambda lives in the Ops stack
 * instead: it needs the control table and the runtime execution role, which
 * exist only after Data and Agent (contracts/spend-control.md § Stack split).
 * Keeping the Lambda here is what forced the old design to act on the one
 * role that deployed early enough — a guest role CDK names with a hash
 * suffix, which the handler never matched (#61).
 */
export class BudgetStack extends cdk.Stack {
  /** Published for the Ops stack, which subscribes the hard-stop Lambda. */
  public readonly hardStopTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: BudgetStackProps) {
    super(scope, id, props);

    if (typeof props.alertEmail !== 'string' || props.alertEmail.trim() === '') {
      throw new Error(
        'BudgetStack needs an owner email for budget alerts. ' +
          'Deploy with: cdk deploy -c budgetAlertEmail=<owner email>',
      );
    }

    // Anything published here triggers the hard stop, so only the 100% budget
    // notification may publish. Warnings and ops alarms never use this topic (#56).
    this.hardStopTopic = new sns.Topic(this, 'BudgetHardStopTopic', {
      displayName: 'Max Height Budget Hard Stop',
    });

    // AWS Budgets can publish only if the topic policy grants it, scoped to this
    // account so no other account's budget can trigger the hard stop (F3).
    this.hardStopTopic.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('budgets.amazonaws.com')],
        actions: ['sns:Publish'],
        resources: [this.hardStopTopic.topicArn],
        conditions: {
          StringEquals: { 'aws:SourceAccount': this.account },
          ArnLike: {
            'aws:SourceArn': this.formatArn({ service: 'budgets', region: '', resource: '*' }),
          },
        },
      }),
    );

    const ownerEmail: budgets.CfnBudget.SubscriberProperty = {
      subscriptionType: 'EMAIL',
      address: props.alertEmail,
    };

    const notificationAt = (
      threshold: number,
      subscribers: budgets.CfnBudget.SubscriberProperty[],
    ): budgets.CfnBudget.NotificationWithSubscribersProperty => ({
      notification: {
        notificationType: 'ACTUAL',
        comparisonOperator: 'GREATER_THAN',
        threshold,
        thresholdType: 'PERCENTAGE',
      },
      subscribers,
    });

    new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: 'MaxHeight-Monthly',
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: MONTHLY_CEILING_USD, unit: 'USD' },
        // The cap is on what Max Height costs, not on what the builder is
        // charged after credits: a credited month would otherwise read as $0
        // while the meter runs, and the hard stop would never fire.
        costTypes: {
          includeCredit: false,
          includeRefund: false,
          includeDiscount: false,
        },
      },
      notificationsWithSubscribers: [
        // $10 and $16 of a $20 ceiling: email only, deliberately with no SNS
        // subscriber (constitution 1.9.0 P2, amendment A5).
        notificationAt(50, [ownerEmail]),
        notificationAt(80, [ownerEmail]),
        // $20: the hard stop. It also emails, so it never fires silently.
        notificationAt(100, [
          { subscriptionType: 'SNS', address: this.hardStopTopic.topicArn },
          ownerEmail,
        ]),
      ],
    });

    new cdk.CfnOutput(this, 'HardStopTopicArn', {
      value: this.hardStopTopic.topicArn,
      exportName: `${this.stackName}-HardStopTopicArn`,
    });
  }
}
