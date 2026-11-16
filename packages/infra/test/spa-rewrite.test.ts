/**
 * The CloudFront viewer-request function that gives the SPA its routes (T051;
 * contracts/csp-and-hosting.md § SPA routing without `errorResponses`).
 *
 * The distribution used to turn every 403 and 404 into `/index.html` with
 * status 200. That is distribution-wide, so it also rewrote the AgentCore
 * authorizer's 403 — the one response the browser must see to know its token
 * expired. This function replaces it, and runs on the default behavior only.
 *
 * The test evaluates `lib/functions/spa-rewrite.js` itself, so the code under
 * test is the code CDK uploads.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(here, '..', 'lib', 'functions', 'spa-rewrite.js'), 'utf8');

/**
 * CloudFront Functions are plain scripts with a global `handler`, not modules,
 * so the file is evaluated and its `handler` returned.
 */
function loadHandler(): (event: {
  request: { uri: string };
}) => { uri: string } | Record<string, unknown> {
  const factory = new Function(`${source}\nreturn handler;`);
  return factory() as ReturnType<typeof loadHandler>;
}

function rewrite(uri: string): string {
  const result = loadHandler()({ request: { uri } });
  return (result as { uri: string }).uri;
}

describe('spa-rewrite', () => {
  test.each(['/', '/privacy', '/auth/callback'])('rewrites %s to /index.html', (uri) => {
    expect(rewrite(uri)).toBe('/index.html');
  });

  test.each([
    '/audio/greeting-001.mp3',
    '/assets/index-abc123.js',
    '/assets/index-abc123.css',
    '/favicon.ico',
  ])('leaves %s alone, because its last segment has an extension', (uri) => {
    expect(rewrite(uri)).toBe(uri);
  });

  test('returns the request object, which is what CloudFront forwards', () => {
    const request = { uri: '/privacy', headers: { host: { value: 'max.recipieces.com' } } };
    const result = loadHandler()({ request }) as typeof request;

    expect(result).toBe(request);
    expect(result.headers.host.value).toBe('max.recipieces.com');
  });

  test('does not rewrite a dotted directory with a trailing slash', () => {
    // `.well-known/` style paths end in a segment with no dot of their own.
    expect(rewrite('/auth/callback/')).toBe('/index.html');
  });

  test('is syntactically valid under the JS 2.0 feature set it is deployed with', () => {
    // CloudFront Functions runtime 2.0 is ES 2020-ish but has no modules, no
    // `require`, no timers and no network. A bare `export` or `import` here
    // would deploy and then fail at the edge on every request.
    expect(source).not.toMatch(/\b(?:import|export|require)\b/);
  });
});
