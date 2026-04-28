# Sales School diagram toolchain integration handoff

Date: 2026-04-27

Use this file to continue the Sales School diagram integration work after compaction.

## Current goal

Integrate the generated Sales School diagram images into the live proposal only where they improve the proposal. Keep captions and text equivalents. Keep the WAWCO SVG generator and source SVGs editable.

The immediate integration question is which image diagrams should replace the current HTML and CSS text graphics in:

```txt
~/Projects/whatarewecapableof/proposals/sales-school/index.html
```

Current local preview URL:

```txt
http://127.0.0.1:8765/proposals/sales-school/slots/image-diagrams.html?v=wawco4
```

The server returned `200` at the end of this session.

## Files to read first in a fresh session

Read these completely:

```txt
~/.pi/agent/skills/diagram-maker/SKILL.md
~/.pi/agent/skills/diagram-maker/tools/README.md
~/Projects/whatarewecapableof/proposals/sales-school/toolchain-handoff-prompt.md
~/Projects/whatarewecapableof/proposals/sales-school/image-diagram-handoff.md
~/Projects/whatarewecapableof/proposals/sales-school/diagram-pass-handoff.md
~/Projects/whatarewecapableof/proposals/sales-school/diagram-toolchain-integration-handoff.md
```

Then inspect as needed:

```txt
~/Projects/whatarewecapableof/proposals/sales-school/index.html
~/Projects/whatarewecapableof/css/proposal-media.css
~/Projects/whatarewecapableof/proposals/sales-school/slots/image-diagrams.html
~/Projects/whatarewecapableof/proposals/sales-school/diagrams/src/generate-diagrams.py
~/Projects/whatarewecapableof/proposals/sales-school/diagrams/svg/
~/Projects/whatarewecapableof/proposals/sales-school/diagrams/png/
~/Projects/whatarewecapableof/proposals/sales-school/diagrams/models/03-portal-architecture.yaml
~/Projects/whatarewecapableof/proposals/sales-school/diagrams/toolchain/03-portal-architecture-comparison.md
```

## What was done in this session

### 1. Proposed portal architecture ran through the new toolchain

Created the source model:

```txt
proposals/sales-school/diagrams/models/03-portal-architecture.yaml
```

Generated toolchain artifacts:

```txt
proposals/sales-school/diagrams/toolchain/03-portal-architecture-outline.html
proposals/sales-school/diagrams/toolchain/03-portal-architecture.dot
proposals/sales-school/diagrams/toolchain/03-portal-architecture-graphviz.svg
proposals/sales-school/diagrams/toolchain/03-portal-architecture-review.html
proposals/sales-school/diagrams/toolchain/03-portal-architecture-comparison.md
proposals/sales-school/diagrams/toolchain/checks/03-portal-architecture/report.json
proposals/sales-school/diagrams/toolchain/checks/03-portal-architecture/desktop.png
proposals/sales-school/diagrams/toolchain/checks/03-portal-architecture/mobile.png
proposals/sales-school/diagrams/toolchain/checks/03-portal-architecture/reduced-motion.png
proposals/sales-school/diagrams/toolchain/checks/03-portal-architecture/print.pdf
```

Toolchain results:

```txt
source model lint: 0 errors, 0 warnings
browser check: 0 errors, 0 warnings, 0 axe violations
```

The model treats diagram 03 as a survey view. It separates:

- MVP page hierarchy.
- Today as the live-session surface.
- Wistia as the kept media layer.
- Search, progress, admin editing, cohorts, and login as optional later scope.
- Transcript indexing as omitted from the visible retry of this diagram.

### 2. Toolchain was improved during the retry

Updated files under:

```txt
~/.pi/agent/skills/diagram-maker/tools
```

Changed:

```txt
src/render-html-page.mjs
src/check-web-diagram.mjs
README.md
```

Changes:

- The browser checker now includes a horizontal overflow check.
- The first review-page mobile check found overflow.
- The combined page renderer now scales SVGs to the viewport, uses fixed table layout, and wraps long code and table content.
- The final review page passed mobile with `scrollWidth` equal to `clientWidth`.

Revalidated the tool package examples:

```txt
npm run lint:examples
npm run render:examples
npm run check:web:examples
```

All three passed at the end of this session.

### 3. WAWCO SVG generator was corrected against the validated model

Updated:

```txt
proposals/sales-school/diagrams/src/generate-diagrams.py
```

Issue found:

- The validated model reserves WAWCO blue for the Today live surface.
- The generated diagram 03 also gave Course home a blue top rule.

Fix:

- Course home now uses a black rule.
- Today remains the only blue-accent node in diagram 03.

Regenerated the full SVG and PNG set.

### 4. Noah flagged spacing problems in screenshots

Noah supplied screenshots showing two issues:

- Diagram 02: the line `Same material, now inside a course place` sat too close to the bottom rule of the proposed portal panel.
- Diagram 06: the three scope boxes had different heights, and the left labels felt crowded against the box edges.

Fixes in `generate-diagrams.py`:

Diagram 02:

- Increased both comparison panels from 285px to 310px high.
- Moved the proposed portal child row upward.
- Moved the bottom claim into a reserved lower caption zone.
- Kept output size at `1800x660`.

