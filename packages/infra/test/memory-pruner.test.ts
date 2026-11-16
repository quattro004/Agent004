import { jest } from '@jest/globals';

/**
 * The memory pruner (T087, T093; contracts/memory-api.md § Pruner).
 *
 * T172 replaced the original rule. Pruning a friend only once `lastSeenAt`
 * passed 30 days would have kept an *active* friend's first-week facts
 * forever, and the service TTL cannot stand in for it: its minimum is 31
 * days, it deletes days late, and consolidation resets it. So the deletion
 * rule here is the age of the record's content — `timestamp ?? createdAt` —
 * and every friend is visited every day.
 *
 * `memoryPrunedAt` is written but never read back as an input. If it were,
 * a run that stamped it could postpone the next deletion, and housekeeping
 * would quietly become a retention extension.
 */

const ddbSend = jest.fn<(command: unknown) => Promise<unknown>>();
const memorySend = jest.fn<(command: unknown) => Promise<unknown>>();

class FakeCommand {
  constructor(public readonly input: Record<string, unknown>) {}
}

jest.unstable_mockModule('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: class {
    send = ddbSend;
  },
  ScanCommand: class ScanCommand extends FakeCommand {},
  UpdateItemCommand: class UpdateItemCommand extends FakeCommand {},
}));

jest.unstable_mockModule('@aws-sdk/client-bedrock-agentcore', () => ({
  BedrockAgentCoreClient: class {
    send = memorySend;
  },
  ListMemoryRecordsCommand: class ListMemoryRecordsCommand extends FakeCommand {},
  BatchDeleteMemoryRecordsCommand: class BatchDeleteMemoryRecordsCommand extends FakeCommand {},
}));

const ENV = {
  CONTROL_TABLE_NAME: 'MaxHeight-Control',
  MEMORY_ID: 'MaxHeightMemory-abc123',
  RETENTION_DAYS: '30',
};

interface PruneSummary {
  friendsVisited: number;
  recordsDeleted: number;
  undatable: number;
}

type Handler = (event: unknown) => Promise<PruneSummary>;

