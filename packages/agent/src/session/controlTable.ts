import {
  GetItemCommand,
  PutItemCommand,
  TransactWriteItemsCommand,
  TransactionCanceledException,
  UpdateItemCommand,
  type AttributeValue,
  type DynamoDBClient,
} from '@aws-sdk/client-dynamodb';

/**
 * The single DynamoDB control table (spec 003 data-model.md § Control table).
 * Every value that bounds behavior — the table name, the session cap, the rate
 * limits — is injected from runtime configuration, never written as a literal.
 */
export interface ControlTableOptions {
  client: DynamoDBClient;
  tableName: string;
  sessionMaxMinutes: number;
  /** Added to the session cap for `SESSION#<sub>.ttl`; cleanup only, never used for expiry. */
  sessionTtlGraceMinutes: number;
  rateLimitPerHour: number;
  rateLimitPerDay: number;
}

export interface AllowEntry {
  email: string;
  provider: string;
  addedAt: string;
  addedBy: string;
}

export interface Friend {
  sub: string;
  email: string;
  provider: string;
  createdAt: string;
  lastSeenAt?: string;
  memoryPrunedAt?: string;
}

const SESSION_STATES = ['Active', 'SignedOff', 'Expired'] as const;
export type SessionState = (typeof SESSION_STATES)[number];

export interface CountedSessionWrite {
  sessionId: string;
  state: SessionState;
  openedAt: string;
  turns: number;
  conversationalTokens: number;
  /** Web searches sent in this session, against `SESSION_MAX_WEB_SEARCHES`. */
  webSearches: number;
}

export interface CountedSession extends CountedSessionWrite {
  ttl: number;
}

export type RateDecision = { allowed: true } | { allowed: false; exceeded: 'hour' | 'day' };

export interface Spend {
  microUsd: number;
  updatedAt: string;
}

export interface Halt {
  haltedAt: string;
  reason: string;
}

export interface AdmissionRequest {
  sub: string;
  /** Unique per request; settlement must present the same one. */
  requestId: string;
  /** Conservative maximum the request could cost, committed before any call. */
  reserveMicroUsd: number;
  /** The month's committed spend, reservations included, may not pass this. */
  spendCeilingMicroUsd: number;
  /** Requests allowed in flight across every runtime instance. */
  maxActiveRequests: number;
  now: Date;
}

/** What a settlement needs to find, and match, the request it admitted. */
export interface Lease {
  sub: string;
  requestId: string;
  reservedMicroUsd: number;
  /** UTC `yyyy-mm` of admission, so a month rollover settles where it reserved. */
  month: string;
}

export type Admission =
  | { admitted: true; lease: Lease }
  | { admitted: false; reason: 'friend_busy' | 'capacity_busy' | 'spend_limit' };

/**
 * The lease is gone or belongs to another request, so counting this settlement
 * could double-count or free someone else's slot. It is never retried.
 */
export class SettlementConflictError extends Error {
  constructor(lease: Lease, options?: { cause?: unknown }) {
    super(`Request ${lease.requestId} for ${lease.sub} was not the holder of its lease`, options);
    this.name = 'SettlementConflictError';
  }
}

type Item = Record<string, AttributeValue>;

