import * as cdk from 'aws-cdk-lib';
import { LogRetention14Days } from './aspects/log-retention.js';
import { CertificateStack } from './certificate-stack.js';
import { DataStack } from './data-stack.js';
import { CognitoStack } from './cognito-stack.js';
import { BudgetStack } from './budget-stack.js';
import { AgentStack } from './agent-stack.js';
import { FrontendStack } from './frontend-stack.js';

/** FR-031: every stack except the us-east-1 certificate stack. */
const env = { region: 'us-west-2' };

/** contracts/csp-and-hosting.md § One site domain. */
export const SITE_DOMAIN = 'max.recipieces.com';

/**
 * Adds every Max Height stack to `app`. Lives outside `bin/app.ts` so tests can
 * assert app-wide properties (Region, tags, log retention) on the real app.
 */
export function buildMaxHeightApp(app: cdk.App): void {
  // Runtime ARN provided at deploy time: cdk deploy -c agentRuntimeArn=arn:aws:...
  const agentRuntimeArn =
    app.node.tryGetContext('agentRuntimeArn') ?? 'arn:aws:bedrock-agentcore:*:*:runtime/*';

  new CertificateStack(app, 'MaxHeight-Certificate', {
    env: { region: 'us-east-1' },
    domainName: SITE_DOMAIN,
  });

  new DataStack(app, 'MaxHeight-Data', { env });

  const cognito = new CognitoStack(app, 'MaxHeight-Cognito', { env, agentRuntimeArn });

  new BudgetStack(app, 'MaxHeight-Budget', {
    env,
    unauthRole: cognito.unauthRole,
    unauthPolicyName: cognito.unauthPolicyName,
    // Never committed (public repo): cdk deploy -c budgetAlertEmail=<owner email>
    alertEmail: app.node.tryGetContext('budgetAlertEmail'),
  });

  new AgentStack(app, 'MaxHeight-Agent', { env });
  new FrontendStack(app, 'MaxHeight-Frontend', { env });

  // research § R-deploy: the one cost-allocation tag.
  cdk.Tags.of(app).add('project', 'max-height');
  cdk.Aspects.of(app).add(new LogRetention14Days());
}
