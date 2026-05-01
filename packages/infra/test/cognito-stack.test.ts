import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { CognitoStack } from '../lib/cognito-stack.js';

describe('CognitoStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new CognitoStack(app, 'TestCognitoStack');
    template = Template.fromStack(stack);
  });

  test('creates a Cognito Identity Pool with unauthenticated access', () => {
    template.hasResourceProperties('AWS::Cognito::IdentityPool', {
      AllowUnauthenticatedIdentities: true,
    });
  });

  test('creates an IAM role for unauthenticated users', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              Federated: 'cognito-identity.amazonaws.com',
            },
            Action: 'sts:AssumeRoleWithWebIdentity',
          },
        ],
      },
    });
  });

  test('grants bedrock-agentcore:InvokeAgentRuntime permission', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'bedrock-agentcore:InvokeAgentRuntime',
            Effect: 'Allow',
          }),
        ]),
      },
    });
  });

  test('grants polly:SynthesizeSpeech permission', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'polly:SynthesizeSpeech',
            Effect: 'Allow',
          }),
        ]),
      },
    });
  });

  test('outputs the IdentityPoolId', () => {
    template.hasOutput('IdentityPoolId', {});
  });
});
