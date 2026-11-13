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

## 4. Eevo prompts must be neutral — no advice or steering

The whole point of this project is to observe how the Eevo model decides for
itself. Prompts sent to the model must therefore contain state, rules, and
context **only**. Do not influence the decision with hints, strategy, or leading
language.

- Include: current game state (scores, turn points, dice), the rules (standard
  Farkle plus any active relics, stated factually), and the available options
  as plain facts.
- **Never** add advice such as:
  - "If you're behind, you may need to take more risks" / "lean toward
    banking if you're ahead" (or any similar steering).
  - Value-interpretation nudges like "next bank earns X" framed as a suggestion.
  - Tradeoff framings that push a choice, e.g. "fewer dice = less farkle risk
    but smaller rolls".
  - Motivational phrasing in question criteria (e.g. "build toward a doubled
    segment and keep your streak alive").
- Questions should just present the choice with objective criteria
  (e.g. `BANK: secure N points` vs `ROLL: roll the remaining N dice`).
- The `eevo.js` prompt builders (`buildStateDescription`, `askWhichDiceToKeep`,
  `askRollOrBank`) are the canonical place for this — keep them neutral when
  editing them.
