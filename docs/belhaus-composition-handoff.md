# BELHAUS composition handoff

Created 2026-04-26 as a compaction-safe session handoff.

## Core correction

The active BELHAUS proposal lives in the What are we capable of? site:

```txt
~/Projects/whatarewecapableof/proposals/belhaus/index.html
https://whatarewecapableof.com/proposals/belhaus
```

Future proposal edits should be grounded in the WAWCO taste profile and proposal components:

```txt
~/Projects/whatarewecapableof/design/taste-profile/profile.md
~/Projects/whatarewecapableof/design/system-constraints.md
~/Projects/whatarewecapableof/css/proposal-media.css
~/Projects/whatarewecapableof/docs/proposal-composition-partner.md
```

The old standalone BELHAUS proposal project is historical source material only:

```txt
~/Projects/belhaus-proposal/
```

Do not use the old Aktiv Grotesk / BDR Mono / Futura PT BELHAUS-styled proposal surface for future live edits. Use the WAWCO proposal surface: left anchored, mono metadata, prose body, 24px baseline, black on white, blue only for state, sticky tabs, no cards, no shadows.

## Session work completed

### Active WAWCO proposal edits

File changed:

```txt
~/Projects/whatarewecapableof/proposals/belhaus/index.html
```

Tone fixes applied from the belhaus-advisor warnings:

1. Page title and proposal meta now use `BELHAUS` casing.
2. Artlogic / ArtCloud language changed from "wrong for what you want" to "weak fits for this specific goal."
3. Removed speculation that Artlogic did not stick because of the same labor loop.
4. Artsy sync is now conditional on Georgie confirming the Partner API route.
5. "Intelligence" now gets translated into relationship notes, passed-on works, fair context, and outreach timing.
6. Several `Belhaus` references inside the active proposal changed to `BELHAUS`.

Important: these tone fixes were applied during the context correction. If Noah wanted them held until after the visual pass, review the diff before publishing.

### Composition files created

Tracked new files:

```txt
~/Projects/whatarewecapableof/proposals/belhaus/media-slots.md
~/Projects/whatarewecapableof/proposals/belhaus/media-slots.json
```

Ignored local-only draft:

```txt
~/Projects/whatarewecapableof/proposals/belhaus/slots/index.html
```

The slot board loads `/css/proposal-media.css` and uses WAWCO-style placeholder frames, not BELHAUS standalone styling. Browser preview pass completed at 375, 768, 1280, and 1600 CSS px with no horizontal overflow on any tab. The mobile diagram placeholders were adjusted from single-column stacks to compact two-column lists so they do not dominate the page.

2026-04-26 update: Noah tagged BEL-02 media and FAVE atmosphere candidates in Are.na. The local slot board now uses tagged BEL-02 artwork images in the private catalog artifact and one FAVE atmosphere image on each proposal tab: Overview, System, and Approach. Noah said the images look good and he likes the placements. The downloaded source images live under ignored `proposals/belhaus/img/src/`.

Typography trial: the BELHAUS proposal and proposal template now keep scope-phase list items and table body text at body size (`--size-m`) instead of shrinking them to `--size-s`. Phase labels, table headers, captions, and metadata remain small because those are role labels, not body prose.

Fresh-session graphics handoff: `docs/belhaus-graphics-generation-handoff.md`. Context-update audit: `docs/belhaus-context-update-audit-2026-04-26.md`.

### 2026-04-29 diagram rebuild

Three inline SVG diagrams from commit `22f14d6` were stripped and rebuilt from scratch using the audited diagram-maker skill. Each built by an independent subagent with no knowledge of the old implementations. New IDs: `#bel-system-architecture`, `#bel-table-connections`, `#bel-agent-cycle`. The new diagrams use text-and-rule vocabulary (no boxes-and-connectors). Verified at 1280px and 375px, no overflow. Not yet committed or deployed. The live HTML/CSS objects (BEL-01 operating model, BEL-03 relationship index, BEL-04 approval sequence) and all media remain in place. Old implementations in git history at `22f14d6`.

### 2026-04-26 live insertion update

The approved local slot-board direction has been incorporated into the active proposal source locally:

```txt
~/Projects/whatarewecapableof/proposals/belhaus/index.html
```

No deploy has been run for this pass.

Final deployable assets now exist in tracked `proposals/belhaus/img/`:

```txt
atmosphere-approach-conversation.jpg
atmosphere-overview-interior.jpg
atmosphere-system-crowd.jpg
bel-02-borders.webp
bel-02-cause-effect-iii.webp
bel-02-sound-of-resonance.webp
bel-02-tiles.webp
bel-02-trophy-head-iii.webp
```

Raw source assets remain ignored under `proposals/belhaus/img/src/`. The local slot board remains ignored under `proposals/belhaus/slots/`.

The live proposal now includes:

1. One FAVE atmosphere image on Overview, System, and Approach.
2. `BEL-01` as live HTML/CSS: a three-band operating model.
3. `BEL-02` as a private catalog artifact with five artwork images and the mono copy `Draft: Five works I thought you'd want to see.`
4. `BEL-03` as live HTML/CSS: a relationship-index table placed after the five-table data model table.
5. `BEL-04` as a live `.proposal-process-timeline` approval sequence.

The failed graphic-system bitmap drafts remain calibration artifacts. Do not replace the live BEL-01 or BEL-03 objects with bitmap outputs unless Noah explicitly asks for a new graphic-system exploration.

### Implemented slots

1. `BEL-01`: operating model
   - Anchor: Overview after stat row and before `What you'd have`
   - Job: diagram, orientation
   - Treatment: live HTML/CSS three-band object
   - Content: source of truth, working surfaces, outputs and integrations
   - Rule: keep Artsy pending and keep Gino or Chloe approval visible

