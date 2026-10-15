# Private Google Sheets RSVP backend

## Status

This folder contains the Apps Script backend source and mocked tests. The authorized production web-app endpoint has been deployed and configured in `docs/config.js`. A real browser-to-private-Sheet round trip is still required before reporting collection as operational. The tests below do not verify live account permissions or create real respondent records.

`Code.gs` is the Apps Script V8 server. `Bridge.html` is its HTML-service transport, maintained alongside the site's client transport. `test-code.mjs` runs the server in a Node VM with deterministic Apps Script mocks and compares its approved choices and name validation with the site.

Run locally from the project root with Node 24 or another Node version supporting TypeScript type stripping:

```sh
node sheets/test-code.mjs
```

The current suite has 136 tests. It makes no network requests and requires no Google account or credentials. Its mocks establish local validation/control-flow behavior; they do not establish Google deployment permissions, actual iframe behavior, or live storage availability.

## Owner setup, when deployment is authorized

1. Choose a private spreadsheet owned by the intended organizer. Keep its sharing restricted to explicitly authorized organizers. Do not publish it or enable link-access sharing for respondents.
2. Create or select an Apps Script project running the V8 runtime. Add `Code.gs` and an HTML file named `Bridge` containing `Bridge.html`.
3. In the project's **Script Properties**, set:
   - `RSVP_SPREADSHEET_ID`: the private spreadsheet's ID.
   - `RSVP_SHEET_NAME`: optional tab name; defaults to `Responses`.
4. Do not copy the spreadsheet ID into the site, HTML template, URL parameters, public repository, or response objects. Script Properties are visible to project editors, so grant edit access only to trusted organizers.
5. The designated response tab may be missing or completely empty. The backend creates the missing tab or initializes an empty tab with the exact headers below. Existing nonempty tabs must have precisely that header layout. It never clears existing rows to fix a mismatch.
6. Authorize and deploy the web app only after the owner approves the required access and intended anonymous respondent access. A deployment intended for the no-Google-sign-in site needs the appropriate web-app access policy and execution as its authorized owner. Workspace policy may prevent this; local tests cannot determine it.
7. Put only the deployment's `/exec` URL in the site's approved configuration. The deployment URL is a public submission endpoint, not a secret. Use the versioned deployment, rather than the editor's `/dev` URL.
8. Run the live acceptance checks below before enabling or sharing collection links. Changes to Apps Script source must be included in an updated deployment version.

The script also maintains `RSVP_RATE_START_MS` and `RSVP_RATE_COUNT` in Script Properties. These are operational counters, not credentials. Do not manually edit them during active collection.

## Bridge and public API

The only public top-level functions are `doGet(e)`, `doPost(e)`, and `submitResponse(payload)`. There is no exported response reader, lookup API, administrative reset, or public sheet-management function. All helpers end in `_`, which makes them unavailable through `google.script.run`.

The exact query `?health=1`, with no extra or repeated parameters, returns ContentService JSON `{"ok":true,"service":"staff-rsvp","protocolVersion":2}`. It reads no Script Properties or spreadsheet and performs no writes. This is a public transport diagnostic, not proof that collection is operational. Other GET queries cannot submit responses.

`doPost(e)` accepts a JSON envelope in a `text/plain;charset=UTF-8` or `application/json` body, rejects nonempty query strings, and bounds the complete body to 20,000 UTF-8 bytes before JSON parsing. It invokes the same `submitResponse` validation, locking, deduplication and verified write path, then returns only a JSON acknowledgment. Form-encoded submissions are not supported. ContentService redirects must be followed. Live checks verified the deployed credential-free CORS health/POST route from the actual GitHub Pages origin before enabling the current browser transport. Re-verify that behavior when changing deployments; local mocks cannot establish it.

For the existing HTML bridge, `doGet(e)` requires `e.parameter.channelNonce` to be exactly 32 lowercase hex characters. A missing or invalid nonce returns an inert page. A valid nonce renders the `Bridge` template with:

```text
parentOriginJson = JSON.stringify('https://mrh-swes.github.io')
channelNonceJson = JSON.stringify(validatedNonce)
```

