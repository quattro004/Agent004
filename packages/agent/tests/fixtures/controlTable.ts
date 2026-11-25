import { vi } from 'vitest';
import {
  SettlementConflictError,
  type Admission,
  type AdmissionRequest,
  type AllowEntry,
  type CountedSession,
  type CountedSessionWrite,
  type Friend,
  type Halt,
  type Lease,
  type RateDecision,
  type SearchClaimDecision,
  type Spend,
} from '../../src/session/controlTable.js';

/**
 * A stateful in-memory stand-in for the parts of `ControlTable` the invocation
 * path uses. Every invocation test needs one: the handler checks
 * `CONTROL#HALT`, admits each turn against a lease and the month's committed
 * spend, and keeps the counted session in the table, all of which must work
 * (or fail closed) without reaching DynamoDB from a test.
 *
 * The state is exposed so a test can seed a busy friend, a full house or an
 * existing session, and assert what settlement left behind.
 */
export interface FakeControlTable {
  getHalt: ReturnType<typeof vi.fn<() => Promise<Halt | undefined>>>;
  getSpend: ReturnType<typeof vi.fn<(now: Date) => Promise<Spend | undefined>>>;
  addSpend: ReturnType<typeof vi.fn<(microUsd: number, now: Date) => Promise<void>>>;
  getFriend: ReturnType<typeof vi.fn<(sub: string) => Promise<Friend | undefined>>>;
  getAllow: ReturnType<typeof vi.fn<(email: string) => Promise<AllowEntry | undefined>>>;
  consumeRate: ReturnType<typeof vi.fn<(sub: string, now: Date) => Promise<RateDecision>>>;
  claimWebSearch: ReturnType<
    typeof vi.fn<
      (
        sub: string,
        sessionId: string,
        expectedWebSearches: number,
        limit: number,
      ) => Promise<SearchClaimDecision>
    >
  >;
  recordFriendSeen: ReturnType<typeof vi.fn<(sub: string, at: Date) => Promise<void>>>;
  getSession: ReturnType<typeof vi.fn<(sub: string) => Promise<CountedSession | undefined>>>;
  putSession: ReturnType<
    typeof vi.fn<
      (sub: string, session: CountedSessionWrite, expected?: CountedSessionWrite) => Promise<void>
    >
  >;
  admitRequest: ReturnType<typeof vi.fn<(request: AdmissionRequest) => Promise<Admission>>>;
  settleRequest: ReturnType<
    typeof vi.fn<(lease: Lease, actualMicroUsd: number, now: Date) => Promise<void>>
  >;
  /** `SESSION#<sub>` items. */
  sessions: Map<string, CountedSession>;
  /** `LEASE#<sub>` items, held until settled. */
  leases: Map<string, Lease>;
  /** `CONTROL#ACTIVE.active` and `SPEND#<month>.microUsd`. */
  counters: { active: number; committedMicroUsd: number };
}

/** The friend every invocation test is, unless it says otherwise. */
export const FAKE_FRIEND: Friend = {
  sub: 'test-friend',
  email: 'friend@example.com',
  provider: 'google',
  createdAt: '2026-11-01T00:00:00.000Z',
};

export const FAKE_ALLOW: AllowEntry = {
  email: FAKE_FRIEND.email,
  provider: 'google',
  addedAt: '2026-11-01T00:00:00.000Z',
  addedBy: 'builder',
};

