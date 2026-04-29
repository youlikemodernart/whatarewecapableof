# BELHAUS graphics generation handoff

Created 2026-04-26 for a fresh session focused on final graphics for the BELHAUS proposal.

## 2026-04-29 status update

The three inline SVG diagrams from commit `22f14d6` were stripped and rebuilt from scratch (2026-04-29) using the audited diagram-maker skill. Three independent subagents each ran the full pipeline (intake, semantic model, renderer choice, render) with no knowledge of the old implementations. The new diagrams use text-and-rule vocabulary instead of boxes-and-connectors. Verified at 1280px and 375px, no overflow. Not yet committed or deployed. The draft YAML briefs below are stale. The rejection notes from the bitmap pass remain useful as calibration.

## Goal

If Noah asks to continue graphic-system work later, use the rejected BELHAUS bitmap drafts and the successful live HTML/CSS proposal objects as calibration material. Keep any new graphic-system outputs as review artifacts until Noah approves copying them into a live proposal repo.

Active proposal source:

```txt
~/Projects/whatarewecapableof/proposals/belhaus/index.html
https://whatarewecapableof.com/proposals/belhaus
```

Local slot board:

```txt
~/Projects/whatarewecapableof/proposals/belhaus/slots/index.html
http://127.0.0.1:8888/proposals/belhaus/slots/
```

Do not use the old standalone BELHAUS proposal repo for live work. It is historical source material only.

## Read first

Read these before generating anything:

```txt
~/Projects/whatarewecapableof/docs/belhaus-composition-handoff.md
~/Projects/whatarewecapableof/proposals/belhaus/media-slots.md
~/Projects/whatarewecapableof/proposals/belhaus/media-slots.json
~/Projects/whatarewecapableof/proposals/belhaus/slots/index.html
~/Projects/whatarewecapableof/proposals/belhaus/index.html
~/Projects/whatarewecapableof/design/taste-profile/profile.md
~/Projects/whatarewecapableof/design/system-constraints.md
~/Projects/whatarewecapableof/docs/proposal-composition-partner.md
~/Projects/whatarewecapableof/design/proposal-composition-system.md
~/.pi/projects/-Users-noah--pi/memory/project_graphic_system.md
```

If using the graphic system, also inspect:

```txt
~/Projects/graphic-system/briefs/fde/fde-02-growth.yml
~/Projects/graphic-system/briefs/fde/fde-05-yearly-rhythm.yml
~/Projects/graphic-system/briefs/examples/diagram.yml
```

## Current approved direction

Noah reviewed the local slot board with the FAVE atmosphere images and said the images look good and he likes where they are placed. That direction has been incorporated locally into the active proposal source. No deploy has been run for this pass.

The current local active-proposal placements are:

| Slot | Section | Active treatment | Asset or source |
|---|---|---|---|
| BEL-ATMO-01 | Overview | live image | `proposals/belhaus/img/atmosphere-overview-interior.jpg`; source Are.na block `45611715`, tagged `FAVE` |
| BEL-01 | Overview | live HTML/CSS three-band operating model | no bitmap asset |
| BEL-02 | Overview private catalog artifact | live HTML/CSS artifact with five works | `proposals/belhaus/img/bel-02-*.webp`; source Are.na blocks tagged `BEL-02` |
| BEL-ATMO-02 | System | live image | `proposals/belhaus/img/atmosphere-system-crowd.jpg`; source Are.na block `45611705`, tagged `FAVE` |
| BEL-03 | System | live HTML/CSS relationship-index table after the five-table data model table | no bitmap asset |
| BEL-04 | System | live `.proposal-process-timeline` approval sequence | no bitmap asset |
| BEL-ATMO-03 | Approach | live image | `proposals/belhaus/img/atmosphere-approach-conversation.jpg`; source Are.na block `45611709`, tagged `FAVE` |

The source files remain ignored under `proposals/belhaus/img/src/`. Final deployable assets now live in `proposals/belhaus/img/`.

## Rejected diagram direction

A first graphic-system pass created BEL-01 and BEL-03 as network-style bitmap diagrams under:

```txt
~/Projects/graphic-system/briefs/belhaus/
~/Projects/graphic-system/output/belhaus/
```

Noah rejected these drafts. The issue is taste and form, not just a rendering bug. Treat the current generated BEL-01 and BEL-03 outputs as failed drafts and do not copy them into the WAWCO proposal repo.

Observed problems:

- Connector-line diagrams created awkward visual noise and stray line fragments.
- The graphics felt like crude auto-layout exports rather than intentional WAWCO proposal objects.
- BEL-01 did not make the operating system clearer.
- BEL-03 was closer because it showed the Relationships table as connective, but it still felt generic.
- The typographic scale was too loud in the wrong places.

