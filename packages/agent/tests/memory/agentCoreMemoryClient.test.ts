import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  BatchDeleteMemoryRecordsCommand,
  BedrockAgentCoreClient,
  CreateEventCommand,
  DeleteEventCommand,
  DeleteMemoryRecordCommand,
  GetMemoryRecordCommand,
  ListEventsCommand,
  ListMemoryRecordsCommand,
  ListSessionsCommand,
  ResourceNotFoundException,
  RetrieveMemoryRecordsCommand,
} from '@aws-sdk/client-bedrock-agentcore';
import { createAgentCoreMemoryClient } from '../../src/memory/agentCoreMemoryClient.js';

const memorySdk = mockClient(BedrockAgentCoreClient);

function record(memoryRecordId: string) {
  return {
    memoryRecordId,
    memoryStrategyId: 'semantic-strategy',
    namespaces: ['/max-height/friend-1/facts/'],
    content: { text: memoryRecordId },
    createdAt: new Date('2026-11-16T00:00:00.000Z'),
  };
}

describe('AgentCoreMemoryClient', () => {
  beforeEach(() => {
    memorySdk.reset();
  });

  afterAll(() => {
    memorySdk.restore();
  });

  it('lists every hierarchical namespace page using namespacePath', async () => {
    memorySdk
      .on(ListMemoryRecordsCommand)
      .resolvesOnce({ memoryRecordSummaries: [record('record-1')], nextToken: 'next-page' })
      .resolves({ memoryRecordSummaries: [record('record-2')] });

    const client = createAgentCoreMemoryClient();
    const records = await client.listRecords({
      memoryId: 'memory-id',
      namespace: '/max-height/friend-1/',
      maxResults: 1,
    });

    expect(records.map(({ memoryRecordId }) => memoryRecordId)).toEqual(['record-1', 'record-2']);
    expect(
      memorySdk.commandCalls(ListMemoryRecordsCommand).map(({ args }) => args[0].input),
    ).toEqual([
      {
        memoryId: 'memory-id',
        namespacePath: '/max-height/friend-1/',
        maxResults: 1,
      },
      {
        memoryId: 'memory-id',
        namespacePath: '/max-height/friend-1/',
        maxResults: 1,
        nextToken: 'next-page',
      },
    ]);
  });

  it('retrieves records hierarchically and maps one event for both turn messages', async () => {
    memorySdk.on(RetrieveMemoryRecordsCommand).resolves({
      memoryRecordSummaries: [record('record-1')],
    });
    memorySdk.on(CreateEventCommand).resolves({});

    const client = createAgentCoreMemoryClient();
    const records = await client.retrieveRecords({
      memoryId: 'memory-id',
      namespace: '/max-height/friend-1/',
      searchQuery: 'favorite music',
      topK: 10,
    });
    await client.createEvent({
      memoryId: 'memory-id',
      actorId: 'friend-1',
      sessionId: 'counted-session',
      eventTimestamp: new Date('2026-11-16T12:00:00.000Z'),
      messages: [
        { role: 'USER', text: 'I like synths.' },
        { role: 'ASSISTANT', text: 'A fine choice.' },
      ],
    });

    expect(records.map(({ memoryRecordId }) => memoryRecordId)).toEqual(['record-1']);
    expect(memorySdk.commandCalls(RetrieveMemoryRecordsCommand)[0]?.args[0].input).toEqual({
      memoryId: 'memory-id',
      namespacePath: '/max-height/friend-1/',
      searchCriteria: { searchQuery: 'favorite music', topK: 10 },
      maxResults: 10,
    });
    expect(memorySdk.commandCalls(CreateEventCommand)[0]?.args[0].input).toMatchObject({
      memoryId: 'memory-id',
      actorId: 'friend-1',
      sessionId: 'counted-session',
      eventTimestamp: new Date('2026-11-16T12:00:00.000Z'),
      payload: [
        { conversational: { role: 'USER', content: { text: 'I like synths.' } } },
        { conversational: { role: 'ASSISTANT', content: { text: 'A fine choice.' } } },
      ],
    });
  });

  it('paginates through every session and event before a forget operation completes', async () => {
    memorySdk
      .on(ListSessionsCommand)
      .resolvesOnce({ sessionSummaries: [{ sessionId: 'session-1' }], nextToken: 'sessions-next' })
      .resolves({ sessionSummaries: [{ sessionId: 'session-2' }] });
    memorySdk
      .on(ListEventsCommand)
      .resolvesOnce({ events: [{ eventId: 'event-1' }], nextToken: 'events-next' })
      .resolves({ events: [{ eventId: 'event-2' }] });
    memorySdk.on(DeleteEventCommand).resolves({});

    const client = createAgentCoreMemoryClient();
    const sessions = await client.listSessions({ memoryId: 'memory-id', actorId: 'friend-1' });
    const events = await client.listEvents({
      memoryId: 'memory-id',
      actorId: 'friend-1',
      sessionId: 'session-1',
    });
    await client.deleteEvent({
      memoryId: 'memory-id',
      actorId: 'friend-1',
      sessionId: 'session-1',
      eventId: 'event-1',
    });

    expect(sessions).toEqual([{ sessionId: 'session-1' }, { sessionId: 'session-2' }]);
    expect(events).toEqual([{ eventId: 'event-1' }, { eventId: 'event-2' }]);
    expect(memorySdk.commandCalls(ListEventsCommand).map(({ args }) => args[0].input)).toEqual([
      {
        memoryId: 'memory-id',
        actorId: 'friend-1',
        sessionId: 'session-1',
        includePayloads: false,
      },
      {
        memoryId: 'memory-id',
        actorId: 'friend-1',
        sessionId: 'session-1',
        includePayloads: false,
        nextToken: 'events-next',
      },
    ]);
    expect(memorySdk.commandCalls(DeleteEventCommand)[0]?.args[0].input).toEqual({
      memoryId: 'memory-id',
      actorId: 'friend-1',
      sessionId: 'session-1',
      eventId: 'event-1',
    });
  });

  it('maps a missing record to undefined and deletes an owned record by its namespace', async () => {
    memorySdk
      .on(GetMemoryRecordCommand)
      .resolvesOnce({ memoryRecord: record('record-1') })
      .rejectsOnce(
        new ResourceNotFoundException({
          message: 'not found',
          $metadata: { httpStatusCode: 404 },
        }),
      );
    memorySdk.on(DeleteMemoryRecordCommand).resolves({});

    const client = createAgentCoreMemoryClient();
    const found = await client.getRecord({ memoryId: 'memory-id', memoryRecordId: 'record-1' });
    const missing = await client.getRecord({ memoryId: 'memory-id', memoryRecordId: 'missing' });
    await client.deleteRecord({
      memoryId: 'memory-id',
      memoryRecordId: 'record-1',
      namespace: '/max-height/friend-1/facts/',
    });

    expect(found?.memoryRecordId).toBe('record-1');
    expect(missing).toBeUndefined();
    expect(memorySdk.commandCalls(DeleteMemoryRecordCommand)[0]?.args[0].input).toEqual({
      memoryId: 'memory-id',
      memoryRecordId: 'record-1',
      namespace: '/max-height/friend-1/facts/',
    });
  });

  it('chunks batch deletes to 100 and preserves partial failure details', async () => {
    const records = Array.from({ length: 101 }, (_, index) => ({
      memoryRecordId: `record-${index}`,
      namespace: '/max-height/friend-1/facts/',
    }));
    memorySdk
      .on(BatchDeleteMemoryRecordsCommand)
      .resolvesOnce({
        successfulRecords: records.slice(0, 100).map(({ memoryRecordId }) => ({ memoryRecordId })),
        failedRecords: [],
      })
      .resolves({
        successfulRecords: [],
        failedRecords: [{ memoryRecordId: 'record-100', errorMessage: 'denied' }],
      });

    const client = createAgentCoreMemoryClient();
    const result = await client.batchDeleteRecords({ memoryId: 'memory-id', records });
    const calls = memorySdk.commandCalls(BatchDeleteMemoryRecordsCommand);

    expect(calls).toHaveLength(2);
    expect(calls[0]?.args[0].input.records).toHaveLength(100);
    expect(calls[1]?.args[0].input.records).toEqual([records[100]]);
    expect(result.successfulRecords).toHaveLength(100);
    expect(result.failedRecords).toEqual([
      { memoryRecordId: 'record-100', errorMessage: 'denied' },
    ]);
  });
});
