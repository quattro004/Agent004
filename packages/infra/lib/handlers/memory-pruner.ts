import {
  BatchDeleteMemoryRecordsCommand,
  BedrockAgentCoreClient,
  ListMemoryRecordsCommand,
} from '@aws-sdk/client-bedrock-agentcore';
import { DynamoDBClient, ScanCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';

/**
 * Memory pruner (FR-013; contracts/memory-api.md § Pruner).
 *
 * T172 settled what "30-day retention" has to mean here. Deleting a friend's
 * memory once `lastSeenAt` passed 30 days would have kept an active friend's
 * first-week facts forever, and the service's own record TTL cannot stand in
 * for the promise: its minimum is 31 days, it deletes days after expiry while
 * still serving the record, and consolidation restarts its clock. So this
 * visits every friend every day and ages each record by its content's
 * timestamp.
 *
 * Nothing is swallowed. One friend's failure does not stop the others, but
 * the run ends by throwing, which raises the Lambda `Errors` alarm.
 */

const FRIEND_PREFIX = 'FRIEND#';
const DEFAULT_RETENTION_DAYS = 30;
/** `BatchDeleteMemoryRecords` takes up to 100 records per call. */
const DELETE_BATCH_SIZE = 100;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface PruneSummary {
  friendsVisited: number;
  recordsDeleted: number;
  /** Records with no usable age. Kept, never guessed at, and surfaced here. */
  undatable: number;
}

interface Summary {
  recordsDeleted: number;
  undatable: number;
}

interface RecordSummary {
  memoryRecordId?: string;
  namespaces?: string[];
  timestamp?: Date | string | number;
  createdAt?: Date | string | number;
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`memory-pruner is missing the ${name} environment variable`);
  }
  return value;
}

function namespacePathFor(sub: string): string {
  return `/max-height/${sub}/`;
}

/**
 * The age of what the record says, not of the row it was last written into.
 * `timestamp` is the source content's time and survives consolidation;
 * `createdAt` is the write and does not.
 */
function contentAgeMs(record: RecordSummary, now: number): number | undefined {
  const raw = record.timestamp ?? record.createdAt;
  if (raw === undefined) return undefined;
  const at = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
  return Number.isNaN(at) ? undefined : now - at;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Deletes a friend's expired records. In `deleteEverything` mode — the
 * operator's delete-on-request route — age is not consulted at all, so an
 * undatable record goes too.
 */
async function pruneFriend(
  memory: BedrockAgentCoreClient,
  memoryId: string,
  sub: string,
  retentionMs: number,
  deleteEverything: boolean,
): Promise<Summary> {
  const namespacePath = namespacePathFor(sub);
  const doomed: Array<{ memoryRecordId: string; namespace?: string }> = [];
  let undatable = 0;
  let nextToken: string | undefined;

  do {
    const page = (await memory.send(
      new ListMemoryRecordsCommand({ memoryId, namespacePath, nextToken }),
    )) as { memoryRecordSummaries?: RecordSummary[]; nextToken?: string };

    for (const record of page.memoryRecordSummaries ?? []) {
      if (record.memoryRecordId === undefined) continue;
      if (!deleteEverything) {
        const age = contentAgeMs(record, Date.now());
        if (age === undefined) {
          undatable += 1;
          continue;
        }
        if (age <= retentionMs) continue;
      }
      const namespace = record.namespaces?.[0];
      doomed.push(
        namespace === undefined
          ? { memoryRecordId: record.memoryRecordId }
          : { memoryRecordId: record.memoryRecordId, namespace },
      );
    }

    nextToken = page.nextToken;
  } while (nextToken !== undefined);

  let recordsDeleted = 0;
  for (const batch of chunk(doomed, DELETE_BATCH_SIZE)) {
    const result = (await memory.send(
      new BatchDeleteMemoryRecordsCommand({ memoryId, records: batch }),
    )) as { successfulRecords?: unknown[]; failedRecords?: unknown[] };

    // A partial failure comes back in the response body rather than as an
    // exception, so it has to be read out or the wipe is reported as done.
    const failed = result.failedRecords ?? [];
    if (failed.length > 0) {
      throw new Error(`BatchDeleteMemoryRecords left ${failed.length} record(s) undeleted`);
    }
    recordsDeleted += (result.successfulRecords ?? []).length;
  }

  return { recordsDeleted, undatable };
}

async function listFriendSubs(dynamo: DynamoDBClient, tableName: string): Promise<string[]> {
  const subs: string[] = [];
  let startKey: Record<string, unknown> | undefined;

  do {
    const page = (await dynamo.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: 'pk',
        FilterExpression: 'begins_with(pk, :prefix)',
        ExpressionAttributeValues: { ':prefix': { S: FRIEND_PREFIX } },
        ExclusiveStartKey: startKey as never,
      }),
    )) as { Items?: Array<{ pk?: { S?: string } }>; LastEvaluatedKey?: Record<string, unknown> };

    for (const item of page.Items ?? []) {
      const pk = item.pk?.S;
      if (pk !== undefined && pk.startsWith(FRIEND_PREFIX))
        subs.push(pk.slice(FRIEND_PREFIX.length));
    }

    startKey = page.LastEvaluatedKey;
  } while (startKey !== undefined);

  return subs;
}

