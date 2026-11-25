import React from 'react';
import { DENIED_MESSAGE, SIGNED_OUT_MESSAGE } from '../config/copy';
import { SignInError } from './SignInError';

export type SignInStatus = 'checking' | 'signed-out' | 'denied' | 'error';

export interface SignInProps {
  status: SignInStatus;
  onSignIn: () => void;
}

/**
 * The gate in front of the broadcast (contracts/auth-and-allowlist.md).
 *
 * While the stored refresh token is still being tried, this renders nothing
 * at all: flashing a sign-in prompt at someone who is already signed in is
 * worse than a moment of blank screen.
 */
export function SignIn({ status, onSignIn }: SignInProps) {
  if (status === 'checking') return null;

  if (status === 'error') {
    return <SignInError onRetry={onSignIn} />;
  }

  if (status === 'denied') {
    return (
      <div data-testid="sign-in-denied" className="sign-in-panel" role="alert">
        <p className="sign-in-message">{DENIED_MESSAGE}</p>
      </div>
    );
  }

  return (
    <div data-testid="sign-in" className="sign-in-panel">
      <p className="sign-in-message">{SIGNED_OUT_MESSAGE}</p>
      <button type="button" className="sign-in-button" onClick={onSignIn}>
        Sign in with Google
      </button>
    </div>
  );
}
