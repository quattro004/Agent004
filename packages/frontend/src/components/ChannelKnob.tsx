interface ChannelKnobProps {
  onChannelChange: () => void;
  disabled: boolean;
}

export function ChannelKnob({ onChannelChange, disabled }: ChannelKnobProps) {
  function handleClick() {
    if (disabled) return;
    onChannelChange();
  }

  return (
    <div className="channel-knob-wrapper">
      <button
        type="button"
        aria-label="Channel"
        className="channel-knob"
        onClick={handleClick}
        disabled={disabled}
      />
    </div>
  );
}
