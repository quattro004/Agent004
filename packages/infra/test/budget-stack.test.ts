import { isDeepStrictEqual } from 'node:util';
import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { BudgetStack } from '../lib/budget-stack.js';

const ALERT_EMAIL = 'owner@example.com';

interface Subscriber {
  SubscriptionType: string;
  Address: unknown;
}

interface NotificationWithSubscribers {
  Notification: { Threshold: number };
  Subscribers: Subscriber[];
}

/**
 * The Budget stack after the Q6 redesign (T066, T074, T155).
 *
 * It deploys first (FR-033) and therefore takes nothing from another stack.
 * It owns the budget, its notifications, the hard-stop topic and that topic's
 * policy — and nothing else. The hard-stop Lambda moved to the Ops stack,
 * which deploys after Data and Agent because it needs the control table and
 * the runtime role (contracts/spend-control.md § Stack split).
 */
describe('BudgetStack', () => {
  let template: Template;
  let stack: BudgetStack;

  function subscribersAt(threshold: number): Subscriber[] {
    const [budget] = Object.values(template.findResources('AWS::Budgets::Budget'));
    const notifications: NotificationWithSubscribers[] =
      budget.Properties.NotificationsWithSubscribers;
    const match = notifications.find((n) => n.Notification.Threshold === threshold);
    if (!match) throw new Error(`No budget notification at ${threshold}%`);
    return match.Subscribers;
  }

  function hardStopTopicRef(): unknown {
    const [topicId] = Object.keys(template.findResources('AWS::SNS::Topic'));
    return { Ref: topicId };
  }

  beforeAll(() => {
    const app = new cdk.App();
    stack = new BudgetStack(app, 'TestBudgetStack', { alertEmail: ALERT_EMAIL });
    template = Template.fromStack(stack);
  });

  // FR-033: the Budget stack deploys before anything that can spend, so it
  // cannot wait on a role, a table or a runtime from a later stack.
  test('takes no props from another stack', () => {
    expect(stack.dependencies).toEqual([]);
  });

  // Constitution 1.9.0 P2: a $20 hard cap, so the thresholds fall at $10, $16
  // and $20 (amendment A5, spec § Clarifications 2026-11-02).
  test('creates a $20/month cost budget', () => {
    template.hasResourceProperties('AWS::Budgets::Budget', {
      Budget: Match.objectLike({
        BudgetLimit: { Amount: 20, Unit: 'USD' },
        TimeUnit: 'MONTHLY',
        BudgetType: 'COST',
      }),
    });
  });

  // Credits and refunds would hide real spend: a credited month reads as $0
  // while the meter runs, and the cap is on what Max Height costs, not on what
  // the builder is charged after credits.
  test('counts gross spend, excluding credits, refunds and discounts', () => {
    template.hasResourceProperties('AWS::Budgets::Budget', {
      Budget: Match.objectLike({
        CostTypes: Match.objectLike({
          IncludeCredit: false,
          IncludeRefund: false,
          IncludeDiscount: false,
        }),
      }),
    });
  });

  test('creates one SNS topic, for the hard stop', () => {
    template.resourceCountIs('AWS::SNS::Topic', 1);
  });

  test.each([50, 80, 100])('%i%% threshold emails the owner', (threshold) => {
    expect(subscribersAt(threshold)).toContainEqual({
      SubscriptionType: 'EMAIL',
      Address: ALERT_EMAIL,
    });
  });

  // #56: a warning that reaches the hard-stop topic halts the service at 50%
  // of the budget. Only the 100% notification may publish.
  test('only the 100% notification reaches the hard-stop topic', () => {
    const topic = hardStopTopicRef();
    const reachingHardStop = [50, 80, 100].filter((threshold) =>
      subscribersAt(threshold).some(
        (s) => s.SubscriptionType === 'SNS' && isDeepStrictEqual(s.Address, topic),
      ),
    );
    expect(reachingHardStop).toEqual([100]);
  });

  // F3: without this policy AWS Budgets cannot publish at all, so the hard
  // stop never fires. Conditions use tokens, never a literal account.
  test('Budgets can publish to the hard-stop topic, scoped to this account', () => {
    const topic = hardStopTopicRef();
    template.hasResourceProperties('AWS::SNS::TopicPolicy', {
      Topics: [topic],
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Allow',
            Principal: { Service: 'budgets.amazonaws.com' },
            Action: 'sns:Publish',
            Resource: topic,
            Condition: {
              StringEquals: { 'aws:SourceAccount': { Ref: 'AWS::AccountId' } },
              ArnLike: {
                'aws:SourceArn': {
                  'Fn::Join': [
                    '',
                    [
                      'arn:',
                      { Ref: 'AWS::Partition' },
                      ':budgets::',
                      { Ref: 'AWS::AccountId' },
                      ':*',
                    ],
                  ],
                },
              },
            },
          }),
        ]),
      },
    });
  });

  // The hard-stop Lambda needs the control table and the runtime role, which
  // exist only after Data and Agent. Keeping it here is what forced the old
  // design to reach for the one role that deployed early enough (#61).
  test('contains no Lambda', () => {
    template.resourceCountIs('AWS::Lambda::Function', 0);
  });

  test('publishes the hard-stop topic ARN for the Ops stack', () => {
    template.hasOutput('*', { Export: Match.anyValue() });
    expect(stack.hardStopTopic.topicArn).toBeDefined();
  });

  // Mirrors app.node.tryGetContext('budgetAlertEmail') returning undefined, or
  // `-c budgetAlertEmail=` passed empty. No warning would ever reach a person.
  test.each([undefined, '', '   '])(
    'an alert email of %p fails loudly, naming the context key',
    (alertEmail) => {
      const app = new cdk.App();
      expect(
        () =>
          new BudgetStack(app, 'TestBudgetStack', {
            alertEmail: alertEmail as unknown as string,
          }),
      ).toThrow(/budgetAlertEmail/);
    },
  );
});
