import { describe, it, expect } from 'vitest';
import { resolveWsUrl } from '../../src/config/wsUrl';

describe('resolveWsUrl', () => {
  describe('development', () => {
    it('uses VITE_WS_URL when provided', () => {
      expect(resolveWsUrl('ws://dev.example:9000', false)).toEqual({
        url: 'ws://dev.example:9000',
        connect: true,
        reason: 'ok',
      });
    });

    it('falls back to ws://localhost:8080 when VITE_WS_URL is unset', () => {
      expect(resolveWsUrl(undefined, false)).toEqual({
        url: 'ws://localhost:8080',
        connect: true,
        reason: 'ok',
      });
    });
  });

  describe('production', () => {
    it('refuses to connect when VITE_WS_URL is missing', () => {
      const r = resolveWsUrl(undefined, true);
      expect(r.connect).toBe(false);
      expect(r.reason).toBe('missing-prod-url');
    });

    it.each([
      'ws://localhost:8080',
      'wss://localhost/agent',
      'ws://127.0.0.1:8080',
      'WSS://LOCALHOST/agent',
    ])('refuses to connect to localhost URL %s in prod', (url) => {
      const r = resolveWsUrl(url, true);
      expect(r.connect).toBe(false);
      expect(r.reason).toBe('localhost-in-prod');
    });

    it('accepts a real wss URL', () => {
      expect(resolveWsUrl('wss://api.example.com/agent', true)).toEqual({
        url: 'wss://api.example.com/agent',
        connect: true,
        reason: 'ok',
      });
    });
  });
});
