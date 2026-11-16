import { jest } from '@jest/globals';

/**
 * The hard stop (T067, research Q6, contracts/spend-control.md).
 *
 * It does two things and both must succeed: it writes `CONTROL#HALT`, which
 * every spend-bearing path checks, and it attaches a deny-all-spend policy to
 * the runtime execution role. The HALT write comes first, because it takes
 * effect on the next request even if IAM is slow or fails.
 *
 * #61 is the trap this redesign exists to avoid: the old handler deleted a
 * policy by a name CDK never synthesizes, and swallowed the resulting
 * `NoSuchEntityException` as success. Nothing here reports success it did not
 * achieve.
 */

const send = jest.fn<(command: unknown) => Promise<unknown>>();
const iamSend = jest.fn<(command: unknown) => Promise<unknown>>();

jest.unstable_mockModule('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: class {
    send = send;
  },
  PutItemCommand: class {
    constructor(public readonly input: Record<string, unknown>) {}
  },
}));

jest.unstable_mockModule('@aws-sdk/client-iam', () => ({
  IAMClient: class {
    send = iamSend;
  },
  PutRolePolicyCommand: class {
    constructor(public readonly input: Record<string, unknown>) {}
  },
}));

const ENV = {
  CONTROL_TABLE_NAME: 'MaxHeight-Control',
  RUNTIME_ROLE_NAME: 'MaxHeight-Agent-RuntimeRole-ABC123',
  DENY_POLICY_NAME: 'MaxHeightHardStopDenyAll',
};

type Handler = (event: unknown) => Promise<void>;

async function loadHandler(env: Partial<typeof ENV> = ENV): Promise<Handler> {
  for (const key of Object.keys(ENV)) delete process.env[key];
  for (const [key, value] of Object.entries(env)) process.env[key] = value as string;
  jest.resetModules();
  const module = await import('../lib/handlers/hard-stop.js');
  return module.handler as Handler;
}

interface Captured {
  input: Record<string, unknown>;
}

describe('hard-stop handler', () => {
  beforeEach(() => {
    send.mockReset().mockResolvedValue({});
    iamSend.mockReset().mockResolvedValue({});
  });

  afterEach(() => {
    for (const key of Object.keys(ENV)) delete process.env[key];
  });

  test('writes CONTROL#HALT with the reason and a timestamp', async () => {
    const handler = await loadHandler();

    await handler({ Records: [] });

    expect(send).toHaveBeenCalledTimes(1);
    const { input } = send.mock.calls[0][0] as Captured;
    expect(input.TableName).toBe(ENV.CONTROL_TABLE_NAME);
    const item = input.Item as Record<string, { S?: string }>;
    expect(item.pk.S).toBe('CONTROL#HALT');
    expect(item.reason.S).toBe('budget-100');
    expect(Date.parse(item.haltedAt.S as string)).not.toBeNaN();
  });

  // The HALT item stops the next request on its own. The deny policy is the
  // belt to its braces, so it must never be the only thing that landed.
  test('writes HALT before it touches IAM', async () => {
    const order: string[] = [];
    send.mockImplementation(async () => {
      order.push('ddb');
      return {};
    });
    iamSend.mockImplementation(async () => {
      order.push('iam');
      return {};
    });
    const handler = await loadHandler();

    await handler({ Records: [] });

    expect(order).toEqual(['ddb', 'iam']);
  });

  // #61: the role and policy names come from CDK through the environment,
  // because CDK appends a hash suffix that no literal can predict.
  test('attaches the deny policy to the role named in the environment', async () => {
    const handler = await loadHandler();

    await handler({ Records: [] });

    const { input } = iamSend.mock.calls[0][0] as Captured;
    expect(input.RoleName).toBe(ENV.RUNTIME_ROLE_NAME);
    expect(input.PolicyName).toBe(ENV.DENY_POLICY_NAME);
    const document = JSON.parse(input.PolicyDocument as string);
    expect(document.Statement[0].Effect).toBe('Deny');
    expect(document.Statement[0].Action).toEqual(
      expect.arrayContaining(['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream']),
    );
    expect(document.Statement[0].Resource).toBe('*');
  });

  // PutRolePolicy replaces a policy of the same name, so a second notification
  // lands the same document rather than failing or doubling up.
  test('is idempotent: running twice lands the same two writes again', async () => {
    const handler = await loadHandler();

    await handler({ Records: [] });
    await handler({ Records: [] });

    expect(send).toHaveBeenCalledTimes(2);
    expect(iamSend).toHaveBeenCalledTimes(2);
    const first = (send.mock.calls[0][0] as Captured).input.Item as Record<string, { S?: string }>;
    const second = (send.mock.calls[1][0] as Captured).input.Item as Record<string, { S?: string }>;
    expect(second.pk.S).toBe(first.pk.S);
    expect(second.reason.S).toBe(first.reason.S);
  });

  test.each(Object.keys(ENV))('throws when %s is missing, naming it', async (missing) => {
    const env = { ...ENV } as Record<string, string>;
    delete env[missing];
    const handler = await loadHandler(env);

    await expect(handler({ Records: [] })).rejects.toThrow(new RegExp(missing));
    expect(send).not.toHaveBeenCalled();
  });

  test('throws when the HALT write fails, and never reaches IAM', async () => {
    send.mockRejectedValue(new Error('ProvisionedThroughputExceededException'));
    const handler = await loadHandler();

    await expect(handler({ Records: [] })).rejects.toThrow(
      /ProvisionedThroughputExceededException/,
    );
    expect(iamSend).not.toHaveBeenCalled();
  });

  // The old handler caught NoSuchEntityException and logged "already
  // detached", so a hard stop that did nothing reported success (#61).
  test('throws when the role does not exist, rather than reporting success', async () => {
    const noSuchEntity = Object.assign(new Error('Role not found'), {
      name: 'NoSuchEntityException',
    });
    iamSend.mockRejectedValue(noSuchEntity);
    const handler = await loadHandler();

    await expect(handler({ Records: [] })).rejects.toThrow(/Role not found/);
  });
});
