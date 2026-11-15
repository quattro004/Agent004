import * as cdk from 'aws-cdk-lib';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Template } from 'aws-cdk-lib/assertions';
import { LogRetention14Days } from '../lib/aspects/log-retention.js';

interface Resource {
  Type: string;
  Properties?: { LoggingConfig?: { LogGroup?: { Ref?: string } }; RetentionInDays?: number };
}

/** Each Lambda's logical ID, mapped to its log group's retention (undefined if none). */
function lambdaLogRetention(template: Template): Record<string, number | undefined> {
  const resources = template.toJSON().Resources as Record<string, Resource>;
  return Object.fromEntries(
    Object.entries(resources)
      .filter(([, r]) => r.Type === 'AWS::Lambda::Function')
      .map(([id, r]) => {
        const ref = r.Properties?.LoggingConfig?.LogGroup?.Ref;
        return [id, ref ? resources[ref]?.Properties?.RetentionInDays : undefined];
      }),
  );
}

// research § R-obs: CDK creates the crossRegionReferences export writer and
// reader Lambdas in prepareApp, after Aspects run. They need 14-day groups too.
describe('LogRetention14Days', () => {
  test('reaches the crossRegionReferences export writer and reader Lambdas', () => {
    const app = new cdk.App();
    const env = (region: string) => ({ account: '111111111111', region });
    const producer = new cdk.Stack(app, 'Producer', {
      env: env('us-east-1'),
      crossRegionReferences: true,
    });
    const topic = new sns.Topic(producer, 'Topic');
    const consumer = new cdk.Stack(app, 'Consumer', {
      env: env('us-west-2'),
      crossRegionReferences: true,
    });
    new cdk.CfnOutput(consumer, 'TopicArn', { value: topic.topicArn });
    cdk.Aspects.of(app).add(new LogRetention14Days());

    const writer = lambdaLogRetention(Template.fromStack(producer));
    const reader = lambdaLogRetention(Template.fromStack(consumer));

    expect(Object.keys(writer)).toEqual([expect.stringMatching(/CrossRegionExportWriter/)]);
    expect(Object.keys(reader)).toEqual([expect.stringMatching(/CrossRegionExportReader/)]);
    expect([...Object.values(writer), ...Object.values(reader)]).toEqual([14, 14]);
  });
});
