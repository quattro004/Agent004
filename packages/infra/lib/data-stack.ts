import * as cdk from 'aws-cdk-lib';
import * as agentcore from 'aws-cdk-lib/aws-bedrockagentcore';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

/** Built-in strategies under the friend's namespace (contracts/memory-api.md § Resource). */
const NAMESPACE = '/max-height/{actorId}';

/**
 * The DynamoDB control table (data-model.md § Control table) and AgentCore
 * Memory. The memory pruner joins this stack in T089.
 */
export class DataStack extends cdk.Stack {
  readonly controlTable: dynamodb.ITable;
  readonly memory: agentcore.CfnMemory;

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
        { semanticMemoryStrategy: { name: 'facts', namespaces: [`${NAMESPACE}/facts/`] } },
        {
          userPreferenceMemoryStrategy: {
            name: 'preferences',
            namespaces: [`${NAMESPACE}/preferences/`],
          },
        },
        {
          summaryMemoryStrategy: {
            name: 'summaries',
            namespaces: [`${NAMESPACE}/summaries/{sessionId}/`],
          },
        },
      ],
    });

    new cdk.CfnOutput(this, 'ControlTableName', { value: table.tableName });
    new cdk.CfnOutput(this, 'ControlTableArn', { value: table.tableArn });
    new cdk.CfnOutput(this, 'MemoryId', { value: this.memory.attrMemoryId });
    new cdk.CfnOutput(this, 'MemoryArn', { value: this.memory.attrMemoryArn });
  }
}
