export type StutterPronunciation = 'ipa-schwa' | 'ipa-strut' | 'alias';

const STUTTER_PACING = {
  original: { gapMs: 100, onsetRate: undefined },
  faster: { gapMs: 50, onsetRate: undefined },
  snappy: { gapMs: 50, onsetRate: 'x-fast' },
  snappier: { gapMs: 20, onsetRate: 'x-fast' },
  rapid: { gapMs: 0, onsetRate: 'x-fast' },
  gap5: { gapMs: 5, onsetRate: 'x-fast' },
} as const;

export type SpeechPacing = keyof typeof STUTTER_PACING;

const ONSETS: Record<string, { ipa: string; alias: string }> = {
  b: { ipa: 'b', alias: 'buh' },
  c: { ipa: 'k', alias: 'kuh' },
  d: { ipa: 'd', alias: 'duh' },
  f: { ipa: 'f', alias: 'fuh' },
  g: { ipa: 'ɡ', alias: 'guh' },
  h: { ipa: 'h', alias: 'huh' },
  j: { ipa: 'd͡ʒ', alias: 'juh' },
  k: { ipa: 'k', alias: 'kuh' },
  l: { ipa: 'l', alias: 'luh' },
  m: { ipa: 'm', alias: 'muh' },
  n: { ipa: 'n', alias: 'nuh' },
  p: { ipa: 'p', alias: 'puh' },
  q: { ipa: 'k', alias: 'kuh' },
  r: { ipa: 'ɹ', alias: 'ruh' },
  s: { ipa: 's', alias: 'suh' },
  t: { ipa: 't', alias: 'tuh' },
  v: { ipa: 'v', alias: 'vuh' },
  w: { ipa: 'w', alias: 'wuh' },
  x: { ipa: 'ks', alias: 'ksuh' },
  y: { ipa: 'j', alias: 'yuh' },
  z: { ipa: 'z', alias: 'zuh' },
};

/** Transform single-consonant stutters in trusted SSML, leaving markup untouched. */
export function stutterToSsml(
  ssml: string,
  pronunciation: StutterPronunciation = 'ipa-schwa',
  pacing: SpeechPacing = 'rapid',
): string {
  const { gapMs, onsetRate } = STUTTER_PACING[pacing];
  const stutterBreak = gapMs > 0 ? `<break time="${gapMs}ms"/>` : '';
  return ssml.replace(
    /<(phoneme|sub)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/\1>|<(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+/gi,
    (part) => {
      if (part.startsWith('<')) return part;
      return part.replace(
        /https?:\/\/[^\s]+|\b([bcdfghjklmnpqrstvwxyz])-(?:\1-)*(\1[a-z]+)\b/gi,
        (stutter: string, letter: string | undefined, word: string | undefined) => {
          if (letter === undefined || word === undefined) return stutter;
          const onset = ONSETS[letter.toLowerCase()];
          const fragments = stutter.slice(0, -word.length).split('-').filter(Boolean);
          const burst =
            fragments
              .map((fragment) =>
                pronunciation === 'alias'
                  ? `<sub alias="${onset.alias}">${fragment}</sub>`
                  : `<phoneme alphabet="ipa" ph="${onset.ipa}${pronunciation === 'ipa-schwa' ? 'ə' : 'ʌ'}">${fragment}</phoneme>`,
              )
              .join(stutterBreak) + stutterBreak;
          return (onsetRate ? `<prosody rate="${onsetRate}">${burst}</prosody>` : burst) + word;
        },
      );
    },
  );
}

export function wrapInSsml(
  text: string,
  pronunciation: StutterPronunciation = 'ipa-schwa',
  pacing: SpeechPacing = 'rapid',
): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const rate = pacing === 'original' ? '105%' : '115%';
  return `<speak><prosody rate="${rate}">${stutterToSsml(escaped, pronunciation, pacing)}</prosody></speak>`;
}
