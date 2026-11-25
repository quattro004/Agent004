import React from 'react';
import { SIGN_IN_ERROR_MESSAGE } from '../config/copy';

export interface SignInErrorProps {
  onRetry: () => void;
}

/**
 * A failed sign-in is never shown as a raw error: the friend sees Max
 * blaming the signal and gets another go (FR-044).
 */
export function SignInError({ onRetry }: SignInErrorProps) {
  return (
    <div data-testid="sign-in-error" className="sign-in-panel" role="alert">
      <p className="sign-in-message">{SIGN_IN_ERROR_MESSAGE}</p>
      <button type="button" className="sign-in-button" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
