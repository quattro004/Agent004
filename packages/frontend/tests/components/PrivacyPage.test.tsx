import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PrivacyPage } from '../../src/components/PrivacyPage';

/**
 * FR-053. The page is static content with no spend-bearing action, so it
 * renders while signed out. Its disclosures come from
 * contracts/auth-and-allowlist.md § Privacy page.
 */

describe('PrivacyPage', () => {
  it('renders without a session', () => {
    render(<PrivacyPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/privacy/i);
  });

  it('says what is stored', () => {
    render(<PrivacyPage />);
    const text = document.body.textContent ?? '';

    expect(text).toMatch(/email/i);
    expect(text).toMatch(/Google subject ID/i);
    expect(text).toMatch(/last-seen/i);
    expect(text).toMatch(/memories/i);
    expect(text).toMatch(/conversation events/i);
  });

  it('says how long each kind is kept', () => {
    render(<PrivacyPage />);
    const text = document.body.textContent ?? '';

    expect(text).toMatch(/memories are kept for 30 days/i);
    expect(text).toMatch(/events are kept for 7 days/i);
    expect(text).toMatch(/logs are kept for 14 days/i);
    expect(text).toMatch(/never contain|no message text/i);
  });

  it('lists the controls the friend has', () => {
    render(<PrivacyPage />);
    const text = document.body.textContent ?? '';

    expect(text).toMatch(/what max remembers/i);
    expect(text).toMatch(/export/i);
    expect(text).toMatch(/forget me/i);
  });

  it('says how to request deletion', () => {
    render(<PrivacyPage />);
    expect(screen.getByTestId('deletion-request')).toBeInTheDocument();
  });

  it('offers a way back to the broadcast', () => {
    render(<PrivacyPage />);
    expect(screen.getByRole('link', { name: /back/i })).toHaveAttribute('href', '/');
  });
});
