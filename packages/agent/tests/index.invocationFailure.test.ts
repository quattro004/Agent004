/**
 * A failure that escapes an invocation must never take the process down.
 *
 * `serveInvocation` always opens and ends the SSE response in its `finally`, so
 * by the time `requestHandler` sees the error the headers are already sent.
 * Answering with a 500 then throws inside the `.catch`, which becomes an
 * unhandled rejection and exits the Node process, leaving any admission lease
 * the dead process held to leak. These tests use a real server because the
 * defect is a property of `ServerResponse`, which no double reproduces.
 */
import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testRuntimeConfig } from './fixtures/runtimeConfig.js';
import { fakeControlTable } from './fixtures/controlTable.js';
import { bearerHeaders, TEST_RUNTIME_SESSION_ID } from './fixtures/http.js';

const { __test } = await import('../src/index.js');

let server: Server;
let unhandled: unknown[];
const onUnhandled = (reason: unknown) => unhandled.push(reason);

function portOf(target: Server): number {
  return (target.address() as AddressInfo).port;
}

describe('requestHandler — a failure after the response has started', () => {
  beforeEach(async () => {
    __test.reset();
    __test.setRuntimeConfig(testRuntimeConfig());
    __test.setControlTable(fakeControlTable());
    unhandled = [];
    process.on('unhandledRejection', onUnhandled);
    server = createServer(__test.requestHandler);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  });

  afterEach(async () => {
    process.off('unhandledRejection', onUnhandled);
    vi.restoreAllMocks();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('survives a client that disconnects mid-upload', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const client = httpRequest({
      host: '127.0.0.1',
      port: portOf(server),
      method: 'POST',
      path: '/invocations',
      headers: {
        ...bearerHeaders(),
        'x-amzn-bedrock-agentcore-runtime-session-id': TEST_RUNTIME_SESSION_ID,
        'content-type': 'application/json',
        'content-length': '200',
      },
    });
    client.on('error', () => undefined);
    client.write('{"message":"hel');
    await new Promise((resolve) => setTimeout(resolve, 50));
    client.destroy();

    await vi.waitFor(() => {
      expect(logged).toHaveBeenCalledWith('Invocation error:', expect.anything());
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(unhandled).toEqual([]);
  });
});
