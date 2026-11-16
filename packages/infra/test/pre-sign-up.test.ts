import { jest } from '@jest/globals';

/**
 * Pre sign-up trigger (T046, FR-042, contracts/auth-and-allowlist.md § Pre sign-up).
 *
 * Runs once, the first time Google hands Cognito a federated identity. It is
 * the gate that decides whether an account is created at all, so it fails
 * closed: anything it cannot prove is a denial.
 *
 * Every denial throws the same message. `error_description` reaches the
 * browser's callback URL, so a message that varied by cause would tell a
 * stranger whether an address is on the list (FR-043).
 */

const send = jest.fn<(command: unknown) => Promise<unknown>>();

jest.unstable_mockModule('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: class {
    send = send;
  },
  GetItemCommand: class {
    constructor(public readonly input: Record<string, unknown>) {}
  },
}));

type PreSignUpEvent = {
  triggerSource: string;
  request: { userAttributes: Record<string, string> };
  response: Record<string, boolean>;
};

type Handler = (event: PreSignUpEvent) => Promise<PreSignUpEvent>;

async function loadHandler(tableName: string | null = 'MaxHeight-Control'): Promise<Handler> {
  delete process.env.CONTROL_TABLE_NAME;
  if (tableName !== null) process.env.CONTROL_TABLE_NAME = tableName;
  jest.resetModules();
  const module = await import('../lib/handlers/pre-sign-up.js');
  return module.handler as Handler;
}

function event(attributes: Record<string, string>): PreSignUpEvent {
  return {
    triggerSource: 'PreSignUp_ExternalProvider',
    request: { userAttributes: attributes },
    response: {},
  };
}

const LISTED = { email: 'friend@example.com', email_verified: 'true' };

describe('pre sign-up trigger', () => {
  beforeEach(() => {
    send.mockReset().mockResolvedValue({});
  });

  it('allows a listed, verified Google email', async () => {
    send.mockResolvedValue({ Item: { pk: { S: 'ALLOW#friend@example.com' } } });
    const handler = await loadHandler();

    const result = await handler(event(LISTED));

    expect(result.response.autoConfirmUser).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('reads the allowlist item by the lowercased, trimmed email', async () => {
    send.mockResolvedValue({ Item: { pk: { S: 'ALLOW#friend@example.com' } } });
    const handler = await loadHandler();

    await handler(event({ email: '  Friend@Example.COM ', email_verified: 'true' }));

    const captured = send.mock.calls[0][0] as { input: Record<string, unknown> };
    expect(captured.input).toEqual({
      TableName: 'MaxHeight-Control',
      Key: { pk: { S: 'ALLOW#friend@example.com' } },
    });
  });

  it('denies an email with no allowlist item', async () => {
    send.mockResolvedValue({});
    const handler = await loadHandler();

    await expect(handler(event(LISTED))).rejects.toThrow('DENIED');
  });

  it('denies an unverified email without reading the table', async () => {
    const handler = await loadHandler();

    await expect(
      handler(event({ email: 'friend@example.com', email_verified: 'false' })),
    ).rejects.toThrow('DENIED');
    expect(send).not.toHaveBeenCalled();
  });

  it('denies when the email attribute is missing', async () => {
    const handler = await loadHandler();

    await expect(handler(event({ email_verified: 'true' }))).rejects.toThrow('DENIED');
    expect(send).not.toHaveBeenCalled();
  });

  it('fails closed when the table read fails', async () => {
    send.mockRejectedValue(new Error('ProvisionedThroughputExceededException'));
    const handler = await loadHandler();

    await expect(handler(event(LISTED))).rejects.toThrow();
  });

  it('uses the same message for every denial', async () => {
    const handler = await loadHandler();
    const unverified = await handler(event({ ...LISTED, email_verified: 'false' })).catch(
      (error: Error) => error.message,
    );
    send.mockResolvedValue({});
    const unlisted = await handler(event(LISTED)).catch((error: Error) => error.message);

    expect(unlisted).toBe(unverified);
  });

  it('throws when the control table name is not configured', async () => {
    const handler = await loadHandler(null);

    await expect(handler(event(LISTED))).rejects.toThrow('CONTROL_TABLE_NAME');
  });
});
