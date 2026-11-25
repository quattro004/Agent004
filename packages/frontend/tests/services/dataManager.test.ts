import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  deleteMemory,
  exportMemories,
  forgetMe,
  listMemories,
  MemoryActionError,
  type ActionRunner,
} from '../../src/services/dataManager';
import { useConversationStore } from '../../src/stores/conversationStore';
import { useVisitorStore } from '../../src/stores/visitorStore';

const RECORDS = [
  {
    id: 'fact-1',
    text: 'The viewer likes synthesizers.',
    kind: 'fact',
    createdAt: '2026-11-15T00:00:00.000Z',
  },
];

function runner(outcome: Awaited<ReturnType<ActionRunner>>) {
  return vi.fn<ActionRunner>(async () => outcome);
}

describe('dataManager', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('listMemories', () => {
    it('asks the agent for memory.list and returns its records', async () => {
      const run = runner({ ok: true, data: { records: RECORDS } });

      await expect(listMemories(run)).resolves.toEqual(RECORDS);
      expect(run).toHaveBeenCalledWith({ action: 'memory.list' });
    });

    it('throws with the error code when the agent refuses', async () => {
      const run = runner({ ok: false, code: 'rate_limited' });

      await expect(listMemories(run)).rejects.toMatchObject({
        name: 'MemoryActionError',
        code: 'rate_limited',
      });
    });

    it('does not fall back to anything in localStorage when the agent cannot be reached', async () => {
      localStorage.setItem('max-height-greeting-history', '["g-001"]');
      const run = runner({ ok: false, code: 'transport' });

      await expect(listMemories(run)).rejects.toBeInstanceOf(MemoryActionError);
    });

    it('rejects a reply that is not a list of records', async () => {
      const run = runner({ ok: true, data: { nope: true } });

      await expect(listMemories(run)).rejects.toMatchObject({ code: 'malformed' });
    });

    it('rejects records with missing or invalid fields', async () => {
      const run = runner({
        ok: true,
        data: {
          records: [
            {
              id: 'fact-1',
              text: 'The viewer likes synthesizers.',
              kind: 'unknown',
              createdAt: '',
            },
          ],
        },
      });

      await expect(listMemories(run)).rejects.toMatchObject({ code: 'malformed' });
    });
  });

  describe('exportMemories', () => {
    function stubDownload() {
      const createObjectURL = vi.fn().mockReturnValue('blob:test-url');
      const revokeObjectURL = vi.fn();
      vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
      const anchor = { href: '', download: '', click: vi.fn() };
      vi.spyOn(document, 'createElement').mockReturnValue(anchor as unknown as HTMLElement);
      return { createObjectURL, revokeObjectURL, anchor };
    }

    async function textOf(blob: Blob): Promise<string> {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsText(blob);
      });
    }

    it('downloads what memory.export returned as a .json file', async () => {
      const { createObjectURL, anchor } = stubDownload();
      const data = { exportedAt: '2026-11-16T00:00:00.000Z', records: RECORDS };
      const run = runner({ ok: true, data });

      await exportMemories(run);

      expect(run).toHaveBeenCalledWith({ action: 'memory.export' });
      expect(JSON.parse(await textOf(createObjectURL.mock.calls[0][0] as Blob))).toEqual(data);
      expect(anchor.click).toHaveBeenCalled();
      expect(anchor.download).toMatch(/^max-height-memories-.*\.json$/);
    });

    it('downloads nothing when the export fails', async () => {
      const { createObjectURL, anchor } = stubDownload();

      await expect(exportMemories(runner({ ok: false, code: 'internal' }))).rejects.toBeInstanceOf(
        MemoryActionError,
      );
      expect(createObjectURL).not.toHaveBeenCalled();
      expect(anchor.click).not.toHaveBeenCalled();
    });

    it('never includes the visitor store in the export', async () => {
      const { createObjectURL } = stubDownload();
      useVisitorStore.setState({ actorId: 'local-actor', displayAlias: 'Local' });

      await exportMemories(runner({ ok: true, data: { exportedAt: 'x', records: [] } }));

      expect(await textOf(createObjectURL.mock.calls[0][0] as Blob)).not.toContain('local-actor');
    });

    it('rejects an export payload without an exportedAt timestamp', async () => {
      const { createObjectURL } = stubDownload();

      await expect(
        exportMemories(runner({ ok: true, data: { records: [] } })),
      ).rejects.toMatchObject({ code: 'malformed' });
      expect(createObjectURL).not.toHaveBeenCalled();
    });
  });

  describe('deleteMemory', () => {
    it('sends memory.delete with the record id', async () => {
      const run = runner({ ok: true, data: { deleted: 1 } });

      await deleteMemory(run, 'fact-1');

      expect(run).toHaveBeenCalledWith({ action: 'memory.delete', memoryRecordId: 'fact-1' });
    });

    it('rejects a delete payload that does not confirm one deletion', async () => {
      await expect(
        deleteMemory(runner({ ok: true, data: { deleted: 0 } }), 'fact-1'),
      ).rejects.toMatchObject({ code: 'malformed' });
    });

    it("throws not_found for a record that is not the friend's", async () => {
      await expect(
        deleteMemory(runner({ ok: false, code: 'not_found' }), 'x'),
      ).rejects.toMatchObject({
        code: 'not_found',
      });
    });
  });

  describe('forgetMe', () => {
    function seedLocalState() {
      localStorage.setItem('max-height-actorId', 'abc-123');
      localStorage.setItem('max-height-settings', '{}');
      localStorage.setItem('other-app-key', 'should-stay');
      useConversationStore.getState().setFullText('hello');
    }

    it('wipes remote memory first, then every max-height-* key and store', async () => {
      seedLocalState();
      const run = vi.fn<ActionRunner>(async () => {
        // Local state must still be intact while the remote wipe is in flight.
        expect(localStorage.getItem('max-height-actorId')).toBe('abc-123');
        return { ok: true, data: { recordsDeleted: 3, eventsDeleted: 5 } };
      });

      const result = await forgetMe(run);

      expect(run).toHaveBeenCalledWith({ action: 'memory.forget' });
      expect(result).toEqual({ recordsDeleted: 3, eventsDeleted: 5 });
      // The visitor store mints a fresh ID when reset, so the old one is gone but the key is not.
      expect(localStorage.getItem('max-height-actorId')).not.toBe('abc-123');
      expect(localStorage.getItem('max-height-settings')).toBeNull();
      expect(localStorage.getItem('other-app-key')).toBe('should-stay');
      expect(useConversationStore.getState().currentResponseText).toBe('');
    });

    it('never reports success after a partial wipe: local state survives a failure', async () => {
      seedLocalState();

      await expect(forgetMe(runner({ ok: false, code: 'internal' }))).rejects.toMatchObject({
        code: 'internal',
      });

      expect(localStorage.getItem('max-height-actorId')).toBe('abc-123');
      expect(useConversationStore.getState().currentResponseText).toBe('hello');
    });
  });
});
