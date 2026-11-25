// CloudFront Function (runtime cloudfront-js-2.0), viewer request, default
// behavior only. It gives the SPA its client-side routes without the
// distribution-wide `errorResponses` that would also rewrite the AgentCore
// authorizer's 403 (contracts/csp-and-hosting.md § SPA routing).
//
// This file is deployed verbatim and evaluated by test/spa-rewrite.test.ts,
// so it must stay a plain script: no modules, no timers, no network.
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);

  // A last segment with no dot is a route, not a file. That covers `/`,
  // `/privacy` and `/auth/callback`; `/assets/index-abc.js` and
  // `/audio/greeting-001.mp3` pass through to S3 unchanged.
  if (lastSegment.indexOf('.') === -1) {
    request.uri = '/index.html';
  }

  return request;
}
