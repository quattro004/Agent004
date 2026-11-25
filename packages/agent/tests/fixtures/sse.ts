/**
 * A `ServerResponse` double that records the SSE stream the handler writes.
 *
 * It is an `EventEmitter` because the disconnect signal the handler relies on
 * is `res.on('close')` firing while `writableFinished` is still false (wiki
 * `Gotchas`).
 */
import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';

export interface SseEventFrame {
  type: string;
  [key: string]: unknown;
}

export interface ResponseDouble {
  res: ServerResponse;
  /** Status and headers from `writeHead`, or undefined if never called. */
  head: () => { status: number; headers: Record<string, string> } | undefined;
  /** The raw bytes written, for framing assertions. */
  raw: () => string;
  /** Every `data:` frame, parsed, in order. */
  events: () => SseEventFrame[];
  /** The first event of a given type, for the common single-event assertions. */
  event: (type: string) => SseEventFrame | undefined;
  /** The client vanishing: 'close' arrives before the response finished. */
  disconnect: () => void;
  /** Resolves when the handler calls `res.end()`. */
  end: Promise<void>;
}

export function makeRes(): ResponseDouble {
  const chunks: string[] = [];
  let head: { status: number; headers: Record<string, string> } | undefined;
  let resolveEnd!: () => void;
  const ended = new Promise<void>((r) => (resolveEnd = r));

  const emitter = new EventEmitter();
  const res = Object.assign(emitter, {
    writableFinished: false,
    writeHead(status: number, headers?: Record<string, string>) {
      head = { status, headers: headers ?? {} };
      return res;
    },
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    },
    end(chunk?: string) {
      if (chunk) chunks.push(chunk);
      (res as unknown as { writableFinished: boolean }).writableFinished = true;
      resolveEnd();
      emitter.emit('close');
      return res;
    },
  }) as unknown as ServerResponse;

  const raw = () => chunks.join('');
  const events = () =>
    raw()
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => JSON.parse(line.slice('data: '.length)) as SseEventFrame);

  return {
    res,
    head: () => head,
    raw,
    events,
    event: (type: string) => events().find((e) => e.type === type),
    disconnect: () => emitter.emit('close'),
    end: ended,
  };
}
