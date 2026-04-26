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
