import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

export interface CertificateStackProps extends cdk.StackProps {
  domainName: string;
}

/**
 * The CloudFront certificate (contracts/csp-and-hosting.md § Certificate).
 * Deploy waits until the builder adds ACM's validation CNAME at GoDaddy.
 */
export class CertificateStack extends cdk.Stack {
  readonly certificate: acm.ICertificate;

  constructor(scope: Construct, id: string, props: CertificateStackProps) {
    super(scope, id, { ...props, crossRegionReferences: true });

    this.certificate = new acm.Certificate(this, 'SiteCertificate', {
      domainName: props.domainName,
      validation: acm.CertificateValidation.fromDns(),
    });
  }
}