async function stampPruned(dynamo: DynamoDBClient, tableName: string, sub: string): Promise<void> {
  await dynamo.send(
    new UpdateItemCommand({
      TableName: tableName,
      Key: { pk: { S: `${FRIEND_PREFIX}${sub}` } },
      UpdateExpression: 'SET memoryPrunedAt = :now',
      ExpressionAttributeValues: { ':now': { S: new Date().toISOString() } },
    }),
  );
}

export async function handler(event: unknown): Promise<PruneSummary> {
  const tableName = required('CONTROL_TABLE_NAME');
  const memoryId = required('MEMORY_ID');
  const retentionDays = Number(process.env.RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS);
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    throw new Error(
      `memory-pruner has a nonsensical RETENTION_DAYS: ${process.env.RETENTION_DAYS}`,
    );
  }
  const retentionMs = retentionDays * MS_PER_DAY;

  const dynamo = new DynamoDBClient({});
  const memory = new BedrockAgentCoreClient({});

  const single = (event as { sub?: unknown } | null)?.sub;
  const subs = typeof single === 'string' && single !== '' ? [single] : undefined;
  const deleteEverything = subs !== undefined;
  const friends = subs ?? (await listFriendSubs(dynamo, tableName));

  const summary: PruneSummary = { friendsVisited: 0, recordsDeleted: 0, undatable: 0 };
  const failures: Error[] = [];

  for (const sub of friends) {
    try {
      const result = await pruneFriend(memory, memoryId, sub, retentionMs, deleteEverything);
      summary.friendsVisited += 1;
      summary.recordsDeleted += result.recordsDeleted;
      summary.undatable += result.undatable;
      await stampPruned(dynamo, tableName, sub);
    } catch (error) {
      // The friend's identifier is not message text, but it is still a
      // person, so the log names the failure and not the friend's data.
      console.error(
        JSON.stringify({
          event: 'memory_pruner.friend_failed',
          reason: error instanceof Error ? error.message : 'unknown',
        }),
      );
      failures.push(error instanceof Error ? error : new Error('unknown'));
    }
  }

  if (summary.undatable > 0) {
    console.warn(JSON.stringify({ event: 'memory_pruner.undatable', count: summary.undatable }));
  }

  if (failures.length > 0) {
    throw new Error(
      `memory-pruner failed for ${failures.length} of ${friends.length} friend(s): ${failures
        .map((error) => error.message)
        .join('; ')}`,
    );
  }

  return summary;
}
