/**
 * AgentCore Memory client abstraction.
 * In production, this wraps the real AgentCore Memory SDK.
 * In tests, this module is mocked.
 */

export interface AgentCoreMemoryClient {
  createEvent(params: {
    memoryId: string;
    actorId: string;
    payload: Array<{ role: string; content: string }>;
    sessionId?: string;
  }): Promise<void>;

  listRecords(params: {
    memoryId: string;
    namespace: string;
    maxResults?: number;
  }): Promise<Array<{ memoryRecordId: string; content?: { text: string }; namespaces?: string[] }>>;

  retrieveRecords(params: {
    memoryId: string;
    namespace: string;
    searchQuery: string;
    topK?: number;
  }): Promise<
    Array<{
      memoryRecordId: string;
      content: string;
      score: number;
      namespace: string;
    }>
  >;

  batchDeleteRecords(params: {
    memoryId: string;
    records: Array<{ memoryRecordId: string }>;
  }): Promise<{ successful: number; failed: number }>;

  batchCreateRecords(params: {
    memoryId: string;
    records: Array<{
      content: { text: string };
      namespaces: string[];
      requestIdentifier: string;
      timestamp: number;
    }>;
  }): Promise<{ successful: number; failed: number }>;
}

/**
 * Creates an AgentCore Memory client.
 * Uses environment variable MEMORY_ID for the memory resource.
 */
export function createAgentCoreMemoryClient(): AgentCoreMemoryClient {
  // Production implementation will use the actual AgentCore Memory SDK.
  // For now, throw so tests always use mocks.
  throw new Error(
    'AgentCore Memory client not configured. Set up production client or use mocks in tests.',
  );
}
