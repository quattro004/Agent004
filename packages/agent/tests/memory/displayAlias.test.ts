import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSystemPrompt, type SystemPromptOptions } from '../../src/personality/systemPrompt.js';

// Mock memory adapter
const mockRetrieveMemories = vi.fn();

vi.mock('../../src/memory/memoryAdapter.js', () => ({
  createMemoryAdapter: () => ({
    retrieveMemories: mockRetrieveMemories,
    getNamespace: (actorId: string) => `/max-height/${actorId}/`,
  }),
}));

describe('displayAlias server-side collection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildSystemPrompt with memory context', () => {
    it('includes memory context when memories are provided', () => {
      const options: SystemPromptOptions = {
        displayAlias: 'Sarah',
        memories: [
          { content: 'Visitor enjoys Depeche Mode', type: 'PREFERENCE' },
          { content: 'Visitor works as a software engineer', type: 'FACT' },
        ],
      };

      const prompt = buildSystemPrompt(options);

      expect(prompt).toContain('Sarah');
      expect(prompt).toContain('Depeche Mode');
      expect(prompt).toContain('software engineer');
    });

    it('includes memory section header when memories exist', () => {
      const options: SystemPromptOptions = {
        memories: [{ content: 'Previously discussed 80s music', type: 'TOPIC' }],
      };

      const prompt = buildSystemPrompt(options);

      expect(prompt).toContain('# Prior-session context');
    });

    it('does not include memory section when no memories', () => {
      const options: SystemPromptOptions = {
        memories: [],
      };

      const prompt = buildSystemPrompt(options);

      expect(prompt).not.toContain('# Prior-session context');
    });

    it('does not include memory section when memories undefined', () => {
      const prompt = buildSystemPrompt();

      expect(prompt).not.toContain('# Prior-session context');
    });

    it('loads displayAlias from memory when not provided directly', () => {
      const options: SystemPromptOptions = {
        memories: [{ content: 'Visitor name: Dave', type: 'FACT' }],
        displayAliasFromMemory: 'Dave',
      };

      const prompt = buildSystemPrompt(options);

      expect(prompt).toContain('Dave');
      expect(prompt).toContain('Current viewer');
    });

    it('prefers directly provided displayAlias over memory displayAlias', () => {
      const options: SystemPromptOptions = {
        displayAlias: 'CurrentName',
        displayAliasFromMemory: 'OldName',
        memories: [],
      };

      const prompt = buildSystemPrompt(options);

      expect(prompt).toContain('CurrentName');
      expect(prompt).not.toContain('OldName');
    });

    it('formats different memory types appropriately', () => {
      const options: SystemPromptOptions = {
        memories: [
          { content: 'Lives in Portland', type: 'FACT' },
          { content: 'Loves sci-fi movies', type: 'PREFERENCE' },
          { content: 'Discussed AI and the future of work at length', type: 'SUMMARY' },
          { content: 'artificial intelligence', type: 'TOPIC' },
        ],
      };

      const prompt = buildSystemPrompt(options);

      expect(prompt).toContain('Portland');
      expect(prompt).toContain('sci-fi');
      expect(prompt).toContain('AI');
    });

    it('limits memory context to prevent prompt overflow', () => {
      // Create many long memories
      const memories = Array.from({ length: 50 }, (_, i) => ({
        content: `Memory item ${i}: ${'x'.repeat(400)}`,
        type: 'FACT' as const,
      }));

      const options: SystemPromptOptions = { memories };
      const prompt = buildSystemPrompt(options);

      // Memory section should be capped — exact limit TBD but should not exceed ~2000 chars
      const memorySection = prompt.split('# Prior-session context')[1] || '';
      expect(memorySection.length).toBeLessThan(3000);
    });
  });

  describe('displayAlias from memory on session start', () => {
    it('uses displayAlias from memory for returning visitors', () => {
      const options: SystemPromptOptions = {
        displayAliasFromMemory: 'ReturningVisitor',
      };

      const prompt = buildSystemPrompt(options);
      expect(prompt).toContain('ReturningVisitor');
    });

    it('handles null displayAlias from memory gracefully', () => {
      const options: SystemPromptOptions = {
        displayAliasFromMemory: undefined,
      };

      const prompt = buildSystemPrompt(options);
      expect(prompt).not.toContain('Current viewer');
    });
  });
});
