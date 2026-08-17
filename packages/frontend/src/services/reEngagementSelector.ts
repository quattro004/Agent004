export interface ReEngagementEntry {
  id: string;
  archetype: string;
  text: string;
  audioPath: string;
  audioDurationMs: number;
  videoPath: string;
  weight: number;
}

export interface ReEngagementManifest {
  version: string;
  reEngagements: ReEngagementEntry[];
}

export interface ReEngagementSelector {
  select(): ReEngagementEntry | null;
  reset(): void;
}

export function loadReEngagementManifest(raw: string): ReEngagementManifest {
  return JSON.parse(raw) as ReEngagementManifest;
}

export function createReEngagementSelector(manifest: ReEngagementManifest): ReEngagementSelector {
  const usedIds = new Set<string>();
  let lastArchetype: string | null = null;

  function weightedRandom(entries: ReEngagementEntry[]): ReEngagementEntry | null {
    if (entries.length === 0) return null;
    const totalWeight = entries.reduce((sum, e) => sum + (e.weight ?? 1), 0);
    let r = Math.random() * totalWeight;
    for (const entry of entries) {
      r -= entry.weight ?? 1;
      if (r <= 0) return entry;
    }
    return entries[entries.length - 1];
  }

  return {
    select(): ReEngagementEntry | null {
      // Filter: no repeat within session + archetype rotation
      let pool = manifest.reEngagements.filter(
        (e) => !usedIds.has(e.id) && e.archetype !== lastArchetype,
      );

      // Relax no-repeat-within-session if pool empty, keep archetype constraint
      if (pool.length === 0) {
        pool = manifest.reEngagements.filter((e) => e.archetype !== lastArchetype);
      }

      // Full fallback: relax all constraints
      if (pool.length === 0) {
        pool = manifest.reEngagements;
      }

      const selected = weightedRandom(pool);
      if (selected) {
        usedIds.add(selected.id);
        lastArchetype = selected.archetype;
      }
      return selected;
    },

    reset() {
      usedIds.clear();
      lastArchetype = null;
    },
  };
}
