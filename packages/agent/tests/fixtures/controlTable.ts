import { vi } from 'vitest';
import type { Halt, Spend } from '../../src/session/controlTable.js';

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
}

export function fakeControlTable(
  overrides: { halt?: Halt; spendMicroUsd?: number } = {},
): FakeControlTable {
  return {
    getHalt: vi.fn(async () => overrides.halt),
    getSpend: vi.fn(async () =>
      overrides.spendMicroUsd === undefined
        ? undefined
        : { microUsd: overrides.spendMicroUsd, updatedAt: new Date().toISOString() },
    ),
    addSpend: vi.fn(async () => {}),
  };
}
