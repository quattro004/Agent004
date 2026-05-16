interface TvKnobProps {
  onToggle: () => void;
  isOn: boolean;
}

export function TvKnob({ onToggle, isOn }: TvKnobProps) {
  return (
    <div className="tv-knob-wrapper">
      <button
        type="button"
        aria-label={isOn ? 'Turn off' : 'Turn on'}
        className={`tv-knob${isOn ? ' on' : ''}`}
        onClick={onToggle}
      />
    </div>
  );
}
