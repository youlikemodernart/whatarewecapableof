# Systems research review page

Route: `/internal/systemresearch/`
Status: noindex, nofollow, internal only

## What this page is

A browser-accessible internal review surface for Noah's AI systems architecture research. It tracks the current state, active decisions, open loops, and tool intake rubric. It is a review surface; the Markdown record is the source of truth.

## Canonical source

The page content comes from:
`ezra-arthur-ai-systems-ethos/research/production-operations-agent-pilot/systems-research-review-record-2026-05-09.md`

Reusable patterns come from:
`.pi/projects/-Users-noah--pi/memory/reference_ai_systems_pattern_library.md`

When the research produces a new review record (a new date or a revised version), the canonical source path updates.

## How to update this page

1. Update the canonical Markdown source in the ezra-arthur-ai-systems-ethos project.
2. Promote reusable lessons into `.pi/projects/-Users-noah--pi/memory/reference_ai_systems_pattern_library.md` when they generalize beyond the project.
3. Edit `internal/systemresearch/index.html` to reflect the changes.
4. Update the "Updated" date in the meta line at the top of the page.
5. Update the source packet section to reference the current canonical file and shared pattern library.
6. Commit and deploy.

There is no generator script. The page is hand-edited HTML that mirrors the Markdown source. This keeps the page structure intentional and the update process visible. If update frequency increases, a generator script could convert the Markdown source into this HTML format using the existing CSS tokens and page structure.

## Adding new research records

When a new review record is written (for example, `systems-research-review-record-2026-06-01.md`):

1. Update the canonical source path reference in the HTML and in this README.
2. Update the "Updated" date in the internal-meta line.
3. Revise the content sections to reflect the new state: research tracks, decisions, open loops.
4. Add or remove research tracks, decisions, and open loops as needed.
5. Update the source packet to reference the new file and any new related files.

## Keeping the page in sync

The Markdown record is canonical. The HTML page lags by one manual edit. Pi or Claude can perform the update by reading the new Markdown source and editing the HTML.

Sync steps:
1. Read the current Markdown review record.
2. Read the shared AI systems pattern library.
3. Compare both sources against the HTML page content.
4. Edit the HTML to match the current state.
5. Commit and deploy.

## Auth and access

The page is served without authentication. It relies on noindex/nofollow and unlisted path for obscurity. The tracker at `/tracker/` uses a password and signed-cookie session pattern. That pattern could be reused for this page later if authentication becomes necessary.
