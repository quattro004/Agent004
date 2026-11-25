/**
 * T166 (spec 003, spec.md Session 2026-11-15 § Concurrency and § Accounting):
 * atomic conservative admission and exactly-once settlement in the control
 * table. A stateful DynamoDB double evaluates the conditions the commands carry,
 * and the command assertions pin the actual expressions as well.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBClient,
  GetItemCommand,
  TransactWriteItemsCommand,
  TransactionCanceledException,
  type AttributeValue,
  type TransactWriteItem,
  type TransactWriteItemsCommandInput,
} from '@aws-sdk/client-dynamodb';
import {
  ControlTable,
  SettlementConflictError,
  type AdmissionRequest,
  type ControlTableOptions,
  type Lease,
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

const table = () => new ControlTable({ ...OPTIONS, client: new DynamoDBClient({}) });

const NOV = new Date('2026-11-15T08:00:00.000Z');

function request(overrides: Partial<AdmissionRequest> = {}): AdmissionRequest {
  return {
    sub: 'sub-1',
    requestId: 'req-1',
    reserveMicroUsd: 125_000,
    spendCeilingMicroUsd: 15_000_000,
    maxActiveRequests: 2,
    now: NOV,
    ...overrides,
  };
}

type Item = Record<string, AttributeValue>;

/**
 * Evaluates the conditions this feature's transactions carry against one
 * in-memory table, all-or-nothing like DynamoDB's `TransactWriteItems`.
 */
function useStatefulTable(
  initial: Record<string, Item> = {},
  lostResponse = false,
): {
  items: Map<string, Item>;
  transactions: TransactWriteItemsCommandInput[];
} {
  const items = new Map<string, Item>(Object.entries(initial));
  const transactions: TransactWriteItemsCommandInput[] = [];
  const number = (item: Item | undefined, name: string): number | undefined =>
    item?.[name]?.N === undefined ? undefined : Number(item[name]!.N);

  ddb.on(TransactWriteItemsCommand).callsFake((input: TransactWriteItemsCommandInput) => {
    transactions.push(input);
    const reasons: { Code: string }[] = [];

    const pass = (entry: TransactWriteItem): boolean => {
      if (entry.Put) {
        return !(entry.Put.ConditionExpression && items.has(entry.Put.Item!.pk!.S!));
      }
      if (entry.Delete) {
        const key = entry.Delete.Key!.pk!.S!;
        const values = entry.Delete.ExpressionAttributeValues!;
        const stored = items.get(key);
        return (
          stored?.requestId?.S === values[':requestId']!.S &&
          stored?.reservedMicroUsd?.N === values[':reserved']!.N
        );
      }
      const update = entry.Update!;
      const stored = items.get(update.Key!.pk!.S!);
      const values = update.ExpressionAttributeValues!;
      if (values[':ceiling']) {
        const current = number(stored, 'microUsd');
        return current === undefined || current <= Number(values[':ceiling'].N);
      }
      if (values[':max']) {
        const current = number(stored, 'active');
        return current === undefined || current < Number(values[':max'].N);
      }
      if (values[':zero']) return (number(stored, 'active') ?? 0) > Number(values[':zero'].N);
      return true;
    };

    const outcomes = (input.TransactItems ?? []).map(pass);
    if (outcomes.includes(false)) {
      for (const ok of outcomes) reasons.push({ Code: ok ? 'None' : 'ConditionalCheckFailed' });
      throw new TransactionCanceledException({
        message: 'Transaction cancelled',
        $metadata: {},
        CancellationReasons: reasons,
      });
    }

    for (const entry of input.TransactItems ?? []) {
      if (entry.Put) {
        items.set(entry.Put.Item!.pk!.S!, structuredClone(entry.Put.Item!));
      } else if (entry.Delete) {
        items.delete(entry.Delete.Key!.pk!.S!);
      } else {
        const update = entry.Update!;
        const key = update.Key!.pk!.S!;
        const values = update.ExpressionAttributeValues!;
        const next: Item = { ...(items.get(key) ?? { pk: { S: key } }) };
        const attribute = key.startsWith('SPEND#') ? 'microUsd' : 'active';
        const delta = Number(values[':amount']?.N ?? values[':delta']?.N);
        next[attribute] = { N: String((number(next, attribute) ?? 0) + delta) };
        items.set(key, next);
      }
    }
    if (lostResponse) throw new Error('TransactWriteItems response lost');
    return {};
  });

  return { items, transactions };
}

