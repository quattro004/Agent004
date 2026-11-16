import {
  CognitoIdentityProviderClient,
  UpdateIdentityProviderCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

/**
 * Google IdP client secret (FR-052;
 * contracts/auth-and-allowlist.md § Google client secret).
 *
 * The secret is the only deploy-time value that must stay out of both the
 * repository and the CloudFormation template, so the user pool's Google
 * provider is synthesized with a placeholder and this custom resource writes
 * the real value in during the deployment, straight from SSM.
 *
 * A missing or empty parameter fails the deployment naming the parameter, so
 * the stack never reaches a state where sign-in is broken for a reason nobody
 * can see. Errors are re-raised with their own message replaced, because a
 * custom resource's failure reason is written to the CloudFormation events
 * every member of the account can read.
 */

const ssm = new SSMClient({});
const cognito = new CognitoIdentityProviderClient({});

/** Stable across updates: the resource is one provider's secret, not a value. */
const PHYSICAL_ID = 'MaxHeightGoogleIdpSecret';

interface Properties {
  UserPoolId: string;
  ProviderName: string;
  ParameterName: string;
  ClientId: string;
  AuthorizeScopes: string;
}

export interface IdpSecretEvent {
  RequestType: 'Create' | 'Update' | 'Delete';
  ResourceProperties: Record<string, string>;
}

async function readSecret(parameterName: string): Promise<string> {
  let value: string | undefined;
  try {
    const result = await ssm.send(
      new GetParameterCommand({ Name: parameterName, WithDecryption: true }),
    );
    value = result.Parameter?.Value;
  } catch {
    throw new Error(
      `Could not read the Google client secret from SSM parameter ${parameterName}. ` +
        'Create it as a SecureString before deploying (quickstart.md, Prerequisites row 7).',
    );
  }
  if (!value) {
    throw new Error(
      `SSM parameter ${parameterName} is empty. Store the Google client secret in it ` +
        'as a SecureString before deploying (quickstart.md, Prerequisites row 7).',
    );
  }
  return value;
}

export async function handler(event: IdpSecretEvent): Promise<{ PhysicalResourceId: string }> {
  // Deleting the provider removes the secret with it, and a stack deletion must
  // not fail because the parameter is already gone.
  if (event.RequestType === 'Delete') return { PhysicalResourceId: PHYSICAL_ID };

  const properties = event.ResourceProperties as unknown as Properties;
  const secret = await readSecret(properties.ParameterName);

  try {
    // UpdateIdentityProvider replaces ProviderDetails wholesale, so the client
    // ID and scopes are resent or the provider loses them.
    await cognito.send(
      new UpdateIdentityProviderCommand({
        UserPoolId: properties.UserPoolId,
        ProviderName: properties.ProviderName,
        ProviderDetails: {
          client_id: properties.ClientId,
          client_secret: secret,
          authorize_scopes: properties.AuthorizeScopes,
        },
      }),
    );
  } catch (error) {
    const name = error instanceof Error ? error.name : 'Error';
    // CloudFormation surfaces only `message` in the stack event, so the cause
    // stays available to the CloudWatch log without widening what the console
    // prints.
    throw new Error(
      `Applying the Google client secret to identity provider ` +
        `${properties.ProviderName} failed (${name}).`,
      { cause: error },
    );
  }

  return { PhysicalResourceId: PHYSICAL_ID };
}
