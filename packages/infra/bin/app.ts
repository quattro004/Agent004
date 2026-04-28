#!/usr/bin/env node
import 'source-map-support/register.js';
import * as cdk from 'aws-cdk-lib';

const app = new cdk.App();

// Stacks will be added here as they are implemented:
// - CognitoStack (T021)
// - BudgetStack (T022)
// - AgentStack (T023)
// - FrontendStack (T024)

app.synth();
