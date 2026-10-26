# Local shatter fallback verification — 2026-10-25

## Scope and provenance

Prepared in a new isolated local clone of `https://github.com/MrH-SWES/ai_pd_rsvp.git` at `33adecffc2f07b61a595532bdb45b5406419cfcb`. The supplied workspace was empty; no existing checkout was found in the local home-directory search. The clone was clean before edits. No unrelated work was overwritten.

These checks were initially completed as an uncommitted local patch. The user separately approved publication on October 26, 2026. No push, merge, deployment, publication, billing change, or security-setting change was performed during the initial preparation. `docs/config.js` and the Sheets/backend integration are unchanged.

## Result

- Focusing the decoy name or selecting Next always enters the shatter phase on the first visit, including with reduced motion.
- The baseline visual is the actual inert form with a declarative SVG fracture pattern. It requires no canvas, WebGL, screenshot capture, DOM cloning, or clipping support.
- When motion is permitted and fragment setup succeeds, the existing twenty clipped DOM fragments fall away. All fragments' animation-end events complete the effect.
- Reduced motion, missing clipping support, fragment setup exceptions, disabled/paused/near-zero-duration animations, and computed-style failures use a motionless fracture frame held for 900 foreground milliseconds after a two-frame paint opportunity.
- Cancelling an animation switches to the static frame. Missing completion events trigger that same fallback after 2400 foreground milliseconds, followed by the 900 ms hold; the timeout no longer skips directly to the joke.
- Toggling reduced motion during the effect stops the moving fragments and presents the static frame. The CSS preference also takes effect immediately. No flashing or repeated pulsing is introduced.
- Hidden tabs pause the visual/timer. Explicit Skip intro, Skip animation, and Escape still advance immediately. Focus stays on the skip control during shatter, and decorative content stays inert/hidden from accessibility APIs.
- `docs/app.js` was rebuilt and `docs/index.html` asset URLs now use `shatter-fallback-20261025-1`.

## Automated verification

Passed with Node **24.22.1**:

```sh
npm run verify
```

This ran survey/UI, shatter, dictation, Sheets, and backend tests, TypeScript checking, and the production bundle build. The test-runner groups reported 139 and 12 passing tests; the preceding suites also passed (22 survey tests, UI checks, and 136 Apps Script backend assertions). No production services were contacted by these tests.

The focused shatter tests cover paint gating, normal completion, hidden-tab pause/resume, resize, cleanup, late events, missing events, cancelled animation, reduced motion, disabled/paused/near-zero animation, setup failure, and computed-style failure. The component harness now asserts that reduced motion enters shatter before the joke.

The optional `test-shatter-browser.mjs` additionally passed **13 real headless Chrome scenarios** against a loopback-only server:

1. Normal motion with twenty moving fragments.
2. Reduced motion, static fracture frame.
3. Reduced motion at a 390 × 844 mobile viewport.
4. All CSS animation disabled.
5. Shard animation forcibly paused.
6. Form cloning forced to throw.
7. Clip-path support forced unavailable.
8. All animation-end events suppressed.
9. Reduced motion enabled during the running effect.
10. Running animation cancelled.
11. Escape.
12. Skip animation with reduced motion.
13. Skip intro.

Every scenario reached the joke and removed the shatter layer, with zero page errors and zero external requests. Static scenarios verified visible original form/SVG, eleven fracture paths, no running animation, and a visible hold before advancing. Screenshots are in ignored `.test/shatter-*.png`; normal and reduced screenshots were visually inspected.

Reproduce browser checks without changing project dependencies:

```sh
npm install --prefix /tmp/shatter-browser --no-package-lock --ignore-scripts playwright@1.64.1
PLAYWRIGHT_MODULE=/tmp/shatter-browser/node_modules/playwright/index.mjs \
CHROME_PATH=/usr/bin/google-chrome node test-shatter-browser.mjs
```

Use Node 24+ and an installed Chrome path appropriate to the machine. If Playwright is already installed locally with its Chromium browser, simply run `node test-shatter-browser.mjs`.

Local shell sandbox startup initially failed because `bwrap` was absent. The approved execution path worked; nothing was installed or changed to weaken security settings. No workspace-credit blocker occurred. Safari/Firefox, physical devices, and an actual GPU hardware fault were not tested; Chrome emulation/forced failures are the browser evidence. As before, disabled JavaScript or a browser unable to paint any page cannot render this interaction.

## Existing publication workflow

GitHub's existing dynamic **pages build and deployment** workflow successfully deployed `main` at the baseline SHA in [run 38924324329](https://github.com/MrH-SWES/ai_pd_rsvp/actions/runs/38924324329). There is no repository-owned `.github/workflows` deployment file in this checkout. The production bundle is maintained under `docs/` by `scripts/build-site.mjs`.

The user approved publishing this tested fix on October 26, 2026. The established publication procedure is:

1. Reconcile the patch with the then-current `main`, preserving any intervening work; run `git apply --check` before applying a transported patch.
2. With Node 24+, install declared dependencies and rerun `npm run verify` plus the local browser suite. Include the rebuilt `docs/app.js`, edited `docs/app.css`, and cache-busted `docs/index.html` together with source/tests/docs in the reviewed change. Keep `docs/config.js` intact.
3. Use the repository's established review and update process to land the approved change on `main`, allowing the existing GitHub Pages workflow to publish. Do not create an alternative hosting target or change Pages/security settings.
4. Verify the new Pages run succeeds at the intended commit, then smoke-test normal and reduced-motion introductions at `https://mrh-swes.github.io/ai_pd_rsvp/`. Check the new asset version is served; do not submit real survey data as part of this visual smoke test.

Publication was not executed during the October 25 preparation. The approved October 26 publication and public-page verification are reported separately with the deployed commit and Pages run.
