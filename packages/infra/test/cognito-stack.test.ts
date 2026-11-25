import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { CognitoStack } from '../lib/cognito-stack.js';

/**
 * CognitoStack (T045, FR-041 to FR-043, FR-048, FR-049, FR-052;
 * contracts/auth-and-allowlist.md § Cognito resources).
 *
 * The stack this replaces handed every anonymous visitor temporary AWS
 * credentials through an Identity Pool. Spec 003 removes that entirely: the
 * browser holds tokens, never credentials, and only an invited friend gets
 * tokens at all. The assertions below are mostly about what is *absent*.
 *
 * The domain prefix and the Google client ID are deploy-time values the
 * builder owns (quickstart Prerequisites rows 8 and 9). They arrive as CDK
 * context rather than committed constants, because neither exists yet and a
 * guessed value deploys a publicly visible identity that is wrong
 * (deviation C33).
 */

const CONTEXT = {
  cognitoDomainPrefix: 'max-height-signin',
  googleClientId: '1234567890-abcdef.apps.googleusercontent.com',
};

function buildStack(context: Record<string, string> = CONTEXT): {
  app: cdk.App;
  stack: CognitoStack;
} {
  const app = new cdk.App({ context });
  const dataStack = new cdk.Stack(app, 'TestDataStack', { env: { region: 'us-west-2' } });
  const controlTable = new dynamodb.Table(dataStack, 'Control', {
    partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
  });
  const stack = new CognitoStack(app, 'TestCognitoStack', {
    env: { region: 'us-west-2' },
    controlTable,
    domainPrefix: context.cognitoDomainPrefix,
    googleClientId: context.googleClientId,
  });
  return { app, stack };
}

