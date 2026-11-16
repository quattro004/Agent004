/**
 * T163 (RED): the approved per-turn safety bounds from spec 003
 * § Clarifications, Session 2026-11-15.
 *
 * These assert behavior the runtime must have before it may spend money:
 * an oversized request body is refused before it is parsed or buffered, the
 * serialized model input and each tool result are bounded without becoming
 * structurally invalid, and the per-turn call/tool/token ceilings are the
 * approved numbers. The billed-token cutoff is checked by the SDK *between*
 * calls, so the overshoot is pinned explicitly rather than papered over.
 */
import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import {
  BodyTooLargeError,
  readBoundedBody,
  truncateToolResult,
  boundModelInput,
  invokeLimitsFor,
  TURN_LIMIT_DEFAULTS,
} from '../../src/limits/turnLimits.js';

function streamOf(chunks: (string | Buffer)[]): IncomingMessage {
  const stream = new PassThrough();
  queueMicrotask(() => {
    for (const chunk of chunks) stream.write(chunk);
    stream.end();
  });
  return stream as unknown as IncomingMessage;
}

describe('readBoundedBody — 16 KiB request body', () => {
  it('returns the body when it is within the limit', async () => {
    const body = JSON.stringify({ message: 'hello' });
    await expect(readBoundedBody(streamOf([body]), 16 * 1024)).resolves.toBe(body);
  });

  it('accepts a body of exactly the limit', async () => {
    const body = 'x'.repeat(64);
    await expect(readBoundedBody(streamOf([body]), 64)).resolves.toBe(body);
  });

  it('refuses an oversized chunked body before consuming the rest of the stream', async () => {
    // The point of an *early* refusal is that we never buffer the whole
    // payload. A caller who streams far past the limit must be cut off at it.
    const stream = new PassThrough();
    const chunk = Buffer.alloc(1024, 0x61);
    let written = 0;
    // A real sender keeps writing until the socket is destroyed, so the
    // producer yields between chunks and stops when that happens.
    void (async () => {
      for (let i = 0; i < 64; i += 1) {
        if (stream.destroyed) break;
        written += 1;
        stream.write(chunk);
        await new Promise((resolve) => setImmediate(resolve));
      }
      if (!stream.destroyed) stream.end();
    })();

    await expect(readBoundedBody(stream as unknown as IncomingMessage, 4 * 1024)).rejects.toThrow(
      BodyTooLargeError,
    );
    expect(stream.destroyed).toBe(true);
    expect(written).toBeLessThan(64);
  });

  it('measures UTF-8 bytes, not characters', async () => {
    // Four 3-byte characters are 12 bytes, so a 6-byte limit must refuse them
    // even though `String.length` is only 4.
    const body = '\u4f60\u597d\u4e16\u754c';
    expect(body.length).toBe(4);
    await expect(readBoundedBody(streamOf([body]), 6)).rejects.toThrow(BodyTooLargeError);
  });

  it('reports the limit it enforced', async () => {
    await expect(readBoundedBody(streamOf(['abcdefghij']), 4)).rejects.toThrow(/4 bytes/);
  });
});

describe('truncateToolResult — 8 KiB per tool result', () => {
  it('leaves a small result untouched', () => {
    const result = {
      toolUseId: 't1',
      status: 'success' as const,
      content: [{ type: 'text' as const, text: 'sunny' }],
    };
    expect(truncateToolResult(result, 8 * 1024)).toEqual(result);
  });

  it('bounds an oversized text result to the limit and keeps a valid block', () => {
    const result = {
      toolUseId: 't1',
      status: 'success' as const,
      content: [{ type: 'text' as const, text: 'y'.repeat(20_000) }],
    };
    const bounded = truncateToolResult(result, 1024);

    expect(Buffer.byteLength(JSON.stringify(bounded), 'utf8')).toBeLessThanOrEqual(1024);
    expect(bounded.toolUseId).toBe('t1');
    expect(bounded.status).toBe('success');
    expect(bounded.content[0]).toHaveProperty('text');
  });

  it('says the result was truncated, so the model does not treat it as complete', () => {
    const result = {
      toolUseId: 't1',
      status: 'success' as const,
      content: [{ type: 'text' as const, text: 'y'.repeat(20_000) }],
    };
    const bounded = truncateToolResult(result, 1024);
    expect(JSON.stringify(bounded)).toMatch(/truncated/i);
  });

  it('bounds a JSON result without emitting invalid JSON', () => {
    const result = {
      toolUseId: 't2',
      status: 'success' as const,
      content: [
        { type: 'json' as const, json: { items: Array.from({ length: 500 }, (_, i) => i) } },
      ],
    };
    const bounded = truncateToolResult(result, 512);

    const serialized = JSON.stringify(bounded);
    expect(Buffer.byteLength(serialized, 'utf8')).toBeLessThanOrEqual(512);
    expect(() => JSON.parse(serialized)).not.toThrow();
  });
});

