# Contract: Hosting, custom domain and content security policy

Decisions: research Q4 (transport) and Q9 (domains). Requirements: FR-036, FR-048, FR-049 and FR-050. Stacks: `certificate-stack.ts` (new) and `frontend-stack.ts` (changed). See [plan.md](../plan.md) § Project Structure.

## One site domain

`max.recipieces.com` is a single constant in `bin/app.ts`, passed as a prop to every consumer:

| Consumer | Use |
| --- | --- |
| `certificate-stack.ts` | Certificate domain name |
| `frontend-stack.ts` | Distribution `domainNames` |
| `cognito-stack.ts` | Callback and sign-out URLs ([auth-and-allowlist.md](./auth-and-allowlist.md)) |
| Frontend build | `VITE_REDIRECT_URI` and `VITE_SIGN_OUT_URI` ([runtime-config.md](./runtime-config.md)) |

The domain is public, so committing it is fine. The builder's email is not committed (`-c budgetAlertEmail`).

## Certificate (`certificate-stack.ts`, `us-east-1`)

| Property | Value | Why |
| --- | --- | --- |
| Region | `us-east-1` | CloudFront accepts certificates only from there ([plan.md](../plan.md) § Complexity Tracking) |
| Resource | `acm.Certificate`, `domainName: max.recipieces.com` | — |
| Validation | `CertificateValidation.fromDns()` with **no hosted zone** | DNS stays at GoDaddy (Q9). The builder adds ACM's validation CNAME by hand, and the stack waits until ACM issues the certificate. |
| Sharing | `crossRegionReferences: true` on this stack and the frontend stack | Lets `frontend-stack.ts` in `us-west-2` take the certificate as a prop, so no ARN is copied by hand |

## GoDaddy records (manual; quickstart prerequisites)

| Record | Name | Value | When |
| --- | --- | --- | --- |
| CNAME | ACM's validation name | ACM's validation value | During the first `cdk deploy` of the certificate stack; read from the ACM console or the stack events |
| CNAME | `max` | The distribution's `*.cloudfront.net` name (stack output `DistributionDomainName`) | After the frontend stack deploys |

## Distribution (`frontend-stack.ts`)

| Property | Value | Today |
| --- | --- | --- |
| `domainNames` | `[max.recipieces.com]` | None (FR-049 gap) |
| `certificate` | From `certificate-stack.ts` | None |
| Minimum TLS | The CDK default security policy | Unchanged |
| Default behavior | S3 with origin access control, `REDIRECT_TO_HTTPS`, the security headers policy, plus the SPA rewrite function (below) | `frontend-stack.ts:45-48` |
| `/runtimes/*` behavior | The AgentCore origin ([transport-sse.md](./transport-sse.md) § CloudFront behavior), `REDIRECT_TO_HTTPS`, the same response headers policy | New |
| `errorResponses` | **Removed** | `frontend-stack.ts:51-62` rewrites 403 and 404 to `/index.html` with status 200 |
| Outputs | `DistributionDomainName`, `BucketName`, `SiteUrl` (`https://max.recipieces.com`) | `DistributionUrl`, `BucketName` |
| Site content | `BucketDeployment` of `packages/frontend/dist`, invalidating `/*` (research R-deploy) | No upload path |

### SPA routing without `errorResponses`

