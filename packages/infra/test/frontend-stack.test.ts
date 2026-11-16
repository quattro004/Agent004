import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { FrontendStack } from '../lib/frontend-stack.js';

describe('FrontendStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    // The app pins every stack but Certificate to us-west-2, and the
    // AgentCore origin's domain is derived from the stack's Region, so the
    // test has to build the stack the way the app does.
    const stack = new FrontendStack(app, 'TestFrontendStack', {
      env: { account: '123456789012', region: 'us-west-2' },
    });
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
  // T034: the browser reaches the AgentCore runtime through our own domain, so
  // the distribution needs a second behavior that forwards an SSE POST to
  // bedrock-agentcore unchanged (contracts/transport-sse.md § CloudFront
  // behavior `/runtimes/*`).
  describe('the /runtimes/* behavior', () => {
    const cacheBehavior = () => {
      const distributions = template.findResources('AWS::CloudFront::Distribution');
      const config = Object.values(distributions)[0].Properties.DistributionConfig;
      return (config.CacheBehaviors ?? []).find(
        (b: { PathPattern?: string }) => b.PathPattern === '/runtimes/*',
      );
    };

    test('routes /runtimes/* to the AgentCore origin over HTTPS only', () => {
      const behavior = cacheBehavior();
      expect(behavior).toBeDefined();

      const distributions = template.findResources('AWS::CloudFront::Distribution');
      const origins = Object.values(distributions)[0].Properties.DistributionConfig.Origins;
      const agentOrigin = origins.find(
        (o: { DomainName?: string }) =>
          o.DomainName === 'bedrock-agentcore.us-west-2.amazonaws.com',
      );

      expect(agentOrigin).toBeDefined();
      expect(agentOrigin.CustomOriginConfig.OriginProtocolPolicy).toBe('https-only');
      expect(behavior.TargetOriginId).toBe(agentOrigin.Id);
    });

    test('gives the origin 120s to read, the CloudFormation maximum', () => {
      const distributions = template.findResources('AWS::CloudFront::Distribution');
      const origins = Object.values(distributions)[0].Properties.DistributionConfig.Origins;
      const agentOrigin = origins.find(
        (o: { DomainName?: string }) =>
          o.DomainName === 'bedrock-agentcore.us-west-2.amazonaws.com',
      );

      expect(agentOrigin.CustomOriginConfig.OriginReadTimeout).toBe(120);
    });

    test('allows POST and redirects the viewer to HTTPS', () => {
      const behavior = cacheBehavior();
      expect(behavior.AllowedMethods).toEqual(
        expect.arrayContaining(['POST', 'GET', 'OPTIONS', 'PUT', 'PATCH', 'DELETE', 'HEAD']),
      );
      expect(behavior.ViewerProtocolPolicy).toBe('redirect-to-https');
    });

    test('disables caching, because Authorization is outside the cache key', () => {
      const behavior = cacheBehavior();
      // CachingDisabled is an AWS managed policy with a fixed ID.
      expect(behavior.CachePolicyId).toBe('4135ea2d-6df8-44a3-9df3-4b5a84be39ad');
    });

    test('forwards Authorization to the origin, but never Host', () => {
      const behavior = cacheBehavior();
      // CloudFront rejects `Authorization` in a custom origin request policy's
      // allow-list, so the managed AllViewerExceptHostHeader policy is used
      // instead (deviation C25). It forwards every viewer header except Host,
      // which covers Authorization, Accept, Content-Type and the runtime
      // session-ID header, plus the `qualifier` query string. Forwarding Host
      // would send max.recipieces.com to bedrock-agentcore, which does not
      // serve it.
      expect(behavior.OriginRequestPolicyId).toBe('b689b0a8-53d0-40ab-baf2-68738e2966ac');

      // Nothing may quietly reintroduce a Host-forwarding policy alongside it.
      const custom = template.findResources('AWS::CloudFront::OriginRequestPolicy');
      expect(Object.keys(custom)).toHaveLength(0);
    });
  });
});
