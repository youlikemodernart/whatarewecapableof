# Sales School Image Diagram Pass Handoff

Use this handoff to continue the Sales School proposal image-diagram pass after compaction or in a fresh session.

## Current status

We are exploring replacing the live HTML/CSS text diagrams in the Sales School proposal with generated bitmap image diagrams that better describe the architecture of the proposed processes.

The live proposal is local here:

```txt
~/Projects/whatarewecapableof/proposals/sales-school/index.html
```

The current local preview route for generated image diagrams is:

```txt
http://127.0.0.1:8765/proposals/sales-school/slots/image-diagrams.html
```

The preview file is local-only:

```txt
~/Projects/whatarewecapableof/proposals/sales-school/slots/image-diagrams.html
```

Important: `proposals/*/slots/` is gitignored. The preview page will not appear in normal git status.

Generated diagram assets now exist here:

```txt
~/Projects/whatarewecapableof/proposals/sales-school/diagrams/src/generate-diagrams.py
~/Projects/whatarewecapableof/proposals/sales-school/diagrams/svg/
~/Projects/whatarewecapableof/proposals/sales-school/diagrams/png/
```

The generated files are:

```txt
proposals/sales-school/diagrams/svg/01-current-access-terrain.svg
proposals/sales-school/diagrams/svg/02-structure-shift.svg
proposals/sales-school/diagrams/svg/03-portal-architecture.svg
proposals/sales-school/diagrams/svg/04-live-break-operating-flow.svg
proposals/sales-school/diagrams/svg/05-today-state-surface.svg
proposals/sales-school/diagrams/svg/06-scope-frontier.svg

proposals/sales-school/diagrams/png/01-current-access-terrain.png
proposals/sales-school/diagrams/png/02-structure-shift.png
proposals/sales-school/diagrams/png/03-portal-architecture.png
proposals/sales-school/diagrams/png/04-live-break-operating-flow.png
proposals/sales-school/diagrams/png/05-today-state-surface.png
proposals/sales-school/diagrams/png/06-scope-frontier.png
```

The live proposal currently still contains the HTML/CSS diagrams integrated earlier in this pass. The image diagrams have not yet replaced them in `index.html`.

## Current git state to preserve

At the time of this handoff, relevant git state is expected to include:

```txt
 M PROPOSALS.md
 M css/proposal-media.css
 M proposals/sales-school/index.html
?? proposals/sales-school/diagram-pass-handoff.md
?? proposals/sales-school/image-diagram-handoff.md
?? proposals/sales-school/diagrams/png/01-current-access-terrain.png
?? proposals/sales-school/diagrams/png/02-structure-shift.png
?? proposals/sales-school/diagrams/png/03-portal-architecture.png
?? proposals/sales-school/diagrams/png/04-live-break-operating-flow.png
?? proposals/sales-school/diagrams/png/05-today-state-surface.png
?? proposals/sales-school/diagrams/png/06-scope-frontier.png
?? proposals/sales-school/diagrams/src/generate-diagrams.py
?? proposals/sales-school/diagrams/svg/01-current-access-terrain.svg
?? proposals/sales-school/diagrams/svg/02-structure-shift.svg
?? proposals/sales-school/diagrams/svg/03-portal-architecture.svg
?? proposals/sales-school/diagrams/svg/04-live-break-operating-flow.svg
?? proposals/sales-school/diagrams/svg/05-today-state-surface.svg
?? proposals/sales-school/diagrams/svg/06-scope-frontier.svg
```

`PROPOSALS.md` was already dirty before the diagram work. Do not modify, revert, or stage it unless Noah explicitly asks.

`diagram-pass-handoff.md` was created by the previous pass and is untracked.

## Project and skill context already used

The relevant skill is:

```txt
~/.pi/agent/skills/diagram-maker/SKILL.md
```

The pass used these diagram-maker references:

