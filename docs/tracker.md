# Proposal tracker

Route: `/tracker/`

Purpose: private operating view for active proposal status. The tracker reads `PROPOSALS.md` through an authenticated API endpoint and lets Noah or Austin capture local notes for manual ingestion back into that file.

## Source of truth

`PROPOSALS.md` remains the source of truth.

The tracker parses active proposal entries and displays:

- name
- live URL
- prepared date
- status
- relationship
- tabs
- source
- what we are proposing
- open questions
- next action
- history
- deep docs

Do not create a second status file unless the workflow has outgrown `PROPOSALS.md`.

## Authentication

The tracker page loads as a login shell. Proposal data is returned only from `/api/tracker-data` when the signed session cookie is valid. `vercel.json` includes `PROPOSALS.md` in the tracker data function bundle and blocks direct public access to Markdown, static JSON, `/docs/*`, and `/design/*` source paths.

Required Vercel environment variable, choose one:

```txt
TRACKER_PASSWORD_HASH=sha256:<hex digest>
```

or:

```txt
TRACKER_PASSWORD=<plain password>
```

Recommended:

```txt
TRACKER_SESSION_SECRET=<long random string>
TRACKER_SESSION_DAYS=14
```

If `TRACKER_SESSION_SECRET` is absent, the tracker falls back to the configured password hash or password for cookie signing. Production should use a separate session secret.

Generate a password hash locally:

```bash
node -e "console.log('sha256:' + require('crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" 'your password here'
```

Use the printed value as `TRACKER_PASSWORD_HASH` in Vercel.

## Password rotation

The setup password was temporary. Rotate it later to a generated password or passphrase.

Rotation steps:

1. Generate a new password outside the repo.
2. Generate a SHA-256 hash with the command above.
3. Update `TRACKER_PASSWORD_HASH` in Vercel for Production, Preview, and Development.
4. Redeploy production.
5. Smoke-test `/tracker/`, login, and `/api/tracker-data`.

Do not write the raw password, hash value, session secret, cookies, or `.env.local` values into docs, memory, commits, or handoffs.

## Production source blocking

`vercel.json` blocks direct public access to Markdown files, static JSON files, `/docs/*`, and `/design/*`. `PROPOSALS.md` is still available to the tracker data function through `functions.api/tracker-data.js.includeFiles`.

Keep `404.html` and the blocked-route `dest: "/404.html"` rules. A Vercel route with only `"status": 404` may still send the original static file body with a 404 status. The generic destination prevents source-body exposure.

After changing `vercel.json`, retest:

```bash
curl -s https://whatarewecapableof.com/PROPOSALS.md | head -1
curl -s https://whatarewecapableof.com/docs/tracker.md | head -1
curl -s https://whatarewecapableof.com/package.json | head -1
```

Each should return the generic 404 HTML body, not source contents.

## Notes workflow

Notes are stored in browser `localStorage` under `wawco-tracker-notes-v1`. Individual notes are capped at 4,000 characters.

This is intentional for v1:

- no database
- no GitHub write token
- no automatic source-file mutation
- no extra operational surface

When notes are ready to ingest:

1. Open `/tracker/`.
2. Select a proposal.
3. Copy or download pending notes.
4. Fold the relevant updates into `PROPOSALS.md`.
5. Clear the proposal notes in the tracker.
6. Commit and deploy the updated source file.

## API files

- `api/_tracker.js`: auth helpers, cookie signing, parser
- `api/tracker-login.js`: password check and session cookie
- `api/tracker-logout.js`: clears session cookie
- `api/tracker-data.js`: protected parsed proposal data

## Local testing

Use Vercel dev so the API functions run:

```bash
TRACKER_PASSWORD=test TRACKER_SESSION_SECRET=test npx vercel dev
```

Then open:

```txt
http://localhost:3000/tracker/
```

The static Python server is useful for visual HTML pages, but it will not run the `/api/tracker-*` functions.
