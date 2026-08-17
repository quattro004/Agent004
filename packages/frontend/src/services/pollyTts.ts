import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';

// --- Types ---

export interface VisemeMark {
  time: number;
  type: 'viseme';
  value: string;
}

export interface TtsResult {
  audioData: Uint8Array | null;
  visemeMarks: VisemeMark[] | null;
  textOnly: boolean;
}

// --- Constants ---

const MAX_TEXT_LENGTH = 2900;
const RETRY_DELAY_MS = 500;

// --- Client ---

let pollyClient: PollyClient | null = null;

function getClient(): PollyClient {
  if (!pollyClient) {
    pollyClient = new PollyClient({});
  }
  return pollyClient;
}

// --- SSML ---

/**
 * Wrap text in SSML prosody tags with pitch +10% and rate 105%.
 */
export function wrapInSsml(text: string): string {
  return `<speak><prosody rate="105%">${text}</prosody></speak>`;
}

/**
 * Truncate text to 2900 characters if it exceeds the limit.
 */
export function truncateText(text: string): string {
  if (text.length > MAX_TEXT_LENGTH) {
    return text.slice(0, MAX_TEXT_LENGTH);
  }
  return text;
}

// --- Helpers ---

function isThrottleError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>;
    if (err.name === 'ThrottlingException') return true;
    if (
      err.$metadata &&
      typeof err.$metadata === 'object' &&
      (err.$metadata as Record<string, unknown>).httpStatusCode === 429
    ) {
      return true;
    }
  }
  return false;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function synthesizeAudio(ssml: string): Promise<Uint8Array> {
  const client = getClient();
  const command = new SynthesizeSpeechCommand({
    Engine: 'neural',
    VoiceId: 'Matthew',
    LanguageCode: 'en-US',
    OutputFormat: 'mp3',
    SampleRate: '24000',
    TextType: 'ssml',
    Text: ssml,
  });

  const response = await client.send(command);
  const stream = response.AudioStream;
  return await (
    stream as unknown as { transformToByteArray(): Promise<Uint8Array> }
  ).transformToByteArray();
}

async function synthesizeVisemes(ssml: string): Promise<VisemeMark[]> {
  const client = getClient();
  const command = new SynthesizeSpeechCommand({
    Engine: 'neural',
    VoiceId: 'Matthew',
    LanguageCode: 'en-US',
    OutputFormat: 'json',
    SpeechMarkTypes: ['viseme'],
    TextType: 'ssml',
    Text: ssml,
  });

  const response = await client.send(command);
  const stream = response.AudioStream;
  const bytes = await (
    stream as unknown as { transformToByteArray(): Promise<Uint8Array> }
  ).transformToByteArray();
  const text = new TextDecoder().decode(bytes);

  return text
    .trim()
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as VisemeMark);
}

// --- Main ---

/**
 * Synthesize audio and viseme marks for a turn's response text.
 * Makes dual parallel Polly calls via Promise.all().
 * Retries audio once on 429 throttle after 500ms.
 * Falls back to text-only on second audio failure.
 * Silently ignores viseme failures.
 */
export async function synthesizeTurn(responseText: string): Promise<TtsResult> {
  const text = truncateText(responseText);
  const ssml = wrapInSsml(text);

  // Dual parallel calls
  const [audioResult, visemeResult] = await Promise.all([
    synthesizeAudioWithRetry(ssml),
    synthesizeVisemesSafe(ssml),
  ]);

  return {
    audioData: audioResult,
    visemeMarks: visemeResult,
    textOnly: audioResult === null,
  };
}

async function synthesizeAudioWithRetry(ssml: string): Promise<Uint8Array | null> {
  try {
    return await synthesizeAudio(ssml);
  } catch (error) {
    if (isThrottleError(error)) {
      // Retry once after 500ms
      await delay(RETRY_DELAY_MS);
      try {
        return await synthesizeAudio(ssml);
      } catch {
        // Second failure → text-only fallback
        return null;
      }
    }
    // Non-throttle error → text-only fallback
    return null;
  }
}

async function synthesizeVisemesSafe(ssml: string): Promise<VisemeMark[] | null> {
  try {
    return await synthesizeVisemes(ssml);
  } catch {
    // Silently ignore viseme failures (MVP doesn't use them)
    return null;
  }
}

// --- Testing Support ---

/**
 * Reset the Polly client singleton. Used only for testing.
 * @internal
 */
export function __resetPollyClient() {
  pollyClient = null;
}
