# Board navigation and reveal

Updated October 15, 2026.

## Behavior
- The plain decoy never displays a personalized name. Focusing/clicking its name field starts the shatter, and keyboard/form submission also works.
- The next scene is “Just kidding.” with the requested Google Forms copy. Continuing reveals a character-by-character greeting with a small typing robot.
- Scenes have stable coordinates on one persistent two-dimensional board. The viewport pans by transforming the board. Each scene scrolls independently; offscreen scenes are inert and aria-hidden.
- Reduced-motion preferences bypass shattering, typing, and camera movement. Skip controls and Escape finish active animation. Focus moves to the destination heading without scrolling the page.
- The “No” branch exits to a thank-you screen. Interest and experience remain separate questions. First-time users skip tool/use questions.
- Both identical sessions remain November 3 and November 5, 2026, 3:30–4:30 p.m. Pacific (PST). Only one session can be selected.
- Every editable response field has dictation, an explicit browser speech-service disclosure, and keyboard fallback. Leaving a scene cancels its dictation session.

## Personalization and preview
An optional `#name=FirstName` fragment is display-only. It is not authentication or a saved RSVP. Only Unicode letters/marks, spaces, apostrophes, and hyphens are accepted, with a 60-character maximum; duplicate name parameters and malformed names fall back to a generic greeting. Names render as React text. No roster or recipient email is included in the site.

A small note after the greeting explains that the invite link included the first name. Visitors can change their greeting. Fragment names are not sent in API requests. The separate future `#invite=` flow uses a server-resolved name.

`docs/config.js` still has an empty API base. Preview completion explicitly says no response was submitted or saved. Live collection has not been deployed by this frontend update.

## Checks
- 22 survey validation tests
- 17 component/board/reveal checks
- 16 dictation tests, including stale-callback cancellation and field targeting
- 12 backend regression tests (no backend changes)
- TypeScript check and production bundle

These are deterministic source/component tests, not a substitute for a real microphone or browser end-to-end test. Browser smoke-test results are recorded separately after deployment.
