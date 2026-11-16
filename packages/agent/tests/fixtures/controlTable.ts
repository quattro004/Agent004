import { vi } from 'vitest';
import type {
  AllowEntry,
  Friend,
  Halt,
  RateDecision,
  Spend,
} from '../../src/session/controlTable.js';

/**
 * An in-memory stand-in for the parts of `ControlTable` the invocation path
 * reads. Every invocation test needs one: the handler checks `CONTROL#HALT`
 * and the month's spend tally before it runs a turn, and both must fail closed
 * rather than reach DynamoDB from a test.
 */
export interface FakeControlTable {
  getHalt: ReturnType<typeof vi.fn<() => Promise<Halt | undefined>>>;
  getSpend: ReturnType<typeof vi.fn<(now: Date) => Promise<Spend | undefined>>>;
  addSpend: ReturnType<typeof vi.fn<(microUsd: number, now: Date) => Promise<void>>>;
  getFriend: ReturnType<typeof vi.fn<(sub: string) => Promise<Friend | undefined>>>;
  getAllow: ReturnType<typeof vi.fn<(email: string) => Promise<AllowEntry | undefined>>>;
  consumeRate: ReturnType<typeof vi.fn<(sub: string, now: Date) => Promise<RateDecision>>>;
  recordFriendSeen: ReturnType<typeof vi.fn<(sub: string, at: Date) => Promise<void>>>;
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
  return {
    getHalt: vi.fn(async () => overrides.halt),
    getSpend: vi.fn(async () =>
      overrides.spendMicroUsd === undefined
        ? undefined
        : { microUsd: overrides.spendMicroUsd, updatedAt: new Date().toISOString() },
    ),
    addSpend: vi.fn(async () => {}),
    getFriend: vi.fn(async () => friend),
    getAllow: vi.fn(async () => allow),
    consumeRate: vi.fn(async () => ({ allowed: true }) as RateDecision),
    recordFriendSeen: vi.fn(async () => {}),
  };
}