Refinement direction learned:

- Critique the current drafts first; do not start by rendering more bitmap variants.
- Prefer live HTML/CSS inside the proposal when the graphic depends on readable text.
- BEL-01 became a proposal-native three-band operating model.
- BEL-03 became a relationship-index table after the five-table data model table.
- Use position, grouping, sequence, and repetition before connector lines.

## Current typography trial

The proposal template and the BELHAUS page have been adjusted so scope-phase list items and table body text use body size:

```css
font-size: var(--size-m);
```

Phase labels, table headers, captions, metadata, and mono labels remain smaller because they are role labels, not body prose. The working rule is:

- Use size for role, not emphasis.
- Use bold only for inline emphasis or inline wayfinding.
- Do not shrink or enlarge body prose to make it feel subordinate.

Do not further edit `design/taste-profile/profile.md` or `design/system-constraints.md` without first explaining the system-level impact to Noah.

## Optional future graphic-system exploration

### BEL-01: operating system map

Placement in slot board:

```txt
Overview, after the stat row and before What you'd have
```

Job:

```txt
diagram, orientation
```

Recommended treatment:

- The active proposal already uses a live HTML/CSS three-band operating model. Treat that as the current working solution.
- Do not continue the connector-line network direction from the failed graphic-system draft.
- If using the graphic system later, use it only after choosing a form that is at least as readable as the live object.
- Better directions remain: three-band operating model, stack, or compact system table.
- Use `profile.typeStack: live-site` because the active proposal currently uses the live WAWCO system font stack plus Geist Mono.
- Keep it readable at 724px desktop placement and 327px mobile placement.
- Avoid icons, generic SaaS boxes, rounded cards, shadows, gray hierarchy, connector clutter, or a central hub diagram that feels like consulting theater.

Content to encode:

```txt
Airtable records
BELHAUS web app
AI agent
Private catalog links
Artsy sync, pending confirmation
Email drafts
Squarespace sales data, optional
```

Suggested relationship:

```txt
Airtable records are the source of truth.
The web app is the daily interface.
The AI agent drafts and prepares records, then waits for approval.
Private catalogs, email drafts, Artsy sync, and optional Squarespace data all use the database.
```

Do not imply that Artsy sync is solved. The graphic should mark it as conditional or pending confirmation.

### BEL-03: data model diagram

Placement in slot board:

```txt
System, after Five connected tables in Airtable. and before the data table
```

Job:

```txt
diagram
```

Recommended treatment:

- The active proposal already uses a live HTML/CSS relationship-index table after the five-table data model table. Treat that as the current working solution.
- Treat the first generated relationship-map draft as rejected.
- Prefer a live HTML/CSS relationship object unless a bitmap version clearly earns its place.
- Keep the graphic structural. The adjacent table already contains fields.
- Do not include many field names inside the graphic.
- Prefer a relationship table, restrained four-corner map, or connective index over five equal cards or a generic network graphic.

Content to encode:

```txt
Artworks
Collectors and contacts
Exhibitions and fairs
Consignments
Relationships
```

Suggested relationship:

```txt
Relationships is the connective table.
It links people to artists, collectors to artworks, artworks to exhibitions, works to consignments, and people to people.
```

Risk:

```txt
Five equal blocks can feel generic. The diagram needs to show why the model is useful, not just repeat the table headings.
```

### BEL-04: approval sequence

Placement in active proposal:

```txt
System, after The agent proposes; you decide. and before Integrations
```

Job:

```txt
sequence
```

Current treatment:

```txt
HTML process timeline using .proposal-process-timeline
```

Recommendation:

Keep this as HTML unless a generated graphic is clearly better. The sequence contains live text and makes the human approval rule explicit. HTML keeps it accessible and easier to revise. If a fresh session generates a graphic anyway, treat the adjacent HTML as the source text equivalent.

Content:

```txt
Source arrives: invoice, photo, email, voice memo, or sign-up sheet.
AI prepares a draft record or draft outreach.
Gino or Chloe reviews and approves.
The database updates, then catalog pages, outreach, or Artsy sync can use the record.
```

Risk:

```txt
Do not imply zero work for Gino or Chloe. The point is reduction and preparation, not removal of judgment.
```

### BEL-02: private catalog artifact

Placement in active proposal:

```txt
Overview, after the private catalog paragraph and before the Artsy note
```

Job:

```txt
artifact, specimen
```

Current treatment:

```txt
HTML artifact using BEL-02 tagged artwork images.
```

Recommendation:

Do not use the graphic system for this unless Noah asks for a single flattened artifact image. The current artifact is better as an in-page object because it can use real artwork images, preserve alt text, and avoid overpolishing a UI that does not exist yet.