That bridge response enables framing with `HtmlService.XFrameOptionsMode.ALLOWALL`. The paired bridge/client validate exact origins, source windows, protocol version, and the per-iframe nonce. The allowed parent origin is fixed in server source; no query parameter can override it. `getBridgeConfig_()` is private and returns only the approved parent origin and protocol version `1`.

The RPC accepts exactly this envelope:

```json
{
  "requestId": "00000000-0000-4000-8000-000000000001",
  "responseName": "Avery Teacher",
  "answers": {
    "interest": "interested",
    "experience": "Regularly",
    "tools": [],
    "uses": [],
    "beliefs": [],
    "blockers": [],
    "example": "",
    "question": "",
    "availability": ["session-a"]
  }
}
```

The example ID is a schema illustration only. Real clients must generate a fresh random lowercase UUID v4 with `crypto.randomUUID()` for a new response. They must retain **the exact entire payload and the same request ID** after an uncertain or failed attempt. Regenerating an ID to retry can produce a second response.

Successful replies contain only:

```json
{"ok": true, "requestId": "00000000-0000-4000-8000-000000000001"}
```

Controlled errors contain only `ok: false`, the valid request ID (or an empty string for an invalid ID), and a bounded safe `error` message. Server exceptions, spreadsheet IDs, names, answers, and stack traces are never relayed. An Apps Script platform failure can still invoke the RPC failure handler before this function completes; the bridge handles that as unconfirmed, never success.

## Validation and storage

- The complete JSON envelope is at most 20,000 UTF-8 bytes, checked before acquiring a lock or accessing Sheets.
- The response name is self-reported. It is trimmed, repeated whitespace is normalized, and the stored name is at most 60 JavaScript code units. It must contain a Unicode letter or number and cannot contain ASCII control characters. This matches the host's normalization.
- Example and question text are strings bounded at 500 and 3,000 JavaScript code units respectively, checked before trimming. No text is silently truncated.
- Choices are exact approved values from `lib/survey.ts`; duplicates, unknown values, malformed arrays, unknown keys, conflicting exclusive choices, and over two beliefs are rejected.
- Exactly one availability value is required: `session-a`, `session-b`, `neither`, or `updates`.
- `session-a` is Tuesday, November 3, 2026, 3:30–4:30 p.m. Pacific (PST). `session-b` is Thursday, November 5, 2026, at the same time. This endpoint records interest; it does not reserve seats or confirm a booking.
- The four interest IDs are `curious`, `interested`, `eager`, and `eager_unsure`. To preserve baseline legacy behavior, an omitted interest is stored blank. An explicitly empty, null, or unknown interest is rejected.
- For `Not yet`, tool and use selections are stored as empty arrays, matching the baseline's beginner branch. Other answers are preserved.
- Every text cell passes through formula escaping, including names and free text. Leading `=`, `+`, `-`, `@`, or an apostrophe, including after whitespace/control/format marks, receives an escape apostrophe. Response rows are also formatted as plain text. Read-back verifies that no cell contains a formula and accommodates Sheets consuming one escape apostrophe.

Columns, in fixed order:

```text
received_at_utc
request_id
payload_sha256
response_name
interest
experience
tools
uses
beliefs
blockers
example
question
availability
```

Timestamps are server-generated UTC ISO strings. Multi-select values are JSON arrays in individual cells. Interest and availability use the approved IDs. `payload_sha256` is computed server-side from the accepted untrimmed field values in fixed field order, excluding `requestId`. This binds original whitespace, array ordering, and even beginner choices removed from stored presentation. Object key ordering does not affect the fingerprint.

## Commit, retry, and concurrency behavior

A script-wide lock covers sheet creation/header checks, deduplication, rate reservations, append, flush, and verification. Contention waits up to ten seconds and then returns a retryable controlled error.