async function loadHandler(env: Partial<typeof ENV> = ENV): Promise<Handler> {
  for (const key of Object.keys(ENV)) delete process.env[key];
  for (const [key, value] of Object.entries(env)) process.env[key] = value as string;
  jest.resetModules();
  const module = await import('../lib/handlers/memory-pruner.js');
  return module.handler as Handler;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function friendItem(sub: string): Record<string, { S: string }> {
  return { pk: { S: `FRIEND#${sub}` }, email: { S: `${sub}@example.com` } };
}

function commandName(command: unknown): string {
  return (command as object).constructor.name;
}

function callsNamed(mock: typeof ddbSend, name: string): FakeCommand[] {
  return mock.mock.calls
    .map(([command]) => command)
    .filter((command) => commandName(command) === name) as FakeCommand[];
}

/** Every `ListMemoryRecords` answers with the same page unless a test says otherwise. */
function records(
  summaries: Array<{ id: string; timestamp?: Date; createdAt?: Date }>,
  nextToken?: string,
): Record<string, unknown> {
  return {
    memoryRecordSummaries: summaries.map((s) => ({
      memoryRecordId: s.id,
      namespaces: ['/max-height/friend-1/facts/'],
      timestamp: s.timestamp,
      createdAt: s.createdAt,
    })),
    nextToken,
  };
}

describe('memory pruner', () => {
  beforeEach(() => {
    ddbSend.mockReset().mockResolvedValue({ Items: [friendItem('friend-1')] });
    memorySend.mockReset().mockImplementation(async (command) => {
      if (commandName(command) === 'ListMemoryRecordsCommand') return records([]);
      return { successfulRecords: [], failedRecords: [] };
    });
  });

  afterEach(() => {
    for (const key of Object.keys(ENV)) delete process.env[key];
  });

  describe('the daily run', () => {
    test('deletes records older than the retention window and keeps newer ones', async () => {
      memorySend.mockImplementation(async (command) => {
        if (commandName(command) === 'ListMemoryRecordsCommand') {
          return records([
            { id: 'old', timestamp: daysAgo(31) },
            { id: 'fresh', timestamp: daysAgo(2) },
          ]);
        }
        return { successfulRecords: [{ memoryRecordId: 'old' }], failedRecords: [] };
      });
      const handler = await loadHandler();

      const summary = await handler({});

      const deletes = callsNamed(memorySend, 'BatchDeleteMemoryRecordsCommand');
      expect(deletes).toHaveLength(1);
      expect(deletes[0].input.memoryId).toBe(ENV.MEMORY_ID);
      expect(deletes[0].input.records).toEqual([
        { memoryRecordId: 'old', namespace: '/max-height/friend-1/facts/' },
      ]);
      expect(summary.recordsDeleted).toBe(1);
    });

    // A consolidated record is written today out of content from weeks ago.
    // `createdAt` would make it look new; `timestamp` is the content's age.
    test('ages a record by its content timestamp, not the row it was written in', async () => {
      memorySend.mockImplementation(async (command) => {
        if (commandName(command) === 'ListMemoryRecordsCommand') {
          return records([{ id: 'consolidated', timestamp: daysAgo(45), createdAt: daysAgo(1) }]);
        }
        return { successfulRecords: [{ memoryRecordId: 'consolidated' }], failedRecords: [] };
      });
      const handler = await loadHandler();

      await handler({});

      const deletes = callsNamed(memorySend, 'BatchDeleteMemoryRecordsCommand');
      expect(deletes).toHaveLength(1);
      expect(
        (deletes[0].input.records as Array<{ memoryRecordId: string }>)[0].memoryRecordId,
      ).toBe('consolidated');
    });

    test('falls back to createdAt when the record carries no content timestamp', async () => {
      memorySend.mockImplementation(async (command) => {
        if (commandName(command) === 'ListMemoryRecordsCommand') {
          return records([{ id: 'no-timestamp', createdAt: daysAgo(40) }]);
        }
        return { successfulRecords: [{ memoryRecordId: 'no-timestamp' }], failedRecords: [] };
      });
      const handler = await loadHandler();

      await handler({});

      expect(callsNamed(memorySend, 'BatchDeleteMemoryRecordsCommand')).toHaveLength(1);
    });

    // Deleting on a guess is worse than keeping. Counting it is what makes
    // the gap visible rather than silent.
    test('keeps a record it cannot date, and counts it', async () => {
      memorySend.mockImplementation(async (command) => {
        if (commandName(command) === 'ListMemoryRecordsCommand') {
          return records([{ id: 'undatable' }]);
        }
        return { successfulRecords: [], failedRecords: [] };
      });
      const handler = await loadHandler();

      const summary = await handler({});

      expect(callsNamed(memorySend, 'BatchDeleteMemoryRecordsCommand')).toHaveLength(0);
      expect(summary.undatable).toBe(1);
    });

    test('lists every page before it stops', async () => {
      let page = 0;
      memorySend.mockImplementation(async (command) => {
        if (commandName(command) === 'ListMemoryRecordsCommand') {
          page += 1;
          return page === 1
            ? records([{ id: 'page-1', timestamp: daysAgo(31) }], 'token-2')
            : records([{ id: 'page-2', timestamp: daysAgo(31) }]);
        }
        return {
          successfulRecords: [{ memoryRecordId: 'page-1' }, { memoryRecordId: 'page-2' }],
          failedRecords: [],
        };
      });
      const handler = await loadHandler();

      const summary = await handler({});

      const lists = callsNamed(memorySend, 'ListMemoryRecordsCommand');
      expect(lists).toHaveLength(2);
      expect(lists[0].input.namespacePath).toBe('/max-height/friend-1/');
      expect(lists[0].input.nextToken).toBeUndefined();
      expect(lists[1].input.nextToken).toBe('token-2');
      expect(summary.recordsDeleted).toBe(2);
    });

    test('visits every friend, however recently they were seen or pruned', async () => {
      ddbSend.mockImplementation(async (command) => {
        if (commandName(command) === 'ScanCommand') {
          return {
            Items: [
              { ...friendItem('friend-1'), lastSeenAt: { S: daysAgo(0).toISOString() } },
              { ...friendItem('friend-2'), memoryPrunedAt: { S: daysAgo(0).toISOString() } },
            ],
          };
        }
        return {};
      });
      const handler = await loadHandler();

      const summary = await handler({});

      expect(callsNamed(memorySend, 'ListMemoryRecordsCommand')).toHaveLength(2);
      expect(summary.friendsVisited).toBe(2);
    });

    test('follows the scan through every page of the control table', async () => {
      let scans = 0;
      ddbSend.mockImplementation(async (command) => {
        if (commandName(command) === 'ScanCommand') {
          scans += 1;
          return scans === 1
            ? {
                Items: [friendItem('friend-1')],
                LastEvaluatedKey: { pk: { S: 'FRIEND#friend-1' } },
              }
            : { Items: [friendItem('friend-2')] };
        }
        return {};
      });
      const handler = await loadHandler();

      const summary = await handler({});

      expect(scans).toBe(2);
      expect(summary.friendsVisited).toBe(2);
    });

    test('stamps memoryPrunedAt on each friend it finished', async () => {
      const handler = await loadHandler();

      await handler({});

      const updates = callsNamed(ddbSend, 'UpdateItemCommand');
      expect(updates).toHaveLength(1);
      expect(updates[0].input.TableName).toBe(ENV.CONTROL_TABLE_NAME);
      expect(updates[0].input.Key).toEqual({ pk: { S: 'FRIEND#friend-1' } });
      const values = updates[0].input.ExpressionAttributeValues as Record<string, { S: string }>;
      const stamped = Object.values(values)[0].S;
      expect(Date.parse(stamped)).not.toBeNaN();
    });

    test('ignores control-table items that are not friends', async () => {
      ddbSend.mockImplementation(async (command) => {
        if (commandName(command) === 'ScanCommand') {
          return { Items: [{ pk: { S: 'ALLOW#someone@example.com' } }, friendItem('friend-1')] };
        }
        return {};
      });
      const handler = await loadHandler();

      const summary = await handler({});

      expect(summary.friendsVisited).toBe(1);
      const lists = callsNamed(memorySend, 'ListMemoryRecordsCommand');
      expect(lists[0].input.namespacePath).toBe('/max-height/friend-1/');
    });
  });

  describe('failures', () => {
    test('attempts every remaining friend, then throws naming how many failed', async () => {
      ddbSend.mockImplementation(async (command) => {
        if (commandName(command) === 'ScanCommand') {
          return {
            Items: [friendItem('friend-1'), friendItem('friend-2'), friendItem('friend-3')],
          };
        }
        return {};
      });
      memorySend.mockImplementation(async (command) => {
        if (commandName(command) === 'ListMemoryRecordsCommand') {
          const path = (command as FakeCommand).input.namespacePath as string;
          if (path.includes('friend-2')) throw new Error('ThrottlingException');
          return records([]);
        }
        return { successfulRecords: [], failedRecords: [] };
      });
      const handler = await loadHandler();

      await expect(handler({})).rejects.toThrow(/1 of 3/);

      expect(callsNamed(memorySend, 'ListMemoryRecordsCommand')).toHaveLength(3);
      // The two that worked are still stamped; only the failure is left undone.
      expect(callsNamed(ddbSend, 'UpdateItemCommand')).toHaveLength(2);
    });

    // BatchDeleteMemoryRecords reports per-record failures in the response
    // body rather than throwing, so a handler that only catches exceptions
    // would report a wipe it did not perform.
    test('treats failedRecords in a batch delete as a failure', async () => {
      memorySend.mockImplementation(async (command) => {
        if (commandName(command) === 'ListMemoryRecordsCommand') {
          return records([{ id: 'old', timestamp: daysAgo(31) }]);
        }
        return {
          successfulRecords: [],
          failedRecords: [{ memoryRecordId: 'old', errorMessage: 'nope' }],
        };
      });
      const handler = await loadHandler();

      await expect(handler({})).rejects.toThrow(/1 of 1/);

      expect(callsNamed(ddbSend, 'UpdateItemCommand')).toHaveLength(0);
    });

    test('refuses to run without its configuration', async () => {
      const handler = await loadHandler({ CONTROL_TABLE_NAME: 'MaxHeight-Control' });

      await expect(handler({})).rejects.toThrow(/MEMORY_ID/);
    });
  });

  describe('single-friend mode', () => {
    test('deletes every record for that friend regardless of age', async () => {
      memorySend.mockImplementation(async (command) => {
        if (commandName(command) === 'ListMemoryRecordsCommand') {
          return records([
            { id: 'old', timestamp: daysAgo(31) },
            { id: 'fresh', timestamp: daysAgo(1) },
          ]);
        }
        return {
          successfulRecords: [{ memoryRecordId: 'old' }, { memoryRecordId: 'fresh' }],
          failedRecords: [],
        };
      });
      const handler = await loadHandler();

      const summary = await handler({ sub: 'friend-9' });

      const lists = callsNamed(memorySend, 'ListMemoryRecordsCommand');
      expect(lists[0].input.namespacePath).toBe('/max-height/friend-9/');
      const deletes = callsNamed(memorySend, 'BatchDeleteMemoryRecordsCommand');
      expect(deletes[0].input.records).toHaveLength(2);
      expect(summary.recordsDeleted).toBe(2);
    });

    test('does not scan the control table', async () => {
      const handler = await loadHandler();

      await handler({ sub: 'friend-9' });

      expect(callsNamed(ddbSend, 'ScanCommand')).toHaveLength(0);
    });

    // An undatable record is kept by the daily rule, but a deletion request
    // is not a retention decision: it must leave nothing behind.
    test('deletes an undatable record too', async () => {
      memorySend.mockImplementation(async (command) => {
        if (commandName(command) === 'ListMemoryRecordsCommand') {
          return records([{ id: 'undatable' }]);
        }
        return { successfulRecords: [{ memoryRecordId: 'undatable' }], failedRecords: [] };
      });
      const handler = await loadHandler();

      const summary = await handler({ sub: 'friend-9' });

      expect(callsNamed(memorySend, 'BatchDeleteMemoryRecordsCommand')).toHaveLength(1);
      expect(summary.recordsDeleted).toBe(1);
      expect(summary.undatable).toBe(0);
    });
  });
});