**Custom error responses are distribution-wide.** `CustomErrorResponses` belongs to `DistributionConfig`, and `CacheBehavior` has no equivalent ([CloudFront API: CustomErrorResponse](https://docs.aws.amazon.com/cloudfront/latest/APIReference/API_CustomErrorResponse.html)). Kept as they are, they would rewrite the runtime authorizer's 403 into an HTML page with status 200. The browser would then never see the 403 that triggers its silent refresh ([transport-sse.md](./transport-sse.md) § Response).

They are replaced by a CloudFront Function (`cloudfront.Function`), attached to the **default behavior only** as a viewer-request handler. Its runtime is set explicitly to `FunctionRuntime.JS_2_0`, because the CDK default is JS 1.0 (`aws-cloudfront/lib/function.d.ts:88`, `aws-cdk-lib` 2.272.0). Its source is `lib/functions/spa-rewrite.js`, loaded with `FunctionCode.fromFile` (`function.d.ts:20`), and its unit test evaluates that same file, so the tested code is the deployed code. Lambda@Edge is not an option, because the Free plan does not support it (research Q0). The function rewrites a URI to `/index.html` when the URI's last path segment has no `.`. That covers `/`, `/auth/callback` and `/privacy`. Assets such as `/audio/greeting-001.mp3` and `/assets/*.js` pass through unchanged.

A missing asset now returns S3's own 403, which is correct for an asset. The function's cost is human-read in R-cost, alongside CloudFront.

The app has no router today, so it reads `location.pathname` to pick the callback and privacy views ([auth-and-allowlist.md](./auth-and-allowlist.md)).

## Content security policy

This replaces `frontend-stack.ts:24`. The string is built in CDK, so the Cognito host is exact rather than a wildcard (FR-036, FR-050).

| Directive | Value | Reason |
| --- | --- | --- |
| `default-src` | `'self'` | Unchanged |
| `script-src` | `'self'` | Unchanged |
| `style-src` | `'self' 'unsafe-inline'` | Unchanged; tightening it is out of scope (FR-036) |
| `connect-src` | `'self'` and `https://<prefix>.auth.us-west-2.amazoncognito.com` | `'self'` covers `/runtimes/*` (same origin, Q4). The Cognito host serves the `fetch` calls to `/oauth2/token` and `/oauth2/revoke`. The host comes from the user-pool domain's `baseUrl()`. |
| `media-src` | `'self' blob:` | Unchanged. Pre-rendered clips are same-origin, and server audio is decoded in the page. |
| `img-src` | `'self' data:` | Unchanged |
| `form-action` | `'self'` | New. Sign-in, the callback and sign-out are top-level navigations, not form posts, so no Cognito host is needed (FR-050 asks for every directive sign-in needs, and that is none). Set explicitly because `form-action` does not fall back to `default-src`. |
| `base-uri` | `'self'` | New. It does not fall back to `default-src`. |
| `frame-ancestors` | `'none'` | New. The CSP form of the existing `X-Frame-Options: DENY` (`frontend-stack.ts:28-31`). |

**Removed**:

- `wss://*.execute-api.*.amazonaws.com`: the WebSocket API is gone (Q4)
- `https://cognito-identity.*.amazonaws.com`: the Identity Pool is gone ([auth-and-allowlist.md](./auth-and-allowlist.md))

There is no Polly host, because voice is synthesized on the server (Q1; closes D9).

The other security headers (`frontend-stack.ts:27-40`) are unchanged.

## HTTPS everywhere (FR-048)

- Viewer: both behaviors use `REDIRECT_TO_HTTPS` (today's default behavior, `frontend-stack.ts:47`).
- Origin: the AgentCore origin is HTTPS-only ([transport-sse.md](./transport-sse.md)).
- Sign-in: the callback and sign-out URLs are `https://` ([auth-and-allowlist.md](./auth-and-allowlist.md)). The Cognito prefix domain is served over HTTPS only.

The site is never served on `localhost` in a deployed configuration. Local development callback URLs, if any, are added only to a development app client and never to the deployed one.

## Tests

| Test | Asserts |
| --- | --- |
| `frontend-stack.test.ts` (CDK assertions) | The distribution has **no** `CustomErrorResponses`. The SPA function is on the default behavior and not on `/runtimes/*`, and its runtime is `cloudfront-js-2.0`. The CSP `connect-src` contains no `*` and contains the Cognito domain. `domainNames` equals the site constant. |
| `spa-rewrite.test.ts` | `/`, `/auth/callback` and `/privacy` become `/index.html`. `/audio/greeting-001.mp3` and `/assets/index-abc.js` are unchanged. |
