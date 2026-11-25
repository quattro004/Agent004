import React from 'react';

/**
 * FR-053. Static content with no spend-bearing action, so it renders while
 * signed out. Every claim here is the one made in
 * contracts/auth-and-allowlist.md § Privacy page — change them together.
 */

const DELETION_CONTACT = import.meta.env.VITE_DELETION_CONTACT as string | undefined;

export function PrivacyPage() {
  return (
    <main data-testid="privacy-page" className="privacy-page">
      <h1>Privacy</h1>

      <p>
        Max Height is a non-commercial fan project for a handful of friends. It keeps as little
        about you as it can, and nothing is sold, shared or used to train anything.
      </p>

      <h2>What is stored</h2>
      <ul>
        <li>Your email address and Google subject ID, so the invite list knows you.</li>
        <li>The last-seen date of your most recent visit.</li>
        <li>The memories Max extracts from your conversations.</li>
        <li>Short-term conversation events, so Max can follow the thread of a chat.</li>
      </ul>

      <h2>How long it is kept</h2>
      <ul>
        <li>Sign-in records are kept until you ask for deletion, or until you are removed.</li>
        <li>Memories are kept for 30 days after your last visit.</li>
        <li>Short-term events are kept for 7 days.</li>
        <li>Logs are kept for 14 days and never contain message text.</li>
      </ul>

      <h2>Your controls</h2>
      <ul>
        <li>
          <strong>What Max remembers</strong> — read the memories and delete any of them.
        </li>
        <li>
          <strong>Export</strong> — download everything as a <code>.json</code> file.
        </li>
        <li>
          <strong>Forget me</strong> — wipe your memories and short-term events.
        </li>
      </ul>
      <p>
        While the show is paused to stay inside its budget, those controls are unavailable and
        deletion goes through the request route below.
      </p>

      <h2>Requesting deletion</h2>
      <p data-testid="deletion-request">
        {DELETION_CONTACT ? (
          <>
            Write to <a href={`mailto:${DELETION_CONTACT}`}>{DELETION_CONTACT}</a> and everything
            above is removed.
          </>
        ) : (
          <>
            Ask the person who sent you the link, and everything above is removed. There is no
            public contact address for this project.
          </>
        )}
      </p>

      <p>
        <a href="/">Back to the broadcast</a>
      </p>
    </main>
  );
}
