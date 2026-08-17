import React, { useState, forwardRef, type KeyboardEvent, type ChangeEvent } from 'react';

export interface TextInputProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  maxLength?: number;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { onSubmit, disabled = false, maxLength = 2000 },
  ref,
) {
  const [value, setValue] = useState('');

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && value.trim() && !disabled) {
      onSubmit(value.trim());
      setValue('');
    }
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    setValue(e.target.value);
  }

  return (
    <input
      ref={ref}
      data-testid="text-input"
      className="text-input"
      type="text"
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      maxLength={maxLength}
      placeholder={disabled ? '' : 'Talk to Max...'}
      aria-label="Message input"
    />
  );
});
