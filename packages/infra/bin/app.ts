#!/usr/bin/env node
import 'source-map-support/register.js';
import * as cdk from 'aws-cdk-lib';
import { CognitoStack } from '../lib/cognito-stack.js';
import { BudgetStack } from '../lib/budget-stack.js';
import { AgentStack } from '../lib/agent-stack.js';
import { FrontendStack } from '../lib/frontend-stack.js';

const app = new cdk.App();

new CognitoStack(app, 'MaxHeight-Cognito');
new BudgetStack(app, 'MaxHeight-Budget');
new AgentStack(app, 'MaxHeight-Agent');
new FrontendStack(app, 'MaxHeight-Frontend');

app.synth();
