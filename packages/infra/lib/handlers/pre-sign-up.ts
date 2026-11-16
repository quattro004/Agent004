import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';

/**
 * Pre sign-up trigger (FR-042, FR-043;
 * contracts/auth-and-allowlist.md § Pre sign-up).
 *
 * Cognito calls this once, when Google first presents an identity we have
 * never seen. Allowing it creates the account; throwing means no account is
 * ever created, so this is the cheapest place to turn a stranger away.
 *
 * It fails closed. A read that errors, an attribute that is missing and an
 * address that is not listed are all the same answer, and all of them use
 * {@link DENIAL_MESSAGE}: Cognito copies the message into the callback's
 * `error_description`, where anyone can read it, so it must never say which
 * check failed or whether an address is on the list.
 */

/** FR-043: one message for every cause. */
const DENIAL_MESSAGE = 'DENIED';

const dynamo = new DynamoDBClient({});

function controlTableName(): string {
  const name = process.env.CONTROL_TABLE_NAME;
  if (!name) {
    throw new Error('pre-sign-up is missing the CONTROL_TABLE_NAME environment variable');
  }
  return name;
}

function deny(): never {
  throw new Error(DENIAL_MESSAGE);
}

export interface PreSignUpEvent {
  triggerSource: string;
  request: { userAttributes: Record<string, string> };
  response: Record<string, boolean>;
}

export async function handler(event: PreSignUpEvent): Promise<PreSignUpEvent> {
  const tableName = controlTableName();
  const attributes = event.request.userAttributes ?? {};

  if (attributes.email_verified !== 'true') deny();

  const email = (attributes.email ?? '').trim().toLowerCase();
  if (email === '') deny();

  const listed = await dynamo.send(
    new GetItemCommand({ TableName: tableName, Key: { pk: { S: `ALLOW#${email}` } } }),
  );
  if (!listed.Item) deny();

  // Federated users are confirmed by the provider, so this stays false.
  event.response.autoConfirmUser = false;
  return event;
}
