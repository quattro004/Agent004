import React, { useState, forwardRef, type KeyboardEvent, type ChangeEvent } from 'react';
import { MAX_MESSAGE_CHARS } from '../config/constants';

export interface TextInputProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  maxLength?: number;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { onSubmit, disabled = false, maxLength = MAX_MESSAGE_CHARS },
  ref,
) {
  const [value, setValue] = useState('');

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || disabled) return;
    const text = value.trim();
    // The attribute stops typing past the limit, but a paste or an autofill
    // can still overshoot it, and the runtime would charge for the request
    // before refusing it with `message_too_long`.
    if (!text || text.length > maxLength) return;
    onSubmit(text);
    setValue('');
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
