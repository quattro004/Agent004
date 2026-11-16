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

export interface MemoryRecordSummary {
  memoryRecordId: string;
  memoryStrategyId?: string;
  content?: { text?: string };
  namespaces?: string[];
  createdAt?: Date;
  timestamp?: Date;
  score?: number;
}

export interface MemoryRecordDeleteInput {
  memoryRecordId: string;
  namespace?: string;
}

export interface BatchDeleteResult {
  successfulRecords: Array<{ memoryRecordId: string }>;
  failedRecords: Array<{ memoryRecordId?: string; errorMessage?: string }>;
}

export interface AgentCoreMemoryClient {
  createEvent(params: {
    memoryId: string;
    actorId: string;
    sessionId: string;
    eventTimestamp: Date;
    messages: Array<{ role: 'USER' | 'ASSISTANT'; text: string }>;
  }): Promise<void>;

  listRecords(params: {
    memoryId: string;
    namespace: string;
    maxResults?: number;
  }): Promise<MemoryRecordSummary[]>;

  retrieveRecords(params: {
    memoryId: string;
    namespace: string;
    searchQuery: string;
    topK: number;
  }): Promise<MemoryRecordSummary[]>;

  getRecord(params: {
    memoryId: string;
    memoryRecordId: string;
  }): Promise<MemoryRecordSummary | undefined>;

  deleteRecord(params: {
    memoryId: string;
    memoryRecordId: string;
    namespace: string;
  }): Promise<void>;

  batchDeleteRecords(params: {
    memoryId: string;
    records: MemoryRecordDeleteInput[];
  }): Promise<BatchDeleteResult>;

  listSessions(params: {
    memoryId: string;
    actorId: string;
  }): Promise<Array<{ sessionId: string }>>;

  listEvents(params: {
    memoryId: string;
    actorId: string;
    sessionId: string;
  }): Promise<Array<{ eventId: string }>>;

  deleteEvent(params: {
    memoryId: string;
    actorId: string;
    sessionId: string;
    eventId: string;
  }): Promise<void>;
}

export interface AgentCoreMemoryClientOptions {
  region?: string;
}

const DELETE_BATCH_SIZE = 100;

/**
 * Creates the AgentCore Memory data-plane client. SDK requests are lazy; the
 * first operation resolves credentials and endpoints from the configured AWS
 * runtime environment.
 */
