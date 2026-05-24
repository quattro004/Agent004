/**
 * Browser TTS fallback service.
 * Uses SpeechSynthesis API as a free, no-credential voice fallback.
 * Voice selection priority per research.md §R9:
 *   en-US Google/Microsoft > en-US any > en any > default
 * Params: pitch=1.2, rate=1.05 (approximate Max's Polly prosody).
 */

const PITCH = 1.2;
const RATE = 1.05;

export function isAvailable(): boolean {
  return typeof speechSynthesis !== 'undefined';
}

export function selectVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;

  // Priority 1: en-US with Google or Microsoft (higher quality neural voices)
  const premium = voices.find(
    (v) => v.lang === 'en-US' && (/google/i.test(v.name) || /microsoft/i.test(v.name)),
  );
  if (premium) return premium;

  // Priority 2: any en-US voice
  const enUs = voices.find((v) => v.lang === 'en-US');
  if (enUs) return enUs;

  // Priority 3: any English voice
  const en = voices.find((v) => v.lang.startsWith('en'));
  if (en) return en;

  // Priority 4: first available voice
  return voices[0] ?? null;
}

export function speak(text: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = PITCH;
    utterance.rate = RATE;

    const voices = speechSynthesis.getVoices();
    const voice = selectVoice(voices);
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onend = () => resolve();
    utterance.onerror = (event) => reject(event);

    speechSynthesis.speak(utterance);
  });
}

export function stop(): void {
  if (isAvailable()) {
    speechSynthesis.cancel();
  }
}
