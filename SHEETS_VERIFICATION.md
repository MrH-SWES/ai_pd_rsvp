# Local verification — 2026-10-15

Base: `MrH-SWES/ai_pd_rsvp` at `a69af09ae93c534ee60ce4adc7022e4c574020db`.

`npm run verify` passed:

- 28 existing UI/component/storymap checks
- 22 survey-validation checks
- 16 dictation checks
- 12 legacy D1 backend checks
- 107 Apps Script backend checks
- 13 browser-transport / HTML-bridge checks
- 7 live-Sheets UI / retry checks
- TypeScript no-emit check
- Production browser bundle build

The unchanged `src/Board.tsx`, `src/Reveal.tsx`, and `lib/survey.ts` are byte-identical to the verified baseline. The board still has 17 scenes; the removed name editor and its review link remain absent. The new response-name input exists only in review and its dictation is disabled outside that scene and while saving/saved.

Tests cover successful acknowledgement, mismatched request IDs, wrong origins/source windows/nonces, malformed and oversized inputs, Unicode names, explicit errors, timeouts, duplicate clicks, exact-payload retry, durable deduplication, changed-payload conflict, lock contention, write/flush/read-back failures, uncertain-write recovery, formula and literal-apostrophe escaping, row limits, rate limits, no public read API, and no premature saved state.

The source and documentation were independently reviewed. The authorized production Apps Script endpoint has since been deployed and configured in `docs/config.js`; the legacy `apiBase` remains blank. Static assets use the `sheets-live-20261015-1` cache version. This verification record covers local checks only. An actual browser-to-Apps-Script-to-private-Sheet round trip still must pass; mock verification does not establish that deployment works. No real response write or email send is claimed by these checks.
