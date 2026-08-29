#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CognitoStack } from '../lib/cognito-stack.js';
import { BudgetStack } from '../lib/budget-stack.js';
import { AgentStack } from '../lib/agent-stack.js';
import { FrontendStack } from '../lib/frontend-stack.js';

const app = new cdk.App();

// Runtime ARN provided at deploy time: cdk deploy -c agentRuntimeArn=arn:aws:...
const agentRuntimeArn =
  app.node.tryGetContext('agentRuntimeArn') ?? 'arn:aws:bedrock-agentcore:*:*:runtime/*';

const cognito = new CognitoStack(app, 'MaxHeight-Cognito', { agentRuntimeArn });

new BudgetStack(app, 'MaxHeight-Budget', {
  unauthRole: cognito.unauthRole,
  unauthPolicyName: cognito.unauthPolicyName,
});

new AgentStack(app, 'MaxHeight-Agent');
new FrontendStack(app, 'MaxHeight-Frontend');

app.synth();
