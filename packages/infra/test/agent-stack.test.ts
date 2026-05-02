import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { AgentStack } from '../lib/agent-stack.js';

describe('AgentStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new AgentStack(app, 'TestAgentStack');
    template = Template.fromStack(stack);
  });

  test('creates a WebSocket API Gateway', () => {
    template.hasResource('AWS::ApiGatewayV2::Api', {
      Properties: {
        ProtocolType: 'WEBSOCKET',
      },
    });
  });

  test('creates $connect route with IAM authorization', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: '$connect',
      AuthorizationType: 'AWS_IAM',
    });
  });

  test('creates $disconnect route', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: '$disconnect',
    });
  });

  test('creates $default route', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: '$default',
    });
  });

  test('creates a Lambda function for WebSocket handling', () => {
    template.hasResource('AWS::Lambda::Function', {});
  });

  test('configures stage with throttling limits', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      DefaultRouteSettings: {
        ThrottlingBurstLimit: 10,
        ThrottlingRateLimit: 5,
      },
    });
  });

  test('outputs the WebSocket endpoint URL', () => {
    template.hasOutput('WebSocketEndpoint', {});
  });
});