beforeEach(() => {
  ddb.reset();
});

describe('admitRequest', () => {
  it('reserves spend, takes a global slot and takes the friend lease in one transaction', async () => {
    const { transactions } = useStatefulTable();

    const result = await table().admitRequest(request());

    expect(result).toEqual({
      admitted: true,
      lease: { sub: 'sub-1', requestId: 'req-1', reservedMicroUsd: 125_000, month: '2026-11' },
    });
    expect(transactions).toHaveLength(1);
    const [spend, active, lease] = transactions[0]!.TransactItems!;

    expect(spend!.Update!.Key).toEqual({ pk: { S: 'SPEND#2026-11' } });
    expect(spend!.Update!.UpdateExpression).toBe(
      'ADD #microUsd :amount SET #updatedAt = :updatedAt',
    );
    // Admitted only while committed + reservation stays at or under the ceiling.
    expect(spend!.Update!.ConditionExpression).toBe(
      'attribute_not_exists(#microUsd) OR #microUsd <= :ceiling',
    );
    expect(spend!.Update!.ExpressionAttributeValues).toMatchObject({
      ':amount': { N: '125000' },
      ':ceiling': { N: String(15_000_000 - 125_000) },
    });

    expect(active!.Update!.Key).toEqual({ pk: { S: 'CONTROL#ACTIVE' } });
    expect(active!.Update!.ConditionExpression).toBe(
      'attribute_not_exists(#active) OR #active < :max',
    );
    expect(active!.Update!.ExpressionAttributeValues).toMatchObject({
      ':delta': { N: '1' },
      ':max': { N: '2' },
    });

    expect(lease!.Put!.ConditionExpression).toBe('attribute_not_exists(pk)');
    expect(lease!.Put!.Item).toMatchObject({
      pk: { S: 'LEASE#sub-1' },
      requestId: { S: 'req-1' },
      reservedMicroUsd: { N: '125000' },
      month: { S: '2026-11' },
      startedAt: { S: NOV.toISOString() },
    });
  });

  it('never lets a reservation or the occupied capacity expire', async () => {
    const { transactions } = useStatefulTable();

    await table().admitRequest(request());

    // Expiry never refunds an uncertain reservation (spec.md Session 2026-11-15).
    const serialized = JSON.stringify(transactions[0]);
    expect(serialized).not.toContain('"ttl"');
    expect(serialized).not.toContain('#ttl');
  });

  it('refuses a second active request from the same friend', async () => {
    const { items } = useStatefulTable();
    const t = table();
    await t.admitRequest(request());

    const second = await t.admitRequest(request({ requestId: 'req-2' }));

    expect(second).toEqual({ admitted: false, reason: 'friend_busy' });
    // The refused request reserved nothing and held no slot.
    expect(items.get('SPEND#2026-11')!.microUsd).toEqual({ N: '125000' });
    expect(items.get('CONTROL#ACTIVE')!.active).toEqual({ N: '1' });
    expect(items.get('LEASE#sub-1')!.requestId).toEqual({ S: 'req-1' });
  });

  it('refuses a third active request across friends once two are running', async () => {
    const { items } = useStatefulTable();
    const t = table();
    await t.admitRequest(request({ sub: 'a', requestId: 'ra' }));
    await t.admitRequest(request({ sub: 'b', requestId: 'rb' }));

    const third = await t.admitRequest(request({ sub: 'c', requestId: 'rc' }));

    expect(third).toEqual({ admitted: false, reason: 'capacity_busy' });
    expect(items.has('LEASE#c')).toBe(false);
    expect(items.get('SPEND#2026-11')!.microUsd).toEqual({ N: '250000' });
  });

  it('refuses when the reservation would take the month past the ceiling', async () => {
    const { items } = useStatefulTable({
      'SPEND#2026-11': { pk: { S: 'SPEND#2026-11' }, microUsd: { N: '14900000' } },
    });

    const result = await table().admitRequest(request());

    expect(result).toEqual({ admitted: false, reason: 'spend_limit' });
    expect(items.get('SPEND#2026-11')!.microUsd).toEqual({ N: '14900000' });
    expect(items.has('LEASE#sub-1')).toBe(false);
  });

  it('admits exactly up to the ceiling', async () => {
    useStatefulTable({
      'SPEND#2026-11': {
        pk: { S: 'SPEND#2026-11' },
        microUsd: { N: String(15_000_000 - 125_000) },
      },
    });

    expect(await table().admitRequest(request())).toMatchObject({ admitted: true });
  });

  it('refuses without any write when one reservation alone exceeds the ceiling', async () => {
    // A fresh month has no SPEND item, so the condition alone would admit it.
    useStatefulTable();

    const result = await table().admitRequest(request({ reserveMicroUsd: 16_000_000 }));

    expect(result).toEqual({ admitted: false, reason: 'spend_limit' });
    expect(ddb.commandCalls(TransactWriteItemsCommand)).toHaveLength(0);
  });

  it('prefers friend_busy over the other refusals so a busy friend is told so', async () => {
    useStatefulTable();
    const t = table();
    await t.admitRequest(request({ sub: 'a', requestId: 'ra' }));
    await t.admitRequest(request({ sub: 'b', requestId: 'rb' }));

    const result = await t.admitRequest(request({ sub: 'a', requestId: 'ra2' }));

    expect(result).toEqual({ admitted: false, reason: 'friend_busy' });
  });

  it('reconciles a lost transaction response by strongly reading the exact admitted lease', async () => {
    const state = useStatefulTable({}, true);
    ddb.on(GetItemCommand).callsFake((input) => ({
      Item: state.items.get(input.Key!.pk!.S!),
    }));

    const result = await table().admitRequest(request());

    expect(result).toEqual({
      admitted: true,
      lease: { sub: 'sub-1', requestId: 'req-1', reservedMicroUsd: 125_000, month: '2026-11' },
    });
    const get = ddb.commandCalls(GetItemCommand)[0]?.args[0];
    expect(get.input).toMatchObject({
      TableName: TABLE,
      Key: { pk: { S: 'LEASE#sub-1' } },
      ConsistentRead: true,
    });
  });

  it('fails closed and does not admit a second reservation when no lease can be reconciled', async () => {
    ddb.on(TransactWriteItemsCommand).rejects(new Error('TransactWriteItems response lost'));
    ddb.on(GetItemCommand).resolves({ Item: undefined });

    await expect(table().admitRequest(request())).rejects.toThrow(
      'TransactWriteItems response lost',
    );
    expect(ddb.commandCalls(GetItemCommand)[0]?.args[0].input).toMatchObject({
      TableName: TABLE,
      Key: { pk: { S: 'LEASE#sub-1' } },
      ConsistentRead: true,
    });
  });

  it('propagates a failure that is not a refused condition', async () => {
    ddb.on(TransactWriteItemsCommand).rejects(new Error('ProvisionedThroughputExceeded'));

    await expect(table().admitRequest(request())).rejects.toThrow('ProvisionedThroughputExceeded');
  });

  it.each([
    ['reserveMicroUsd', { reserveMicroUsd: 1.5 }],
    ['reserveMicroUsd', { reserveMicroUsd: -1 }],
    ['maxActiveRequests', { maxActiveRequests: 0 }],
  ])('refuses an invalid %s', async (_name, overrides) => {
    await expect(table().admitRequest(request(overrides))).rejects.toThrow();
    expect(ddb.commandCalls(TransactWriteItemsCommand)).toHaveLength(0);
  });
});

