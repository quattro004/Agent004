import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Template } from 'aws-cdk-lib/assertions';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { FrontendStack } from '../lib/frontend-stack.js';

const SITE_DOMAIN = 'max.recipieces.com';
const COGNITO_HOST = 'max-height-test.auth.us-west-2.amazoncognito.com';

/**
 * `BucketDeployment` needs a directory that exists at synth time. The infra
 * suite must not depend on the frontend having been built, so the test
 * supplies its own.
 */
function siteContentFixture(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'max-height-site-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>Max Height</title>');
  return dir;
}

function buildTemplate(): Template {
  const app = new cdk.App();
  // The certificate really lives in us-east-1 (CloudFront's requirement), but
  // a cross-region reference needs a two-stack app, and this suite is about
  // the distribution. An imported ARN stands in.
  const certificateStack = new cdk.Stack(app, 'TestCertificateStack', {
    env: { account: '123456789012', region: 'us-east-1' },
    crossRegionReferences: true,
  });
  const certificate = acm.Certificate.fromCertificateArn(
    certificateStack,
    'Certificate',
    'arn:aws:acm:us-east-1:123456789012:certificate/11111111-2222-3333-4444-555555555555',
  );

  // The app pins every stack but Certificate to us-west-2, and the
  // AgentCore origin's domain is derived from the stack's Region, so the
  // test has to build the stack the way the app does.
  const stack = new FrontendStack(app, 'TestFrontendStack', {
    env: { account: '123456789012', region: 'us-west-2' },
    crossRegionReferences: true,
    domainName: SITE_DOMAIN,
    certificate,
    cognitoHost: COGNITO_HOST,
    siteContentPath: siteContentFixture(),
  });
  return Template.fromStack(stack);
}

describe('FrontendStack', () => {
  let template: Template;

  beforeAll(() => {
    template = buildTemplate();
  });

  const distributionConfig = () => {
    const distributions = template.findResources('AWS::CloudFront::Distribution');
    return Object.values(distributions)[0].Properties.DistributionConfig;
  };

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

  test('outputs the bucket name', () => {
    template.hasOutput('BucketName', {});
  });

  // T050: the custom domain, the CSP and SPA routing without errorResponses
  // (contracts/csp-and-hosting.md § Distribution, § Content security policy).
  describe('the custom domain (FR-049)', () => {
    test('serves max.recipieces.com with the certificate stack certificate', () => {
      const config = distributionConfig();

      expect(config.Aliases).toEqual([SITE_DOMAIN]);
      expect(config.ViewerCertificate.AcmCertificateArn).toContain(':acm:us-east-1:');
      expect(config.ViewerCertificate.SslSupportMethod).toBe('sni-only');
    });

    test('redirects the viewer to HTTPS on the default behavior (FR-048)', () => {
      expect(distributionConfig().DefaultCacheBehavior.ViewerProtocolPolicy).toBe(
        'redirect-to-https',
      );
    });

    test('outputs the site URL and the distribution domain name for the GoDaddy CNAME', () => {
      template.hasOutput('SiteUrl', { Value: `https://${SITE_DOMAIN}` });
      template.hasOutput('DistributionDomainName', {});
    });
  });

  describe('SPA routing', () => {
    test('has no errorResponses, which would mask the authorizer 403', () => {
      // CustomErrorResponses is distribution-wide, so rewriting 403 to
      // /index.html with status 200 would hide the one response that tells
      // the browser to refresh its token (transport-sse.md § Response).
      expect(distributionConfig().CustomErrorResponses).toBeUndefined();
    });

    test('attaches the rewrite function to the default behavior as a viewer request', () => {
      const associations = distributionConfig().DefaultCacheBehavior.FunctionAssociations;

      expect(associations).toHaveLength(1);
      expect(associations[0].EventType).toBe('viewer-request');
    });

    test('does not attach it to /runtimes/*, which is not a page', () => {
      const runtimes = distributionConfig().CacheBehaviors.find(
        (b: { PathPattern?: string }) => b.PathPattern === '/runtimes/*',
      );

      expect(runtimes.FunctionAssociations ?? []).toHaveLength(0);
    });

    test('pins the function to runtime cloudfront-js-2.0, not the CDK default 1.0', () => {
      template.hasResourceProperties('AWS::CloudFront::Function', {
        FunctionConfig: { Runtime: 'cloudfront-js-2.0' },
      });
    });
  });

  describe('the content security policy (FR-036, FR-050)', () => {
    const csp = (): string => {
      const policies = template.findResources('AWS::CloudFront::ResponseHeadersPolicy');
      return Object.values(policies)[0].Properties.ResponseHeadersPolicyConfig.SecurityHeadersConfig
        .ContentSecurityPolicy.ContentSecurityPolicy;
    };

    const directive = (name: string): string => {
      const found = csp()
        .split(';')
        .map((part) => part.trim())
        .find((part) => part === name || part.startsWith(`${name} `));
      expect(found).toBeDefined();
      return found as string;
    };

    test('allows the exact Cognito host in connect-src, with no wildcard', () => {
      const connectSrc = directive('connect-src');

      expect(connectSrc).toBe(`connect-src 'self' https://${COGNITO_HOST}`);
      expect(connectSrc).not.toContain('*');
    });

    test('drops the WebSocket API and the Identity Pool hosts, which are gone', () => {
      expect(csp()).not.toContain('wss:');
      expect(csp()).not.toContain('cognito-identity');
    });

    test('sets the directives that do not fall back to default-src', () => {
      expect(directive('form-action')).toBe("form-action 'self'");
      expect(directive('base-uri')).toBe("base-uri 'self'");
      expect(directive('frame-ancestors')).toBe("frame-ancestors 'none'");
    });

    test('keeps the directives the audio chain and the app already need', () => {
      expect(directive('default-src')).toBe("default-src 'self'");
      expect(directive('script-src')).toBe("script-src 'self'");
      expect(directive('style-src')).toBe("style-src 'self' 'unsafe-inline'");
      expect(directive('media-src')).toBe("media-src 'self' blob:");
      expect(directive('img-src')).toBe("img-src 'self' data:");
    });

    test('names no Polly host, because voice is synthesized on the server', () => {
      expect(csp()).not.toContain('polly');
    });
  });

  describe('site content', () => {
    test('uploads the built site and invalidates every path', () => {
      template.hasResourceProperties('Custom::CDKBucketDeployment', {
        DistributionPaths: ['/*'],
      });
    });

    test('invalidates through the distribution it just deployed to', () => {
      const deployments = template.findResources('Custom::CDKBucketDeployment');
      const properties = Object.values(deployments)[0].Properties;

      expect(properties.DistributionId).toBeDefined();
    });
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
