import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { buildMaxHeightApp } from '../lib/max-height-app.js';
import { DEPLOY_CONTEXT } from './deploy-context.js';

// contracts/csp-and-hosting.md § Certificate: CloudFront only accepts us-east-1
// certificates, and DNS stays at GoDaddy, so validation is DNS with no hosted zone.
describe('MaxHeight-Certificate', () => {
  let stack: cdk.Stack;
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App({ context: DEPLOY_CONTEXT });
    buildMaxHeightApp(app);
    const found = app.node.tryFindChild('MaxHeight-Certificate');
    if (!found || !cdk.Stack.isStack(found)) {
      throw new Error('buildMaxHeightApp adds no MaxHeight-Certificate stack');
    }
    stack = found;
    template = Template.fromStack(stack);
  });

  test('is in us-east-1 with cross-Region references enabled', () => {
    expect(stack.region).toBe('us-east-1');
    expect(stack._crossRegionReferences).toBe(true);
  });

  test('issues a DNS-validated certificate for max.recipieces.com', () => {
    template.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'max.recipieces.com',
      ValidationMethod: 'DNS',
    });
    // No hosted zone: the builder adds ACM's CNAME at GoDaddy by hand.
    const [cert] = Object.values(template.findResources('AWS::CertificateManager::Certificate'));
    expect(cert.Properties.DomainValidationOptions).toBeUndefined();
  });
});
