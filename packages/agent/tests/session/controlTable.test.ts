/**
 * T017 (spec 003, data-model.md § Control table): every item and attribute the
 * runtime reads or writes, and the validation rules that keep them honest.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
  TransactWriteItemsCommand,
  ConditionalCheckFailedException,
  TransactionCanceledException,
  type AttributeValue,
  type PutItemCommandInput,
} from '@aws-sdk/client-dynamodb';
import {
  ControlTable,
  type ControlTableOptions,
  type CountedSessionWrite,
} from '../../src/session/controlTable.js';

const ddb = mockClient(DynamoDBClient);

const TABLE = 'injected-control-table';
const OPTIONS: Omit<ControlTableOptions, 'client'> = {
  tableName: TABLE,
  sessionMaxMinutes: 30,
  sessionTtlGraceMinutes: 15,
  rateLimitPerHour: 60,
  rateLimitPerDay: 500,
};

function table(): ControlTable {
  return new ControlTable({ ...OPTIONS, client: new DynamoDBClient({}) });
}

const epoch = (iso: string) => Date.parse(iso) / 1000;

beforeEach(() => {
  ddb.reset();
});

describe('control reads', () => {
  it.each([
    ['allowlist', (t: ControlTable) => t.getAllow('friend@example.com')],
    ['friend identity', (t: ControlTable) => t.getFriend('sub-1')],
    ['session', (t: ControlTable) => t.getSession('sub-1')],
    ['monthly spend', (t: ControlTable) => t.getSpend(new Date('2026-11-15'))],
    ['HALT', (t: ControlTable) => t.getHalt()],
  ])('reads %s with strong consistency', async (_name, read) => {
    ddb.on(GetItemCommand).resolves({});

    await read(table());

    expect(ddb.commandCalls(GetItemCommand)[0]!.args[0].input.ConsistentRead).toBe(true);
  });
});

describe('ALLOW#<email>', () => {
  it('lowercases and trims the email before the lookup', async () => {
    ddb.on(GetItemCommand).resolves({});

    await table().getAllow('  Friend@Example.COM ');

    const input = ddb.commandCalls(GetItemCommand)[0]!.args[0].input;
    expect(input.TableName).toBe(TABLE);
    expect(input.Key).toEqual({ pk: { S: 'ALLOW#friend@example.com' } });
  });

  it('returns provider, addedAt and addedBy', async () => {
    ddb.on(GetItemCommand).resolves({
      Item: {
        pk: { S: 'ALLOW#friend@example.com' },
        provider: { S: 'google' },
        addedAt: { S: '2026-11-01T00:00:00.000Z' },
        addedBy: { S: 'operator' },
      },
    });

    expect(await table().getAllow('friend@example.com')).toEqual({
      email: 'friend@example.com',
      provider: 'google',
      addedAt: '2026-11-01T00:00:00.000Z',
      addedBy: 'operator',
    });
  });

  it('returns undefined when the email is not allowlisted', async () => {
    ddb.on(GetItemCommand).resolves({});

    expect(await table().getAllow('stranger@example.com')).toBeUndefined();
  });

  it('fails loud on an entry missing an attribute', async () => {
    ddb.on(GetItemCommand).resolves({
      Item: { pk: { S: 'ALLOW#friend@example.com' }, provider: { S: 'google' } },
    });

    await expect(table().getAllow('friend@example.com')).rejects.toThrow('addedAt');
  });
});

describe('FRIEND#<sub>', () => {
  it('returns email, provider, createdAt, lastSeenAt and memoryPrunedAt', async () => {
    ddb.on(GetItemCommand, { Key: { pk: { S: 'FRIEND#sub-1' } } }).resolves({
      Item: {
        pk: { S: 'FRIEND#sub-1' },
        email: { S: 'friend@example.com' },
        provider: { S: 'google' },
        createdAt: { S: '2026-11-01T00:00:00.000Z' },
        lastSeenAt: { S: '2026-11-10T00:00:00.000Z' },
        memoryPrunedAt: { S: '2026-11-11T00:00:00.000Z' },
      },
    });

    expect(await table().getFriend('sub-1')).toEqual({
      sub: 'sub-1',
      email: 'friend@example.com',
      provider: 'google',
      createdAt: '2026-11-01T00:00:00.000Z',
      lastSeenAt: '2026-11-10T00:00:00.000Z',
      memoryPrunedAt: '2026-11-11T00:00:00.000Z',
    });
  });

  it('leaves lastSeenAt and memoryPrunedAt undefined before they are first written', async () => {
    ddb.on(GetItemCommand).resolves({
      Item: {
        pk: { S: 'FRIEND#sub-1' },
        email: { S: 'friend@example.com' },
        provider: { S: 'google' },
        createdAt: { S: '2026-11-01T00:00:00.000Z' },
      },
    });

    const friend = await table().getFriend('sub-1');

    expect(friend?.lastSeenAt).toBeUndefined();
    expect(friend?.memoryPrunedAt).toBeUndefined();
  });

  it('returns undefined for an unknown sub', async () => {
    ddb.on(GetItemCommand).resolves({});

    expect(await table().getFriend('sub-unknown')).toBeUndefined();
  });

  it('records lastSeenAt on an existing friend only', async () => {
    ddb.on(UpdateItemCommand).resolves({});

    await table().recordFriendSeen('sub-1', new Date('2026-11-15T08:30:00.000Z'));

    const input = ddb.commandCalls(UpdateItemCommand)[0]!.args[0].input;
    expect(input.TableName).toBe(TABLE);
    expect(input.Key).toEqual({ pk: { S: 'FRIEND#sub-1' } });
    expect(input.UpdateExpression).toBe('SET #lastSeenAt = :lastSeenAt');
    expect(input.ExpressionAttributeNames).toEqual({ '#lastSeenAt': 'lastSeenAt' });
    expect(input.ExpressionAttributeValues).toEqual({
      ':lastSeenAt': { S: '2026-11-15T08:30:00.000Z' },
    });
    expect(input.ConditionExpression).toBe('attribute_exists(pk)');
  });
});

describe('SESSION#<sub>', () => {
  const openedAt = '2026-11-15T08:00:00.000Z';
  const initialSession: CountedSessionWrite = {
    sessionId: 'counted-1',
    state: 'Active',
    openedAt,
    turns: 0,
    conversationalTokens: 0,
  };

  // Model the absence/expected-snapshot conditions against one stored item.
  // The command assertions below pin the actual DynamoDB expression as well.
  function useSessionStore(): void {
    let stored: PutItemCommandInput['Item'];
    ddb.on(GetItemCommand).callsFake(() => ({
      Item: stored === undefined ? undefined : structuredClone(stored),
    }));
    ddb.on(PutItemCommand).callsFake((input: PutItemCommandInput) => {
      if (input.ConditionExpression !== undefined) {
        const expected = input.ExpressionAttributeValues;
        const matches =
          input.ConditionExpression === 'attribute_not_exists(pk)'
            ? stored === undefined
            : stored !== undefined &&
              stored.sessionId?.S === expected?.[':expectedSessionId']?.S &&
              stored.state?.S === expected?.[':expectedState']?.S &&
              stored.openedAt?.S === expected?.[':expectedOpenedAt']?.S &&
              stored.turns?.N === expected?.[':expectedTurns']?.N &&
              stored.conversationalTokens?.N === expected?.[':expectedTokens']?.N;
        if (!matches) {
          throw new ConditionalCheckFailedException({ message: 'Session changed', $metadata: {} });
        }
      }
      stored = structuredClone(input.Item);
      return {};
    });
  }

  it('allows only one creator when two requests open a session for the same friend', async () => {
    useSessionStore();
    const t = table();

    const results = await Promise.allSettled([
      t.putSession('sub-1', initialSession),
      t.putSession('sub-1', { ...initialSession, sessionId: 'counted-2' }),
    ]);

    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
    expect((await t.getSession('sub-1'))?.sessionId).toBe('counted-1');
    expect(ddb.commandCalls(PutItemCommand)[0]!.args[0].input.ConditionExpression).toBe(
      'attribute_not_exists(pk)',
    );
  });

  it('rejects a stale counter update so a fresh snapshot can preserve both increments', async () => {
    useSessionStore();
    const t = table();
    await t.putSession('sub-1', initialSession);

    const results = await Promise.allSettled([
      t.putSession(
        'sub-1',
        { ...initialSession, turns: 1, conversationalTokens: 10 },
        initialSession,
      ),
      t.putSession(
        'sub-1',
        { ...initialSession, turns: 1, conversationalTokens: 20 },
        initialSession,
      ),
    ]);

    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
    const current = (await t.getSession('sub-1'))!;
    await t.putSession(
      'sub-1',
      {
        ...current,
        turns: current.turns + 1,
        conversationalTokens: current.conversationalTokens + 20,
      },
      current,
    );
    expect(await t.getSession('sub-1')).toMatchObject({ turns: 2, conversationalTokens: 30 });

    const input = ddb.commandCalls(PutItemCommand)[1]!.args[0].input;
    expect(input.ConditionExpression).toBe(
      '#sessionId = :expectedSessionId AND #state = :expectedState AND ' +
        '#openedAt = :expectedOpenedAt AND #turns = :expectedTurns AND ' +
        '#conversationalTokens = :expectedTokens',
    );
    expect(input.ExpressionAttributeNames).toEqual({
      '#sessionId': 'sessionId',
      '#state': 'state',
      '#openedAt': 'openedAt',
      '#turns': 'turns',
      '#conversationalTokens': 'conversationalTokens',
    });
  });

  it('does not let a stale completion resurrect a signed-off session', async () => {
    useSessionStore();
    const t = table();
    await t.putSession('sub-1', initialSession);
    await t.putSession('sub-1', { ...initialSession, state: 'SignedOff' }, initialSession);

    await expect(
      t.putSession(
        'sub-1',
        { ...initialSession, turns: 1, conversationalTokens: 10 },
        initialSession,
      ),
    ).rejects.toBeInstanceOf(ConditionalCheckFailedException);
    expect((await t.getSession('sub-1'))?.state).toBe('SignedOff');
  });

  it('replaces an ended session conditionally without letting its stale writers overwrite the new one', async () => {
    useSessionStore();
    const t = table();
    const ended: CountedSessionWrite = { ...initialSession, state: 'Expired' };
    await t.putSession('sub-1', ended);
    await t.putSession('sub-1', { ...initialSession, sessionId: 'counted-2' }, ended);

    await expect(t.putSession('sub-1', initialSession, ended)).rejects.toBeInstanceOf(
      ConditionalCheckFailedException,
    );
    expect((await t.getSession('sub-1'))?.sessionId).toBe('counted-2');
  });

  it('writes sessionId, state, openedAt, turns, conversationalTokens and ttl', async () => {
    ddb.on(PutItemCommand).resolves({});

    await table().putSession('sub-1', {
      sessionId: 'counted-1',
      state: 'Active',
      openedAt,
      turns: 3,
      conversationalTokens: 412,
    });

    const input = ddb.commandCalls(PutItemCommand)[0]!.args[0].input;
    expect(input.TableName).toBe(TABLE);
    expect(input.Item).toEqual({
      pk: { S: 'SESSION#sub-1' },
      sessionId: { S: 'counted-1' },
      state: { S: 'Active' },
      openedAt: { S: openedAt },
      turns: { N: '3' },
      conversationalTokens: { N: '412' },
      ttl: { N: String(epoch(openedAt) + (30 + 15) * 60) },
    });
  });

  it('reads every attribute back', async () => {
    ddb.on(GetItemCommand).resolves({
      Item: {
        pk: { S: 'SESSION#sub-1' },
        sessionId: { S: 'counted-1' },
        state: { S: 'SignedOff' },
        openedAt: { S: openedAt },
        turns: { N: '50' },
        conversationalTokens: { N: '19999' },
        ttl: { N: String(epoch(openedAt) + 45 * 60) },
      },
    });

    expect(await table().getSession('sub-1')).toEqual({
      sessionId: 'counted-1',
      state: 'SignedOff',
      openedAt,
      turns: 50,
      conversationalTokens: 19999,
      ttl: epoch(openedAt) + 45 * 60,
    });
  });

  it('rejects an unknown state rather than guessing', async () => {
    ddb.on(GetItemCommand).resolves({
      Item: {
        pk: { S: 'SESSION#sub-1' },
        sessionId: { S: 'counted-1' },
        state: { S: 'Paused' },
        openedAt: { S: openedAt },
        turns: { N: '1' },
        conversationalTokens: { N: '1' },
        ttl: { N: '1' },
      },
    });

    await expect(table().getSession('sub-1')).rejects.toThrow('state');
  });

  it('evaluates expiry from openedAt in code, not from ttl', () => {
    const t = table();
    const session = {
      sessionId: 'counted-1',
      state: 'Active' as const,
      openedAt,
      turns: 1,
      conversationalTokens: 1,
      // A ttl already in the past must not expire a session still inside its cap.
      ttl: epoch(openedAt) - 1,
    };

    expect(t.isSessionExpired(session, new Date('2026-11-15T08:29:59.999Z'))).toBe(false);
    expect(t.isSessionExpired(session, new Date('2026-11-15T08:30:00.000Z'))).toBe(true);
    expect(
      t.isSessionExpired(
        { ...session, ttl: epoch(openedAt) + 10_000 },
        new Date('2026-11-15T08:31:00.000Z'),
      ),
    ).toBe(true);
  });
});

describe('RATE#<sub>#H# and RATE#<sub>#D# (UTC)', () => {
  const now = new Date('2026-11-15T23:30:00.000Z');

  it('atomically ADDs one to the hour and day counters with ttl = window end + one window', async () => {
    ddb.on(TransactWriteItemsCommand).resolves({});

    expect(await table().consumeRate('sub-1', now)).toEqual({ allowed: true });

    const items = ddb.commandCalls(TransactWriteItemsCommand)[0]!.args[0].input.TransactItems!;
    expect(items).toHaveLength(2);
    const [hour, day] = items.map((i) => i.Update!);

    expect(hour!.TableName).toBe(TABLE);
    expect(hour!.Key).toEqual({ pk: { S: 'RATE#sub-1#H#2026-11-15T23' } });
    expect(hour!.UpdateExpression).toBe('ADD #count :one SET #ttl = :ttl');
    expect(hour!.ConditionExpression).toBe('attribute_not_exists(#count) OR #count < :limit');
    expect(hour!.ExpressionAttributeNames).toEqual({ '#count': 'count', '#ttl': 'ttl' });
    expect(hour!.ExpressionAttributeValues).toEqual({
      ':one': { N: '1' },
      ':limit': { N: '60' },
      ':ttl': { N: String(epoch('2026-11-16T01:00:00.000Z')) },
    });

    expect(day!.TableName).toBe(TABLE);
    expect(day!.Key).toEqual({ pk: { S: 'RATE#sub-1#D#2026-11-15' } });
    expect(day!.ExpressionAttributeValues).toEqual({
      ':one': { N: '1' },
      ':limit': { N: '500' },
      ':ttl': { N: String(epoch('2026-11-17T00:00:00.000Z')) },
    });
  });

  it.each([
    ['hour', ['ConditionalCheckFailed', 'None']],
    ['day', ['None', 'ConditionalCheckFailed']],
  ])('refuses without counting when the %s limit is reached', async (window, codes) => {
    ddb.on(TransactWriteItemsCommand).rejects(
      new TransactionCanceledException({
        message: 'Transaction cancelled',
        $metadata: {},
        CancellationReasons: codes.map((Code) => ({ Code })),
      }),
    );

    expect(await table().consumeRate('sub-1', now)).toEqual({ allowed: false, exceeded: window });
    expect(ddb.commandCalls(UpdateItemCommand)).toHaveLength(0);
  });

  it('propagates any other failure', async () => {
    ddb.on(TransactWriteItemsCommand).rejects(new Error('ProvisionedThroughputExceeded'));

    await expect(table().consumeRate('sub-1', now)).rejects.toThrow(
      'ProvisionedThroughputExceeded',
    );
  });
});

describe('SPEND#<yyyy-mm>', () => {
  const now = new Date('2026-11-30T23:59:59.000Z');

  it('atomically ADDs integer microUsd and sets updatedAt', async () => {
    ddb.on(UpdateItemCommand).resolves({});

    await table().addSpend(1234, now);

    const input = ddb.commandCalls(UpdateItemCommand)[0]!.args[0].input;
    expect(input.TableName).toBe(TABLE);
    expect(input.Key).toEqual({ pk: { S: 'SPEND#2026-11' } });
    expect(input.UpdateExpression).toBe('ADD #microUsd :microUsd SET #updatedAt = :updatedAt');
    expect(input.ExpressionAttributeNames).toEqual({
      '#microUsd': 'microUsd',
      '#updatedAt': 'updatedAt',
    });
    expect(input.ExpressionAttributeValues).toEqual({
      ':microUsd': { N: '1234' },
      ':updatedAt': { S: '2026-11-30T23:59:59.000Z' },
    });
  });

  it.each([1.5, -1, Number.NaN])(
    'refuses a non-integer or negative amount (%s)',
    async (amount) => {
      await expect(table().addSpend(amount, now)).rejects.toThrow('microUsd');
      expect(ddb.commandCalls(UpdateItemCommand)).toHaveLength(0);
    },
  );

  it('reads microUsd and updatedAt for the month', async () => {
    ddb.on(GetItemCommand, { Key: { pk: { S: 'SPEND#2026-11' } } }).resolves({
      Item: {
        pk: { S: 'SPEND#2026-11' },
        microUsd: { N: '987654' },
        updatedAt: { S: '2026-11-30T23:00:00.000Z' },
      },
    });

    expect(await table().getSpend(now)).toEqual({
      microUsd: 987654,
      updatedAt: '2026-11-30T23:00:00.000Z',
    });
  });

  it('returns undefined when nothing has been spent this month', async () => {
    ddb.on(GetItemCommand).resolves({});

    expect(await table().getSpend(now)).toBeUndefined();
  });
});

describe('CONTROL#HALT', () => {
  it('returns haltedAt and reason while halted', async () => {
    const item: Record<string, AttributeValue> = {
      pk: { S: 'CONTROL#HALT' },
      haltedAt: { S: '2026-11-20T00:00:00.000Z' },
      reason: { S: 'budget 100% ACTUAL' },
    };
    ddb.on(GetItemCommand, { TableName: TABLE, Key: { pk: { S: 'CONTROL#HALT' } } }).resolves({
      Item: item,
    });

    expect(await table().getHalt()).toEqual({
      haltedAt: '2026-11-20T00:00:00.000Z',
      reason: 'budget 100% ACTUAL',
    });
  });

  it('returns undefined when not halted', async () => {
    ddb.on(GetItemCommand).resolves({});

    expect(await table().getHalt()).toBeUndefined();
  });
});