```txt
~/.pi/agent/skills/diagram-maker/references/01-diagram-brief-and-reasoning.md
~/.pi/agent/skills/diagram-maker/references/05-sitemaps-and-information-architecture.md
~/.pi/agent/skills/diagram-maker/references/06-flows-processes-and-handoffs.md
~/.pi/agent/skills/diagram-maker/references/08-current-proposed-state-and-comparison.md
~/.pi/agent/skills/diagram-maker/references/09-evidence-diagrams-traceability-and-integrity.md
~/.pi/agent/skills/diagram-maker/references/10-critique-and-redesign-framework.md
~/.pi/agent/skills/diagram-maker/references/11-web-implementation-and-accessibility.md
~/.pi/agent/skills/diagram-maker/references/12-create-workflow-and-sales-school-test-case.md
```

For the image-diagram direction, these visual-reference synthesis files were also consulted:

```txt
~/.pi/agent/skills/diagram-maker/sources/visual-card-synthesis-brief.md
~/.pi/agent/skills/diagram-maker/sources/visual-notes/diagram-01.md
~/.pi/agent/skills/diagram-maker/sources/visual-notes/diagram-02.md
~/.pi/agent/skills/diagram-maker/sources/visual-notes/diagram-03.md
~/.pi/agent/skills/diagram-maker/sources/visual-notes/diagram-17.md
~/.pi/agent/skills/diagram-maker/sources/visual-notes/diagram-19.md
~/.pi/agent/skills/diagram-maker/sources/visual-notes/diagram-21.md
~/.pi/agent/skills/diagram-maker/sources/visual-notes/diagram-24.md
~/.pi/agent/skills/diagram-maker/sources/visual-notes/diagram-28.md
~/.pi/agent/skills/diagram-maker/sources/visual-notes/diagram-31.md
~/.pi/agent/skills/diagram-maker/sources/visual-notes/diagram-33.md
~/.pi/agent/skills/diagram-maker/sources/visual-notes/diagram-34.md
~/.pi/agent/skills/diagram-maker/sources/visual-notes/diagram-35.md
```

Project context files read in the earlier pass:

```txt
~/.pi/projects/-Users-noah--pi/memory/project_sales_school_portal.md
~/Projects/austin-sales-school/content/inventory.md
~/Projects/austin-sales-school/content/data/link-flow.json
~/Projects/austin-sales-school/docs/current-site-flow-map.md
~/Projects/austin-sales-school/docs/proposed-site-flow-and-sitemap.md
~/Projects/austin-sales-school/docs/proposal-ia-and-ui-directions.md
```

## What happened in this pass

Noah asked whether `diagram-maker` could be used to make bitmap images. The answer was yes, with the important distinction that `diagram-maker` is the diagram reasoning method, not a bitmap engine by itself.

Recommended workflow was:

1. Treat the current HTML/CSS diagrams as semantic sketches.
2. Create original SVG masters based on diagram-maker grammar and Sales School facts.
3. Export bitmap PNG files from the SVGs.
4. Keep source SVGs and the generator so the images remain editable.
5. Integrate images only after review, with captions and accessible text equivalents.

Noah then asked to do it.

A Python SVG generator was created:

```txt
proposals/sales-school/diagrams/src/generate-diagrams.py
```

It generates six SVGs, then PNGs were exported with:

```bash
rsvg-convert "$f" -o "proposals/sales-school/diagrams/png/$(basename "${f%.svg}").png"
```

Available system tools confirmed:

```txt
node: /Users/noah/.nvm/versions/node/v24.14.1/bin/node
python3: /opt/homebrew/bin/python3
convert: /opt/homebrew/bin/convert
magick: /opt/homebrew/bin/magick
rsvg-convert: /opt/homebrew/bin/rsvg-convert
sharp: available
puppeteer: not installed
```

## Font correction

The first generated diagrams used Georgia, which made them look like EB Garamond. Noah caught this and said to check context.

Context check:

```txt
~/Projects/whatarewecapableof/css/tokens.css
```

Defines:

```css
--font-serif: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
--font-mono: 'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace;
```

Important: the site variable is named `--font-serif`, but it is actually a system sans stack. Do not infer actual serif usage from the variable name.

The generator was corrected to use:

