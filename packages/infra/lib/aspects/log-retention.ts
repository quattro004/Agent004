import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { IConstruct } from 'constructs';

const RETENTION = logs.RetentionDays.TWO_WEEKS;
const LOG_GROUP_ID = 'LogGroup14Days';

/**
 * research § R-obs (SC-011): Lambda creates a missing `/aws/lambda/<name>`
 * group on first invoke, and that group never expires. Every
 * `AWS::Lambda::Function` without a configured log group gets its own 14-day
 * group, wired through `LoggingConfig.LogGroup` so it exists before the first
 * invoke.
 *
 * The work happens in a stack validation hook, not in `visit`: CDK creates the
 * `crossRegionReferences` export writer and reader Lambdas in `prepareApp`,
 * which runs after Aspects and before validation (aws-cdk-lib 2.276.0,
 * `core/lib/private/synthesis.js`), so an Aspect alone never sees them.
 */
export class LogRetention14Days implements cdk.IAspect {
  public visit(node: IConstruct): void {
    if (!cdk.Stack.isStack(node)) return;
    const stack = node;
    stack.node.addValidation({
      validate: () => {
        stack.node
          .findAll()
          .filter((c) => cdk.Stack.of(c) === stack)
          .forEach(addLogGroupIfMissing);
        return [];
      },
    });
  }
}

function addLogGroupIfMissing(construct: IConstruct): void {
  if (!cdk.CfnResource.isCfnResource(construct)) return;
  if (construct.cfnResourceType !== 'AWS::Lambda::Function') return;
  if (construct instanceof lambda.CfnFunction && hasLogGroup(construct)) return;

  const scope = construct.node.scope;
  if (!scope) return;
  const id = `${construct.node.id}${LOG_GROUP_ID}`;
  if (scope.node.tryFindChild(id)) return;

  const logGroup = new logs.LogGroup(scope, id, { retention: RETENTION });
  // Tags.of(app) is also an Aspect, and it has already run by validation time.
  const cfnLogGroup = logGroup.node.defaultChild as logs.CfnLogGroup;
  for (const [key, value] of Object.entries(cdk.Stack.of(construct).tags.tagValues())) {
    cfnLogGroup.tags.setTag(key, value);
  }
  construct.addPropertyOverride('LoggingConfig.LogGroup', logGroup.logGroupName);
}

function hasLogGroup(fn: lambda.CfnFunction): boolean {
  const config = fn.loggingConfig;
  if (config === undefined || cdk.Token.isUnresolved(config)) return false;
  return (config as lambda.CfnFunction.LoggingConfigProperty).logGroup !== undefined;
}
