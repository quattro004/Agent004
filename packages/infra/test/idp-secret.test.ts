import { jest } from '@jest/globals';

/**
 * Google IdP client secret custom resource (T048, FR-052;
 * contracts/auth-and-allowlist.md § Google client secret).
 *
 * The secret is the one deploy-time value that must not reach the repository
 * or the CloudFormation template. CDK has no way to set it on a
 * `UserPoolIdentityProviderGoogle` without putting it in the template, so the
 * provider is created with a placeholder and this custom resource replaces it
 * from SSM during the deployment.
 *
 * `UpdateIdentityProvider` replaces `ProviderDetails` wholesale, so the
 * handler must resend the client ID and scopes alongside the secret, or the
 * provider loses them.
 */

const ssmSend = jest.fn<(command: unknown) => Promise<unknown>>();
const cognitoSend = jest.fn<(command: unknown) => Promise<unknown>>();

jest.unstable_mockModule('@aws-sdk/client-ssm', () => ({
  SSMClient: class {
    send = ssmSend;
  },
  GetParameterCommand: class {
    constructor(public readonly input: Record<string, unknown>) {}
  },
}));

jest.unstable_mockModule('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: class {
    send = cognitoSend;
  },
  UpdateIdentityProviderCommand: class {
    constructor(public readonly input: Record<string, unknown>) {}
  },
}));

const SECRET = 'GOCSPX-super-secret-value';

const PROPERTIES = {
  UserPoolId: 'us-west-2_ABC123',
  ProviderName: 'Google',
  ParameterName: '/max-height/google-client-secret',
  ClientId: '1234567890-abcdef.apps.googleusercontent.com',
  AuthorizeScopes: 'openid email',
};

type Event = { RequestType: string; ResourceProperties: Record<string, string> };
type Handler = (event: Event) => Promise<unknown>;

async function loadHandler(): Promise<Handler> {
  jest.resetModules();
  const module = await import('../lib/handlers/idp-secret.js');
  return module.handler as Handler;
}

function event(requestType: string): Event {
  return { RequestType: requestType, ResourceProperties: { ...PROPERTIES } };
}

interface Captured {
  input: Record<string, unknown>;
}

describe('idp-secret custom resource', () => {
  beforeEach(() => {
    ssmSend.mockReset().mockResolvedValue({ Parameter: { Value: SECRET } });
    cognitoSend.mockReset().mockResolvedValue({});
  });

  it.each(['Create', 'Update'])('applies the secret on %s', async (requestType) => {
    const handler = await loadHandler();

    await handler(event(requestType));

    const update = cognitoSend.mock.calls[0][0] as Captured;
    expect(update.input.UserPoolId).toBe(PROPERTIES.UserPoolId);
    expect(update.input.ProviderName).toBe('Google');
    expect(update.input.ProviderDetails).toEqual({
      client_id: PROPERTIES.ClientId,
      client_secret: SECRET,
      authorize_scopes: 'openid email',
    });
  });

  it('reads the SecureString with decryption', async () => {
    const handler = await loadHandler();

    await handler(event('Create'));

    const read = ssmSend.mock.calls[0][0] as Captured;
    expect(read.input).toEqual({
      Name: '/max-height/google-client-secret',
      WithDecryption: true,
    });
  });

  it('does nothing on Delete, so a stack deletion cannot fail on a missing secret', async () => {
    const handler = await loadHandler();

    await handler(event('Delete'));

    expect(ssmSend).not.toHaveBeenCalled();
    expect(cognitoSend).not.toHaveBeenCalled();
  });

  it('fails the deployment with a message naming the missing parameter', async () => {
    ssmSend.mockRejectedValue(
      Object.assign(new Error('Parameter not found'), { name: 'ParameterNotFound' }),
    );
    const handler = await loadHandler();

    await expect(handler(event('Create'))).rejects.toThrow('/max-height/google-client-secret');
  });

  it('fails the deployment when the parameter exists but is empty', async () => {
    ssmSend.mockResolvedValue({ Parameter: { Value: '' } });
    const handler = await loadHandler();

    await expect(handler(event('Create'))).rejects.toThrow('/max-height/google-client-secret');
  });

  it('never puts the secret in the error it raises', async () => {
    cognitoSend.mockRejectedValue(new Error('InvalidParameterException'));
    const handler = await loadHandler();

    const message = await handler(event('Create')).catch((error: Error) => error.message);

    expect(message).not.toContain(SECRET);
  });

  it('returns a physical ID that does not change between updates', async () => {
    const handler = await loadHandler();

    const created = (await handler(event('Create'))) as { PhysicalResourceId: string };
    const updated = (await handler(event('Update'))) as { PhysicalResourceId: string };

    expect(created.PhysicalResourceId).toBe(updated.PhysicalResourceId);
    expect(created.PhysicalResourceId).not.toContain(SECRET);
  });
});
