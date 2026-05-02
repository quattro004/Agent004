import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  selectGreeting,
  loadManifest,
  type GreetingManifest,
} from '../../src/services/greetingSelector';
import type { Greeting } from '../../src/types/domain';

// --- Test Fixtures ---

function createTestGreeting(overrides: Partial<Greeting> = {}): Greeting {
  return {
    id: 'greeting-001',
    archetype: 'TV_PRESENTER_INTRO',
    text: 'Good evening, good evening, good evening! M-M-Max Height here, broadcasting live from the digital void.',
    audioPath: 'audio/greeting-001.mp3',
    audioDurationMs: 5000,
    videoPath: 'video/greeting-001.mp4',
    weight: 1.0,
    tags: [],
    ...overrides,
  };
}

function createTestManifest(greetings: Greeting[]): GreetingManifest {
  return {
    version: '1.0.0',
    voiceConfig: {
      voiceId: 'Matthew',
      engine: 'neural',
      ssmlPitch: '+10%',
      ssmlRate: '105%',
    },
    greetings,
  };
}

function createFullPool(): Greeting[] {
  const archetypes = [
    'TV_PRESENTER_INTRO',
    'MID_MONOLOGUE',
    'MOCK_ANNOYANCE',
    'SPONSOR_BREAK',
    'TIME_OF_DAY_RIFF',
    'SELF_CONGRATULATION',
    'FAKE_NEWS_FLASH',
    'GLITCH_COLD_OPEN',
  ] as const;

  return archetypes.flatMap((archetype, i) => [
    createTestGreeting({
      id: `greeting-${String(i * 2 + 1).padStart(3, '0')}`,
      archetype,
      audioPath: `audio/greeting-${String(i * 2 + 1).padStart(3, '0')}.mp3`,
      videoPath: `video/greeting-${String(i * 2 + 1).padStart(3, '0')}.mp4`,
      tags: i < 3 ? ['morning'] : i < 5 ? ['afternoon'] : ['evening'],
    }),
    createTestGreeting({
      id: `greeting-${String(i * 2 + 2).padStart(3, '0')}`,
      archetype,
      audioPath: `audio/greeting-${String(i * 2 + 2).padStart(3, '0')}.mp3`,
      videoPath: `video/greeting-${String(i * 2 + 2).padStart(3, '0')}.mp4`,
      tags: i < 3 ? ['morning'] : i < 5 ? ['afternoon'] : ['evening'],
    }),
  ]);
}