Diagram 06:

- Set all three scope bands to the same height: 144px.
- Aligned the tag column consistently.
- Increased left label and title inset.
- Kept output size at `1800x840`.

Regenerated SVG and PNG outputs after these fixes.

### 5. Checks run after generator fixes

Checked:

- source model
- comparison report
- generator
- generated SVGs

Results:

```txt
no non-ASCII
no em dashes
no smart quotes
no double hyphens
```

The project whitespace diff check passed for the generator and generated SVGs.

## Current generated diagram set

Files:

```txt
proposals/sales-school/diagrams/png/01-current-access-terrain.png
proposals/sales-school/diagrams/png/02-structure-shift.png
proposals/sales-school/diagrams/png/03-portal-architecture.png
proposals/sales-school/diagrams/png/04-live-break-operating-flow.png
proposals/sales-school/diagrams/png/05-today-state-surface.png
proposals/sales-school/diagrams/png/06-scope-frontier.png
```

Current dimensions:

```txt
01-current-access-terrain.png 1800x780
02-structure-shift.png 1800x660
03-portal-architecture.png 1800x960
04-live-break-operating-flow.png 1800x800
05-today-state-surface.png 1800x1020
06-scope-frontier.png 1800x840
```

Current assessment:

- 01 is a strong candidate for the Overview current access route.
- 03 is validated through the toolchain and is ready as a Map candidate.
- 05 is a strong candidate for the Today page explanation.
- 06 is a strong candidate for Scope after the equal-height band fix.
- 02 is cleaner after spacing fixes but still optional. It may repeat the argument made by 01 and 03.
- 04 is cleaner than before, but should be reviewed again before integration.

## Important constraints

- Do not touch `PROPOSALS.md`. It was dirty before this work.
- Do not integrate PNGs into `index.html` until Noah approves the preview direction.
- Keep WAWCO style: white background, black text, neutral gray rules, WAWCO blue only for the selected state or active path.
- Do not use beige paper tones.
- Do not use Georgia, EB Garamond, Times New Roman, or any real serif.
- Keep Wistia visible as the media layer.
- Keep Phase 2 separate from MVP.
- Keep current-state claims sourced.
- Mark proposed-state claims as proposed or assumption.
- Preserve captions and text equivalents in the proposal.
- No em dashes or double hyphens in Noah-facing writing or visible diagram text.
- Avoid over-dense image text. Let the image expose structure. Let captions and accessible text carry source notes.

## Updated layout strategy

The first SVG generator strategy was too tolerant of fixed coordinates. Use these stricter rules now:

- Every diagram needs a layout contract.
- Equal semantic bands get equal heights.
- Any bottom claim inside a panel needs a reserved caption zone.
- Labels need clearance from boxes, rules, and sibling nodes.
- If a diagram needs browser delivery, the source model and browser-check pipeline override earlier visual habits.
- Optional diagrams like 02 should be cut unless they add a distinct reasoning job.

The new tools make it reasonable to challenge earlier limits around spacing, layout, and validation. Use browser checks, screenshots, source models, and generated artifacts as constraints, not just visual inspection.

## Integration plan for the next session

Recommended order:

1. Open the preview page and inspect diagrams 01, 03, 05, and 06 in context.
2. Decide whether diagram 02 is worth keeping. Default recommendation: cut it unless the comparison needs a visual bridge.
3. Decide whether diagram 04 is clear enough. If not, refine it before integration.
4. Integrate one diagram first, likely 03 in the Map section, using PNG for visual placement and text equivalent below it.
5. Browser-check the proposal page at desktop and mobile widths.
6. If the first integration holds, integrate 01, 05, and 06.
7. Keep the existing HTML text versions nearby or inside details blocks so mobile and accessibility do not depend on bitmap legibility.

Potential figure pattern:

```html
<figure class="proposal-media proposal-media-wide">
  <img src="/proposals/sales-school/diagrams/png/03-portal-architecture.png" alt="Proposed Sales School portal architecture with Course home, Today, Day One, Day Two, Resources, Facilitator, Wistia media layer, and optional later platform features." width="1800" height="960" loading="lazy">
  <figcaption class="proposal-media-caption">Proposed portal architecture. The first build is Course home, Today, Day One, Day Two, six Breakout pages, Resources, and Facilitator. Wistia remains the media layer. Search, progress, admin editing, cohorts, and login remain later platform scope.</figcaption>
</figure>
```

Keep or adapt the existing `details.proposal-text-version` block below the image. The image should not be the only representation of the structure.

## Commands and checks to run next

From the diagram-maker tools directory, the toolchain example checks should still pass:

```txt
cd ~/.pi/agent/skills/diagram-maker/tools
npm run lint:examples
npm run render:examples
npm run check:web:examples
```

For the validated portal architecture model:

```txt
cd ~/.pi/agent/skills/diagram-maker/tools
node src/diagram-lint.mjs ~/Projects/whatarewecapableof/proposals/sales-school/diagrams/models/03-portal-architecture.yaml
```

After integration, run:

