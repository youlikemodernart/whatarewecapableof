# Systems research review page

Route: `/internal/systemresearch/`
Status: noindex, nofollow, internal only

## What this page is

A browser-accessible internal review surface for WAWCO's AI systems architecture research. It maps the active abstractions, research arms, operating rules, and current evidence streams behind Noah's AI system development process.

The page should read as a high-level systems research map. Ezra production operations is the first concrete case study, not the frame for the whole page.

## Source model

This page is synthesized from a source packet rather than a single canonical Markdown record.

Primary source groups:

- Ethos and architecture memory: `~/.pi/projects/-Users-noah--pi/memory/reference_ai_systems_ethos.md` and `~/.pi/projects/-Users-noah--pi/memory/project_ai_systems_architecture.md`
- Orchestration research: `~/.pi/projects/-Users-noah--pi/research/agent-orchestration-papers-2026-05-06/`
- Shared patterns: `~/.pi/projects/-Users-noah--pi/memory/reference_ai_systems_pattern_library.md`
- Talent manifest layer: `~/.pi/agent/talents/README.md`
- Ezra pilot evidence: `~/Projects/ezra-arthur-ai-systems-ethos/research/production-operations-agent-pilot/` and its active workboard

The HTML page is a review surface. Source truth stays in Markdown, CSV, JSON, YAML, workboards, proposal packets, scripts, and accepted memory files.

## How to update this page

1. Read the current source packet named in the page.
2. Check the active Ezra workboard if the page still references the production operations pilot.
3. Check the shared pattern library for promoted reusable patterns.
4. Draft revised page copy in Markdown before editing HTML when the page frame changes materially.
5. Edit `internal/systemresearch/index.html` to reflect the approved revision.
6. Update the `Updated` date in the meta line and footer if needed.
7. Update the source packet section.
8. Commit and deploy only after Noah approves the content and the publish action.

There is no generator script. The page is hand-edited HTML so the structure stays intentional and reviewable. If update frequency increases, a generator can convert a Markdown source file into this HTML format using the existing CSS tokens and page structure.

## Adding new research arms

When a new research arm is added:

1. Add it to the active research arms section.
2. Add its source file or folder to the source packet.
3. Classify any reusable conclusions before closeout: project-only context, reusable client-operations pattern, general AI systems principle, tool-evaluation finding, approval or security boundary, or candidate template.
4. Promote reusable conclusions to the shared pattern library with evidence links and without private or client-specific data.

## Keeping the page in sync

The page should lag source truth by one manual edit, not become source truth itself.

Sync steps:

1. Read the current source packet.
2. Compare source claims against the HTML page.
3. Mark draft-level claims as draft-level in the page language.
4. Remove stale operational detail that belongs in workboards or proposal packets.
5. Edit the HTML.
6. Verify the local page.
7. Commit, push, deploy, and verify production only after approval.

## Auth and access

The page is served without authentication. It relies on noindex/nofollow and an unlisted path for obscurity. The tracker at `/tracker/` uses a password and signed-cookie session pattern. That pattern could be reused for this page later if authentication becomes necessary.
