/**
 * useSpeech — Web Speech API hook for voice input.
 * Start/stop SpeechRecognition on mic hold, collect transcript,
 * and provide the final text for submission.
 */

import { useState, useCallback, useRef } from 'react';

export interface UseSpeechReturn {
  isListening: boolean;
  transcript: string;
  error: string | null;
  start: () => void;
  stop: () => string;
}

// Detect speech recognition provider for disclosure
export function getSpeechProvider(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Chrome')) return 'Google';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Apple';
  return 'your browser';
}

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEvent = {
  resultIndex: number;
  results: SpeechRecognitionResultList;
};

type SpeechRecognitionResultList = {
  length: number;
  item: (index: number) => SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
};

type SpeechRecognitionResult = {
  isFinal: boolean;
  [index: number]: { transcript: string };
  length: number;
};

function getSpeechRecognitionConstructor(): (new () => SpeechRecognitionInstance) | null {
  const w = window as unknown as Record<string, unknown>;
  return (
    (w.SpeechRecognition as new () => SpeechRecognitionInstance) ??
    (w.webkitSpeechRecognition as new () => SpeechRecognitionInstance) ??
    null
  );
}

export function useSpeech(): UseSpeechReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const start = useCallback(() => {
    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      setError('Speech recognition not supported');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        }
      }
      if (finalTranscript) {
        setTranscript((prev) => prev + finalTranscript);
      }
    };

    recognition.onerror = (event: { error: string }) => {
      setError(event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    setTranscript('');
    setError(null);
    setIsListening(true);
    recognition.start();
  }, []);

  const stop = useCallback((): string => {
    recognitionRef.current?.stop();
    setIsListening(false);
    return transcript;
  }, [transcript]);

  return { isListening, transcript, error, start, stop };
}
