import { jest } from '@jest/globals';

/**
 * Pre token generation trigger (T047, FR-042, FR-018;
 * contracts/auth-and-allowlist.md § Pre token generation).
 *
 * Runs at every sign-in *and* every refresh, which is what makes revocation
 * take effect without waiting for a token to expire (SC-016). It also carries
 * the hard stop into the sign-in path: while `CONTROL#HALT` exists, nobody
 * gets a new token, so a halted system stops admitting work rather than
 * refusing it one turn later.
 *
 * On success it upserts `FRIEND#<sub>`, which is the record the runtime reads
 * to learn a friend's email — the access token does not carry one (C16).
 */

const send = jest.fn<(command: unknown) => Promise<unknown>>();

jest.unstable_mockModule('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: class {
    send = send;
  },
  GetItemCommand: class {
    readonly kind = 'get';
    constructor(public readonly input: Record<string, unknown>) {}
  },
  UpdateItemCommand: class {
    readonly kind = 'update';
    constructor(public readonly input: Record<string, unknown>) {}
  },
}));

type PreTokenEvent = {
  userName: string;
  request: { userAttributes: Record<string, string> };
  response: Record<string, unknown>;
};

type Handler = (event: PreTokenEvent) => Promise<PreTokenEvent>;

async function loadHandler(tableName: string | null = 'MaxHeight-Control'): Promise<Handler> {
  delete process.env.CONTROL_TABLE_NAME;
  if (tableName !== null) process.env.CONTROL_TABLE_NAME = tableName;
  jest.resetModules();
  const module = await import('../lib/handlers/pre-token-generation.js');
  return module.handler as Handler;
}

const SUB = '6f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8';

function event(attributes: Record<string, string> = {}): PreTokenEvent {
  return {
    userName: 'Google_112233445566778899',
    request: {
      userAttributes: {
        sub: SUB,
        email: 'friend@example.com',
        email_verified: 'true',
        identities: JSON.stringify([{ providerName: 'Google' }]),
        ...attributes,
      },
    },
    response: {},
  };
}

interface Captured {
  kind: string;
  input: Record<string, unknown>;
}

function calls(): Captured[] {
  return send.mock.calls.map((call) => call[0] as Captured);
}

/** No HALT item, and the friend is on the allowlist. */
function admitted(): void {
  send.mockImplementation(async (command) => {
    const { kind, input } = command as Captured;
    if (kind !== 'get') return {};
    const pk = ((input.Key as { pk: { S: string } }).pk as { S: string }).S;
    return pk.startsWith('ALLOW#') ? { Item: { pk: { S: pk } } } : {};
  });
}

describe('pre token generation trigger', () => {
  beforeEach(() => {
    send.mockReset().mockResolvedValue({});
  });

  it('issues tokens for a listed friend and adds no claims', async () => {
    admitted();
    const handler = await loadHandler();

    const result = await handler(event());

    expect(result.response).toEqual({});
  });

  it('upserts FRIEND#<sub> with the email and provider', async () => {
    admitted();
    const handler = await loadHandler();

    await handler(event());

    const update = calls().find((call) => call.kind === 'update');
    expect(update?.input.TableName).toBe('MaxHeight-Control');
    expect(update?.input.Key).toEqual({ pk: { S: `FRIEND#${SUB}` } });
    const values = update?.input.ExpressionAttributeValues as Record<string, { S: string }>;
    expect(values[':email'].S).toBe('friend@example.com');
    expect(values[':provider'].S).toBe('google');
    expect(values[':createdAt'].S).toEqual(expect.any(String));
  });

  it('sets createdAt only when it is absent', async () => {
    admitted();
    const handler = await loadHandler();

    await handler(event());

    const update = calls().find((call) => call.kind === 'update');
    expect(update?.input.UpdateExpression).toContain('if_not_exists(createdAt, :createdAt)');
  });

  it('denies while CONTROL#HALT exists, and writes nothing', async () => {
    send.mockImplementation(async (command) => {
      const { input } = command as Captured;
      const pk = (input.Key as { pk: { S: string } }).pk.S;
      return pk === 'CONTROL#HALT' ? { Item: { pk: { S: pk } } } : { Item: { pk: { S: pk } } };
    });
    const handler = await loadHandler();

    await expect(handler(event())).rejects.toThrow('DENIED');
    expect(calls().some((call) => call.kind === 'update')).toBe(false);
  });

  it('denies when the allowlist item is gone', async () => {
    send.mockResolvedValue({});
    const handler = await loadHandler();

    await expect(handler(event())).rejects.toThrow('DENIED');
  });

  it('denies an unverified email', async () => {
    admitted();
    const handler = await loadHandler();

    await expect(handler(event({ email_verified: 'false' }))).rejects.toThrow('DENIED');
  });

  it('reads the allowlist by the lowercased email', async () => {
    admitted();
    const handler = await loadHandler();

    await handler(event({ email: 'Friend@Example.com' }));

    const keys = calls().map((call) => (call.input.Key as { pk: { S: string } }).pk.S);
    expect(keys).toContain('ALLOW#friend@example.com');
  });

  it('fails closed when a read fails', async () => {
    send.mockRejectedValue(new Error('ResourceNotFoundException'));
    const handler = await loadHandler();

    await expect(handler(event())).rejects.toThrow();
  });

  it('fails closed when the FRIEND write fails', async () => {
    send.mockImplementation(async (command) => {
      const { kind, input } = command as Captured;
      if (kind === 'update') throw new Error('ConditionalCheckFailedException');
      const pk = (input.Key as { pk: { S: string } }).pk.S;
      return pk.startsWith('ALLOW#') ? { Item: { pk: { S: pk } } } : {};
    });
    const handler = await loadHandler();

    await expect(handler(event())).rejects.toThrow();
  });

  it('throws when the control table name is not configured', async () => {
    const handler = await loadHandler(null);

    await expect(handler(event())).rejects.toThrow('CONTROL_TABLE_NAME');
  });
});
