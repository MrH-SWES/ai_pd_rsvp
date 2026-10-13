# Portable PD RSVP API

Standalone Cloudflare Worker + D1 backend for a static GitHub Pages survey. No application runtime dependencies, no Sites authentication, no public organizer endpoints, and no real invitations/data included. This directory has not been deployed.

## Contract and privacy

- `GET /api/invitation`, with `X-Invitation: <64 lowercase hex characters>`, returns only `{name,sessions}` for an active invitation.
- `POST /api/response`, same header, `Content-Type: application/json`, and the existing survey Answer JSON, returns `{ok:true}` after a successful D1 upsert. It overwrites that invitation's previous submission, rather than adding duplicate responses.
- All requests require an exact `Origin` matching `ALLOWED_ORIGIN`. Browser preflights are supported; wildcard origins and cookie credentials are not. The Worker URL and allowed frontend origin are public configuration, not secrets.
- Tokens are 32 cryptographically random bytes. D1 stores SHA-256 hashes only. Invitation URLs use `#invite=...` so the token is not sent to GitHub Pages in the page request. The frontend sends it to this API in the header.
- There is no list, prior-answer, roster, export, or organizer API. Administrative work uses authenticated Wrangler on the owner's computer.
- Requests are capped at 20,000 bytes, even if Content-Length is absent or false. Selections, uniqueness, exclusive choices, text limits, and current session IDs are validated server-side. No submitted metadata is accepted as trusted identity.
- Treat invitation links as passwords: anyone holding one can see the greeting and submit/replace its response. This is bearer-link access, not identity verification. CORS limits browsers; it does not stop a non-browser client spoofing Origin. Token secrecy provides authorization.
- No request bodies, tokens, or errors are explicitly logged; Worker observability is disabled in the supplied configuration. The hosting provider may still retain platform logs. Do not enable header/body logging on this API. Put no student information in survey prompts or answers.
- A GitHub Pages origin such as `https://OWNER.github.io` is shared by all repository paths under that account. CORS cannot isolate one repository path. Use a dedicated custom domain if that boundary matters.

## Tests (no installation needed)

Requires Node 22+:

```sh
npm test
```

Tests use deterministic invitation fixtures and a mock D1 implementation. They verify route contracts, rejection paths, CORS, token hashing, payload limits, and upserts. They do not establish live Cloudflare behavior. Complete a real end-to-end test with a synthetic invitation before inviting staff.

## Deployment prerequisites

1. Decide/approve the actual GitHub repository and frontend origin, and the external Cloudflare hosting/storage arrangement. This package does not create a repository, send invitations, or deploy anything.
2. Owner has a Cloudflare account with Workers/D1 enabled and permission to store the intended survey information there. Check applicable organizational policies, provider terms, and billing before use.
3. Install the official Cloudflare Wrangler CLI from npm, choosing a reviewed version. It is a deployment tool, not a runtime dependency. Authenticate on the owner's device; never commit credentials. The commands below assume `wrangler` is available on PATH.
4. Confirm actual session labels, times, time zone, and location. No proposed dates are pre-seeded.
5. Provide the owner-approved recipient names privately. The minimal backend does not store email addresses.

Commands below are instructions, not actions already performed. Remote commands create/change Cloudflare resources and upload the supplied data; run only after the relevant approval.

```sh
wrangler login
wrangler d1 create pd-rsvp
```

Paste the returned database ID into `wrangler.toml`; replace `ALLOWED_ORIGIN` with the exact origin (e.g. `https://OWNER.github.io`, without `/REPO/`). Keep `DB` as the binding name. Then:

```sh
wrangler d1 migrations apply pd-rsvp --remote
wrangler deploy
```

Set the static frontend API base to the resulting HTTPS Worker origin, so the browser calls `https://YOUR-WORKER.workers.dev/api/invitation` and `/api/response`. Do not send Sites auth headers or cookies. GitHub Pages can serve only the frontend; these API routes run on the Worker.

For local integration instead, apply migrations with `--local`, run `wrangler dev --var ALLOWED_ORIGIN:http://localhost:3000`, and point the frontend to the local Worker. Local and remote D1 are distinct stores; provisioning a local database does not seed the remote one.

## Private provisioning

Store inputs inside ignored `private/` with restrictive permissions:

```sh
mkdir -m 700 private
```

`private/names.json` is a JSON array of recipient display names. `private/sessions.json` is an array of `{ "id": "session-a", "label": "Confirmed date", "detail": "Confirmed time, time zone and location" }` objects. Replace the descriptive placeholders with approved details. IDs must be unique and stable; `neither` and `updates` are reserved. Changing/removing IDs after responses arrive can make older answers refer to retired sessions; review any such change.

```sh
node scripts/provision.mjs private/names.json private/sessions.json https://OWNER.github.io/REPO/ private/batch-1
```

This only creates local files: `provision.sql` (hashed tokens + names + sessions) and `invitation-links.json` (names + bearer URLs). It performs no network calls, does not print bearer links, creates files mode 0600, and refuses to overwrite existing output files. Keep raw links secure; they cannot be recovered from their hashes. A new batch creates new links and does not revoke old links. Import only after reviewing the target and data:

```sh
wrangler d1 execute pd-rsvp --remote --file private/batch-1/provision.sql
```

For a synthetic local test, use `--local` instead. Never commit `private/`, publish it with the frontend, or include it in downloadable source bundles. Only distribute links to the intended people through an approved channel.

## Owner-only export and revocation

Export responses to an owner-local JSON file through authenticated CLI (not the web API):

```sh
umask 077
wrangler d1 execute pd-rsvp --remote --json --command "SELECT i.name,r.submitted_at,r.payload FROM responses r JOIN invitations i ON i.hash=r.invitation_hash ORDER BY r.submitted_at;" > private/responses.json
```

`payload` is a JSON string in the returned result envelope. If converting to CSV, escape cells and neutralize leading spreadsheet formula characters. Keep exports off GitHub and share only with approved recipients. For an administrative SQL backup:

```sh
wrangler d1 export pd-rsvp --remote --output private/backup.sql
```

To revoke a link, hash its 64-character token locally with SHA-256 (same `hashToken` function), and run a reviewed local SQL file containing `UPDATE invitations SET revoked=1 WHERE hash='ACTUAL_HASH';` via `wrangler d1 execute ... --file ...`. Revocation blocks new requests but does not erase submitted responses; a request already in progress may finish. Retention/deletion decisions are separate administrative actions. Configure rate limiting or other abuse controls separately before wider exposure if required; this package does not claim to include them.

## References

- [Cloudflare D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/)