1. Validate input and compute the server SHA-256 fingerprint.
2. Acquire the script lock and inspect the configured private tab.
3. Verify its exact headers and reject formula headers or an unexpected layout.
4. Scan only request IDs and hashes, with a maximum of 10,000 response rows.
5. If the request ID already exists with a different fingerprint, return a conflict and append nothing. Reusing an ID must never update an earlier row.
6. If the ID and fingerprint already match, verify the complete stored row and return the same success. No new timestamp, quota reservation, or response row is created.
7. For a new ID, reserve one attempt in the global rate window and append one complete row immediately after the existing rows.
8. Call `SpreadsheetApp.flush()` while still holding the lock, then read the complete row back and verify its contents and absence of formulas. Only after this succeeds return `ok: true`.
9. Release the lock.

If an append or flush has an uncertain outcome, the response is a failure. Retrying the frozen request can recognize the already-committed row and safely succeed. A partial or altered row fails verification and requires organizer investigation; the script does not silently repair it, overwrite it, or create another row for the same request ID.

The collection is append-only by request ID. A new request ID can append a new response from the same self-reported name; this system does not verify identities or replace responses by name. A genuine request to change a completed response needs an explicitly designed organizer workflow. Do not describe repeat submissions as automatically replacing earlier responses.

Do not edit, delete, clear, or overwrite the collection tab while it is serving submissions. Apps Script locks coordinate executions of this script; they do not lock out human editors or other scripts. Removing request-ID history defeats deduplication. If organizers need alternate views, use separate authorized analysis tabs or a separate private report.

## Limits and threat model

- At most 60 **new attempts** are reserved in a fixed one-minute window. A failed attempt can consume a reservation; this is conservative protection against ambiguous writes. A retry of an already-committed identical request bypasses this throttle. Other unsaved requests may need to wait for the next window.
- At most 10,000 response rows are accepted. At capacity, a committed identical retry still works, but a new request is rejected. If a tab already exceeds the cap, requests fail closed before scanning its metadata.
- The public site and bridge origin checks guard the browser messaging channel; they do not authenticate the respondent. Anyone who can reach a publicly available web app can potentially attempt a submission using its public RPC. Names and request IDs are not identity proof.
- This is a modest-volume collection design, not strong bot protection. The global throttle does not identify users or IPs and can itself be exhausted. Apps Script quotas, anonymous-access restrictions, and service availability also apply. If strong admission controls are needed, use a separately authorized authenticated backend or a verified invitation mechanism.
- The response sheet and script project must remain private. No respondent should receive spreadsheet access. Do not add data-returning public helpers or log submitted answers.
- Do not send student names, confidential information, credentials, or other unnecessary sensitive content in example/question fields.

## Live acceptance checks still required

Use approved synthetic test responses and a designated private test sheet. No real respondent data is needed.

1. Load the deployed site from the exact approved parent origin and submit a synthetic response. Verify one complete private row, the correct timestamp and choices, and success only after the server acknowledgement.
2. Resubmit the **identical ID and payload** and verify the row count does not change. Change one answer while keeping that ID and verify a conflict without a second row.
3. Simulate an interrupted/uncertain client acknowledgement, then retry the frozen payload and verify exactly one row.
4. Check literal formula-looking text and leading apostrophes in the live sheet; verify plain text, no formulas, and successful identical retry.
5. Test both approved session IDs, `neither`, `updates`, Unicode names, and the `Not yet` branch.
6. Verify the iframe's actual Google redirect/nesting works with the client source/origin checks. Confirm missing/invalid nonces and messages from other origins never invoke submission.
7. Confirm the Google deployment can be reached under the intended access policy without granting respondents sheet access. Confirm no private ID or response data appears in the public page/config, rendered bridge, or returned RPC objects.
8. Verify the site's disabled/unconfigured mode, network failure, RPC failure, timeout, and malformed acknowledgement all preserve answers and avoid a saved-success message.

## Primary API references

- [Apps Script HTML-service communication and private functions](https://developers.google.com/apps-script/guides/html/communication)
- [Apps Script lock service](https://developers.google.com/apps-script/reference/lock/)
- [SpreadsheetApp.flush and spreadsheet operations](https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet-app)

These document the private-helper naming convention, script locking, and flushing pending spreadsheet changes. Local tests deliberately mock those APIs rather than claiming to test Google's infrastructure.
