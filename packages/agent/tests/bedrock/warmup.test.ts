/**
 * Warm-up probe tests (infra-plan Phase 1, T154).
 *
 * AgentCore Runtime V2 snapshots the process on the first healthy `/ping`.
 * Only work that is actually *driven* lands in that snapshot, so the warm-up
 * has to issue a real signed round-trip rather than merely allocate a client.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { BedrockRuntimeClient, ListAsyncInvokesCommand } from '@aws-sdk/client-bedrock-runtime';
import { probeBedrockRuntime, __test } from '../../src/bedrock/warmup.js';

const bedrockMock = mockClient(BedrockRuntimeClient);

describe('probeBedrockRuntime', () => {
  beforeEach(() => {
    bedrockMock.reset();
    __test.resetClient();
  });

  afterAll(() => {
    bedrockMock.restore();
  });

  it('should send a real ListAsyncInvokes round-trip rather than only constructing a client', async () => {
    bedrockMock.on(ListAsyncInvokesCommand).resolves({});

    await probeBedrockRuntime();

    const calls = bedrockMock.commandCalls(ListAsyncInvokesCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input).toEqual({ maxResults: 1 });
  });

  it('should reuse one client so the warmed connection pool survives into the snapshot', async () => {
    bedrockMock.on(ListAsyncInvokesCommand).resolves({});

    await probeBedrockRuntime();
    await probeBedrockRuntime();

    expect(__test.getClient()).toBe(__test.getClient());
    expect(bedrockMock.commandCalls(ListAsyncInvokesCommand)).toHaveLength(2);
  });

  it('should resolve to a V2-supported region by default', () => {
    expect(__test.resolveRegion({})).toBe('us-west-2');
    expect(__test.resolveRegion({ AWS_REGION: 'us-east-1' })).toBe('us-east-1');
  });

  it('should surface failure loudly rather than falling back silently', async () => {
    bedrockMock
      .on(ListAsyncInvokesCommand)
      .rejects(new Error('AccessDeniedException: bedrock:ListAsyncInvokes'));

    await expect(probeBedrockRuntime()).rejects.toThrow('AccessDeniedException');
  });
});
