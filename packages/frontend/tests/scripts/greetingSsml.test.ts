/**
 * Phase 1 (audio-plan): coverage + well-formedness guard for the hand-tuned
 * greeting SSML module. Every manifest greeting must have exactly one
 * well-formed `<speak>` SSML document, and there must be no orphan keys.
 */
import { describe, it, expect } from 'vitest';
import { greetingSsml } from '../../scripts/greetingSsml';
import { buildGreetingSsml } from '../../scripts/greetingGenCore';
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

  it('gives the buffering audition a pronounced onset glitch and name stutter', () => {
    const doc = parseXml(buildGreetingSsml('', greetingSsml['greeting-015']));
    expect(doc.querySelectorAll('phoneme[ph="bə"]')).toHaveLength(3);
    expect(doc.querySelectorAll('phoneme[ph="mə"]')).toHaveLength(3);
  });

  it.each(['ipa-schwa', 'ipa-strut', 'alias'] as const)(
    'preserves the original dialogue and valid XML with %s pronunciation',
    (pronunciation) => {
      const words = (text: string) => text.toLowerCase().match(/[a-z0-9']+/g);
      for (const greeting of manifest.greetings) {
        const doc = parseXml(buildGreetingSsml('', greetingSsml[greeting.id], pronunciation));
        expect(doc.querySelector('parsererror'), `${greeting.id}: malformed SSML`).toBeNull();
        doc.querySelectorAll('phoneme, sub').forEach((onset) => onset.remove());
        const original = greeting.text.replace(/\b([a-z])-(?:\1-)*(\1[a-z]+)\b/gi, '$2');
        expect(words(doc.documentElement.textContent ?? ''), greeting.id).toEqual(words(original));
      }
    },
  );

  it.each(['faster', 'snappy'] as const)(
    'preserves the dialogue and valid XML across the pool with %s pacing',
    (pacing) => {
      const words = (text: string) => text.toLowerCase().match(/[a-z0-9']+/g);
      for (const greeting of manifest.greetings) {
        const doc = parseXml(buildGreetingSsml('', greetingSsml[greeting.id], 'ipa-schwa', pacing));
        expect(doc.querySelector('parsererror'), `${greeting.id}: malformed paced SSML`).toBeNull();
        expect(doc.documentElement.firstElementChild?.getAttribute('rate'), greeting.id).toBe(
          '115%',
        );
        doc.querySelectorAll('phoneme, sub').forEach((onset) => onset.remove());
        const original = greeting.text.replace(/\b([a-z])-(?:\1-)*(\1[a-z]+)\b/gi, '$2');
        expect(words(doc.documentElement.textContent ?? ''), greeting.id).toEqual(words(original));
      }
    },
  );
});
