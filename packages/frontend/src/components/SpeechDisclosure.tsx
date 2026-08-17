export interface SpeechDisclosureProps {
  provider: string;
  visible: boolean;
  onDismiss: () => void;
}

export function SpeechDisclosure({ provider, visible, onDismiss }: SpeechDisclosureProps) {
  if (!visible) return null;

  return (
    <div className="speech-disclosure" role="dialog" aria-label="Speech recognition disclosure">
      <p>
        Speech recognition is provided by <strong>{provider}</strong>. Your voice data is processed
        by your browser&apos;s speech recognition service.
      </p>
      <button type="button" onClick={onDismiss} aria-label="Got it">
        Got it
      </button>
    </div>
  );
}
