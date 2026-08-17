import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { FrontendStack } from '../lib/frontend-stack.js';

describe('FrontendStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new FrontendStack(app, 'TestFrontendStack');
    template = Template.fromStack(stack);
  });

  test('creates an S3 bucket for static assets', () => {
    template.hasResource('AWS::S3::Bucket', {});
  });

  test('creates a CloudFront distribution', () => {
    template.hasResource('AWS::CloudFront::Distribution', {});
  });

  test('configures CloudFront with default root object index.html', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        DefaultRootObject: 'index.html',
      },
    });
  });

  test('creates an Origin Access Control for S3', () => {
    template.hasResource('AWS::CloudFront::OriginAccessControl', {});
  });

  test('outputs the distribution URL', () => {
    template.hasOutput('DistributionUrl', {});
  });

  test('outputs the bucket name', () => {
    template.hasOutput('BucketName', {});
  });
});
