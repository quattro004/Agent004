import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** `packages/frontend/dist`, resolved from this file rather than the cwd. */
const DEFAULT_SITE_CONTENT = path.resolve(here, '..', '..', 'frontend', 'dist');

export interface FrontendStackProps extends cdk.StackProps {
  /** The one site domain (contracts/csp-and-hosting.md § One site domain). */
  domainName: string;
  /** From `certificate-stack.ts` in us-east-1, by cross-region reference. */
  certificate: acm.ICertificate;
  /** `<prefix>.auth.<region>.amazoncognito.com`, for the CSP's connect-src. */
  cognitoHost: string;
  /**
   * Upload the built site and invalidate CloudFront (`-c publishSite=true`).
   * Off by default: a deploy of any other stack synthesizes this one too, and
   * the site cannot be built until the stacks it takes its values from exist.
   */
  publishSite?: boolean;
  /** The built site, read only when publishing. Defaults to `packages/frontend/dist`. */
  siteContentPath?: string;
}

/**
 * The file the frontend build writes into `dist` (`buildConfig.ts` in the
 * frontend package) to say whether that build carries the runtime and sign-in
 * configuration. `pnpm run validate` leaves a build without it in `dist`, and
 * publishing that would ship a client that cannot reach anything.
 */
const BUILD_MARKER_FILE = 'max-height-build.json';

/** Throws unless `siteContentPath` holds a finished deploy build. */
function assertPublishable(siteContentPath: string): void {
  if (!fs.existsSync(siteContentPath)) {
    throw new Error(
      `The built site is not at ${siteContentPath}. ` +
        `Run \`pnpm --filter @max-height/frontend build\` before publishing the site.`,
    );
  }
  if (!fs.existsSync(path.join(siteContentPath, 'index.html'))) {
    throw new Error(`${siteContentPath} has no index.html, so it is not a built site.`);
  }
  if (!isDeployBuild(path.join(siteContentPath, BUILD_MARKER_FILE))) {
    throw new Error(
      `${siteContentPath} is not a deploy build. Write the VITE_* values from the stack ` +
        `outputs and rebuild with MAX_HEIGHT_DEPLOY=1 (quickstart.md § Deploy order).`,
    );
  }
}

function isDeployBuild(markerPath: string): boolean {
  try {
    return (
      (JSON.parse(fs.readFileSync(markerPath, 'utf8')) as { deploy?: unknown }).deploy === true
    );
  } catch {
    return false;
  }
}

/**
 * The public face of Max Height: the S3 origin, the distribution that fronts
 * both it and the AgentCore runtime, and the headers the browser is held to
 * (contracts/csp-and-hosting.md).
 */
export class FrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, { ...props, crossRegionReferences: true });

    const siteContentPath = props.siteContentPath ?? DEFAULT_SITE_CONTENT;
    if (props.publishSite) assertPublishable(siteContentPath);

    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const securityHeaders = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      responseHeadersPolicyName: 'MaxHeightSecurityHeaders',
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          contentSecurityPolicy: contentSecurityPolicy(props.cognitoHost),
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: {
          frameOption: cloudfront.HeadersFrameOption.DENY,
          override: true,
        },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.days(365),
          includeSubdomains: true,
          override: true,
        },
      },
    });

    // SPA routes used to come from distribution-wide `errorResponses`, which
    // also rewrote the runtime authorizer's 403 into a 200 HTML page — the one
    // response the browser must see to refresh its token
    // (contracts/csp-and-hosting.md § SPA routing without errorResponses).
    // The runtime is pinned because the CDK default is still JS 1.0.
    const spaRewrite = new cloudfront.Function(this, 'SpaRewrite', {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromFile({
        filePath: path.join(here, 'functions', 'spa-rewrite.js'),
      }),
      comment: 'Rewrites extensionless paths to /index.html',
    });

    // The browser must reach the AgentCore runtime through our own origin: a
    // cross-origin call would need CORS on a service we do not control, and
    // the CSP's connect-src is 'self'. CloudFront forwards the SSE POST
    // unchanged (contracts/transport-sse.md § CloudFront behavior).
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      domainNames: [props.domainName],
      certificate: props.certificate,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: securityHeaders,
        functionAssociations: [
          {
            function: spaRewrite,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      additionalBehaviors: {
        '/runtimes/*': {
          origin: new origins.HttpOrigin(`bedrock-agentcore.${this.region}.amazonaws.com`, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
            // A turn holds the connection open for the whole stream. 120s is
            // the CloudFormation maximum; the default 30s would cut off a
            // long reply mid-sentence.
            readTimeout: cdk.Duration.seconds(120),
          }),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          responseHeadersPolicy: securityHeaders,
          // Authorization is outside the cache key, so caching must be off:
          // a cached reply would be served to the wrong friend.
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          // CloudFront rejects `Authorization` in a custom origin request
          // policy's allow-list; with caching off, the managed
          // AllViewerExceptHostHeader policy is the supported way to forward
          // it (repost.aws/knowledge-center/cloudfront-authorization-header).
          // It also omits Host, which matters here: forwarding
          // max.recipieces.com to bedrock-agentcore would reach a host it does
          // not serve. See deviation C25.
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      defaultRootObject: 'index.html',
    });

    if (props.publishSite) {
      // Dropping this resource again (a later deploy without publishSite)
      // leaves the uploaded files in place: `retainOnDelete` defaults to true.
      new s3deploy.BucketDeployment(this, 'SiteContent', {
        sources: [s3deploy.Source.asset(siteContentPath, { exclude: [BUILD_MARKER_FILE] })],
        destinationBucket: siteBucket,
        distribution,
        // The SPA's entry point keeps its name across deploys, so a stale cached
        // index.html would keep serving the previous build's asset hashes.
        distributionPaths: ['/*'],
      });
    }

    new cdk.CfnOutput(this, 'SiteUrl', { value: `https://${props.domainName}` });

    // The GoDaddy CNAME for `max` points at this (csp-and-hosting.md
    // § GoDaddy records).
    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: distribution.distributionDomainName,
    });

    new cdk.CfnOutput(this, 'BucketName', {
      value: siteBucket.bucketName,
    });
  }
}

/**
 * FR-036 and FR-050. Built here rather than written out, so the Cognito host
 * is the exact one the user pool serves instead of a wildcard.
 *
 * `form-action`, `base-uri` and `frame-ancestors` are set explicitly because
 * none of them falls back to `default-src`. Sign-in is a top-level navigation
 * rather than a form post, so `form-action` needs no Cognito host.
 */
function contentSecurityPolicy(cognitoHost: string): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' https://${cognitoHost}`,
    "media-src 'self' blob:",
    "img-src 'self' data:",
    "form-action 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}
