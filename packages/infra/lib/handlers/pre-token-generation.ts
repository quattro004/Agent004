import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';

/**
 * Pre token generation trigger (FR-042, FR-018, SC-016;
 * contracts/auth-and-allowlist.md § Pre token generation).
 *
 * Cognito calls this at every sign-in and every refresh, which is the whole
 * point: removing `ALLOW#<email>` revokes access at the next refresh rather
 * than whenever the current token happens to expire. The hard stop is checked
 * here too, so a halted system stops letting people in instead of letting them
 * in and refusing them a turn later.
 *
 * On success it upserts `FRIEND#<sub>`. That item is how the runtime learns a
 * friend's email, because the bearer is a Cognito *access* token and carries
 * no `email` claim (deviation C16). No claims are added to the token.
 */

/** FR-043: one message for every cause. */
const DENIAL_MESSAGE = 'DENIED';

const dynamo = new DynamoDBClient({});

function controlTableName(): string {
  const name = process.env.CONTROL_TABLE_NAME;
  if (!name) {
    throw new Error('pre-token-generation is missing the CONTROL_TABLE_NAME environment variable');
  }
  return name;
}

function deny(): never {
  throw new Error(DENIAL_MESSAGE);
}

async function exists(tableName: string, pk: string): Promise<boolean> {
  const result = await dynamo.send(
    new GetItemCommand({ TableName: tableName, Key: { pk: { S: pk } } }),
  );
  return result.Item !== undefined;
}

export interface PreTokenGenerationEvent {
  userName: string;
  request: { userAttributes: Record<string, string> };
  response: Record<string, unknown>;
}

export async function handler(event: PreTokenGenerationEvent): Promise<PreTokenGenerationEvent> {
  const tableName = controlTableName();
  const attributes = event.request.userAttributes ?? {};

  if (await exists(tableName, 'CONTROL#HALT')) deny();
  if (attributes.email_verified !== 'true') deny();

  const email = (attributes.email ?? '').trim().toLowerCase();
  const sub = attributes.sub ?? '';
  if (email === '' || sub === '') deny();

  if (!(await exists(tableName, `ALLOW#${email}`))) deny();

  const now = new Date().toISOString();
  await dynamo.send(
    new UpdateItemCommand({
      TableName: tableName,
      Key: { pk: { S: `FRIEND#${sub}` } },
      UpdateExpression:
        'SET email = :email, provider = :provider, createdAt = if_not_exists(createdAt, :createdAt)',
      ExpressionAttributeValues: {
        ':email': { S: email },
        ':provider': { S: 'google' },
        ':createdAt': { S: now },
      },
    }),
  );

  return event;
}