```py
TEXT_FACE = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
MONO = "'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace"
```

It was also corrected to avoid using a misleading constant name like `SERIF`.

After regeneration, these checks passed on SVGs and the generator:

```txt
no Georgia
no Garamond
no Times New Roman
no em dashes
no smart quotes
no double hyphens
no non-ASCII
```

## Generated diagram set

### 01 Current access terrain

File:

```txt
proposals/sales-school/diagrams/png/01-current-access-terrain.png
```

Purpose: replace or supplement the current access chain in Overview.

Reference grammar:

- Diagram 19: access terrain / movement on the terrain where friction occurs.
- Diagram 35: numbered callouts on an artifact.
- Diagram 02: distinguish existing assets from route structure.

Content:

```txt
GoHighLevel preview -> Firebase email HTML -> Email index -> Day section -> Breakout button -> PDF index -> Wistia page
```

Counts:

```txt
2 day sections
6 PDF indexes
35 Wistia videos
1 resource PDF
5 missing support features
```

Missing support features:

```txt
global nav
search
progress
current-session state
facilitator control
```

### 02 Same material, different structure

File:

```txt
proposals/sales-school/diagrams/png/02-structure-shift.png
```

Purpose: replace or supplement the before/after comparison in Overview.

Reference grammar:

- Diagram 02: same elements shown as inventory versus navigable structure.
- Tufte small-multiple comparison: hold the frame steady while changing topology.

Core claim:

```txt
The assets exist, but students reach them through document-index access during a live teaching moment.
The same material becomes portal navigation: Today, day pages, and Wistia as media layer.
```

### 03 Proposed portal architecture

File:

```txt
proposals/sales-school/diagrams/png/03-portal-architecture.png
```

Purpose: replace the proposed sitemap in Map.

Reference grammar:

- Diagram 03: portal workspace map.
- Diagram 01: hub page exposing peer destinations.
- Diagram 33: phase/status band over a structure.

Content:

```txt
/sales-school
  /today
  /day-one
    /breakout-1
    /breakout-2
    /breakout-3
  /day-two
    /breakout-4
    /breakout-5
    /breakout-6
  /resources
  /facilitator

Media layer kept: Wistia embeds or linked media pages
Phase 2 options: search / progress / transcript indexing / admin editing / cohort management / login
```

### 04 Live-break operating flow

File:

```txt
proposals/sales-school/diagrams/png/04-live-break-operating-flow.png
```

Purpose: replace the live-break swimlane in Experience.

Reference grammar:

- Diagram 24: decision and branch logic.
- Diagram 21: live/session cycle reasoning.
- Diagram 34: stuck path and transition logic.

Lanes:

```txt
Zoom
Facilitator
Student
Portal
```

Core route:

```txt
Live Zoom -> Select breakout -> Cue students -> Open Today -> Watch sequence -> Show return prompt -> Debrief
```

Exception branches to confirm:

```txt
Cannot open Today
Wrong breakout
Student stuck
```

Important: this diagram still needs visual refinement. The current version is useful as a candidate but may need better spacing, clearer lane alignment, and less overlap between state tags and path nodes before proposal integration.

### 05 Today page as current-session surface

File:

```txt
proposals/sales-school/diagrams/png/05-today-state-surface.png
```

Purpose: replace the Today page wireframe in Experience.

Reference grammar:

- Diagram 35: annotated artifact callouts.
- Diagram 01: hub/current page pattern.
- Diagram 33: state overlay.

Callouts:

```txt
1 Course state
2 Active breakout
3 Watch queue
4 Return prompt
5 Help state
6 Wistia layer
```

### 06 Scope frontier

File:

```txt
proposals/sales-school/diagrams/png/06-scope-frontier.png
```

Purpose: replace the Phase 1 / Wistia / Phase 2 scope overlay in Scope.

Reference grammar:

- Diagram 33: status frontier over structure.
- Diagram 31: production and maintenance boundary.

Core claim:

```txt
Phase 1 is course portal structure.
Wistia media layer is kept.
Phase 2 is optional platform infrastructure.
```

