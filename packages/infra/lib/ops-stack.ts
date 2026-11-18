import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as xray from 'aws-cdk-lib/aws-xray';
import { Construct } from 'constructs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The deny-all-spend policy name. The hard stop creates this policy itself with
 * `PutRolePolicy`, so no CDK hash suffix applies — the trap behind #61, where a
 * handler tried to act on a policy name CDK had never synthesized.
 */
export const DENY_POLICY_NAME = 'MaxHeightHardStopDenyAll';

/** The namespace the runtime publishes `BreakerWriteFailures` under. */
export const RUNTIME_METRIC_NAMESPACE = 'MaxHeight';

export interface OpsStackProps extends cdk.StackProps {
  /** The budget stack's 100% notification topic. */
  hardStopTopic: sns.ITopic;
  controlTable: dynamodb.ITable;
  /** The AgentCore Runtime execution role the hard stop denies spend on. */
  runtimeRole: iam.IRole;
  prunerFunction: lambda.IFunction;
  /** Omitted when `budgetAlertEmail` was not passed at deploy time. */
  alertEmail?: string;
}

/**
 * Operations: the hard stop and the alarms that say when something that was
 * supposed to protect us did not run (contracts/spend-control.md § Stack split,
 * § Operations alarms; FR-019, FR-022).
 *
 * It deploys after Data and Agent because it needs the control table, the
 * pruner and the runtime execution role.
 */
export class OpsStack extends cdk.Stack {
  readonly alarmTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: OpsStackProps) {
    super(scope, id, props);

    // Never the hard-stop topic: a budget notification must not reach the
    // builder's inbox pretending to be an operational failure, and an alarm
    // must not trip the hard stop.
    this.alarmTopic = new sns.Topic(this, 'OpsAlarmTopic', {
      displayName: 'Max Height operations',
    });
    if (props.alertEmail) {
      this.alarmTopic.addSubscription(new subscriptions.EmailSubscription(props.alertEmail));
    }

    const hardStop = new NodejsFunction(this, 'HardStop', {
      entry: path.join(here, 'handlers', 'hard-stop.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      // #61: the names come from CDK, because CDK appends a hash suffix that no
      // literal in the handler could predict.
      environment: {
        CONTROL_TABLE_NAME: props.controlTable.tableName,
        RUNTIME_ROLE_NAME: props.runtimeRole.roleName,
        DENY_POLICY_NAME,
      },
    });

    // Least privilege: it writes HALT and attaches one policy to one role. It
    // cannot undo either — recovery is manual (FR-021).
    hardStop.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:PutItem'],
        resources: [props.controlTable.tableArn],
      }),
    );
    hardStop.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['iam:PutRolePolicy'],
        resources: [props.runtimeRole.roleArn],
      }),
    );

    // CDK creates the subscription in this stack and adds the cross-stack
    // dependency on the budget stack itself.
    props.hardStopTopic.addSubscription(new subscriptions.LambdaSubscription(hardStop));

    this.alarm('HardStopFailed', 'The hard stop failed: spend may still be running', {
      metric: hardStop.metricErrors({ statistic: 'Sum' }),
    });

    this.alarm('PrunerFailed', 'The memory pruner failed: 30-day retention is at risk', {
      metric: props.prunerFunction.metricErrors({ statistic: 'Sum' }),
    });

    this.alarm('BreakerWriteFailed', 'The breaker could not record a turn: spend is unmeasured', {
      metric: new cloudwatch.Metric({
        namespace: RUNTIME_METRIC_NAMESPACE,
        metricName: 'BreakerWriteFailures',
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
    });

    for (const [id, metricName, description] of [
      [
        'SettlementFailed',
        'SettlementFailures',
        'A request could not be settled: a lease and its reservation stand until reconciled',
      ],
      [
        'UnmeteredRequest',
        'UnmeteredRequests',
        'A turn had no usable usage and was charged at its full reservation',
      ],
      [
        'SessionWriteFailed',
        'SessionWriteFailures',
        'A counted session could not be saved: its caps may not be enforced',
      ],
    ] as const) {
      this.alarm(id, description, {
        metric: new cloudwatch.Metric({
          namespace: RUNTIME_METRIC_NAMESPACE,
          metricName,
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
      });
    }

    this.alarm('RuntimeSystemErrors', 'The AgentCore Runtime returned a server error', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Bedrock-AgentCore',
        metricName: 'SystemErrors',
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
    });

    this.enableTransactionSearch();

    new cdk.CfnOutput(this, 'OpsAlarmTopicArn', { value: this.alarmTopic.topicArn });
    new cdk.CfnOutput(this, 'HardStopFunctionName', { value: hardStop.functionName });
  }

  /**
   * research § R-obs: X-Ray writes spans to the `aws/spans` log group, at the
   * default indexing percentage. X-Ray creates that group itself, and enabling
   * fails if it already exists, so retention is set after the config, not by
   * declaring the group. Deleting the stack disables Transaction Search but
   * leaves `aws/spans` in place.
   */
  private enableTransactionSearch(): void {
    const { partition, region, account } = this;
    const logGroupArn = (name: string): string =>
      `arn:${partition}:logs:${region}:${account}:log-group:${name}:*`;

    const policy = new logs.CfnResourcePolicy(this, 'TransactionSearchLogsPolicy', {
      policyName: 'MaxHeightTransactionSearch',
      policyDocument: cdk.Fn.toJsonString({
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'TransactionSearchXRayAccess',
            Effect: 'Allow',
            Principal: { Service: 'xray.amazonaws.com' },
            Action: 'logs:PutLogEvents',
            Resource: [logGroupArn('aws/spans'), logGroupArn('/aws/application-signals/data')],
            Condition: {
              ArnLike: { 'aws:SourceArn': `arn:${partition}:xray:${region}:${account}:*` },
              StringEquals: { 'aws:SourceAccount': account },
            },
          },
        ],
      }),
    });

    const config = new xray.CfnTransactionSearchConfig(this, 'TransactionSearch', {});
    config.addDependency(policy);

    const retention = new logs.LogRetention(this, 'SpansRetention', {
      logGroupName: 'aws/spans',
      retention: logs.RetentionDays.TWO_WEEKS,
    });
    retention.node.addDependency(config);
  }

  /** One failure is worth an email; missing data means nothing went wrong. */
  private alarm(
    id: string,
    description: string,
    { metric }: { metric: cloudwatch.IMetric },
  ): cloudwatch.Alarm {
    const alarm = new cloudwatch.Alarm(this, id, {
      alarmDescription: description,
      metric,
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    alarm.addAlarmAction(new cwActions.SnsAction(this.alarmTopic));
    return alarm;
  }
}
