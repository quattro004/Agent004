import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { CognitoStack } from '../lib/cognito-stack.js';

describe('CognitoStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new CognitoStack(app, 'TestCognitoStack', {
      agentRuntimeArn: 'arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/test-agent',
    });
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

  test('scopes bedrock-agentcore:InvokeAgentRuntime to specific ARN', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'bedrock-agentcore:InvokeAgentRuntime',
            Effect: 'Allow',
            Resource: 'arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/test-agent',
          }),
        ]),
      },
    });
  });

  test('does not use wildcard resource for AgentCore', () => {
    const policies = template.findResources('AWS::IAM::Policy');
    for (const [, policy] of Object.entries(policies)) {
      const statements = (policy as { Properties: { PolicyDocument: { Statement: Array<{ Action: string; Resource: string }> } } }).Properties.PolicyDocument.Statement;
      for (const stmt of statements) {
        if (stmt.Action === 'bedrock-agentcore:InvokeAgentRuntime') {
          expect(stmt.Resource).not.toBe('*');
        }
      }
    }
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