## Local preview page

A local-only preview page was created to view the images in site context:

```txt
~/Projects/whatarewecapableof/proposals/sales-school/slots/image-diagrams.html
```

Open locally:

```txt
http://127.0.0.1:8765/proposals/sales-school/slots/image-diagrams.html
```

This page imports the same site CSS stack:

```txt
/css/tokens.css
/css/base.css
/css/typography.css
/css/layout.css
/css/components.css
/css/proposal-media.css?v=diagrams-20260427
```

It shows the six PNGs inside WAWCO proposal styling and includes short captions describing the reference grammar for each image.

Again: this page is ignored by git because it is under `proposals/*/slots/`.

## Browser state

Chrome DevTools MCP was connected earlier. Chrome remote debugging is available at port 9222.

The local server from the project root should still be running on port 8765:

```bash
cd ~/Projects/whatarewecapableof
python3 -m http.server 8765
```

Check with:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8765/proposals/sales-school/slots/image-diagrams.html
```

Expected:

```txt
200
```

If the server is not running, restart it from the project root.

## Noah feedback after local image preview

Noah reviewed the generated PNG diagrams in the site-context preview and gave these critiques:

1. The beige paper palette feels off for WAWCO.
   - Source of beige: the first image pass over-weighted the visual-reference corpus and earlier handoff phrase `warm paper background`.
   - WAWCO context: `css/tokens.css` uses white background, black text, and electric blue accent `rgb(0, 15, 255)`.
   - Required correction: remove the beige system from generated diagrams. Use white or transparent background, black text, light neutral rules, and WAWCO blue only for a primary path or active state.

2. Arrow placement is visibly broken.
   - Screenshot examples show arrowheads hitting beside nodes, crossing borders awkwardly, and failing to visually connect to target handles.
   - Required correction: use arrowheads only for true sequence, movement, transition, or handoff. Use plain connectors for hierarchy, membership, association, and callout leaders.
   - Generator correction: replace ad hoc path endpoints with connector helpers that anchor to node edges and stop outside the target by a consistent gap. Prefer orthogonal connectors or no-arrow step numbering where possible.

3. Text and margins are inconsistent.
   - Screenshot examples show text clipping or running outside boxes, callout markers colliding with labels, and left/right margins that do not behave as a system.
   - Required correction: remove long explanatory prose from inside SVG boxes, set fixed safe padding, give every node more internal room, and use a stricter typographic scale.
   - Generator correction: avoid approximate character wrapping as the only protection. Shorten labels first, then use safer line counts and larger boxes.

4. The diagrams are too dense for their job.
   - The images carry too much accompanying text and too many simultaneous claims.
   - Required correction: let each diagram answer one visual query. Move source basis, reading rules, and longer explanation to HTML captions or text equivalents.
   - Proposed integration principle: ship fewer image diagrams if fewer diagrams make the proposal easier to understand.

Immediate redesign direction:

- System palette: white background, black labels, neutral gray rules, WAWCO blue for a single active path or current state.
- System geometry: consistent outer margin, consistent node padding, one grid rhythm, no decorative waves, no beige panels.
- Arrows: delete most arrows. Keep arrows only in the current access route and live sequence, and make them edge-anchored. Hierarchy maps use plain connectors. Callouts use leader lines and numbered markers without arrowheads.
- Density: remove intro paragraphs and reading-rule boxes from the SVGs. Captions and adjacent text carry those explanations.
- Diagram count: likely integrate 01, 03, 05, and 06 after simplification. Rebuild 04 as a much simpler live-moment sequence. Consider dropping 02 because it may repeat the combined argument of 01 plus 03.

## WAWCO-native revision completed

After Noah approved the direction, the generator was rewritten and all SVG and PNG outputs were regenerated.

Generator:

```txt
proposals/sales-school/diagrams/src/generate-diagrams.py
```

Updated outputs:

```txt
01-current-access-terrain.png 1800x780
02-structure-shift.png 1800x820
03-portal-architecture.png 1800x960
04-live-break-operating-flow.png 1800x800
05-today-state-surface.png 1800x1020
06-scope-frontier.png 1800x840
```

Main changes:

- Removed beige and warm paper palette from the SVG generator.
- Set diagram background to white, text to black, secondary rules to neutral gray, and accent to WAWCO blue `#000fff`.
- Removed most arrowheads.
- Replaced live-break swimlane arrows with a numbered five-step path.
- Replaced Today-page leader-line callouts with numbered markers and a side key.
- Replaced scope wave with three simple scope bands.
- Removed long reading-rule prose from inside images.
- Removed transcript indexing from visible optional-later diagram labels.
- Updated local preview captions and image dimensions in `proposals/sales-school/slots/image-diagrams.html`.