If it becomes final:

- Keep it framed as an artifact, not final product UI.
- Use approved BELHAUS artwork only.
- Use root-relative image paths from tracked `proposals/belhaus/img/`, not `img/src/`.
- Avoid fake controls, fake metrics, or polished app chrome.

## Suggested graphic-system briefs

Use these as starting points, not final truth. Create them under:

```txt
~/Projects/graphic-system/briefs/belhaus/
```

Generated outputs should stay in:

```txt
~/Projects/graphic-system/output/belhaus/
```

Do not copy outputs into the WAWCO proposal repo until Noah approves the renders.

### Draft brief: BEL-01 operating system map

```yaml
id: bel-01-operating-system-map
name: BELHAUS operating system map
template: diagram-card
theme: whatarewecapableof
profile:
  path: /Users/noah/Projects/whatarewecapableof/design/taste-profile/profile.md
  project: whatarewecapableof
  typeStack: live-site
placement:
  context: proposal
  slot: BEL-01
  displayWidth: 724
  narrowWidth: 327
  mobileWidth: 327
  targetRatio: 16:9
  sourceTextEquivalent: adjacent-html
design:
  priority: diagram-led
  textScale: proposal-body
  hierarchyDepth: 3
  imagePriority: low
  overlayStrength: none
content:
  eyebrow: Operating system
  title: One database, several working surfaces.
  deck: The database is the source of truth. The app, agent, catalog links, email, and confirmed integrations use the same records.
  nodes:
    - label: 01
      title: Airtable records
      text: Source of truth for artworks, collectors, exhibitions, consignments, and relationships.
    - label: 02
      title: BELHAUS app
      text: Daily interface for search, edits, profiles, and private catalogs.
    - label: 03
      title: AI agent
      text: Prepares drafts and waits for approval.
    - label: 04
      title: Private catalog links
      text: Collector-facing views from selected works.
    - label: 05
      title: Artsy
      text: Sync path pending Georgie confirmation.
    - label: 06
      title: Email
      text: Drafts queue inside the existing sending flow.
layout:
  direction: horizontal
  columns: 3
  margin: 0
  titleWidth: 1600
export:
  filename: bel-01-operating-system-map
  outputDir: ../../output/belhaus
  format: jpg
  quality: 90
  writeHtml: true
  variants:
    - name: wide
      width: 1920
      height: 1080
      dpr: 1
      displayWidth: 724
    - name: mobile
      width: 1080
      height: 1080
      dpr: 1
      displayWidth: 327
```

### Draft brief: BEL-03 data model diagram

```yaml
id: bel-03-data-model
name: BELHAUS data model diagram
template: diagram-card
theme: whatarewecapableof
profile:
  path: /Users/noah/Projects/whatarewecapableof/design/taste-profile/profile.md
  project: whatarewecapableof
  typeStack: live-site
placement:
  context: proposal
  slot: BEL-03
  displayWidth: 724
  narrowWidth: 327
  mobileWidth: 327
  targetRatio: 16:9
  sourceTextEquivalent: adjacent-html
design:
  priority: diagram-led
  textScale: proposal-body
  hierarchyDepth: 3
  imagePriority: low
  overlayStrength: none
content:
  eyebrow: Data model
  title: Five tables, with relationships doing the connective work.
  deck: The point is not more fields. The point is connecting artworks, people, fairs, consignments, and histories in one place.
  nodes:
    - label: A
      title: Artworks
      text: Works, status, images, price, provenance, location.
    - label: B
      title: Collectors and contacts
      text: People, notes, history, interest, passed-on works.
    - label: C
      title: Exhibitions and fairs
      text: Where works were shown and who encountered them.
    - label: D
      title: Consignments
      text: Works in and out of BELHAUS, terms, dates, contact.
    - label: E
      title: Relationships
      text: Links between people, artists, artworks, collections, and conversations.
layout:
  direction: horizontal
  columns: 5
  margin: 0
  titleWidth: 1700
export:
  filename: bel-03-data-model
  outputDir: ../../output/belhaus
  format: jpg
  quality: 90
  writeHtml: true
  variants:
    - name: wide
      width: 1920
      height: 1080
      dpr: 1
      displayWidth: 724
    - name: mobile
      width: 1080
      height: 1200
      dpr: 1
      displayWidth: 327
```

### Optional draft brief: BEL-04 approval sequence

Use only if the HTML timeline feels too plain after review.

