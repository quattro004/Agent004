import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as customresources from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_DOMAIN } from './site-domain.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** contracts/auth-and-allowlist.md § Google client secret. */
const SECRET_PARAMETER = '/max-height/google-client-secret';

/**
 * What the template carries in place of the real secret. The custom resource
 * replaces it during the deployment; it is never a credential.
 */
const SECRET_PLACEHOLDER = 'PLACEHOLDER-SET-AT-DEPLOY-TIME';

/** The least that yields a verified email; `profile` is deliberately not asked for. */
const GOOGLE_SCOPES = 'openid email';

export interface CognitoStackProps extends cdk.StackProps {
  /** Reads `ALLOW#<email>` and `CONTROL#HALT`; writes `FRIEND#<sub>`. */
  controlTable: dynamodb.ITable;
  /**
   * Cognito prefix domain. Must be unique in the Region and must not contain
   * `aws`, `amazon` or `cognito` (quickstart Prerequisites row 8).
   */
  domainPrefix?: string;
  /** The registered Google web client ID (quickstart Prerequisites row 9). */
  googleClientId?: string;
}

/**
 * Sign-in (FR-041 to FR-043, FR-048, FR-049, FR-052;
 * contracts/auth-and-allowlist.md § Cognito resources).
 *
 * This replaces an Identity Pool that handed every anonymous visitor temporary
 * AWS credentials. Nothing here issues credentials to a browser: a friend
 * signs in with Google, the triggers decide whether they are invited, and the
 * browser holds only tokens.
 *
 * The two deploy-time values are public — both appear in the browser's sign-in
 * redirect — but neither is invented here. A wrong prefix deploys a domain
 * someone else may own, and a wrong client ID deploys a sign-in that cannot
 * work, so a missing one fails synth naming the context key rather than
 * guessing (deviation C33).
 */
export class CognitoStack extends cdk.Stack {
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;
  readonly domainPrefix: string;

