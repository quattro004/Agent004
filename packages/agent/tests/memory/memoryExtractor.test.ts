import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractMemories, type TurnContent } from '../../src/memory/memoryExtractor.js';

describe('MemoryExtractor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fact extraction', () => {
    it('extracts factual statements from conversation text', () => {
      const turns: TurnContent[] = [
        { role: 'user', text: 'I work as a software engineer at a startup' },
        { role: 'assistant', text: 'A s-s-software engineer! How MARVELLOUS!' },
      ];

      const result = extractMemories(turns, 'session-001');

      expect(result.memories.length).toBeGreaterThan(0);
      const facts = result.memories.filter((m) => m.type === 'FACT');
      expect(facts.length).toBeGreaterThan(0);
      expect(facts.some((f) => f.content.toLowerCase().includes('software engineer'))).toBe(true);
    });

    it('extracts multiple facts from a multi-turn conversation', () => {
      const turns: TurnContent[] = [
        { role: 'user', text: 'I live in Portland and I have two cats' },
        { role: 'assistant', text: 'Portland! With CATS! How d-d-domestic!' },
        { role: 'user', text: 'Yeah, I also really love playing guitar' },
        { role: 'assistant', text: 'A guitar player! In MY studio!' },
      ];

      const result = extractMemories(turns, 'session-001');

      const facts = result.memories.filter((m) => m.type === 'FACT');
      expect(facts.length).toBeGreaterThanOrEqual(2);
    });

    it('does not extract facts from assistant-only text', () => {
      const turns: TurnContent[] = [
        { role: 'assistant', text: 'I am Max Height, the greatest digital host!' },
      ];

      const result = extractMemories(turns, 'session-001');
      const facts = result.memories.filter((m) => m.type === 'FACT');
      expect(facts).toHaveLength(0);
    });
  });

  describe('preference detection', () => {
    it('detects preferences from user statements', () => {
      const turns: TurnContent[] = [
        { role: 'user', text: 'I really love sci-fi movies, especially Blade Runner' },
        { role: 'assistant', text: 'Blade Runner! Now THAT is cinema!' },
      ];

      const result = extractMemories(turns, 'session-001');
      const prefs = result.memories.filter((m) => m.type === 'PREFERENCE');
      expect(prefs.length).toBeGreaterThan(0);
      expect(
        prefs.some(
          (p) =>
            p.content.toLowerCase().includes('sci-fi') ||
            p.content.toLowerCase().includes('blade runner'),
        ),
      ).toBe(true);
    });

    it('detects dislike preferences', () => {
      const turns: TurnContent[] = [
        { role: 'user', text: "I can't stand reality TV shows" },
        { role: 'assistant', text: 'Finally someone with TASTE!' },
      ];

      const result = extractMemories(turns, 'session-001');
      const prefs = result.memories.filter((m) => m.type === 'PREFERENCE');
      expect(prefs.length).toBeGreaterThan(0);
    });
  });

  describe('displayAlias extraction', () => {
    it('extracts name from direct name response pattern', () => {
      const turns: TurnContent[] = [
        { role: 'assistant', text: 'W-w-what do they call you, dear viewer?' },
        { role: 'user', text: "I'm Sarah" },
      ];

      const result = extractMemories(turns, 'session-001');

      expect(result.displayAlias).toBe('Sarah');
    });

    it('extracts name from "my name is" pattern', () => {
      const turns: TurnContent[] = [
        { role: 'assistant', text: 'And what shall I call you?' },
        { role: 'user', text: 'My name is Dave' },
      ];

      const result = extractMemories(turns, 'session-001');
      expect(result.displayAlias).toBe('Dave');
    });

    it('extracts name from "call me" pattern', () => {
      const turns: TurnContent[] = [
        { role: 'assistant', text: 'W-what do they call you?' },
        { role: 'user', text: 'Just call me Alex' },
      ];

      const result = extractMemories(turns, 'session-001');
      expect(result.displayAlias).toBe('Alex');
    });

    it('extracts name from bare name response after name question', () => {
      const turns: TurnContent[] = [
        { role: 'assistant', text: "W-w-what's your name, friend?" },
        { role: 'user', text: 'Jordan' },
      ];

      const result = extractMemories(turns, 'session-001');
      expect(result.displayAlias).toBe('Jordan');
    });

    it('returns null when user declines to share name', () => {
      const turns: TurnContent[] = [
        { role: 'assistant', text: 'What do they call you?' },
        { role: 'user', text: "I'd rather not say" },
      ];

      const result = extractMemories(turns, 'session-001');
      expect(result.displayAlias).toBeNull();
    });

    it('returns null when no name exchange occurs', () => {
      const turns: TurnContent[] = [
        { role: 'user', text: 'Tell me about the weather' },
        { role: 'assistant', text: 'The WEATHER?!' },
      ];

      const result = extractMemories(turns, 'session-001');
      expect(result.displayAlias).toBeNull();
    });
  });

  describe('summary generation', () => {
    it('generates a summary for conversations with 5+ turns', () => {
      const turns: TurnContent[] = [
        { role: 'user', text: 'Hey Max!' },
        { role: 'assistant', text: 'Hello dear viewer!' },
        { role: 'user', text: 'Tell me about the 80s' },
        { role: 'assistant', text: 'The 80s were MAGNIFICENT!' },
        { role: 'user', text: 'What about the music?' },
        { role: 'assistant', text: 'Depeche Mode! Duran Duran!' },
        { role: 'user', text: 'I love Depeche Mode too' },
        { role: 'assistant', text: 'A person of TASTE!' },
        { role: 'user', text: 'What about TV shows?' },
        { role: 'assistant', text: 'Miami Vice! Knight Rider!' },
      ];

      const result = extractMemories(turns, 'session-001');
      const summaries = result.memories.filter((m) => m.type === 'SUMMARY');
      expect(summaries.length).toBeGreaterThan(0);
      expect(summaries[0].content.length).toBeGreaterThan(0);
      expect(summaries[0].content.length).toBeLessThanOrEqual(500);
    });

    it('does not generate summary for very short conversations', () => {
      const turns: TurnContent[] = [
        { role: 'user', text: 'Hi' },
        { role: 'assistant', text: 'Hello!' },
      ];

      const result = extractMemories(turns, 'session-001');
      const summaries = result.memories.filter((m) => m.type === 'SUMMARY');
      expect(summaries).toHaveLength(0);
    });
  });

  describe('topic extraction', () => {
    it('extracts topics discussed in depth', () => {
      const turns: TurnContent[] = [
        { role: 'user', text: 'What do you think about artificial intelligence?' },
        { role: 'assistant', text: 'AI? I WAS AI before AI was cool!' },
        { role: 'user', text: 'But what about the future of AI and jobs?' },
        { role: 'assistant', text: 'Jobs? They had JOBS in the 80s!' },
        { role: 'user', text: 'Do you think AI will replace TV hosts?' },
        { role: 'assistant', text: 'Replace ME?! IMPOSSIBLE!' },
      ];

      const result = extractMemories(turns, 'session-001');
      const topics = result.memories.filter((m) => m.type === 'TOPIC');
      expect(topics.length).toBeGreaterThan(0);
      expect(
        topics.some(
          (t) =>
            t.content.toLowerCase().includes('ai') ||
            t.content.toLowerCase().includes('artificial intelligence'),
        ),
      ).toBe(true);
    });
  });

  describe('deduplication', () => {
    it('deduplicates memories with similar content', () => {
      const turns: TurnContent[] = [
        { role: 'user', text: 'I love sci-fi movies' },
        { role: 'assistant', text: 'Sci-fi!' },
        { role: 'user', text: 'Yeah I really enjoy science fiction films' },
        { role: 'assistant', text: 'MARVELLOUS!' },
      ];

      const result = extractMemories(turns, 'session-001');
      const prefs = result.memories.filter((m) => m.type === 'PREFERENCE');
      // Should deduplicate "loves sci-fi movies" and "enjoys science fiction films"
      expect(prefs.length).toBeLessThanOrEqual(2);
    });
  });

  describe('sourceSessionId tagging', () => {
    it('tags all extracted memories with the source session ID', () => {
      const turns: TurnContent[] = [
        { role: 'user', text: 'I work as a chef in New York' },
        { role: 'assistant', text: 'A chef! In NEW YORK!' },
      ];

      const result = extractMemories(turns, 'session-xyz');

      for (const memory of result.memories) {
        expect(memory.sourceSessionId).toBe('session-xyz');
      }
    });
  });

  describe('content length constraint', () => {
    it('keeps each memory content within 500 chars', () => {
      const longText =
        'I really enjoy ' + 'very '.repeat(100) + 'long conversations about many topics';
      const turns: TurnContent[] = [
        { role: 'user', text: longText },
        { role: 'assistant', text: 'MARVELLOUS!' },
      ];

      const result = extractMemories(turns, 'session-001');

      for (const memory of result.memories) {
        expect(memory.content.length).toBeLessThanOrEqual(500);
      }
    });
  });
});