Checks run after regeneration:

```txt
SVGs and generator have no non-ASCII characters.
SVGs and generator have no em dashes.
SVGs and generator have no smart quotes.
SVGs and generator have no double hyphens.
SVGs and generator no longer contain the old beige color tokens.
```

Current assessment:

- Strongest candidates: 01, 03, 05, 06.
- 04 is now much cleaner and can be reviewed again.
- 02 is improved but may still be unnecessary because 01 plus 03 already make the structure argument.

## Engine geometry revision completed

Noah then flagged remaining geometry issues in the cleaner WAWCO-style pass:

```txt
~/Downloads/Screenshots/Screenshot 2026-04-27 at 2.26.38 PM.png
~/Downloads/Screenshots/Screenshot 2026-04-27 at 2.26.35 PM.png
~/Downloads/Screenshots/Screenshot 2026-04-27 at 2.26.27 PM.png
~/Downloads/Screenshots/Screenshot 2026-04-27 at 2.26.21 PM.png
```

Observed issues:

- Number markers sat too close to card edges.
- Connector lines ran through breakout child boxes.
- Root-to-child curves in the architecture diagram felt arbitrary.
- The generator had no layout contract, so every diagram used hand-coded coordinates.

Implemented fixes in `generate-diagrams.py`:

- Added a `Box` data class with anchors, content bounds, marker placement, and circle containment checks.
- Added Canvas layers: background, debug, connectors, containers, nodes, markers, text, and notes.
- Nodes now draw after connectors, so white-filled nodes mask hierarchy lines that pass behind them.
- `node()` now returns a `Box`.
- Added `bus()` for clean hierarchy connectors.
- Added `vertical_trunk()` for child stacks such as breakouts under Day One and Day Two.
- Added `marker()` to place numbered callouts inside boxes from named placements instead of raw coordinates.
- Added an audit pass for marker containment and canvas bounds.
- Added a debug SVG mode through the short `-d` flag. It draws box bounds, safe areas, and anchor points.

Regenerated outputs again after this engine revision.

Key visual changes:

- Architecture diagram now uses bus connectors instead of loose curves.
- Breakout child connector lines render behind the boxes and no longer run visibly through labels.
- Today page markers now use safe inset placement. Marker 3 uses a smaller marker because it lives in a tight row.
- Live-break sequence line now stops at each number circle instead of passing behind it.

Checks after regeneration:

```txt
Generator printed no audit warnings.
SVGs and generator have no non-ASCII characters.
SVGs and generator have no em dashes.
SVGs and generator have no smart quotes.
SVGs and generator have no double hyphens.
```

## Alignment and fit revision completed

Noah then annotated two screenshots:

```txt
~/Downloads/Screenshots/Screenshot 2026-04-27 at 2.32.49 PM.png
~/Downloads/Screenshots/Screenshot 2026-04-27 at 2.33.44 PM.png
```

Observed issues:

- Diagram 02 still had a density problem and an unnecessary floating change label.
- Diagram 02 child labels such as Resources and Facilitator needed text-aware boxes.
- Diagram 03 breakout labels needed left alignment and vertical centering.
- Diagram 03 band content needed consistent value-column alignment.

Implemented fixes:

