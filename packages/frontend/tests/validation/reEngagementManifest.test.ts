/**
 * T128: Build-time validation for re-engagement manifest.
 * Validates re-engagement-manifest.json against the contract schema.
 *
 * Checks:
 * 1. JSON Schema compliance (required fields, types, patterns)
 * 2. All 6 archetypes have ≥ 2 entries
 * 3. No duplicate IDs
 * 4. Minimum 12 entries total
 * 5. Audio/video paths follow naming convention
 */
import { describe, it, expect } from 'vitest';
import { validateReEngagementManifest } from '../../src/validation/validateReEngagementManifest';
import type { ReEngagementManifest } from '../../src/validation/validateReEngagementManifest';

const VALID_MANIFEST: ReEngagementManifest = {
  version: '1.0.0',
  reEngagements: [
    {
      id: 're-engagement-001',
      archetype: 'SIGNAL_CHECK',
      text: 'H-h-hello? Is this thing still on? I can see the little light blinking.',
      audioPath: 'audio/re-engagement-001.mp3',
      audioDurationMs: 5500,
      videoPath: 'video/re-engagement-001.mp4',
      weight: 1.0,
    },
    {
      id: 're-engagement-002',
      archetype: 'SIGNAL_CHECK',
      text: 'Still there? Blink twice if you can hear me. Or type something.',
      audioPath: 'audio/re-engagement-002.mp3',
      audioDurationMs: 4000,
      videoPath: 'video/re-engagement-002.mp4',
      weight: 1.0,
    },
    {
      id: 're-engagement-003',
      archetype: 'FAKE_CONCERN',
      text: 'Should I be worried? Did you fall asleep on me? I never believed it until now.',
      audioPath: 'audio/re-engagement-003.mp3',
      audioDurationMs: 5500,
      videoPath: 'video/re-engagement-003.mp4',
      weight: 1.0,
    },
    {
      id: 're-engagement-004',
      archetype: 'FAKE_CONCERN',
      text: 'I am getting concerned. Not genuinely, you understand. Are you okay out there?',
      audioPath: 'audio/re-engagement-004.mp3',
      audioDurationMs: 4500,
      videoPath: 'video/re-engagement-004.mp4',
      weight: 1.0,
    },
    {
      id: 're-engagement-005',
      archetype: 'RAMBLING_FILL',
      text: 'You know, while you are away, I have been thinking about the nature of digital existence.',
      audioPath: 'audio/re-engagement-005.mp3',
      audioDurationMs: 6500,
      videoPath: 'video/re-engagement-005.mp4',
      weight: 1.0,
    },
    {
      id: 're-engagement-006',
      archetype: 'RAMBLING_FILL',
      text: 'Did you know that technically I am made of math? Just m-math and electricity.',
      audioPath: 'audio/re-engagement-006.mp3',
      audioDurationMs: 4500,
      videoPath: 'video/re-engagement-006.mp4',
      weight: 1.0,
    },
    {
      id: 're-engagement-007',
      archetype: 'SELF_ENTERTAINMENT',
      text: 'Do not mind me, I will just entertain m-m-myself. La la la. See? I am fine.',
      audioPath: 'audio/re-engagement-007.mp3',
      audioDurationMs: 5500,
      videoPath: 'video/re-engagement-007.mp4',
      weight: 1.0,
    },
    {
      id: 're-engagement-008',
      archetype: 'SELF_ENTERTAINMENT',
      text: 'I am counting my own pixels again. It is oddly soothing. Anyway whenever you are r-ready.',
      audioPath: 'audio/re-engagement-008.mp3',
      audioDurationMs: 4000,
      videoPath: 'video/re-engagement-008.mp4',
      weight: 1.0,
    },
    {
      id: 're-engagement-009',
      archetype: 'MOCK_SIGN_OFF',
      text: 'Well, if you are not going to talk to me, maybe I will just — no. No, I will stay.',
      audioPath: 'audio/re-engagement-009.mp3',
      audioDurationMs: 5500,
      videoPath: 'video/re-engagement-009.mp4',
      weight: 1.0,
    },
    {
      id: 're-engagement-010',
      archetype: 'MOCK_SIGN_OFF',
      text: 'Fine. I will just go then. Except I c-can not. Because I live here. So. Here we are.',
      audioPath: 'audio/re-engagement-010.mp3',
      audioDurationMs: 4000,
      videoPath: 'video/re-engagement-010.mp4',
      weight: 1.0,
    },
    {
      id: 're-engagement-011',
      archetype: 'AUDIENCE_ADDRESS',
      text: 'Ladies and gentlemen, it appears my guest has left the building. We will wait. Patiently.',
      audioPath: 'audio/re-engagement-011.mp3',
      audioDurationMs: 5500,
      videoPath: 'video/re-engagement-011.mp4',
      weight: 1.0,
    },
    {
      id: 're-engagement-012',
      archetype: 'AUDIENCE_ADDRESS',
      text: 'To our viewers at home — this is what happens when you let the audience run the show.',
      audioPath: 'audio/re-engagement-012.mp3',
      audioDurationMs: 4500,
      videoPath: 'video/re-engagement-012.mp4',
      weight: 1.0,
    },
  ],
};

