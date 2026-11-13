# AGENTS.md

Ground rules for any agent (human or AI) working in this repository.

## 1. Commit locally, never push

- Commit changes locally when you finish a unit of work.
- **Never push code to the `origin` remote** by default. The maintainer handles pushing to GitHub when ready.
- If a push is genuinely required (the user explicitly asks), confirm with the user first.

## 2. Never expose the API key

- Never print, log, or display the Eevo API key in plain text anywhere — not in the UI, not in `console.log`, not in error messages, not in commit messages.
- When handling API responses/requests for debugging, always redact/strip the key before storing or displaying (see `eevo.js` `getDebugRequests()` which already strips it).

## 3. API keys stay ephemeral

- API keys are held **only in memory** for the duration of the page session.
- **Never persist them** in `localStorage`, `sessionStorage`, cookies, IndexedDB, or any other storage.
- Reloading the page should require re-entering the key.
- The input field should use `type="password"`.
