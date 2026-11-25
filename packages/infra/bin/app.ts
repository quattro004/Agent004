#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { buildMaxHeightApp } from '../lib/max-height-app.js';

const app = new cdk.App();
buildMaxHeightApp(app);
app.synth();