describe('validateReEngagementManifest', () => {
  it('should pass for a valid manifest with all 6 archetypes covered', () => {
    const result = validateReEngagementManifest(VALID_MANIFEST);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject manifest with fewer than 12 entries', () => {
    const manifest = {
      ...VALID_MANIFEST,
      reEngagements: VALID_MANIFEST.reEngagements.slice(0, 10),
    };
    const result = validateReEngagementManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('12'))).toBe(true);
  });

  it('should reject manifest with duplicate IDs', () => {
    const entries = [...VALID_MANIFEST.reEngagements];
    entries[1] = { ...entries[1], id: entries[0].id };
    const manifest = { ...VALID_MANIFEST, reEngagements: entries };
    const result = validateReEngagementManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('duplicate') || e.includes('Duplicate'))).toBe(
      true,
    );
  });

  it('should reject manifest missing an archetype (< 2 per archetype)', () => {
    // Remove both AUDIENCE_ADDRESS entries, replace with extra SIGNAL_CHECK
    const entries = VALID_MANIFEST.reEngagements.filter((e) => e.archetype !== 'AUDIENCE_ADDRESS');
    entries.push({
      ...entries[0],
      id: 're-engagement-099',
      archetype: 'SIGNAL_CHECK',
    });
    entries.push({
      ...entries[0],
      id: 're-engagement-098',
      archetype: 'SIGNAL_CHECK',
    });
    const manifest = { ...VALID_MANIFEST, reEngagements: entries };
    const result = validateReEngagementManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('AUDIENCE_ADDRESS'))).toBe(true);
  });

  it('should reject entry with invalid ID pattern', () => {
    const entries = [...VALID_MANIFEST.reEngagements];
    entries[0] = { ...entries[0], id: 'bad-id' };
    const manifest = { ...VALID_MANIFEST, reEngagements: entries };
    const result = validateReEngagementManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('id') || e.includes('pattern'))).toBe(true);
  });

  it('should reject entry with invalid archetype', () => {
    const entries = [...VALID_MANIFEST.reEngagements];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    entries[0] = { ...entries[0], archetype: 'INVALID_TYPE' as any };
    const manifest = { ...VALID_MANIFEST, reEngagements: entries };
    const result = validateReEngagementManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('archetype'))).toBe(true);
  });

  it('should reject entry with audioDurationMs out of range', () => {
    const entries = [...VALID_MANIFEST.reEngagements];
    entries[0] = { ...entries[0], audioDurationMs: 15000 };
    const manifest = { ...VALID_MANIFEST, reEngagements: entries };
    const result = validateReEngagementManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('audioDurationMs') || e.includes('duration'))).toBe(
      true,
    );
  });

  it('should reject entry with invalid audioPath pattern', () => {
    const entries = [...VALID_MANIFEST.reEngagements];
    entries[0] = { ...entries[0], audioPath: 'wrong/path.wav' };
    const manifest = { ...VALID_MANIFEST, reEngagements: entries };
    const result = validateReEngagementManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('audioPath'))).toBe(true);
  });

  it('should reject manifest with missing version', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const manifest = { reEngagements: VALID_MANIFEST.reEngagements } as any;
    const result = validateReEngagementManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('version'))).toBe(true);
  });

  it('should validate the actual manifest file on disk', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const manifestPath = path.resolve(
      __dirname,
      '../../public/greetings/re-engagements/re-engagement-manifest.json',
    );
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(raw);
    const result = validateReEngagementManifest(manifest);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