- Added approximate text measurement and font fitting in the generator.
- Added `small_node()` for short label boxes, with left alignment and vertical centering.
- Added `layout_row()` for text-aware peer rows.
- Added `band()` for consistent label/value columns in horizontal bands.
- Reworked diagram 02 into a shorter optional comparison at 1800x660.
- Removed the floating change label from diagram 02.
- Reworked diagram 02 child boxes with text-aware sizing.
- Updated diagram 03 breakout rows to use `small_node()`.
- Updated diagram 03 media and optional later bands to use `band()`, so values align to the same x position.
- Updated the local preview image dimension for diagram 02.

Regenerated outputs again. Current dimensions:

```txt
01-current-access-terrain.png 1800x780
02-structure-shift.png 1800x660
03-portal-architecture.png 1800x960
04-live-break-operating-flow.png 1800x800
05-today-state-surface.png 1800x1020
06-scope-frontier.png 1800x840
```

Checks after this revision:

```txt
Generator printed no audit warnings.
SVGs and generator have no non-ASCII characters.
SVGs and generator have no em dashes.
SVGs and generator have no smart quotes.
SVGs and generator have no double hyphens.
```

## Recommended next steps

1. Open the preview page in Chrome:

```txt
http://127.0.0.1:8765/proposals/sales-school/slots/image-diagrams.html
```

2. Review which diagrams are worth integrating.

Likely candidates to integrate first:

```txt
01-current-access-terrain.png
03-portal-architecture.png
05-today-state-surface.png
06-scope-frontier.png
```

Diagrams needing refinement before integration:

```txt
02-structure-shift.png
04-live-break-operating-flow.png
```

Reason: 02 is conceptually right but visually less strong than 01 and 03. 04 has useful flow logic but needs spacing and node/tag refinement.

3. If integrating images, keep both PNG and SVG sources committed.

4. Update `proposals/sales-school/index.html` to replace selected live HTML/CSS diagrams with image figures, but keep accessible text versions and captions.

Suggested image figure pattern:

```html
<figure class="proposal-media proposal-media-wide proposal-media-surface">
  <img src="/proposals/sales-school/diagrams/png/01-current-access-terrain.png" alt="Current access terrain showing seven surfaces from GoHighLevel preview to Wistia page, with evidence counts and missing feature tags." width="1800" height="1040" loading="lazy">
  <figcaption class="proposal-media-caption">Current-state route. Source basis: Sales School IA packet, proposal memory, current email preview, PDF contact sheet, and Wistia contact sheet.</figcaption>
</figure>
```

Consider whether `proposal-media-surface` is too much because the PNG already has its own background. A plain `proposal-media-wide` image with a subtle border may be better.

5. Review mobile. Bitmap diagrams may become too small on phones. If needed, create mobile-specific cropped or stacked variants, or keep the existing HTML text versions below each image.

6. Run checks:

```bash
cd ~/Projects/whatarewecapableof
python3 - <<'PY'
from pathlib import Path
paths = [
    Path('proposals/sales-school/index.html'),
    Path('css/proposal-media.css'),
    Path('proposals/sales-school/diagrams/src/generate-diagrams.py'),
]
paths += sorted(Path('proposals/sales-school/diagrams/svg').glob('*.svg'))
for path in paths:
    text = path.read_text()
    print(path)
    print('  non_ascii', sorted({c for c in text if ord(c) > 127})[:20])
    print('  em_dash_count', text.count(chr(8212)))
    print('  smart_quote_count', sum(text.count(chr(c)) for c in [8220, 8221, 8216, 8217]))
    print('  double_hyphen_count', text.count('--'))
PY
git diff --check -- proposals/sales-school/index.html css/proposal-media.css proposals/sales-school/diagrams/src/generate-diagrams.py proposals/sales-school/diagrams/svg
```

## Conduct rules for continuation

