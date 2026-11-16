import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SignIn } from '../../src/components/SignIn';
import { SignInError } from '../../src/components/SignInError';
import { DENIED_MESSAGE, SIGNED_OUT_MESSAGE, SIGN_IN_ERROR_MESSAGE } from '../../src/config/copy';

/**
 * The signed-out, denied and sign-in-error states are all in character
 * (contracts/auth-and-allowlist.md § Denial copy, FR-043). None of them ever
 * shows a raw error, and the denial copy never varies by cause.
 */

describe('SignIn', () => {
  it('invites the friend in and offers a way in', () => {
    render(<SignIn status="signed-out" onSignIn={() => {}} />);

    expect(screen.getByText(SIGNED_OUT_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
  });

  it('starts sign-in when the button is pressed', () => {
    const onSignIn = vi.fn();
    render(<SignIn status="signed-out" onSignIn={onSignIn} />);

    fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }));

    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it('shows the one constant denial line, with no way to retry', () => {
    render(<SignIn status="denied" onSignIn={() => {}} />);

    expect(screen.getByText(DENIED_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign in with google/i })).not.toBeInTheDocument();
  });

  it('shows the sign-in error state in character, and lets the friend try again', () => {
    render(<SignIn status="error" onSignIn={() => {}} />);

    expect(screen.getByText(SIGN_IN_ERROR_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('never shows a raw error, whatever the cause', () => {
    const { container } = render(<SignIn status="error" onSignIn={() => {}} />);

    const text = container.textContent ?? '';
    expect(text).not.toMatch(/error[:_]|exception|stack|undefined|401|403/i);
  });

  it('says nothing at all while the sign-in state is still unknown', () => {
    const { container } = render(<SignIn status="checking" onSignIn={() => {}} />);

    expect(container.textContent).toBe('');
  });
});

describe('SignInError', () => {
  it('renders the in-character line and a retry', () => {
    const onRetry = vi.fn();
    render(<SignInError onRetry={onRetry} />);

    expect(screen.getByText(SIGN_IN_ERROR_MESSAGE)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