- local desktop browser review
- local mobile browser review
- character check for non-ASCII, em dashes, smart quotes, and double hyphens
- project whitespace diff check
- git status from `~/Projects/whatarewecapableof`

## Current git state notes

Expected dirty or untracked files include:

```txt
M PROPOSALS.md
M css/proposal-media.css
M proposals/sales-school/index.html
?? proposals/sales-school/diagram-pass-handoff.md
?? proposals/sales-school/image-diagram-handoff.md
?? proposals/sales-school/toolchain-handoff-prompt.md
?? proposals/sales-school/diagram-toolchain-integration-handoff.md
?? proposals/sales-school/diagrams/models/03-portal-architecture.yaml
?? proposals/sales-school/diagrams/src/generate-diagrams.py
?? proposals/sales-school/diagrams/svg/*.svg
?? proposals/sales-school/diagrams/png/*.png
?? proposals/sales-school/diagrams/toolchain/
```

`PROPOSALS.md` was pre-existing dirty state. Do not modify, revert, or stage it unless Noah explicitly asks.

## Final reporting expectations

When continuing, report:

- changed files
- preview URL
- which diagrams were integrated or cut
- source-model lint result
- browser-check artifacts, if run
- remaining diagram candidates
- any open questions that block final integration

## Continuation update: live proposal integration

Date: 2026-04-28

The generated image diagrams were integrated into the live proposal page:

```txt
~/Projects/whatarewecapableof/proposals/sales-school/index.html
```

Integrated diagrams:

```txt
01-current-access-terrain.png
03-portal-architecture.png
04-live-break-operating-flow.png
05-today-state-surface.png
06-scope-frontier.png
```

Cut from live integration:

```txt
02-structure-shift.png
```

Reason: diagram 02 repeated the structure argument already carried by diagram 01 plus diagram 03.

Implementation notes:

- Each integrated image is inside `figure.proposal-image-diagram`.
- Each image has width and height attributes, alt text, and adjacent figcaption.
- Each complex diagram has a nearby `details.proposal-text-version[data-diagram-text-equivalent]` block.
- Mobile uses a focusable horizontal scroll region for diagram images so bitmap labels do not shrink to unreadable size.
- The tab script now supports direct hash activation, so these local checks work:
  - `/index.html#overview`
  - `/index.html#architecture`
  - `/index.html#experience`
  - `/index.html#scope`
  - `/index.html#question`
- The proposal page includes a reduced-motion override that sets transition and animation durations to `0s` under `prefers-reduced-motion: reduce`.
- Small uppercase label opacity was raised on this page to clear axe color-contrast checks.

Updated CSS:

```txt
~/Projects/whatarewecapableof/css/proposal-media.css
```

New class:

```txt
.proposal-image-diagram
```

Browser-check artifacts were written here:

```txt
proposals/sales-school/diagrams/toolchain/checks/proposal-integrated-overview/
proposals/sales-school/diagrams/toolchain/checks/proposal-integrated-architecture/
proposals/sales-school/diagrams/toolchain/checks/proposal-integrated-experience/
proposals/sales-school/diagrams/toolchain/checks/proposal-integrated-scope/
proposals/sales-school/diagrams/toolchain/checks/proposal-integrated-question/
```

Each tab check produced:

```txt
report.json
desktop.png
mobile.png
reduced-motion.png
print.pdf
```

Results for all five tab checks:

```txt
errors: 0
warnings: 0
axe violations: 0
desktop scrollWidth equals clientWidth
mobile scrollWidth equals clientWidth
```

Toolchain checks run after integration:

```txt
cd ~/.pi/agent/skills/diagram-maker/tools
npm run lint:examples
npm run render:examples
npm run check:web:examples
node src/diagram-lint.mjs ~/Projects/whatarewecapableof/proposals/sales-school/diagrams/models/03-portal-architecture.yaml
```

Results:

```txt
example lints: passed
example renders: passed
example web checks: passed
03 source model lint: 0 errors, 0 warnings
```

Character and whitespace checks:

```txt
index.html visible text: no double hyphens
index.html: no non-ASCII, no em dashes, no smart quotes
proposal-media.css: no non-ASCII, no em dashes, no smart quotes
SVGs and generator: no non-ASCII, no em dashes, no smart quotes, no double hyphens
project whitespace diff check: passed
```

Note: raw CSS files contain CSS custom property markers. Those are syntax, not Noah-facing prose.

Current local URLs:

```txt
http://127.0.0.1:8765/proposals/sales-school/index.html#overview
http://127.0.0.1:8765/proposals/sales-school/index.html#architecture
http://127.0.0.1:8765/proposals/sales-school/index.html#experience
http://127.0.0.1:8765/proposals/sales-school/index.html#scope
http://127.0.0.1:8765/proposals/sales-school/slots/image-diagrams.html?v=wawco4
```

Open questions:

- Whether to keep the older HTML/CSS diagram primitives in `proposal-media.css` for exploration reuse or remove them after final approval.
- Whether to tune the mobile diagram experience further with cropped mobile-specific diagrams instead of horizontal scroll.
- Whether to remove the local-only `slots/image-diagrams.html` page after approval.
