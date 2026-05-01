import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class CognitoStack extends cdk.Stack {
  public readonly identityPoolId: string;
  public readonly unauthRole: iam.Role;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const identityPool = new cognito.CfnIdentityPool(this, 'GuestIdentityPool', {
      allowUnauthenticatedIdentities: true,
      identityPoolName: 'MaxHeightGuestPool',
    });

    const unauthRole = new iam.Role(this, 'CognitoUnauthRole', {
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'unauthenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
    });

    unauthRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock-agentcore:InvokeAgentRuntime'],
        resources: ['*'],
      })
    );

    unauthRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['polly:SynthesizeSpeech'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'polly:Engine': 'neural',
            'polly:VoiceId': 'Matthew',
          },
        },
      })
    );

    new cognito.CfnIdentityPoolRoleAttachment(this, 'RoleAttachment', {
      identityPoolId: identityPool.ref,
      roles: {
        unauthenticated: unauthRole.roleArn,
      },
    });

    this.identityPoolId = identityPool.ref;
    this.unauthRole = unauthRole;

    new cdk.CfnOutput(this, 'IdentityPoolId', {
      value: identityPool.ref,
    });
  }
}
