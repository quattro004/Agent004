/**
 * T163 (RED): the two bounds the SDK cannot enforce for us.
 *
 * `InvokeOptions.limits` has no tool-execution ceiling and no result size
 * bound, so both are enforced with hooks. A tool loop that cannot be stopped
 * is unbounded spend, and an unbounded tool result walks straight into the
 * next model call's input tokens.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  BeforeToolCallEvent,
  AfterToolCallEvent,
  BeforeInvocationEvent,
  BeforeModelCallEvent,
  ToolResultBlock,
  TextBlock,
} from '@strands-agents/sdk';
import { registerTurnLimits, TURN_LIMIT_DEFAULTS } from '../../src/limits/turnLimits.js';

type HookCallback = (event: unknown) => void;

function fakeAgent(messages: unknown[] = []) {
  const hooks = new Map<unknown, HookCallback[]>();
  const agent = {
    messages,
    addHook: vi.fn((ctor: unknown, cb: HookCallback) => {
      const list = hooks.get(ctor) ?? [];
      list.push(cb);
      hooks.set(ctor, list);
      return () => {};
    }),
  };
  const fire = (ctor: unknown, event: unknown) => {
    for (const cb of hooks.get(ctor) ?? []) cb(event);
  };
  return { agent, fire };
}

function toolCallEvent() {
  return { cancel: false as boolean | string, toolUse: { name: 'get_news', toolUseId: 't1' } };
}

describe('registerTurnLimits', () => {
  it('allows the approved number of tool executions and cancels the next', () => {
    const { agent, fire } = fakeAgent();
    registerTurnLimits(agent as never, TURN_LIMIT_DEFAULTS);

    const events = Array.from({ length: 5 }, toolCallEvent);
    for (const event of events) fire(BeforeToolCallEvent, event);

    expect(events.slice(0, 4).map((e) => e.cancel)).toEqual([false, false, false, false]);
    expect(events[4].cancel).not.toBe(false);
    expect(String(events[4].cancel)).toMatch(/tool/i);
  });

  it('resets the tool budget for each new invocation', () => {
    const { agent, fire } = fakeAgent();
    registerTurnLimits(agent as never, TURN_LIMIT_DEFAULTS);

    for (let i = 0; i < 4; i += 1) fire(BeforeToolCallEvent, toolCallEvent());
    fire(BeforeInvocationEvent, {});

    const next = toolCallEvent();
    fire(BeforeToolCallEvent, next);
    expect(next.cancel).toBe(false);
  });

  it('truncates a tool result that exceeds the byte bound', () => {
    const { agent, fire } = fakeAgent();
    registerTurnLimits(agent as never, { ...TURN_LIMIT_DEFAULTS, toolResultMaxBytes: 512 });

    const event = {
      result: new ToolResultBlock({
        toolUseId: 't1',
        status: 'success',
        content: [new TextBlock('n'.repeat(5000))],
      }),
    };
    fire(AfterToolCallEvent, event);

    expect(Buffer.byteLength(JSON.stringify(event.result), 'utf8')).toBeLessThanOrEqual(512);
    expect(JSON.stringify(event.result)).toContain('truncated');
  });

  it('leaves a tool result within the bound untouched', () => {
    const { agent, fire } = fakeAgent();
    registerTurnLimits(agent as never, TURN_LIMIT_DEFAULTS);

    const original = new ToolResultBlock({
      toolUseId: 't1',
      status: 'success',
      content: [new TextBlock('short answer')],
    });
    const event = { result: original };
    fire(AfterToolCallEvent, event);

    expect(event.result).toBe(original);
  });

  it('drops the oldest messages when the model input exceeds the byte bound', () => {
    const messages = Array.from({ length: 6 }, (_v, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: [{ type: 'text', text: `${i}`.repeat(400) }],
    }));
    const newest = messages[5];
    const { agent, fire } = fakeAgent(messages);
    registerTurnLimits(agent as never, { ...TURN_LIMIT_DEFAULTS, modelInputMaxBytes: 1200 });

    fire(BeforeModelCallEvent, { agent });

    expect(agent.messages.length).toBeLessThan(6);
    // The newest message is the friend's current request; dropping it would
    // answer a different question than the one that was asked.
    expect(agent.messages.at(-1)).toBe(newest);
  });
});