describe('boundModelInput — 32 KiB serialized model input', () => {
  const systemPrompt = 'You are Max Height.';
  const message = (text: string) => ({
    role: 'user' as const,
    content: [{ type: 'text' as const, text }],
  });

  it('leaves a small history untouched', () => {
    const messages = [message('hi'), { role: 'assistant' as const, content: [] }];
    expect(boundModelInput(messages, { maxBytes: 32 * 1024, systemPrompt }).messages).toEqual(
      messages,
    );
  });

  it('drops the oldest messages first when over the limit', () => {
    const messages = [
      message('oldest '.repeat(400)),
      message('middle '.repeat(400)),
      message('current'),
    ];

    const { messages: bounded } = boundModelInput(messages, { maxBytes: 2048, systemPrompt });

    expect(Buffer.byteLength(JSON.stringify(bounded), 'utf8')).toBeLessThanOrEqual(2048);
    expect(JSON.stringify(bounded)).toContain('current');
    expect(JSON.stringify(bounded)).not.toContain('oldest');
  });

  it('never drops the current request, even when it alone exceeds the limit', () => {
    const { messages: bounded } = boundModelInput([message('z'.repeat(5000))], {
      maxBytes: 512,
      systemPrompt,
    });

    expect(bounded).toHaveLength(1);
    expect(bounded[0].role).toBe('user');
  });

  it('reports how many messages it dropped, so the turn can be observed', () => {
    const messages = [message('a'.repeat(3000)), message('b'.repeat(3000)), message('current')];
    expect(boundModelInput(messages, { maxBytes: 1024, systemPrompt }).dropped).toBe(2);
  });

  it('produces structurally valid messages after bounding', () => {
    const { messages: bounded } = boundModelInput([message('a'.repeat(9000)), message('current')], {
      maxBytes: 1024,
      systemPrompt,
    });

    for (const bound of bounded) {
      expect(bound).toHaveProperty('role');
      expect(Array.isArray(bound.content)).toBe(true);
    }
  });
});

describe('invokeLimitsFor — the approved per-turn ceilings', () => {
  it('uses the numbers the builder approved on 2026-11-15', () => {
    expect(TURN_LIMIT_DEFAULTS).toMatchObject({
      requestBodyMaxBytes: 16 * 1024,
      modelInputMaxBytes: 32 * 1024,
      toolResultMaxBytes: 8 * 1024,
      maxModelCalls: 4,
      maxToolExecutions: 4,
      maxGeneratedTokens: 1000,
      maxBilledTokens: 64_000,
      deadlineMs: 60_000,
    });
  });

  it('maps the approved ceilings onto the SDK InvokeLimits dimensions', () => {
    // The SDK's `turns` is one model call plus the tools it requests, which is
    // the dimension the 4-model-call ceiling bounds.
    expect(invokeLimitsFor(TURN_LIMIT_DEFAULTS)).toEqual({
      turns: 4,
      outputTokens: 1000,
      totalTokens: 64_000,
    });
  });

  it('shrinks the generated-token allowance to the capacity left in the turn', () => {
    // T164: the next call may not be allowed to generate the full budget when
    // the session has nearly exhausted it.
    expect(invokeLimitsFor(TURN_LIMIT_DEFAULTS, { remainingGeneratedTokens: 120 })).toMatchObject({
      outputTokens: 120,
    });
  });

  it('never raises a ceiling above the approved maximum', () => {
    expect(
      invokeLimitsFor(TURN_LIMIT_DEFAULTS, { remainingGeneratedTokens: 999_999 }),
    ).toMatchObject({ outputTokens: 1000 });
  });
});
