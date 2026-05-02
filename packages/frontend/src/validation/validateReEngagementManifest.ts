/**
 * T128: Re-engagement manifest validator.
 * Validates the manifest against the contract schema from
 * specs/001-max-height-ai-character/contracts/re-engagement-manifest.md
 */

const VALID_ARCHETYPES = [
  'SIGNAL_CHECK',
  'FAKE_CONCERN',
  'RAMBLING_FILL',
  'SELF_ENTERTAINMENT',
  'MOCK_SIGN_OFF',
  'AUDIENCE_ADDRESS',
] as const;

type Archetype = (typeof VALID_ARCHETYPES)[number];

export interface ReEngagementEntry {
  id: string;
  archetype: Archetype;
  text: string;
  audioPath: string;
  audioDurationMs: number;
  videoPath: string;
  weight?: number;
}

export interface ReEngagementManifest {
  version: string;
  generatedAt?: string;
  voiceConfig?: {
    voiceId: string;
    engine: string;
    ssmlPitch?: string;
    ssmlRate?: string;
  };
  reEngagements: ReEngagementEntry[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const ID_PATTERN = /^re-engagement-\d{3}$/;
const AUDIO_PATH_PATTERN = /^audio\/re-engagement-\d{3}\.mp3$/;
const VIDEO_PATH_PATTERN = /^video\/re-engagement-\d{3}\.mp4$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const MIN_ENTRIES = 12;
const MIN_PER_ARCHETYPE = 2;
const MIN_DURATION_MS = 1000;
const MAX_DURATION_MS = 12000;

export function validateReEngagementManifest(manifest: ReEngagementManifest): ValidationResult {
  const errors: string[] = [];

  // Version check
  if (!manifest.version) {
    errors.push('Missing required field: version');
  } else if (!VERSION_PATTERN.test(manifest.version)) {
    errors.push(`Invalid version format: "${manifest.version}" (expected semver)`);
  }

  if (!manifest.reEngagements || !Array.isArray(manifest.reEngagements)) {
    errors.push('Missing required field: reEngagements (must be an array)');
    return { valid: false, errors };
  }

  // Minimum entries
  if (manifest.reEngagements.length < MIN_ENTRIES) {
    errors.push(
      `Manifest must have at least ${MIN_ENTRIES} entries, found ${manifest.reEngagements.length}`,
    );
  }

  // Per-entry validation
  const seenIds = new Set<string>();
  const archetypeCounts = new Map<string, number>();

  for (const entry of manifest.reEngagements) {
    // ID pattern
    if (!ID_PATTERN.test(entry.id)) {
      errors.push(`Invalid id pattern: "${entry.id}" (expected re-engagement-NNN)`);
    }

    // Duplicate ID
    if (seenIds.has(entry.id)) {
      errors.push(`Duplicate id: "${entry.id}"`);
    }
    seenIds.add(entry.id);

    // Archetype
    if (!VALID_ARCHETYPES.includes(entry.archetype as Archetype)) {
      errors.push(
        `Invalid archetype "${entry.archetype}" on ${entry.id}. Valid: ${VALID_ARCHETYPES.join(', ')}`,
      );
    } else {
      archetypeCounts.set(entry.archetype, (archetypeCounts.get(entry.archetype) ?? 0) + 1);
    }

    // Audio path
    if (!AUDIO_PATH_PATTERN.test(entry.audioPath)) {
      errors.push(`Invalid audioPath "${entry.audioPath}" on ${entry.id}`);
    }

    // Video path
    if (!VIDEO_PATH_PATTERN.test(entry.videoPath)) {
      errors.push(`Invalid videoPath "${entry.videoPath}" on ${entry.id}`);
    }

    // Duration range
    if (entry.audioDurationMs < MIN_DURATION_MS || entry.audioDurationMs > MAX_DURATION_MS) {
      errors.push(
        `audioDurationMs ${entry.audioDurationMs} out of range [${MIN_DURATION_MS}, ${MAX_DURATION_MS}] on ${entry.id}`,
      );
    }
  }

  // Archetype coverage: each must have ≥ 2
  for (const archetype of VALID_ARCHETYPES) {
    const count = archetypeCounts.get(archetype) ?? 0;
    if (count < MIN_PER_ARCHETYPE) {
      errors.push(`Archetype "${archetype}" has ${count} entries (need ≥ ${MIN_PER_ARCHETYPE})`);
    }
  }

  return { valid: errors.length === 0, errors };
}