describe('settleRequest', () => {
  const lease: Lease = {
    sub: 'sub-1',
    requestId: 'req-1',
    reservedMicroUsd: 125_000,
    month: '2026-11',
  };

  async function admitted() {
    const state = useStatefulTable();
    const result = await table().admitRequest(request());
    if (!result.admitted) throw new Error('setup: expected admission');
    return { ...state, lease: result.lease };
  }

  it('replaces the reservation with the actual spend and frees the lease and slot in one transaction', async () => {
    const { items, transactions, lease: held } = await admitted();

    await table().settleRequest(held, 40_000, new Date('2026-11-15T08:01:00.000Z'));

    expect(items.get('SPEND#2026-11')!.microUsd).toEqual({ N: '40000' });
    expect(items.get('CONTROL#ACTIVE')!.active).toEqual({ N: '0' });
    expect(items.has('LEASE#sub-1')).toBe(false);

    const settle = transactions.at(-1)!.TransactItems!;
    expect(settle).toHaveLength(3);
    const del = settle.find((i) => i.Delete)!.Delete!;
    expect(del.ConditionExpression).toBe(
      '#requestId = :requestId AND #reservedMicroUsd = :reserved',
    );
  });

  it('charges the overage when the turn cost more than it reserved', async () => {
    const { items, lease: held } = await admitted();

    await table().settleRequest(held, 150_000, NOV);

    expect(items.get('SPEND#2026-11')!.microUsd).toEqual({ N: '150000' });
  });

  it('settles against the month the request was admitted in, across a month rollover', async () => {
    const { items } = useStatefulTable();
    const t = table();
    const result = await t.admitRequest(request({ now: new Date('2026-11-30T23:59:59.000Z') }));
    if (!result.admitted) throw new Error('setup: expected admission');

    await t.settleRequest(result.lease, 30_000, new Date('2026-12-01T00:00:05.000Z'));

    expect(items.get('SPEND#2026-11')!.microUsd).toEqual({ N: '30000' });
    expect(items.has('SPEND#2026-12')).toBe(false);
  });

  it('settles exactly once: a second settlement conflicts and counts nothing', async () => {
    const { items, lease: held } = await admitted();
    const t = table();
    await t.settleRequest(held, 40_000, NOV);

    await expect(t.settleRequest(held, 40_000, NOV)).rejects.toBeInstanceOf(
      SettlementConflictError,
    );
    expect(items.get('SPEND#2026-11')!.microUsd).toEqual({ N: '40000' });
    expect(items.get('CONTROL#ACTIVE')!.active).toEqual({ N: '0' });
  });

  it('conflicts when the lease belongs to a newer request, leaving that request intact', async () => {
    const { items, lease: held } = await admitted();
    const t = table();
    await t.settleRequest(held, 40_000, NOV);
    await t.admitRequest(request({ requestId: 'req-2' }));

    await expect(t.settleRequest(held, 40_000, NOV)).rejects.toBeInstanceOf(
      SettlementConflictError,
    );
    expect(items.get('LEASE#sub-1')!.requestId).toEqual({ S: 'req-2' });
    expect(items.get('CONTROL#ACTIVE')!.active).toEqual({ N: '1' });
  });

  it('does not free anything when it is never settled', async () => {
    const { items } = await admitted();

    // A crash is no settlement call at all; the lease, slot and reservation stay.
    expect(items.get('LEASE#sub-1')).toBeDefined();
    expect(items.get('CONTROL#ACTIVE')!.active).toEqual({ N: '1' });
    expect(items.get('SPEND#2026-11')!.microUsd).toEqual({ N: '125000' });
  });

  it('propagates a failure that is not a conflict, so the caller can alarm', async () => {
    ddb.on(TransactWriteItemsCommand).rejects(new Error('ProvisionedThroughputExceeded'));

    await expect(table().settleRequest(lease, 1, NOV)).rejects.toThrow(
      'ProvisionedThroughputExceeded',
    );
  });

  it.each([1.5, -1, Number.NaN])(
    'refuses a non-integer or negative actual (%s)',
    async (actual) => {
      await expect(table().settleRequest(lease, actual, NOV)).rejects.toThrow('microUsd');
      expect(ddb.commandCalls(TransactWriteItemsCommand)).toHaveLength(0);
    },
  );
});
