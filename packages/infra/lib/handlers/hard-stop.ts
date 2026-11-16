import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { IAMClient, PutRolePolicyCommand } from '@aws-sdk/client-iam';

/**
 * Hard stop (FR-018, FR-021; contracts/spend-control.md § Hard stop).
 *
 * The 100% ACTUAL budget notification reaches the hard-stop topic, which
 * invokes this. Two things must happen and both must succeed:
 *
 *   1. `CONTROL#HALT` is written. Every spend-bearing path reads it before it
 *      spends, so this takes effect without waiting for IAM to propagate.
 *   2. A deny-all-spend inline policy is attached to the runtime execution
 *      role, backing up step 1 for tokens already in flight.
 *
 * Nothing is swallowed. A missing environment variable, a failed write or a
 * missing role throws, which fails the SNS delivery, retries, and finally
 * raises the `Errors` alarm that emails the builder (FR-019, FR-022).
 */

// Every spend-bearing action the runtime role is allowed
// (contracts/runtime-config.md § Execution role). DynamoDB, Logs and X-Ray
// stay allowed so the container can still read HALT and log its refusal, and
// so does `bedrock:ListAsyncInvokes`, which bills nothing and gates start-up.
const DENIED_ACTIONS = [
  'bedrock:InvokeModel',
  'bedrock:InvokeModelWithResponseStream',
  'polly:SynthesizeSpeech',
  'bedrock-agentcore:CreateEvent',
  'bedrock-agentcore:ListSessions',
  'bedrock-agentcore:ListEvents',
  'bedrock-agentcore:DeleteEvent',
  'bedrock-agentcore:RetrieveMemoryRecords',
  'bedrock-agentcore:ListMemoryRecords',
  'bedrock-agentcore:GetMemoryRecord',
  'bedrock-agentcore:DeleteMemoryRecord',
  'bedrock-agentcore:BatchDeleteMemoryRecords',
];

const HALT_REASON = 'budget-100';

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`hard-stop is missing the ${name} environment variable`);
  }
  return value;
}

export async function handler(_event: unknown): Promise<void> {
  const tableName = required('CONTROL_TABLE_NAME');
  const roleName = required('RUNTIME_ROLE_NAME');
  const policyName = required('DENY_POLICY_NAME');

  const dynamo = new DynamoDBClient({});
  await dynamo.send(
    new PutItemCommand({
      TableName: tableName,
      Item: {
        pk: { S: 'CONTROL#HALT' },
        haltedAt: { S: new Date().toISOString() },
        reason: { S: HALT_REASON },
      },
    }),
  );

  const iam = new IAMClient({});
  await iam.send(
    new PutRolePolicyCommand({
      RoleName: roleName,
      PolicyName: policyName,
      PolicyDocument: JSON.stringify({
        Version: '2012-10-17',
        Statement: [{ Effect: 'Deny', Action: DENIED_ACTIONS, Resource: '*' }],
      }),
    }),
  );
}