2. `BEL-02`: private catalog artifact
   - Anchor: Overview after private catalog paragraph and before Artsy note
   - Job: artifact, specimen
   - Treatment: live HTML/CSS artifact using optimized artwork images
   - Content: one selected work, four related works, draft mono status line
   - Rule: frame it as a draft artifact, not final product UI

3. `BEL-03`: relationship index
   - Anchor: System after the five-table data model table and before `The fields are yours`
   - Job: diagram
   - Treatment: live HTML/CSS relationship table
   - Content: examples of records held in the Relationships table and what each connects
   - Rule: place after the five-table table so the reader has context first

4. `BEL-04`: approval sequence
   - Anchor: System after `The agent proposes; you decide.` and before Integrations
   - Job: sequence
   - Treatment: live `.proposal-process-timeline`
   - Content: source arrives, AI prepares draft, Gino or Chloe approves, database updates, catalog or outreach uses the record

Parked:

5. `BEL-05`: build timeline
   - Add only when terms and scope are ready
   - Reason: a polished timeline can make the 1 week plus 4 to 5 week structure feel committed before pricing is settled

## Project memory and agent updates

Files updated to preserve the correction after compaction:

```txt
~/.pi/projects/-Users-noah--pi/memory/project_belhaus.md
~/.pi/projects/-Users-noah--pi/memory/reference_whatarewecapableof_proposal_composition.md
~/.pi/agent/agents/belhaus-advisor.md
~/.pi/agents/belhaus-advisor/AGENT.md
~/Projects/whatarewecapableof/PROPOSALS.md
```

These now state that the active BELHAUS proposal lives under WAWCO and should use WAWCO styling.

## Current git status summary

At the live-insertion handoff point, relevant WAWCO changes include:

```txt
M  PROPOSALS.md
M  docs/asset-inventory.json
M  docs/asset-inventory.md
M  docs/directory-map.md
M  docs/site-dashboard.html
M  proposals/_template/index.html
M  proposals/belhaus/index.html
?? docs/belhaus-composition-handoff.md
?? docs/belhaus-context-update-audit-2026-04-26.md
?? docs/belhaus-graphics-generation-handoff.md
?? proposals/belhaus/img/
?? proposals/belhaus/media-slots.json
?? proposals/belhaus/media-slots.md
!! proposals/belhaus/img/src/
!! proposals/belhaus/slots/
```

Some tracked modifications predate this live media insertion. Do not assume every modified file belongs to this pass. The ignored slot board and raw source image directory are expected because `.gitignore` includes `proposals/*/slots/` and `proposals/*/img/src/`.

The accidental standalone slot board under `~/Projects/belhaus-proposal/slots/` was removed. Its `.gitignore` is back to only `.vercel`.

## Preview command

Use this from the WAWCO repo root:

```sh
cd ~/Projects/whatarewecapableof
python3 -m http.server 8888
```

Open:

```txt
http://127.0.0.1:8888/proposals/belhaus/slots/
```

Live proposal preview:

```txt
http://127.0.0.1:8888/proposals/belhaus/
http://127.0.0.1:8888/proposals/belhaus/?v=live-slots-final
```

## Browser test results

Local URL tested:

```txt
http://127.0.0.1:8888/proposals/belhaus/slots/
```

Viewport results:

```txt
375 CSS px: no overflow on Overview, System, Approach, or ?
768 CSS px: no overflow on Overview, System, Approach, or ?
1280 CSS px: no overflow on Overview, System, Approach, or ?
1600 CSS px: no overflow on Overview, System, Approach, or ?
```

Screenshots saved for review:

```txt
/tmp/belhaus-wawco-slots-1280-overview-v3.png
/tmp/belhaus-wawco-slots-1280-bel01-v3.png
/tmp/belhaus-wawco-slots-375-bel01-v2.png
/tmp/belhaus-slots-v4-overview-1280.png
/tmp/belhaus-slots-v4-system-1280.png
/tmp/belhaus-slots-v4-approach-1280.png
/tmp/belhaus-slots-v4-approach-phase-1280.png
/tmp/belhaus-slots-v4-approach-table-1280.png
/tmp/belhaus-slots-v4-approach-375.png
/tmp/belhaus-live-overview-top-1280.png
/tmp/belhaus-live-bel01-1280.png
/tmp/belhaus-live-bel03-1280.png
/tmp/belhaus-live-bel01-375.png
/tmp/belhaus-live-bel03-375.png
```

Active proposal validation completed after insertion:

```txt
375, 768, 1280, 1600 CSS px: no horizontal overflow on Overview, System, Approach, or ?
Visible active-tab images: loaded successfully after scrolling into view
Artsy language: pending or conditional
Approval language: Gino or Chloe remains explicit
Diagram body text: var(--size-m) at each breakpoint
```

After BEL-03 was moved below the five-table data model table, System tab overflow was rechecked at 375, 768, 1280, and 1600 CSS px and passed.

## Next steps

1. Rerun full active proposal QA after any additional copy or spacing edits.
2. Review the local active proposal in Safari or Chrome before committing.
3. Commit only the intended BELHAUS media pass and documentation updates; separate unrelated tracked modifications if needed.
4. Deploy only when Noah explicitly asks.
5. Keep `BEL-05` parked until terms are ready.

## Open questions

- Should this local media pass be deployed as-is after review?
- Should the failed BEL-01 and BEL-03 bitmap directions be revisited later inside `~/Projects/graphic-system`, or treated only as calibration?
- Should the table body text remain `--size-m`, or should dense data tables get a named small-text exception while scope-phase lists stay body size?