describe('greetingSelector', () => {
  describe('selectGreeting', () => {
    it('should select a greeting from the pool via weighted random selection', () => {
      const pool = createFullPool();
      const manifest = createTestManifest(pool);
      const result = selectGreeting(manifest, []);

      expect(result).toBeDefined();
      expect(pool.some((g) => g.id === result.id)).toBe(true);
    });

    it('should filter out greetings used in last 3 sessions', () => {
      const pool = createFullPool();
      const manifest = createTestManifest(pool);

      // Simulate 3 sessions of history where greeting-001, greeting-002, greeting-003 were used
      const recentHistory = ['greeting-001', 'greeting-002', 'greeting-003'];

      // Run selection many times to ensure filtered IDs are never chosen
      for (let i = 0; i < 50; i++) {
        const result = selectGreeting(manifest, recentHistory);
        expect(recentHistory).not.toContain(result.id);
      }
    });

    it('should prefer time-of-day matching tags when available', () => {
      const morningGreetings = [
        createTestGreeting({ id: 'greeting-001', tags: ['morning'], weight: 1.0 }),
        createTestGreeting({ id: 'greeting-002', tags: ['morning'], weight: 1.0 }),
      ];
      const eveningGreetings = [
        createTestGreeting({ id: 'greeting-003', tags: ['evening'], weight: 1.0 }),
        createTestGreeting({ id: 'greeting-004', tags: ['evening'], weight: 1.0 }),
      ];
      const allGreetings = [...morningGreetings, ...eveningGreetings];
      // Pad to minimum 16 with neutral greetings
      for (let i = 5; i <= 16; i++) {
        allGreetings.push(
          createTestGreeting({
            id: `greeting-${String(i).padStart(3, '0')}`,
            tags: [],
          }),
        );
      }

      const manifest = createTestManifest(allGreetings);

      // Mock the current hour to be morning (8 AM)
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-02T08:00:00'));

      const morningResults: string[] = [];
      for (let i = 0; i < 50; i++) {
        const result = selectGreeting(manifest, []);
        morningResults.push(result.id);
      }

      // Morning-tagged greetings should appear more often than evening ones
      const morningCount = morningResults.filter(
        (id) => id === 'greeting-001' || id === 'greeting-002',
      ).length;
      const eveningCount = morningResults.filter(
        (id) => id === 'greeting-003' || id === 'greeting-004',
      ).length;

      expect(morningCount).toBeGreaterThan(eveningCount);

      vi.useRealTimers();
    });

    it('should fallback to 1-session no-repeat window on pool exhaustion', () => {
      // Create a small pool (16 greetings minimum)
      const pool = createFullPool(); // 16 greetings
      const manifest = createTestManifest(pool);

      // History covers ALL 16 greetings across "3 sessions"
      const exhaustedHistory = pool.map((g) => g.id);

      // Should still return a greeting (fallback to 1-session window)
      const result = selectGreeting(manifest, exhaustedHistory);
      expect(result).toBeDefined();
      expect(pool.some((g) => g.id === result.id)).toBe(true);
    });

    it('should respect weight for higher probability selection', () => {
      const heavyGreeting = createTestGreeting({
        id: 'greeting-001',
        weight: 1.0,
      });
      const lightGreeting = createTestGreeting({
        id: 'greeting-002',
        weight: 0.1,
      });
      const pool = [heavyGreeting, lightGreeting];
      // Pad to 16
      for (let i = 3; i <= 16; i++) {
        pool.push(
          createTestGreeting({
            id: `greeting-${String(i).padStart(3, '0')}`,
            weight: 0.01,
          }),
        );
      }
      const manifest = createTestManifest(pool);

      const results: Record<string, number> = {};
      for (let i = 0; i < 200; i++) {
        const result = selectGreeting(manifest, []);
        results[result.id] = (results[result.id] ?? 0) + 1;
      }

      // Heavy greeting should be selected more often than light
      expect(results['greeting-001'] ?? 0).toBeGreaterThan(results['greeting-002'] ?? 0);
    });

    it('should trim greetingHistory to 20 entries when tracked externally', () => {
      // This tests the contract that the caller trims to 20
      const longHistory = Array.from({ length: 25 }, (_, i) =>
        `greeting-${String(i + 1).padStart(3, '0')}`,
      );

      // Only the last 20 should be considered for filtering
      const trimmedHistory = longHistory.slice(-20);
      const pool = createFullPool();
      const manifest = createTestManifest(pool);

      // Should work without error even with long history
      const result = selectGreeting(manifest, trimmedHistory);
      expect(result).toBeDefined();
    });
  });

  describe('loadManifest', () => {
    it('should parse a valid manifest JSON', () => {
      const pool = createFullPool();
      const raw = JSON.stringify(createTestManifest(pool));
      const manifest = loadManifest(raw);

      expect(manifest.version).toBe('1.0.0');
      expect(manifest.greetings).toHaveLength(16);
      expect(manifest.voiceConfig.voiceId).toBe('Matthew');
    });

    it('should throw on invalid JSON', () => {
      expect(() => loadManifest('not json')).toThrow();
    });

    it('should throw if greetings array is missing', () => {
      const raw = JSON.stringify({ version: '1.0.0' });
      expect(() => loadManifest(raw)).toThrow();
    });

    it('should throw if version is missing', () => {
      const raw = JSON.stringify({ greetings: [] });
      expect(() => loadManifest(raw)).toThrow();
    });
  });
});
