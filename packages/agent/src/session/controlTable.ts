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

  async putSession(sub: string, session: CountedSessionWrite): Promise<void> {
    const { sessionMaxMinutes, sessionTtlGraceMinutes } = this.options;
    const ttl = epochSeconds(session.openedAt) + (sessionMaxMinutes + sessionTtlGraceMinutes) * 60;
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
          ttl: { N: String(ttl) },
        },
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
      new GetItemCommand({ TableName: this.options.tableName, Key: { pk: { S: pk } } }),
    );
    return Item;
  }
}

function spendKey(now: Date): string {
  return `SPEND#${now.toISOString().slice(0, 7)}`;
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
