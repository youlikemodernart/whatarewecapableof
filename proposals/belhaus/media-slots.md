# BELHAUS media slots

Composition pass for `whatarewecapableof.com/proposals/belhaus`.

## Context

The active BELHAUS proposal now lives inside the What are we capable of? proposal system:

```txt
~/Projects/whatarewecapableof/proposals/belhaus/index.html
https://whatarewecapableof.com/proposals/belhaus
```

Future visual work should use the What are we capable of? taste profile, not the standalone BELHAUS proposal styling. Use the mono/prose proposal surface, 24px baseline, left anchor, black on white, one blue state color, and the existing proposal media primitives. The older `~/Projects/belhaus-proposal/` site is historical source material only.

## Rule

Each visual needs a job. The proposal should stay text-led and WAWCO-native. Use diagrams and artifacts as quiet work objects, not branded BELHAUS decoration. Do not add generic gallery imagery.

## Active slots

These slots have been incorporated locally into the active proposal source. No deploy has been run for this pass.

### BEL-01: operating model

- Anchor: Overview, after the stat row and before `What you'd have`
- Job: diagram, orientation
- Treatment: live HTML/CSS three-band operating model
- Asset need: none for the current active proposal
- Suggested content: source of truth, working surfaces, outputs and integrations
- Rationale: gives Gino the whole system in one glance before the page moves into detail
- Mobile treatment: single-column band stack
- Status: implemented locally in `proposals/belhaus/index.html`
- Tag: `slot: BEL-01`
- Priority: high
- Risk: can become generic consulting theater. Keep it text-first, no icons, no shadows, no SaaS boxes.

### BEL-02: private catalog artifact

- Anchor: Overview, after the private catalog paragraph and before the Artsy note
- Job: artifact, specimen
- Treatment: live HTML/CSS artifact using five optimized artwork images
- Asset paths:
  - `proposals/belhaus/img/bel-02-trophy-head-iii.webp`
  - `proposals/belhaus/img/bel-02-borders.webp`
  - `proposals/belhaus/img/bel-02-tiles.webp`
  - `proposals/belhaus/img/bel-02-cause-effect-iii.webp`
  - `proposals/belhaus/img/bel-02-sound-of-resonance.webp`
- Suggested content: one selected work, four related works, short explanatory copy
- Copy: `Draft: Five works I thought you'd want to see.`
- Rationale: makes the collector-facing value concrete
- Mobile treatment: primary work followed by explanatory copy and thumbnail grid
- Status: implemented locally in `proposals/belhaus/index.html`
- Tag: `slot: BEL-02`
- Priority: high
- Risk: if too polished, it may imply the app UI is final. Keep it framed as a draft artifact.

### BEL-03: relationship index

- Anchor: System, after the five-table data model table and before `The fields are yours`
- Job: diagram
- Treatment: live HTML/CSS relationship-index table
- Asset need: none for the current active proposal
- Suggested content: examples of records held in the Relationships table and what each connects
- Rationale: clarifies Relationships after the reader has context for the five tables
- Mobile treatment: compact two-column relationship list
- Status: implemented locally in `proposals/belhaus/index.html`
- Tag: `slot: BEL-03`
- Priority: high
- Risk: can get technical fast. Keep fields out of this object because the adjacent table already carries detail.

### BEL-04: approval sequence

- Anchor: System, after `The agent proposes; you decide.` and before `Integrations`
- Job: sequence
- Treatment: live `.proposal-process-timeline`
- Asset need: none for the current active proposal
- Suggested content: source arrives, AI prepares draft, Gino or Chloe approves, database updates, catalog or outreach uses the record
- Rationale: answers what the AI automates while preserving human approval
- Mobile treatment: same vertical timeline
- Status: implemented locally in `proposals/belhaus/index.html`
- Tag: `slot: BEL-04`
- Priority: high
- Risk: avoid overpromising. Use prepares and drafts, not language that implies the AI does everything.

## Atmosphere slots

These use Are.na blocks tagged `FAVE`. Their job is pacing and client-world texture, not proof.

### BEL-ATMO-01: overview gallery interior

- Anchor: Overview, after the opening paragraph and before the stat row
- Job: atmosphere, pause
- Asset: final path `proposals/belhaus/img/atmosphere-overview-interior.jpg`; source Are.na block `45611715`, raw source `proposals/belhaus/img/src/atmosphere-overview-interior.jpg`
- Rationale: puts the system proposal back inside the gallery space before the abstract architecture starts
- Status: implemented locally in `proposals/belhaus/index.html`
- Risk: if it competes with the operating system map, cut it or move it lower

### BEL-ATMO-02: system gallery crowd

- Anchor: System, after the opening architecture paragraph and before `Data model`
- Job: atmosphere, pause
- Asset: final path `proposals/belhaus/img/atmosphere-system-crowd.jpg`; source Are.na block `45611705`, raw source `proposals/belhaus/img/src/atmosphere-system-crowd.jpg`
- Rationale: reminds the reader that the database serves live relationships, openings, and artwork in rooms
- Status: implemented locally in `proposals/belhaus/index.html`
- Risk: the square crop may feel too social for the System page; evaluate in the browser

### BEL-ATMO-03: approach conversation

- Anchor: Approach, after the opening phase paragraph and before Phase 1
- Job: atmosphere, pause
- Asset: final path `proposals/belhaus/img/atmosphere-approach-conversation.jpg`; source Are.na block `45611709`, raw source `proposals/belhaus/img/src/atmosphere-approach-conversation.jpg`
- Rationale: gives the work plan a human scale before the phase structure begins
- Status: implemented locally in `proposals/belhaus/index.html`
- Risk: if it reads as event coverage rather than working relationship, cut it

## Parked slot

### BEL-05: build timeline

- Anchor: Approach, after Phase 3 or before Division of labor
- Job: sequence, pause
- Ratio: vertical timeline default
- Asset need: generated timeline
- Suggested content: Week 1 audit, Weeks 2 to 6 build v1, ongoing extensions
- Rationale: gives the Approach tab air and makes the engagement feel bounded
- Mobile treatment: vertical timeline
- Status: parked
- Tag: `slot: BEL-05`
- Priority: medium
- Risk: can make the timeline feel like a committed scope before terms are aligned. Add only when Noah is ready to stand behind it.

## Cut or defer

- Artlogic versus ArtCloud comparison graphic: the live table already carries the comparison. A visual comparison could make the page feel prosecutorial.
- Airtable screenshots: they risk making the system feel like another spreadsheet chore.
- Generic AI imagery: it would cheapen the proposal tone.
- Decorative gallery or installation photography: atmosphere is allowed, but this proposal's first need is system comprehension.

## Tone cautions

- Keep Georgie inside the circle. Her ArtCloud recommendation was reasonable gallery-default advice.
- Keep Artsy sync conditional until Georgie confirms the Partner API route.
- Keep human approval visible. The AI prepares and drafts; Gino or Chloe approves.
- Translate intelligence into practical artifacts: collector history, passed-on works, fair context, relationship notes, outreach timing.