  constructor(scope: Construct, id: string, props: CognitoStackProps) {
    super(scope, id, props);

    this.domainPrefix = this.requireDeployValue(
      props.domainPrefix,
      'cognitoDomainPrefix',
      'quickstart.md Prerequisites row 8',
    );
    const googleClientId = this.requireDeployValue(
      props.googleClientId,
      'googleClientId',
      'quickstart.md Prerequisites row 9',
    );
    this.assertUsablePrefix(this.domainPrefix);

    const preSignUp = this.trigger('PreSignUp', 'pre-sign-up.ts', props.controlTable);
    props.controlTable.grant(preSignUp, 'dynamodb:GetItem');

    const preTokenGeneration = this.trigger(
      'PreTokenGeneration',
      'pre-token-generation.ts',
      props.controlTable,
    );
    props.controlTable.grant(preTokenGeneration, 'dynamodb:GetItem', 'dynamodb:UpdateItem');

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'MaxHeightFriends',
      featurePlan: cognito.FeaturePlan.LITE,
      selfSignUpEnabled: false,
      signInAliases: { email: false, username: false },
      // Deleting the stack must not delete the friends who signed in.
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lambdaTriggers: { preSignUp, preTokenGeneration },
    });

    const google = new cognito.CfnUserPoolIdentityProvider(this, 'Google', {
      userPoolId: this.userPool.userPoolId,
      providerName: 'Google',
      providerType: 'Google',
      providerDetails: {
        client_id: googleClientId,
        client_secret: SECRET_PLACEHOLDER,
        authorize_scopes: GOOGLE_SCOPES,
      },
      // FR-043 needs `email_verified`. Nothing else is stored, which is what
      // keeps the privacy page's disclosure short (FR-053).
      attributeMapping: { email: 'email', email_verified: 'email_verified' },
    });

    this.applyRealSecret(google, googleClientId);

    this.userPoolClient = new cognito.UserPoolClient(this, 'WebClient', {
      userPool: this.userPool,
      generateSecret: false,
      // A public client cannot keep a secret, so the authorization code is
      // bound to the browser with PKCE instead (services/auth.ts).
      authFlows: {},
      oAuth: {
        flows: { authorizationCodeGrant: true, implicitCodeGrant: false },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL],
        // FR-048: never a localhost URL on the deployed client.
        callbackUrls: [`https://${SITE_DOMAIN}/auth/callback`],
        logoutUrls: [`https://${SITE_DOMAIN}/`],
      },
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.GOOGLE],
      enableTokenRevocation: true,
    });
    // Cognito rejects a client naming a provider the pool does not have yet.
    this.userPoolClient.node.addDependency(google);

    this.userPool.addDomain('Domain', {
      cognitoDomain: { domainPrefix: this.domainPrefix },
    });

    new cdk.CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
    });
    new cdk.CfnOutput(this, 'CognitoHost', { value: this.cognitoHost });
  }

  /** The host the browser redirects to, and the one the CSP must allow (T050). */
  get cognitoHost(): string {
    return `${this.domainPrefix}.auth.${this.region}.amazoncognito.com`;
  }

  private requireDeployValue(value: string | undefined, contextKey: string, where: string): string {
    if (value) return value;
    throw new Error(
      `MaxHeight-Cognito needs the ${contextKey} context value: ` +
        `cdk deploy -c ${contextKey}=<value>. Choose it first — see ${where}.`,
    );
  }

  private assertUsablePrefix(prefix: string): void {
    const reserved = ['aws', 'amazon', 'cognito'].filter((word) => prefix.includes(word));
    if (reserved.length > 0) {
      throw new Error(
        `The cognitoDomainPrefix "${prefix}" contains ${reserved.join(', ')}. ` +
          'AWS rejects a prefix containing aws, amazon or cognito.',
      );
    }
  }

  private trigger(id: string, file: string, controlTable: dynamodb.ITable): NodejsFunction {
    return new NodejsFunction(this, id, {
      entry: path.join(here, 'handlers', file),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      // Cognito gives a trigger 5 seconds and does not retry, so a slow read
      // must fail as a denial rather than hang the sign-in.
      timeout: cdk.Duration.seconds(5),
      environment: { CONTROL_TABLE_NAME: controlTable.tableName },
    });
  }

  /**
   * FR-052: the real secret reaches Cognito without passing through the
   * template. `UpdateIdentityProvider` replaces `ProviderDetails` wholesale,
   * so the handler resends the client ID and scopes with it.
   */
  private applyRealSecret(
    google: cognito.CfnUserPoolIdentityProvider,
    googleClientId: string,
  ): void {
    const onEvent = new NodejsFunction(this, 'IdpSecret', {
      entry: path.join(here, 'handlers', 'idp-secret.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
    });
    onEvent.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter${SECRET_PARAMETER}`],
      }),
    );
    onEvent.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ['kms:Decrypt'],
        resources: [`arn:aws:kms:${this.region}:${this.account}:key/*`],
        conditions: { StringEquals: { 'kms:ViaService': `ssm.${this.region}.amazonaws.com` } },
      }),
    );
    onEvent.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ['cognito-idp:UpdateIdentityProvider'],
        resources: [
          `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/${this.userPool.userPoolId}`,
        ],
      }),
    );

    const provider = new customresources.Provider(this, 'IdpSecretProvider', {
      onEventHandler: onEvent,
    });

    const resource = new cdk.CustomResource(this, 'GoogleIdpSecret', {
      serviceToken: provider.serviceToken,
      resourceType: 'Custom::GoogleIdpSecret',
      properties: {
        UserPoolId: this.userPool.userPoolId,
        ProviderName: 'Google',
        ParameterName: SECRET_PARAMETER,
        ClientId: googleClientId,
        AuthorizeScopes: GOOGLE_SCOPES,
      },
    });
    resource.node.addDependency(google);
  }
}