- Use `~/.pi/...` canonical paths in shared docs.
- Follow `diagram-maker` for this diagram task.
- Keep diagrams original. Use the visual references as structural grammar, not as styles to copy.
- Use WAWCO type context: system sans for the main text face, Geist Mono for labels and metadata.
- Do not use Georgia, EB Garamond, Times New Roman, or any actual serif unless Noah explicitly requests it.
- Keep Wistia visible as the media layer.
- Keep Phase 2 separate from MVP.
- Do not make the current state look bad through chaotic styling. Let route depth and intermediate layers carry the argument.
- Keep work at IA and link-flow level unless Noah asks for lesson-level content.
- Do not focus on transcripts unless requested.
- Mark current-state claims as sourced and proposed-state claims as proposed or assumed.
- Preserve open questions: final client name, brand assets, design references, portal location, login, progress tracking, who controls active breakout, repeated cohorts, budget, timeline, maintenance model.
- No em dashes or double hyphens in Noah-facing writing or generated visible diagram text.
- Do not touch `PROPOSALS.md` unless Noah explicitly asks.

## Exact fresh-session prompt

Copy this into a fresh session:

```md
We are continuing the Sales School proposal image-diagram pass after compaction.

First read:

- `~/.pi/agent/skills/diagram-maker/SKILL.md`
- `~/Projects/whatarewecapableof/proposals/sales-school/image-diagram-handoff.md`
- `~/Projects/whatarewecapableof/proposals/sales-school/diagram-pass-handoff.md`
- `~/.pi/projects/-Users-noah--pi/memory/project_sales_school_portal.md`

Then, if needed, read the diagram-maker references listed in the handoff, especially:

- `~/.pi/agent/skills/diagram-maker/references/11-web-implementation-and-accessibility.md`
- `~/.pi/agent/skills/diagram-maker/references/12-create-workflow-and-sales-school-test-case.md`
- `~/.pi/agent/skills/diagram-maker/sources/visual-card-synthesis-brief.md`

Primary files:

- `~/Projects/whatarewecapableof/proposals/sales-school/index.html`
- `~/Projects/whatarewecapableof/css/proposal-media.css`
- `~/Projects/whatarewecapableof/proposals/sales-school/diagrams/src/generate-diagrams.py`
- `~/Projects/whatarewecapableof/proposals/sales-school/diagrams/svg/*.svg`
- `~/Projects/whatarewecapableof/proposals/sales-school/diagrams/png/*.png`
- `~/Projects/whatarewecapableof/proposals/sales-school/slots/image-diagrams.html`

Current state:

- The live proposal currently has integrated HTML/CSS diagrams.
- A new generated image-diagram set exists as SVG and PNG.
- The image diagrams have not yet replaced the live proposal diagrams.
- A local preview page exists at `proposals/sales-school/slots/image-diagrams.html` and is ignored by git.
- `PROPOSALS.md` was already dirty before this work. Do not touch or revert it.
- The first generator version used Georgia and looked like EB Garamond. This was corrected. Use WAWCO system sans, not a real serif.

Task:

1. Open `http://127.0.0.1:8765/proposals/sales-school/slots/image-diagrams.html` locally. Restart the server from `~/Projects/whatarewecapableof` if needed.
2. Review the generated images in site context.
3. Refine SVG generator output if Noah requests visual changes.
4. If Noah approves, integrate selected PNGs into `proposals/sales-school/index.html` with captions and accessible text equivalents.
5. Keep SVG and generator sources so the diagrams remain editable.
6. Run desktop and mobile checks.
7. Run ASCII, dash, and `git diff --check` checks.
8. Report changed files and remaining open questions.

Likely integration priority:

1. `01-current-access-terrain.png`
2. `03-portal-architecture.png`
3. `05-today-state-surface.png`
4. `06-scope-frontier.png`

Review carefully before integrating:

- `02-structure-shift.png`
- `04-live-break-operating-flow.png`

Constraints:

- Use generated bitmap images only where they improve the proposal.
- Preserve captions and text equivalents.
- Keep Wistia visible as the media layer.
- Keep Phase 2 visually separate from MVP.
- Keep current-state claims sourced and proposed-state claims marked as proposed or assumed.
- Do not use Georgia, EB Garamond, Times New Roman, or any actual serif.
- No em dashes or double hyphens.
```