export function fakeControlTable(
  overrides: {
    halt?: Halt;
    /** The month's committed spend before the test starts. */
    spendMicroUsd?: number;
    /** `null` means "never signed in"; omitted means the usual friend. */
    friend?: Friend | null;
    /** `null` means the friend has been removed from the list. */
    allow?: AllowEntry | null;
  } = {},
): FakeControlTable {
  // `??` would read a deliberate `null` as "not supplied", so the absent case
  // has to be told apart from the omitted one explicitly.
  const friend = overrides.friend === undefined ? FAKE_FRIEND : (overrides.friend ?? undefined);
  const allow = overrides.allow === undefined ? FAKE_ALLOW : (overrides.allow ?? undefined);

  const sessions = new Map<string, CountedSession>();
  const leases = new Map<string, Lease>();
  const counters = { active: 0, committedMicroUsd: overrides.spendMicroUsd ?? 0 };
  let spendTouched = overrides.spendMicroUsd !== undefined;

  const sameSnapshot = (stored: CountedSession, expected: CountedSessionWrite): boolean =>
    stored.sessionId === expected.sessionId &&
    stored.state === expected.state &&
    stored.openedAt === expected.openedAt &&
    stored.turns === expected.turns &&
    stored.conversationalTokens === expected.conversationalTokens &&
    stored.webSearches === expected.webSearches;

  return {
    getHalt: vi.fn(async () => overrides.halt),
    getSpend: vi.fn(async () =>
      spendTouched
        ? { microUsd: counters.committedMicroUsd, updatedAt: new Date().toISOString() }
        : undefined,
    ),
    addSpend: vi.fn(async (microUsd: number) => {
      spendTouched = true;
      counters.committedMicroUsd += microUsd;
    }),
    getFriend: vi.fn(async () => friend),
    getAllow: vi.fn(async () => allow),
    consumeRate: vi.fn(async () => ({ allowed: true }) as RateDecision),
    claimWebSearch: vi.fn(
      async (
        sub: string,
        sessionId: string,
        expectedWebSearches: number,
        limit: number,
      ): Promise<SearchClaimDecision> => {
        const session = sessions.get(sub);
        if (!session || session.sessionId !== sessionId) {
          return { claimed: false, reason: 'session_changed' };
        }
        if (session.webSearches !== expectedWebSearches) {
          return { claimed: false, reason: 'session_changed' };
        }
        if (session.webSearches >= limit) {
          return { claimed: false, reason: 'limit' };
        }
        const next = { ...session, webSearches: session.webSearches + 1 };
        sessions.set(sub, next);
        return { claimed: true, webSearches: next.webSearches };
      },
    ),
    recordFriendSeen: vi.fn(async () => {}),
    getSession: vi.fn(async (sub: string) => sessions.get(sub)),
    putSession: vi.fn(
      async (sub: string, session: CountedSessionWrite, expected?: CountedSessionWrite) => {
        const current = sessions.get(sub);
        if (
          expected === undefined
            ? current !== undefined
            : !current || !sameSnapshot(current, expected)
        ) {
          throw new Error('ConditionalCheckFailed: SESSION item is not the expected snapshot');
        }
        sessions.set(sub, { ...session, ttl: 0 });
      },
    ),
    admitRequest: vi.fn(async (request: AdmissionRequest): Promise<Admission> => {
      if (leases.has(request.sub)) return { admitted: false, reason: 'friend_busy' };
      if (counters.active >= request.maxActiveRequests) {
        return { admitted: false, reason: 'capacity_busy' };
      }
      if (counters.committedMicroUsd + request.reserveMicroUsd > request.spendCeilingMicroUsd) {
        return { admitted: false, reason: 'spend_limit' };
      }
      const lease: Lease = {
        sub: request.sub,
        requestId: request.requestId,
        reservedMicroUsd: request.reserveMicroUsd,
        month: request.now.toISOString().slice(0, 7),
      };
      leases.set(request.sub, lease);
      counters.active += 1;
      counters.committedMicroUsd += request.reserveMicroUsd;
      spendTouched = true;
      return { admitted: true, lease };
    }),
    settleRequest: vi.fn(async (lease: Lease, actualMicroUsd: number) => {
      const held = leases.get(lease.sub);
      if (!held || held.requestId !== lease.requestId) throw new SettlementConflictError(lease);
      leases.delete(lease.sub);
      counters.active -= 1;
      counters.committedMicroUsd += actualMicroUsd - lease.reservedMicroUsd;
    }),
    sessions,
    leases,
    counters,
  };
}