const HOUR_SECONDS = 3600;
const DAY_SECONDS = 24 * HOUR_SECONDS;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export class ControlTable {
  constructor(private readonly options: ControlTableOptions) {}

  async getAllow(email: string): Promise<AllowEntry | undefined> {
    const normalized = normalizeEmail(email);
    const item = await this.get(`ALLOW#${normalized}`);
    if (!item) return undefined;
    return {
      email: normalized,
      provider: str(item, 'provider'),
      addedAt: str(item, 'addedAt'),
      addedBy: str(item, 'addedBy'),
    };
  }

  async getFriend(sub: string): Promise<Friend | undefined> {
    const item = await this.get(`FRIEND#${sub}`);
    if (!item) return undefined;
    return {
      sub,
      email: str(item, 'email'),
      provider: str(item, 'provider'),
      createdAt: str(item, 'createdAt'),
      lastSeenAt: optionalStr(item, 'lastSeenAt'),
      memoryPrunedAt: optionalStr(item, 'memoryPrunedAt'),
    };
  }

  /** Pre token generation creates `FRIEND#<sub>`; the runtime never creates a partial one. */
  async recordFriendSeen(sub: string, at: Date): Promise<void> {
    await this.options.client.send(
      new UpdateItemCommand({
        TableName: this.options.tableName,
        Key: { pk: { S: `FRIEND#${sub}` } },
        UpdateExpression: 'SET #lastSeenAt = :lastSeenAt',
        ConditionExpression: 'attribute_exists(pk)',
        ExpressionAttributeNames: { '#lastSeenAt': 'lastSeenAt' },
        ExpressionAttributeValues: { ':lastSeenAt': { S: at.toISOString() } },
      }),
    );
  }

  /** Create only if absent, or replace only the exact session snapshot the caller read. */
  async putSession(
    sub: string,
    session: CountedSessionWrite,
    expected?: CountedSessionWrite,
  ): Promise<void> {
    const { sessionMaxMinutes, sessionTtlGraceMinutes } = this.options;
    const ttl = epochSeconds(session.openedAt) + (sessionMaxMinutes + sessionTtlGraceMinutes) * 60;
    const condition =
      expected === undefined
        ? { ConditionExpression: 'attribute_not_exists(pk)' }
        : {
            ConditionExpression:
              '#sessionId = :expectedSessionId AND #state = :expectedState AND ' +
              '#openedAt = :expectedOpenedAt AND #turns = :expectedTurns AND ' +
              '#conversationalTokens = :expectedTokens',
            ExpressionAttributeNames: {
              '#sessionId': 'sessionId',
              '#state': 'state',
              '#openedAt': 'openedAt',
              '#turns': 'turns',
              '#conversationalTokens': 'conversationalTokens',
            },
            ExpressionAttributeValues: {
              ':expectedSessionId': { S: expected.sessionId },
              ':expectedState': { S: expected.state },
              ':expectedOpenedAt': { S: expected.openedAt },
              ':expectedTurns': { N: String(expected.turns) },
              ':expectedTokens': { N: String(expected.conversationalTokens) },
            },
          };
    await this.options.client.send(
      new PutItemCommand({
        TableName: this.options.tableName,
        Item: {
          pk: { S: `SESSION#${sub}` },
          sessionId: { S: session.sessionId },
          state: { S: session.state },
          openedAt: { S: session.openedAt },
          turns: { N: String(session.turns) },
          conversationalTokens: { N: String(session.conversationalTokens) },
          webSearches: { N: String(session.webSearches) },
          ttl: { N: String(ttl) },
        },
        ...condition,
      }),
    );
  }

  async getSession(sub: string): Promise<CountedSession | undefined> {
    const item = await this.get(`SESSION#${sub}`);
    if (!item) return undefined;
    const state = str(item, 'state');
    if (!(SESSION_STATES as readonly string[]).includes(state)) {
      throw new Error(`SESSION#${sub} has unknown state "${state}"`);
    }
    return {
      sessionId: str(item, 'sessionId'),
      state: state as SessionState,
      openedAt: str(item, 'openedAt'),
      turns: num(item, 'turns'),
      conversationalTokens: num(item, 'conversationalTokens'),
      webSearches: num(item, 'webSearches'),
      ttl: num(item, 'ttl'),
    };
  }

  /** DynamoDB TTL deletion is not immediate, so expiry is decided here from `openedAt`. */
  isSessionExpired(session: CountedSession, now: Date): boolean {
    const expiresAtMs = Date.parse(session.openedAt) + this.options.sessionMaxMinutes * 60_000;
    return now.getTime() >= expiresAtMs;
  }

  /**
   * Counts one message against the fixed UTC hour and day windows. Both
   * counters move in one transaction, so a refused message is counted in
   * neither window.
   */
  async consumeRate(sub: string, now: Date): Promise<RateDecision> {
    const iso = now.toISOString();
    const hourStart = Math.floor(now.getTime() / 1000 / HOUR_SECONDS) * HOUR_SECONDS;
    const dayStart = Math.floor(now.getTime() / 1000 / DAY_SECONDS) * DAY_SECONDS;
    const windows = [
      {
        pk: `RATE#${sub}#H#${iso.slice(0, 13)}`,
        limit: this.options.rateLimitPerHour,
        ttl: hourStart + 2 * HOUR_SECONDS,
      },
      {
        pk: `RATE#${sub}#D#${iso.slice(0, 10)}`,
        limit: this.options.rateLimitPerDay,
        ttl: dayStart + 2 * DAY_SECONDS,
      },
    ];

    try {
      await this.options.client.send(
        new TransactWriteItemsCommand({
          TransactItems: windows.map((w) => ({
            Update: {
              TableName: this.options.tableName,
              Key: { pk: { S: w.pk } },
              UpdateExpression: 'ADD #count :one SET #ttl = :ttl',
              ConditionExpression: 'attribute_not_exists(#count) OR #count < :limit',
              ExpressionAttributeNames: { '#count': 'count', '#ttl': 'ttl' },
              ExpressionAttributeValues: {
                ':one': { N: '1' },
                ':limit': { N: String(w.limit) },
                ':ttl': { N: String(w.ttl) },
              },
            },
          })),
        }),
      );
      return { allowed: true };
    } catch (err) {
      if (!(err instanceof TransactionCanceledException)) throw err;
      const codes = (err.CancellationReasons ?? []).map((r) => r.Code);
      if (codes[0] === 'ConditionalCheckFailed') return { allowed: false, exceeded: 'hour' };
      if (codes[1] === 'ConditionalCheckFailed') return { allowed: false, exceeded: 'day' };
      throw err;
    }
  }

  /** `microUsd` is an integer so repeated `ADD`s never drift. */
  async addSpend(microUsd: number, now: Date): Promise<void> {
    if (!Number.isSafeInteger(microUsd) || microUsd < 0) {
      throw new Error(`microUsd must be a non-negative integer, got ${microUsd}`);
    }
    await this.options.client.send(
      new UpdateItemCommand({
        TableName: this.options.tableName,
        Key: { pk: { S: spendKey(now) } },
        UpdateExpression: 'ADD #microUsd :microUsd SET #updatedAt = :updatedAt',
        ExpressionAttributeNames: { '#microUsd': 'microUsd', '#updatedAt': 'updatedAt' },
        ExpressionAttributeValues: {
          ':microUsd': { N: String(microUsd) },
          ':updatedAt': { S: now.toISOString() },
        },
      }),
    );
  }

  /**
   * Admits one spend-bearing request, or refuses it, in one transaction: the
   * month's spend is reserved at a conservative maximum, a global slot is
   * taken, and the friend's lease is created. Nothing here expires, so a
   * request that never settles keeps its reservation and occupied capacity
   * until an operator reconciles it (spec.md Session 2026-11-15).
   */
  async admitRequest(request: AdmissionRequest): Promise<Admission> {
    const { sub, requestId, reserveMicroUsd, spendCeilingMicroUsd, maxActiveRequests, now } =
      request;
    assertMicroUsd('reserveMicroUsd', reserveMicroUsd);
    if (!Number.isSafeInteger(maxActiveRequests) || maxActiveRequests < 1) {
      throw new Error(`maxActiveRequests must be a positive integer, got ${maxActiveRequests}`);
    }
    // A fresh month has no SPEND item, which the condition below would admit.
    if (reserveMicroUsd > spendCeilingMicroUsd) {
      return { admitted: false, reason: 'spend_limit' };
    }

    const month = monthOf(now);
    const lease: Lease = { sub, requestId, reservedMicroUsd: reserveMicroUsd, month };
    const { tableName } = this.options;

    try {
      await this.options.client.send(
        new TransactWriteItemsCommand({
          TransactItems: [
            {
              Update: {
                TableName: tableName,
                Key: { pk: { S: `SPEND#${month}` } },
                UpdateExpression: 'ADD #microUsd :amount SET #updatedAt = :updatedAt',
                ConditionExpression: 'attribute_not_exists(#microUsd) OR #microUsd <= :ceiling',
                ExpressionAttributeNames: { '#microUsd': 'microUsd', '#updatedAt': 'updatedAt' },
                ExpressionAttributeValues: {
                  ':amount': { N: String(reserveMicroUsd) },
                  ':ceiling': { N: String(spendCeilingMicroUsd - reserveMicroUsd) },
                  ':updatedAt': { S: now.toISOString() },
                },
              },
            },
            {
              Update: {
                TableName: tableName,
                Key: { pk: { S: ACTIVE_KEY } },
                UpdateExpression: 'ADD #active :delta',
                ConditionExpression: 'attribute_not_exists(#active) OR #active < :max',
                ExpressionAttributeNames: { '#active': 'active' },
                ExpressionAttributeValues: {
                  ':delta': { N: '1' },
                  ':max': { N: String(maxActiveRequests) },
                },
              },
            },
            {
              Put: {
                TableName: tableName,
                Item: {
                  pk: { S: leaseKey(sub) },
                  requestId: { S: requestId },
                  reservedMicroUsd: { N: String(reserveMicroUsd) },
                  month: { S: month },
                  startedAt: { S: now.toISOString() },
                },
                ConditionExpression: 'attribute_not_exists(pk)',
              },
            },
          ],
        }),
      );
      return { admitted: true, lease };
    } catch (err) {
      if (!(err instanceof TransactionCanceledException)) throw err;
      const failed = (index: number) =>
        err.CancellationReasons?.[index]?.Code === 'ConditionalCheckFailed';
      if (failed(2)) return { admitted: false, reason: 'friend_busy' };
      if (failed(1)) return { admitted: false, reason: 'capacity_busy' };
      if (failed(0)) return { admitted: false, reason: 'spend_limit' };
      throw err;
    }
  }

  /**
   * Replaces the reservation with what the request actually cost, and frees
   * its lease and global slot, in one transaction guarded by the lease. A
   * conflict means the request was already settled or is not the lease's
   * holder, so nothing is counted twice.
   */
  async settleRequest(lease: Lease, actualMicroUsd: number, now: Date): Promise<void> {
    assertMicroUsd('actualMicroUsd', actualMicroUsd);
    const { tableName } = this.options;

    try {
      await this.options.client.send(
        new TransactWriteItemsCommand({
          TransactItems: [
            {
              Delete: {
                TableName: tableName,
                Key: { pk: { S: leaseKey(lease.sub) } },
                ConditionExpression: '#requestId = :requestId AND #reservedMicroUsd = :reserved',
                ExpressionAttributeNames: {
                  '#requestId': 'requestId',
                  '#reservedMicroUsd': 'reservedMicroUsd',
                },
                ExpressionAttributeValues: {
                  ':requestId': { S: lease.requestId },
                  ':reserved': { N: String(lease.reservedMicroUsd) },
                },
              },
            },
            {
              Update: {
                TableName: tableName,
                Key: { pk: { S: ACTIVE_KEY } },
                UpdateExpression: 'ADD #active :delta',
                ConditionExpression: '#active > :zero',
                ExpressionAttributeNames: { '#active': 'active' },
                ExpressionAttributeValues: { ':delta': { N: '-1' }, ':zero': { N: '0' } },
              },
            },
            {
              Update: {
                TableName: tableName,
                Key: { pk: { S: `SPEND#${lease.month}` } },
                UpdateExpression: 'ADD #microUsd :amount SET #updatedAt = :updatedAt',
                ExpressionAttributeNames: { '#microUsd': 'microUsd', '#updatedAt': 'updatedAt' },
                ExpressionAttributeValues: {
                  ':amount': { N: String(actualMicroUsd - lease.reservedMicroUsd) },
                  ':updatedAt': { S: now.toISOString() },
                },
              },
            },
          ],
        }),
      );
    } catch (err) {
      if (
        err instanceof TransactionCanceledException &&
        err.CancellationReasons?.some((reason) => reason.Code === 'ConditionalCheckFailed')
      ) {
        throw new SettlementConflictError(lease, { cause: err });
      }
      throw err;
    }
  }

  async getSpend(now: Date): Promise<Spend | undefined> {
    const item = await this.get(spendKey(now));
    if (!item) return undefined;
    return { microUsd: num(item, 'microUsd'), updatedAt: str(item, 'updatedAt') };
  }

  async getHalt(): Promise<Halt | undefined> {
    const item = await this.get('CONTROL#HALT');
    if (!item) return undefined;
    return { haltedAt: str(item, 'haltedAt'), reason: str(item, 'reason') };
  }

  private async get(pk: string): Promise<Item | undefined> {
    const { Item } = await this.options.client.send(
      new GetItemCommand({
        TableName: this.options.tableName,
        Key: { pk: { S: pk } },
        ConsistentRead: true,
      }),
    );
    return Item;
  }
}

const ACTIVE_KEY = 'CONTROL#ACTIVE';

function monthOf(now: Date): string {
  return now.toISOString().slice(0, 7);
}

function spendKey(now: Date): string {
  return `SPEND#${monthOf(now)}`;
}

function leaseKey(sub: string): string {
  return `LEASE#${sub}`;
}

function assertMicroUsd(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} (microUsd) must be a non-negative integer, got ${value}`);
  }
}

function epochSeconds(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`Not an ISO timestamp: "${iso}"`);
  return Math.floor(ms / 1000);
}

function str(item: Item, name: string): string {
  const value = item[name]?.S;
  if (value === undefined) throw new Error(`${item.pk?.S ?? 'item'} is missing string ${name}`);
  return value;
}

function optionalStr(item: Item, name: string): string | undefined {
  return item[name] === undefined ? undefined : str(item, name);
}

function num(item: Item, name: string): number {
  const raw = item[name]?.N;
  const value = raw === undefined ? Number.NaN : Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${item.pk?.S ?? 'item'} is missing number ${name}`);
  return value;
}
