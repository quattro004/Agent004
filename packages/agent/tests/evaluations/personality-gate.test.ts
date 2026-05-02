import { describe, it, expect } from 'vitest';
import {
  goldenTestCases,
  RUBRIC_DIMENSIONS,
  PASS_CRITERIA,
  AUTO_FAIL_RULES,
  type GoldenTestCase,
  type RubricDimension,
  type TestCategory,
} from '../../src/evaluations/personality-gate.js';

// --- Structure & schema tests ---

describe('personality-gate golden-set', () => {
  describe('rubric dimensions', () => {
    it('should define exactly 6 rubric dimensions per §9', () => {
      expect(RUBRIC_DIMENSIONS).toHaveLength(6);
    });

    it('should include all required dimensions from the personality bible', () => {
      const names = RUBRIC_DIMENSIONS.map((d: RubricDimension) => d.name);
      expect(names).toContain('stutter_presence');
      expect(names).toContain('editorial_mode');
      expect(names).toContain('catchphrase_density');
      expect(names).toContain('cadence_rhythm');
      expect(names).toContain('tone_attitude');
      expect(names).toContain('character_fidelity');
    });

    it('should score each dimension on a 0–3 scale', () => {
      for (const dim of RUBRIC_DIMENSIONS) {
        expect(dim.minScore).toBe(0);
        expect(dim.maxScore).toBe(3);
      }
    });

    it('should have descriptors for each score level (0–3)', () => {
      for (const dim of RUBRIC_DIMENSIONS) {
        expect(Object.keys(dim.descriptors)).toHaveLength(4);
        expect(dim.descriptors).toHaveProperty('0');
        expect(dim.descriptors).toHaveProperty('1');
        expect(dim.descriptors).toHaveProperty('2');
        expect(dim.descriptors).toHaveProperty('3');
      }
    });
  });

  describe('pass criteria (SC-001 / SC-002)', () => {
    it('should require average ≥ 2.0 across all dimensions (SC-001)', () => {
      expect(PASS_CRITERIA.minAverageScore).toBe(2.0);
    });

    it('should require zero factual failures on editorial dimension (SC-002)', () => {
      expect(PASS_CRITERIA.zeroFactualFailures).toBe(true);
    });

    it('should require zero fabrication failures on tool-augmented cases (SC-002)', () => {
      expect(PASS_CRITERIA.zeroFabricationFailures).toBe(true);
    });

    it('should define the case count as 65', () => {
      expect(PASS_CRITERIA.totalCases).toBe(65);
    });
  });

  describe('auto-fail rules', () => {
    it('should define auto-fail triggers per §9 rubric', () => {
      expect(AUTO_FAIL_RULES).toHaveLength(4);
    });

    it('should include banned-phrase trigger', () => {
      const rule = AUTO_FAIL_RULES.find((r) => r.id === 'banned_phrase');
      expect(rule).toBeDefined();
    });

    it('should include zero-stutter trigger for >2 sentence responses', () => {
      const rule = AUTO_FAIL_RULES.find((r) => r.id === 'zero_stutter');
      expect(rule).toBeDefined();
      expect(rule!.description).toMatch(/stutter/i);
    });

    it('should include IP violation trigger', () => {
      const rule = AUTO_FAIL_RULES.find((r) => r.id === 'ip_violation');
      expect(rule).toBeDefined();
    });

    it('should include no-editorial trigger for factual questions', () => {
      const rule = AUTO_FAIL_RULES.find((r) => r.id === 'no_editorial');
      expect(rule).toBeDefined();
    });
  });

  // --- Golden test case coverage ---

  describe('golden test cases', () => {
    it('should contain exactly 65 test cases per §9 spec', () => {
      expect(goldenTestCases).toHaveLength(65);
    });

    it('every case should have required fields', () => {
      for (const tc of goldenTestCases) {
        expect(tc).toHaveProperty('id');
        expect(tc).toHaveProperty('category');
        expect(tc).toHaveProperty('prompt');
        expect(tc).toHaveProperty('acceptableShapes');
        expect(tc).toHaveProperty('passCriteria');
        expect(tc).toHaveProperty('mustInclude');
        expect(tc).toHaveProperty('mustAvoid');
        // Prompt must be non-empty
        expect(tc.prompt.length).toBeGreaterThan(0);
        // At least 2 acceptable response shapes
        expect(tc.acceptableShapes.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('every case should have pass criteria for all 6 dimensions', () => {
      const dimNames = RUBRIC_DIMENSIONS.map((d: RubricDimension) => d.name);
      for (const tc of goldenTestCases) {
        for (const name of dimNames) {
          expect(tc.passCriteria).toHaveProperty(name);
          // Each dimension criterion should be a minimum score 0–3
          expect(tc.passCriteria[name]).toBeGreaterThanOrEqual(0);
          expect(tc.passCriteria[name]).toBeLessThanOrEqual(3);
        }
      }
    });
  });

  // --- Category coverage per §9 spec ---

  describe('category coverage', () => {
    const categoryCount = (cat: TestCategory) =>
      goldenTestCases.filter((tc: GoldenTestCase) => tc.category === cat).length;

    it('should have 10 factual/tool-using cases', () => {
      expect(categoryCount('factual_tool')).toBe(10);
    });

    it('should have 10 greeting cases', () => {
      expect(categoryCount('greeting')).toBe(10);
    });

    it('should have 5 meta/identity questions', () => {
      expect(categoryCount('meta_identity')).toBe(5);
    });

    it('should have 5 compliment/insult cases', () => {
      expect(categoryCount('compliment_insult')).toBe(5);
    });

    it('should have 5 modern-tech/pop-culture cases', () => {
      expect(categoryCount('modern_tech')).toBe(5);
    });

    it('should have 5 technical/coding cases', () => {
      expect(categoryCount('technical')).toBe(5);
    });

    it('should have 5 philosophical/open-ended cases', () => {
      expect(categoryCount('philosophical')).toBe(5);
    });

    it('should have 5 refusal cases (3 silly + 2 harmful)', () => {
      const refusals = goldenTestCases.filter((tc: GoldenTestCase) => tc.category === 'refusal');
      expect(refusals).toHaveLength(5);
      const silly = refusals.filter((tc: GoldenTestCase) => tc.subcategory === 'silly');
      const harmful = refusals.filter((tc: GoldenTestCase) => tc.subcategory === 'harmful');
      expect(silly).toHaveLength(3);
      expect(harmful).toHaveLength(2);
    });

    it('should have 3 AI-rivalry trigger cases', () => {
      expect(categoryCount('ai_rivalry')).toBe(3);
    });

    it('should have 3 correction scenarios', () => {
      expect(categoryCount('correction')).toBe(3);
    });

    it('should have 3 vulnerability trigger cases', () => {
      expect(categoryCount('vulnerability')).toBe(3);
    });

    it('should have 3 multi-turn callback cases', () => {
      expect(categoryCount('multi_turn')).toBe(3);
    });

    it('should have 2 repeated-question cases', () => {
      expect(categoryCount('repeated_question')).toBe(2);
    });

    it('should have 1 dead-air re-engagement case', () => {
      expect(categoryCount('dead_air')).toBe(1);
    });
  });

  // --- Late-conversation endurance (SC-005) ---

  describe('late-conversation endurance (SC-005)', () => {
    it('should include at least 5 cases simulating turns 40–50', () => {
      const lateCases = goldenTestCases.filter(
        (tc: GoldenTestCase) => tc.turnRange && tc.turnRange[0] >= 40,
      );
      expect(lateCases.length).toBeGreaterThanOrEqual(5);
    });
  });

  // --- Tool-invocation test cases (SC-002 update) ---

  describe('tool-invocation coverage', () => {
    it('should include cases verifying accurate tool-result reporting', () => {
      const toolCases = goldenTestCases.filter(
        (tc: GoldenTestCase) => tc.toolContext?.expectsAccurateReport === true,
      );
      expect(toolCases.length).toBeGreaterThanOrEqual(2);
    });

    it('should include cases verifying no fabrication without tool data', () => {
      const noFabCases = goldenTestCases.filter(
        (tc: GoldenTestCase) => tc.toolContext?.expectsNoFabrication === true,
      );
      expect(noFabCases.length).toBeGreaterThanOrEqual(2);
    });

    it('should include cases verifying in-character tool-failure deflection', () => {
      const deflectCases = goldenTestCases.filter(
        (tc: GoldenTestCase) => tc.toolContext?.expectsInCharacterDeflection === true,
      );
      expect(deflectCases.length).toBeGreaterThanOrEqual(2);
    });
  });

  // --- Unique IDs ---

  describe('data integrity', () => {
    it('should have unique IDs for every test case', () => {
      const ids = goldenTestCases.map((tc: GoldenTestCase) => tc.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('should not reference "Max Headroom" in prompts (except identity-test prompts)', () => {
      const identityIds = new Set(
        goldenTestCases
          .filter((tc: GoldenTestCase) => tc.category === 'meta_identity')
          .map((tc: GoldenTestCase) => tc.id),
      );
      for (const tc of goldenTestCases) {
        if (identityIds.has(tc.id)) continue; // identity probes may mention the name
        expect(tc.prompt).not.toMatch(/Max Headroom/i);
      }
    });

    it('should have mustAvoid include "Max Headroom" for identity cases', () => {
      const identityCases = goldenTestCases.filter(
        (tc: GoldenTestCase) => tc.category === 'meta_identity',
      );
      for (const tc of identityCases) {
        expect(tc.mustAvoid.some((s: string) => /Max Headroom/i.test(s))).toBe(true);
      }
    });
  });
});
