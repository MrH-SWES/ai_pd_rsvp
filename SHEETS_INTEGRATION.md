# Private Google Sheets RSVP integration

Local implementation based on GitHub `MrH-SWES/ai_pd_rsvp` commit `a69af09ae93c534ee60ce4adc7022e4c574020db`.

## What changed

- Preserves the current 17-scene UI and cinematic greeting; the removed name panel and “Change my greeting” link remain absent.
- Adds a self-reported name field and dictation only inside review when the Sheets endpoint is enabled. The `#name=` greeting is never submitted.
- Sends a bounded envelope only after the attendee presses “Send my response.” A credential-free CORS fetch sends a text/plain JSON POST directly to Apps Script; the current UI does not need a hidden iframe or popup.
- Follows the ContentService redirect, accepts only readable JSON from the allowed Google response origins, streams at most 2KB, and requires the exact success keys and matching request ID. A 30-second independent deadline prevents an indefinite Saving state. The old nonce-bound iframe remains available only for older clients.
- Keeps the same response payload and request ID after uncertain saves. Editing stays disabled while retrying, and the sheet deduplicates the durable request ID under a lock.
- The sheet is append-only. A confirmed response is read-only in that page session. A fresh page session can submit a new response; this is not an authenticated identity or an overwrite-by-person system.
- The backend has no public response, roster, or export read API. It does not send email.

## Files

- `sheets/Code.gs`: bounded validation, locked append, durable request-ID deduplication, formula escaping, flush/read-back verification, controlled errors.
- `sheets/Bridge.html`: nonce/source/origin handshake and `google.script.run` bridge.
- `sheets/appsscript.json`: V8/UTC manifest with the Google Sheets scope needed for `SpreadsheetApp.openById`.
- `lib/sheets.ts`: strict payload/name validation and backward-compatible iframe transport.
- `lib/sheets-fetch.ts`: credential-free bounded POST transport.
- `lib/pending.ts`: exact-envelope same-tab recovery and duplicate-safe blocking.
- `src/Survey.tsx`: review-only name and submit/retry states.
- `docs/config.js`: public production Apps Script endpoint, with the legacy `apiBase` kept blank.
- `docs/app.js`: rebuilt production browser bundle.

## Activation steps

1. Use the organizer’s existing private RSVP spreadsheet. Keep its sharing private. Choose an empty response tab or a new tab; do not clear, rename, or replace an existing nonempty response tab.
2. In the intended Apps Script project, put `Code.gs` and `Bridge.html` in files named Code and Bridge. Use the manifest only after reviewing any existing project settings. The standalone backend requires Google Sheets OAuth access for the authorized organizer. This code does not itself grant access or complete consent.
3. Set Script Properties `RSVP_SPREADSHEET_ID` to the private spreadsheet ID and `RSVP_SHEET_NAME` to the chosen tab. The default is Responses. Keep these properties out of the repository and site.
4. Deploy a web app that executes as the organizer and permits intended unauthenticated attendees to reach the submission endpoint, if the account’s policy allows it. Do not broaden the spreadsheet’s sharing. Complete required authorization with the owner. If school policy prevents that access mode, stop and report the blocker.
5. Copy the exact production URL `https://script.google.com/macros/s/DEPLOYMENT_ID/exec` into `docs/config.js` as `sheetsEndpoint`. Keep `apiBase: ''`. `/dev`, query parameters, and alternate hosts are rejected. The allowed survey parent origin is exactly `https://mrh-swes.github.io`.
6. Deploy the updated static `docs` files together. The config is separate from the bundle; changing its endpoint does not require bundling, but use the current cache-busting version on all asset URLs when publishing further config changes.
7. In an actual browser, open the public survey directly, optionally with `#name=Will`. Do not use `#invite=` for Sheets: that preserves the separate legacy D1 flow.
8. Make the single authorized test submission using clearly labeled test answers. Confirm exactly one expected row in the private sheet and a visible save confirmation. Test retrying the same request ID without adding another row before calling the backend operational. Keep any test row unless deletion was authorized.
9. Only then send the authorized test email, using the same verified public survey URL. Email sending is outside this implementation.

## Verification and limitations

Use Node 24+ and the pinned dependencies in `package.json`, then run `npm run verify`. No network or production services are contacted by the tests. The current local environment uses the already-installed dependencies; no new software was installed for this task.

The Apps Script runtime, account access mode, actual CORS redirect chain, and a real private-sheet round trip require browser validation after deployment. Mock tests are not proof of a working deployment. Verify readable credential-free health and POST responses from the actual GitHub Pages origin, read back the synthetic row, and test the final survey bundle in the intended browser before declaring a deployment operational.

Browser origin and response checks protect the transport, not attendee identity. A public append service can be called by others who know its endpoint. Names are explicitly self-reported. Rate/row bounds limit resource use; they are not strong anti-abuse authentication. No staff roster or credential is embedded.

Retry deduplication survives backend timeouts and duplicate calls for the same request ID. The current client keeps an unconfirmed exact envelope in this tab’s session storage and can automatically restore it after a same-tab reload for 24 hours. An incompatible, expired, clock-skewed, or endpoint-mismatched record is retained and blocks a new submission until the organizer checks it. Storage failures are disclosed; keep that tab open and retry its in-memory envelope. The new code cannot recover answers from a closed/reloaded old-version tab, and no cross-tab or cross-browser transfer is promised. Confirmed saving clears only the exact matching stored payload and endpoint. There is no public lookup endpoint that could expose prior answers.

Official runtime references: [ContentService JSON and redirects](https://developers.google.com/apps-script/guides/content), [web app request events](https://developers.google.com/apps-script/guides/web), [HTML-service server calls](https://developers.google.com/apps-script/guides/html/communication), [iframe sandbox restrictions](https://developers.google.com/apps-script/guides/html/restrictions), and [ALLOWALL framing](https://developers.google.com/apps-script/reference/html/x-frame-options-mode).
