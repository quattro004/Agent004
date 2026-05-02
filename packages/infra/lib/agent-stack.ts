import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export class AgentStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Secrets stored in SSM Parameter Store (SecureString)
    const weatherApiKey = ssm.StringParameter.fromSecureStringParameterAttributes(
      this, 'WeatherApiKey', { parameterName: '/max-height/weather-api-key' },
    );
    const newsApiKey = ssm.StringParameter.fromSecureStringParameterAttributes(
      this, 'NewsApiKey', { parameterName: '/max-height/news-api-key' },
    );

    const wsHandler = new lambda.Function(this, 'WebSocketHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'websocket-handler.handler',
      code: lambda.Code.fromAsset('lib/handlers'),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        WEATHER_API_KEY_PARAM: '/max-height/weather-api-key',
        NEWS_API_KEY_PARAM: '/max-height/news-api-key',
      },
    });

    // Grant Lambda access to read the secure parameters
    weatherApiKey.grantRead(wsHandler);
    newsApiKey.grantRead(wsHandler);

    const webSocketApi = new apigatewayv2.CfnApi(this, 'WebSocketApi', {
      name: 'MaxHeightWebSocket',
      protocolType: 'WEBSOCKET',
      routeSelectionExpression: '$request.body.type',
    });

    const integration = new apigatewayv2.CfnIntegration(this, 'LambdaIntegration', {
      apiId: webSocketApi.ref,
      integrationType: 'AWS_PROXY',
      integrationUri: `arn:aws:apigateway:${this.region}:lambda:path/2015-03-31/functions/${wsHandler.functionArn}/invocations`,
    });

    // IAM authorizer for WebSocket $connect — validates SigV4 signatures
    const _connectRoute = new apigatewayv2.CfnRoute(this, 'ConnectRoute', {
      apiId: webSocketApi.ref,
      routeKey: '$connect',
      authorizationType: 'AWS_IAM',
      target: `integrations/${integration.ref}`,
    });

    const _disconnectRoute = new apigatewayv2.CfnRoute(this, 'DisconnectRoute', {
      apiId: webSocketApi.ref,
      routeKey: '$disconnect',
      target: `integrations/${integration.ref}`,
    });

    const _defaultRoute = new apigatewayv2.CfnRoute(this, 'DefaultRoute', {
      apiId: webSocketApi.ref,
      routeKey: '$default',
      target: `integrations/${integration.ref}`,
    });

    const _stage = new apigatewayv2.CfnStage(this, 'ProdStage', {
      apiId: webSocketApi.ref,
      stageName: 'prod',
      autoDeploy: true,
      defaultRouteSettings: {
        throttlingBurstLimit: 10,
        throttlingRateLimit: 5,
      },
    });

    // Grant API Gateway permission to invoke the Lambda
    wsHandler.addPermission('ApiGwInvoke', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.ref}/*`,
    });

    // Grant Lambda permission to post back to connections
    wsHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['execute-api:ManageConnections'],
        resources: [`arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.ref}/*`],
      })
    );

    new cdk.CfnOutput(this, 'WebSocketEndpoint', {
      value: `wss://${webSocketApi.ref}.execute-api.${this.region}.amazonaws.com/prod`,
    });
  }
}