describe('CognitoStack', () => {
  let template: Template;

  beforeAll(() => {
    template = Template.fromStack(buildStack().stack);
  });

  describe('the browser never receives AWS credentials (FR-041)', () => {
    test('has no Identity Pool', () => {
      template.resourceCountIs('AWS::Cognito::IdentityPool', 0);
      template.resourceCountIs('AWS::Cognito::IdentityPoolRoleAttachment', 0);
    });

    test('has no role assumable by cognito-identity', () => {
      const roles = Object.values(
        template.findResources('AWS::IAM::Role') as Record<
          string,
          { Properties: { AssumeRolePolicyDocument: { Statement: { Principal: unknown }[] } } }
        >,
      );
      const principals = roles.flatMap((role) =>
        role.Properties.AssumeRolePolicyDocument.Statement.map((s) => JSON.stringify(s.Principal)),
      );
      expect(principals.join(' ')).not.toContain('cognito-identity');
    });

    test('grants polly:SynthesizeSpeech to nobody', () => {
      const policies = JSON.stringify(template.findResources('AWS::IAM::Policy'));
      expect(policies).not.toContain('polly:SynthesizeSpeech');
    });
  });

  describe('user pool', () => {
    test('is on the Lite feature plan', () => {
      template.hasResourceProperties('AWS::Cognito::UserPool', { UserPoolTier: 'LITE' });
    });

    test('disables self sign-up, so an account exists only through Google', () => {
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
      });
    });

    test('is retained on stack deletion, so friends are not silently erased', () => {
      template.hasResource('AWS::Cognito::UserPool', { DeletionPolicy: 'Retain' });
    });

    test('wires both triggers', () => {
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        LambdaConfig: {
          PreSignUp: Match.anyValue(),
          PreTokenGeneration: Match.anyValue(),
        },
      });
    });
  });

  describe('Google is the only identity provider', () => {
    test('requests only openid and email', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolIdentityProvider', {
        ProviderName: 'Google',
        ProviderType: 'Google',
        ProviderDetails: Match.objectLike({
          client_id: CONTEXT.googleClientId,
          authorize_scopes: 'openid email',
        }),
      });
    });

    test('maps only email and email_verified', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolIdentityProvider', {
        AttributeMapping: { email: 'email', email_verified: 'email_verified' },
      });
    });

    test('carries a placeholder client secret, never a real one (FR-052)', () => {
      const providers = template.findResources('AWS::Cognito::UserPoolIdentityProvider') as Record<
        string,
        { Properties: { ProviderDetails: { client_secret: string } } }
      >;
      const secrets = Object.values(providers).map(
        (p) => p.Properties.ProviderDetails.client_secret,
      );
      expect(secrets).toEqual(['PLACEHOLDER-SET-AT-DEPLOY-TIME']);
    });

    test('has a custom resource that applies the real secret from SSM', () => {
      template.hasResourceProperties('Custom::GoogleIdpSecret', {
        ParameterName: '/max-height/google-client-secret',
        ClientId: CONTEXT.googleClientId,
      });
    });

    test('the custom resource template never contains the parameter value', () => {
      const custom = JSON.stringify(template.findResources('Custom::GoogleIdpSecret'));
      expect(custom).not.toContain('client_secret');
    });
  });

  describe('app client', () => {
    test('is public, code-grant only, and revocable', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        GenerateSecret: false,
        AllowedOAuthFlows: ['code'],
        AllowedOAuthFlowsUserPoolClient: true,
        AllowedOAuthScopes: Match.arrayWith(['openid', 'email']),
        SupportedIdentityProviders: ['Google'],
        EnableTokenRevocation: true,
      });
    });

    test('allows no password or SRP auth flow', () => {
      const clients = template.findResources('AWS::Cognito::UserPoolClient') as Record<
        string,
        { Properties: { ExplicitAuthFlows?: string[] } }
      >;
      const flows = Object.values(clients).flatMap((c) => c.Properties.ExplicitAuthFlows ?? []);
      expect(flows.filter((flow) => flow !== 'ALLOW_REFRESH_TOKEN_AUTH')).toEqual([]);
    });

    test('uses https callbacks on the site domain only (FR-048)', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        CallbackURLs: ['https://max.recipieces.com/auth/callback'],
        LogoutURLs: ['https://max.recipieces.com/'],
      });
    });

    test('has no localhost URL anywhere', () => {
      expect(JSON.stringify(template.toJSON())).not.toContain('localhost');
    });
  });

  describe('domain', () => {
    test('uses the prefix from context', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolDomain', {
        Domain: CONTEXT.cognitoDomainPrefix,
      });
    });

    test('outputs the host the frontend and its CSP need', () => {
      const outputs = template.findOutputs('*') as Record<string, { Value: unknown }>;
      expect(JSON.stringify(outputs)).toContain(
        `${CONTEXT.cognitoDomainPrefix}.auth.us-west-2.amazoncognito.com`,
      );
    });
  });

  describe('triggers', () => {
    test('both run on Node.js 22 with the control table name', () => {
      const functions = template.findResources('AWS::Lambda::Function', {
        Properties: {
          Runtime: 'nodejs22.x',
          Environment: { Variables: { CONTROL_TABLE_NAME: Match.anyValue() } },
        },
      });
      expect(Object.keys(functions).length).toBe(2);
    });

    test('pre sign-up may only read the control table', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({ Action: 'dynamodb:GetItem', Effect: 'Allow' }),
          ]),
        },
      });
    });

    test('pre token generation may also write the friend record', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith(['dynamodb:GetItem', 'dynamodb:UpdateItem']),
              Effect: 'Allow',
            }),
          ]),
        },
      });
    });

    test('no trigger policy allows a wildcard resource', () => {
      const policies = template.findResources('AWS::IAM::Policy') as Record<
        string,
        { Properties: { PolicyDocument: { Statement: { Resource: unknown }[] } } }
      >;
      const wildcards = Object.values(policies)
        .flatMap((policy) => policy.Properties.PolicyDocument.Statement)
        .filter((statement) => statement.Resource === '*');
      expect(wildcards).toEqual([]);
    });
  });

  describe('deploy-time values', () => {
    test('fails naming the context key when the domain prefix is missing', () => {
      expect(() => buildStack({ googleClientId: CONTEXT.googleClientId })).toThrow(
        /cognitoDomainPrefix/,
      );
    });

    test('fails naming the context key when the Google client ID is missing', () => {
      expect(() => buildStack({ cognitoDomainPrefix: CONTEXT.cognitoDomainPrefix })).toThrow(
        /googleClientId/,
      );
    });

    test('rejects a prefix AWS will not accept', () => {
      expect(() => buildStack({ ...CONTEXT, cognitoDomainPrefix: 'max-aws-height' })).toThrow(
        /aws/,
      );
    });
  });
});
