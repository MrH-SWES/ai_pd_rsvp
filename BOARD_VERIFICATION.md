# Storymap and terminal reveal

Sheets integration note: the baseline UI remains intact. Current backend and review-only name changes are documented in `SHEETS_INTEGRATION.md`.

Updated October 15, 2026.

## Experience
- Focusing the plain fake form’s name field starts twenty real polygon fragments.
- “Just kidding.” retains the Google Forms copy. The SignUpGenius aside fades in after 2.7 foreground seconds. The main message gets 10.5 foreground seconds before a 900 ms fade to black.
- The terminal displays only green `Wake up, FirstName...` text on solid black. A generic link displays `Wake up...`.
- Per-character typing is unchanged: 850 ms initial pause, 360 ms after commas, 105 ms after spaces, otherwise 58 + (character count modulo 3) × 28 ms. The caret blinks after completion.
- Click, tap, Enter, or Space advances only after typing is complete. Automatic advance waits five foreground seconds after the last character. All reveal clocks pause while the tab is hidden.
- Reduced motion shows a motionless fractured form for 900 foreground milliseconds before the joke, and bypasses pan, typing, and fade. The joke has a Continue button; the terminal is keyboard-focusable and manually advanced, with no automatic advance.
- A permanent top-down two-dimensional storymap holds every scene. The camera translates over one dotted surface with route hairlines, shared registration marks, and visible gaps between panels. Panels do not crossfade. Yes moves east; No moves south. The remainder winds around the same surface.
- Only the active panel is accessible and interactive. Scene changes reset its scroll and focus the destination heading. Escape/Skip movement finishes a pan.
- The No branch ends politely without submitting. Interest and experience remain separate; first-time users skip tools/use questions.
- Session options remain November 3 and November 5, 2026, 3:30–4:30 p.m. Pacific (PST), one session maximum.
- Every actual editable text field keeps dictation, its speech-service disclosure, and keyboard fallback. Leaving a field’s scene cancels dictation.

## Fonts, personalization, and privacy
The terminal uses the original, unmodified Liberation Mono Regular TTF under SIL Open Font License 1.1, bundled with its copyright/license. This is a legally licensed terminal-style choice, not a claim to the exact font from the film. Lexend remains on the rest of the custom experience; the deliberately familiar fake-form opener retains its plain form styling.

The optional `#name=FirstName` fragment is display-only, never authentication. It accepts bounded Unicode letters/marks, spaces, apostrophes, and hyphens, and rejects duplicate/malformed values. It is rendered as text and is not sent in API requests. No staff roster or recipient emails are embedded. A separate future `#invite=` flow is unchanged.

The terminal contains no name-source disclaimer or other visible text. The review retains truthful name, preview, and dictation disclosures. The obsolete full-screen name editor, its review link, board slot, and unused state/styles have been removed. The display-only personalized and generic terminal greetings are unchanged. `docs/config.js` still has an empty API base. Finishing the preview explicitly confirms no response was submitted or saved. The authorized Sheets integration now configures its production endpoint; the review-only response name and save state are enabled. A real browser-to-private-Sheet round trip remains required before reporting collection as operational.

## Automated checks
- 28 UI/component/timing/storymap checks, including panel absence and forward/back/review navigation
- 22 survey validation tests
- 16 dictation tests
- 12 unchanged backend regression tests
- TypeScript no-emit check and production bundle

The original verification could not launch local headless Chromium. Local Chrome verification of the October 25 shatter fix now passes; see `SHATTER_VERIFICATION.md` for exact scenarios and reproduction steps. Physical mobile and real-microphone testing are not claimed.
