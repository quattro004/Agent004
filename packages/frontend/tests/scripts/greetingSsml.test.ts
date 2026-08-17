/**
 * Phase 1 (audio-plan): coverage + well-formedness guard for the hand-tuned
 * greeting SSML module. Every manifest greeting must have exactly one
 * well-formed `<speak>` SSML document, and there must be no orphan keys.
 */
import { describe, it, expect } from 'vitest';
import { greetingSsml } from '../../scripts/greetingSsml';
import manifest from '../../public/greetings/manifest.json';

const greetingIds: string[] = manifest.greetings.map((g) => g.id);

function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml');
}

describe('greetingSsml', () => {
  it('provides an SSML entry for every manifest greeting id', () => {
    const missing = greetingIds.filter((id) => !(id in greetingSsml));
    expect(missing).toEqual([]);
  });

  it('has no orphan SSML keys absent from the manifest', () => {
    const idSet = new Set(greetingIds);
    const orphans = Object.keys(greetingSsml).filter((key) => !idSet.has(key));
    expect(orphans).toEqual([]);
  });

  it('wraps every value in a single, well-formed <speak> root', () => {
    for (const [id, ssml] of Object.entries(greetingSsml)) {
      const doc = parseXml(ssml);
      expect(doc.querySelector('parsererror'), `${id}: SSML is not well-formed XML`).toBeNull();
      expect(doc.documentElement.nodeName, `${id}: root element must be <speak>`).toBe('speak');
      const speakOpenTags = (ssml.match(/<speak[\s>]/g) ?? []).length;
      expect(speakOpenTags, `${id}: must contain exactly one <speak> root`).toBe(1);
    }
  });

  it('uses only SSML the neural engine supports', () => {
    for (const [id, ssml] of Object.entries(greetingSsml)) {
      expect(ssml, `${id}: neural voices ignore/reject the prosody pitch attribute`).not.toMatch(
        /pitch\s*=/,
      );
      expect(ssml, `${id}: <emphasis> is not available on neural voices`).not.toMatch(/<emphasis/);
    }
  });
});
