import * as cdk from 'aws-cdk-lib';
import { LogRetention14Days } from './aspects/log-retention.js';
import { AgentStack } from './agent-stack.js';
import { CertificateStack } from './certificate-stack.js';
import { DataStack } from './data-stack.js';
import { CognitoStack } from './cognito-stack.js';
import { BudgetStack } from './budget-stack.js';
import { FrontendStack } from './frontend-stack.js';
import { SITE_DOMAIN } from './site-domain.js';

/** FR-031: every stack except the us-east-1 certificate stack. */
const env = { region: 'us-west-2' };

export { SITE_DOMAIN };

/**
 * Adds every Max Height stack to `app`. Lives outside `bin/app.ts` so tests can
 * assert app-wide properties (Region, tags, log retention) on the real app.
 */
export function buildMaxHeightApp(app: cdk.App): void {
  new CertificateStack(app, 'MaxHeight-Certificate', {
    env: { region: 'us-east-1' },
    domainName: SITE_DOMAIN,
  });

  const data = new DataStack(app, 'MaxHeight-Data', { env });

  // Both are public values the builder owns, and neither is invented here:
  // cdk deploy -c cognitoDomainPrefix=<prefix> -c googleClientId=<id>
  // (quickstart.md Prerequisites rows 8 and 9, deviation C33).
  const cognitoStack = new CognitoStack(app, 'MaxHeight-Cognito', {
    env,
    controlTable: data.controlTable,
    domainPrefix: app.node.tryGetContext('cognitoDomainPrefix'),
    googleClientId: app.node.tryGetContext('googleClientId'),
  });

  new AgentStack(app, 'MaxHeight-Agent', {
    env,
    controlTable: data.controlTable,
    memory: { memoryId: data.memory.attrMemoryId, memoryArn: data.memory.attrMemoryArn },
    userPool: cognitoStack.userPool,
    userPoolClient: cognitoStack.userPoolClient,
  });

  new BudgetStack(app, 'MaxHeight-Budget', {
    env,
    // Never committed (public repo): cdk deploy -c budgetAlertEmail=<owner email>
    alertEmail: app.node.tryGetContext('budgetAlertEmail'),
  });

  new FrontendStack(app, 'MaxHeight-Frontend', { env });

  // research § R-deploy: the one cost-allocation tag.
  cdk.Tags.of(app).add('project', 'max-height');
  cdk.Aspects.of(app).add(new LogRetention14Days());
}