export function createAgentCoreMemoryClient(
  options: AgentCoreMemoryClientOptions = {},
): AgentCoreMemoryClient {
  const sdk = new BedrockAgentCoreClient(options);

  async function listRecords({
    memoryId,
    namespace,
    maxResults,
  }: {
    memoryId: string;
    namespace: string;
    maxResults?: number;
  }): Promise<MemoryRecordSummary[]> {
    const records: MemoryRecordSummary[] = [];
    let nextToken: string | undefined;

    do {
      const page = await sdk.send(
        new ListMemoryRecordsCommand({
          memoryId,
          namespacePath: namespace,
          maxResults,
          nextToken,
        }),
      );
      records.push(...(page.memoryRecordSummaries ?? []).map(toRecordSummary));
      nextToken = page.nextToken;
    } while (nextToken !== undefined);

    return records;
  }

  async function listSessions({
    memoryId,
    actorId,
  }: {
    memoryId: string;
    actorId: string;
  }): Promise<Array<{ sessionId: string }>> {
    const sessions: Array<{ sessionId: string }> = [];
    let nextToken: string | undefined;

    do {
      const page = await sdk.send(new ListSessionsCommand({ memoryId, actorId, nextToken }));
      for (const session of page.sessionSummaries ?? []) {
        sessions.push({ sessionId: requiredString(session.sessionId, 'sessionId') });
      }
      nextToken = page.nextToken;
    } while (nextToken !== undefined);

    return sessions;
  }

  async function listEvents({
    memoryId,
    actorId,
    sessionId,
  }: {
    memoryId: string;
    actorId: string;
    sessionId: string;
  }): Promise<Array<{ eventId: string }>> {
    const events: Array<{ eventId: string }> = [];
    let nextToken: string | undefined;

    do {
      const page = await sdk.send(
        new ListEventsCommand({
          memoryId,
          actorId,
          sessionId,
          includePayloads: false,
          nextToken,
        }),
      );
      for (const event of page.events ?? []) {
        events.push({ eventId: requiredString(event.eventId, 'eventId') });
      }
      nextToken = page.nextToken;
    } while (nextToken !== undefined);

    return events;
  }

  return {
    async createEvent({ memoryId, actorId, sessionId, eventTimestamp, messages }) {
      await sdk.send(
        new CreateEventCommand({
          memoryId,
          actorId,
          sessionId,
          eventTimestamp,
          payload: messages.map(({ role, text }) => ({
            conversational: { role, content: { text } },
          })),
        }),
      );
    },

    listRecords,

    async retrieveRecords({ memoryId, namespace, searchQuery, topK }) {
      const page = await sdk.send(
        new RetrieveMemoryRecordsCommand({
          memoryId,
          namespacePath: namespace,
          searchCriteria: { searchQuery, topK },
          maxResults: topK,
        }),
      );
      return (page.memoryRecordSummaries ?? []).map(toRecordSummary);
    },

    async getRecord({ memoryId, memoryRecordId }) {
      try {
        const result = await sdk.send(new GetMemoryRecordCommand({ memoryId, memoryRecordId }));
        return result.memoryRecord ? toRecordSummary(result.memoryRecord) : undefined;
      } catch (error) {
        if (error instanceof ResourceNotFoundException) return undefined;
        throw error;
      }
    },

    async deleteRecord({ memoryId, memoryRecordId, namespace }) {
      await sdk.send(new DeleteMemoryRecordCommand({ memoryId, memoryRecordId, namespace }));
    },

    async batchDeleteRecords({ memoryId, records }) {
      const successfulRecords: BatchDeleteResult['successfulRecords'] = [];
      const failedRecords: BatchDeleteResult['failedRecords'] = [];

      for (let offset = 0; offset < records.length; offset += DELETE_BATCH_SIZE) {
        const batch = records.slice(offset, offset + DELETE_BATCH_SIZE);
        const result = await sdk.send(
          new BatchDeleteMemoryRecordsCommand({ memoryId, records: batch }),
        );
        successfulRecords.push(
          ...(result.successfulRecords ?? []).flatMap((record) =>
            record.memoryRecordId === undefined ? [] : [{ memoryRecordId: record.memoryRecordId }],
          ),
        );
        failedRecords.push(
          ...(result.failedRecords ?? []).map((record) => ({
            memoryRecordId: record.memoryRecordId,
            errorMessage: record.errorMessage,
          })),
        );
      }

      return { successfulRecords, failedRecords };
    },

    listSessions,
    listEvents,

    async deleteEvent({ memoryId, actorId, sessionId, eventId }) {
      await sdk.send(new DeleteEventCommand({ memoryId, actorId, sessionId, eventId }));
    },
  };
}

function toRecordSummary(record: {
  memoryRecordId?: string;
  memoryStrategyId?: string;
  content?: { text?: string };
  namespaces?: string[];
  createdAt?: Date;
  timestamp?: Date;
  score?: number;
}): MemoryRecordSummary {
  return {
    memoryRecordId: requiredString(record.memoryRecordId, 'memoryRecordId'),
    memoryStrategyId: record.memoryStrategyId,
    content: record.content?.text === undefined ? undefined : { text: record.content.text },
    namespaces: record.namespaces,
    createdAt: record.createdAt,
    timestamp: record.timestamp,
    score: record.score,
  };
}

function requiredString(value: string | undefined, name: string): string {
  if (value === undefined || value === '') {
    throw new Error(`AgentCore Memory response is missing ${name}`);
  }
  return value;
}