```yaml
id: bel-04-approval-sequence
name: BELHAUS approval sequence
template: diagram-card
theme: whatarewecapableof
profile:
  path: /Users/noah/Projects/whatarewecapableof/design/taste-profile/profile.md
  project: whatarewecapableof
  typeStack: live-site
placement:
  context: proposal
  slot: BEL-04
  displayWidth: 724
  narrowWidth: 327
  mobileWidth: 327
  targetRatio: compact
  sourceTextEquivalent: adjacent-html
design:
  priority: diagram-led
  textScale: proposal-body
  hierarchyDepth: 3
  imagePriority: low
  overlayStrength: none
diagram:
  kind: sequence
content:
  eyebrow: Approval sequence
  nodes:
    - label: 01
      title: Source arrives
      text: Invoice, photo, email, voice memo, or sign-up sheet.
    - label: 02
      title: Draft prepared
      text: The agent prepares a record or outreach draft.
    - label: 03
      title: Human approval
      text: Gino or Chloe reviews and approves.
    - label: 04
      title: Record used
      text: Catalog, outreach, or confirmed integration can use the record.
layout:
  direction: horizontal
  columns: 4
  margin: 0
export:
  filename: bel-04-approval-sequence
  outputDir: ../../output/belhaus
  format: jpg
  quality: 90
  writeHtml: true
  variants:
    - name: wide
      width: 1920
      height: 720
      dpr: 1
      displayWidth: 724
    - name: mobile
      width: 1080
      height: 1080
      dpr: 1
      displayWidth: 327
```

## Validation checklist for generated graphics

Before showing Noah:

```txt
[ ] Rendered graphic uses WAWCO profile with typeStack: live-site.
[ ] No rounded cards, shadows, gradients, decorative icons, or color accents beyond state blue if needed.
[ ] No text is below readable size at 724px desktop placement.
[ ] Mobile variant reads at 327px placement.
[ ] Artsy sync is marked pending or conditional.
[ ] AI approval sequence keeps Gino or Chloe visibly in the loop.
[ ] Diagram says something the adjacent paragraph does not already say.
[ ] Output metadata has no severe validation warnings.
[ ] Contact sheet or preview page is built for review.
```

## Recommended future graphic-system exploration workflow

Use this only if Noah asks to revisit BELHAUS bitmap or graphic-system diagrams. The active proposal does not need this workflow to proceed.

1. Start in `~/Projects/whatarewecapableof` and review the active proposal plus the slot board locally.
2. Start `python3 -m http.server 8888` if the server is not already running.
3. In `~/Projects/graphic-system`, create or revise `briefs/belhaus/` using the live BEL-01 and BEL-03 objects as calibration.
4. Run:

```sh
cd ~/Projects/graphic-system
npm run render -- briefs/belhaus
npm run preview:build
```

5. Open the generated preview or contact sheets.
6. Compare the generated graphics against the local slot board placement width.
7. If a graphic becomes too text-heavy, rebuild the slot as live HTML/CSS in the WAWCO proposal rather than forcing it into a bitmap.
8. Show Noah the local renders before moving anything into `~/Projects/whatarewecapableof/proposals/belhaus/img/`.
9. Keep new outputs under `~/Projects/graphic-system/output/belhaus/` until Noah approves any live insertion.
10. If Noah approves replacing or adding a live asset, copy only final deployable assets into tracked `proposals/belhaus/img/` and insert them into `proposals/belhaus/index.html` with root-relative paths.
11. Run browser QA at 375, 768, 1280, and 1600 widths.
12. Run `npm run scan:assets` only after final tracked media paths are added.

## Files changed before this handoff

In `~/Projects/whatarewecapableof`, relevant files for this BELHAUS pass include:

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
?? proposals/belhaus/media-slots.md
?? proposals/belhaus/media-slots.json
!! proposals/belhaus/img/src/
!! proposals/belhaus/slots/
```

Some tracked modifications predate the live media insertion. The ignored slot board and image source directory are expected.

## Browser review artifacts

Screenshots from the local slot board:

```txt
/tmp/belhaus-slots-v4-overview-1280.png
/tmp/belhaus-slots-v4-system-1280.png
/tmp/belhaus-slots-v4-approach-1280.png
/tmp/belhaus-slots-v4-approach-phase-1280.png
/tmp/belhaus-slots-v4-approach-table-1280.png
/tmp/belhaus-slots-v4-approach-375.png
/tmp/belhaus-slots-v4-bel02-1280.png
```

## Do not do in the fresh session

- Do not deploy the local slot board.
- Do not copy generated graphic-system outputs into the proposal repo without Noah approval.
- Do not run external image-generation APIs unless Noah explicitly asks and billing implications are clear.
- Do not treat Artsy sync as solved.
- Do not imply the AI removes Gino or Chloe from approval.
- Do not add the parked build timeline until terms are ready.
- Do not change the WAWCO taste profile or global system constraints without explaining the impact first.
