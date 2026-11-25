import * as cdk from 'aws-cdk-lib';
import * as agentcore from 'aws-cdk-lib/aws-bedrockagentcore';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Built-in strategies under the friend's namespace (contracts/memory-api.md § Resource). */
const NAMESPACE = '/max-height/{actorId}';

/** The promise, kept by the pruner (constitution :236; spec 001 data-model.md:165). */
const RETENTION_DAYS = 30;

/**
 * The service's own record TTL, used only as a backstop. 31 days is its
 * documented minimum, so it cannot express the 30-day promise; it bounds the
 * damage if the pruner stops running (contracts/memory-api.md § Pruner, T172).
 */
const RECORD_TTL_BACKSTOP_DAYS = 31;

const RECORD_EXPIRY = { recordExpiryDurationDays: RECORD_TTL_BACKSTOP_DAYS };

/**
 * The DynamoDB control table (data-model.md § Control table), AgentCore
 * Memory, and the daily pruner that keeps the 30-day window.
 */
export class DataStack extends cdk.Stack {
  readonly controlTable: dynamodb.ITable;
  readonly memory: agentcore.CfnMemory;
  /** The Ops stack alarms on this function's failures. */
  readonly prunerFunction: lambda.IFunction;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const table = new dynamodb.Table(this, 'ControlTable', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      // research § R-cost prices the table on demand (deviation C14).
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      // Holds the allowlist and the breaker tally; never lose it to a stack delete.
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    this.controlTable = table;

    this.memory = new agentcore.CfnMemory(this, 'Memory', {
      name: 'MaxHeightMemory',
      eventExpiryDuration: 7,
      memoryStrategies: [
        {
          semanticMemoryStrategy: {
            name: 'facts',
            namespaces: [`${NAMESPACE}/facts/`],
            recordExpirySpecification: RECORD_EXPIRY,
          },
        },
        {
          userPreferenceMemoryStrategy: {
            name: 'preferences',
            namespaces: [`${NAMESPACE}/preferences/`],
            recordExpirySpecification: RECORD_EXPIRY,
          },
        },
        {
          summaryMemoryStrategy: {
            name: 'summaries',
            namespaces: [`${NAMESPACE}/summaries/{sessionId}/`],
            recordExpirySpecification: RECORD_EXPIRY,
          },
        },
      ],
    });

    this.prunerFunction = this.addPruner(table);
    new cdk.CfnOutput(this, 'ControlTableName', { value: table.tableName });
    new cdk.CfnOutput(this, 'ControlTableArn', { value: table.tableArn });
    new cdk.CfnOutput(this, 'MemoryId', { value: this.memory.attrMemoryId });
    new cdk.CfnOutput(this, 'MemoryArn', { value: this.memory.attrMemoryArn });
  }

  /**
   * One friend's entire memory passes through this role, so it holds the two
   * Memory actions it needs and nothing that could write a record, and it can
   * stamp the control table but never delete from it.
   */
  private addPruner(table: dynamodb.Table): lambda.IFunction {
    const pruner = new NodejsFunction(this, 'MemoryPruner', {
      entry: path.join(here, 'handlers', 'memory-pruner.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      // It walks every friend and every page of their records; a timeout
      // here is a failed run, which is loud, not a silent partial wipe.
      timeout: cdk.Duration.minutes(5),
      environment: {
        CONTROL_TABLE_NAME: table.tableName,
        MEMORY_ID: this.memory.attrMemoryId,
        RETENTION_DAYS: String(RETENTION_DAYS),
      },
    });

    table.grant(pruner, 'dynamodb:Scan', 'dynamodb:UpdateItem');

    pruner.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'bedrock-agentcore:ListMemoryRecords',
          'bedrock-agentcore:BatchDeleteMemoryRecords',
        ],
        resources: [this.memory.attrMemoryArn],
      }),
    );

    new events.Rule(this, 'MemoryPrunerSchedule', {
      schedule: events.Schedule.rate(cdk.Duration.days(1)),
      targets: [new targets.LambdaFunction(pruner)],
    });

    return pruner;
  }
}
