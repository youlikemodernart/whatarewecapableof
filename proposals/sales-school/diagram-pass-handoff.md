# Sales School Diagram Pass Handoff

Use this handoff after compaction or in a fresh session to continue the Sales School proposal diagram pass.

## Current status

The `diagram-maker` skill build is complete and was used as the method for this pass.

Skill entry point:

```txt
~/.pi/agent/skills/diagram-maker/SKILL.md
```

Primary proposal files:

```txt
~/Projects/whatarewecapableof/proposals/sales-school/index.html
~/Projects/whatarewecapableof/css/proposal-media.css
~/Projects/austin-sales-school/
~/.pi/projects/-Users-noah--pi/memory/project_sales_school_portal.md
```

Local exploration page created:

```txt
~/Projects/whatarewecapableof/proposals/sales-school/slots/index.html
```

Important: `proposals/*/slots/` is ignored by git. The slots page is local exploration only and will not appear in normal `git status`.

Tracked file changed in this session:

```txt
~/Projects/whatarewecapableof/css/proposal-media.css
```

The CSS file now includes reusable diagram classes for the proposed upgraded text graphics:

```txt
.proposal-evidence-counts
.proposal-evidence-count
.proposal-access-route
.proposal-access-node
.proposal-access-label
.proposal-access-verb
.proposal-access-note
.proposal-feature-tags
.proposal-diagram-tag
.proposal-structure-comparison
.proposal-comparison-panel
.proposal-comparison-title
.proposal-comparison-list
.proposal-portal-sitemap
.proposal-sitemap-node
.proposal-sitemap-level
.proposal-sitemap-band
.proposal-live-lanes
.proposal-live-lane
.proposal-live-track
.proposal-live-step
.proposal-support-grid
.proposal-scope-grid
.proposal-text-version
```

Live proposal file not yet changed in this pass:

```txt
~/Projects/whatarewecapableof/proposals/sales-school/index.html
```

Pre-existing dirty file before this pass:

```txt
~/Projects/whatarewecapableof/PROPOSALS.md
```

Do not revert or modify `PROPOSALS.md` unless Noah explicitly asks.

## What was done

1. Read the new `diagram-maker` skill and these references:

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

2. Read project memory and local IA docs:

```txt
~/.pi/projects/-Users-noah--pi/memory/project_sales_school_portal.md
~/Projects/austin-sales-school/content/inventory.md
~/Projects/austin-sales-school/content/data/link-flow.json
~/Projects/austin-sales-school/docs/current-site-flow-map.md
~/Projects/austin-sales-school/docs/proposed-site-flow-and-sitemap.md
~/Projects/austin-sales-school/docs/proposal-ia-and-ui-directions.md
```

3. Audited the existing Sales School proposal diagrams in `index.html`.

Existing live proposal currently has:

- Current access chain text graphic in Overview.
- Proposed portal sitemap text graphic in Map.
- Live-break flow text graphic in Experience.
- Low-fidelity Today page wireframe in Experience.

4. Created local exploration page at:

```txt
~/Projects/whatarewecapableof/proposals/sales-school/slots/index.html
```

The exploration page includes:

- Audit of current graphics.
- Upgraded current access chain.
- Before and after structure comparison.
- Proposed portal sitemap with all six breakout pages, Wistia media layer, and Phase 2 band.
- Live-break swimlane flow with Zoom, Facilitator, Student, and Portal lanes.
- Today page state-surface wireframe.
- Phase 1 and Phase 2 scope overlay.
- Source and assumptions table.

5. Started a local server from the project root:

```bash
cd ~/Projects/whatarewecapableof
python3 -m http.server 8765
```

Current local URL:

```txt
http://127.0.0.1:8765/proposals/sales-school/slots/
```

A server process may still be running. PID file, if present:

```txt
/tmp/wawco-sales-school-slots-http.pid
```

6. Browser-checked the exploration page with Chrome DevTools MCP.

Screenshots saved during this session:

```txt
/tmp/sales-school-slots-desktop.png
/tmp/sales-school-slots-mobile.png
```

These are temporary files, not durable project artifacts.

Automated checks run:

```bash
python3 - <<'PY'
from pathlib import Path
p=Path('proposals/sales-school/slots/index.html')
text=p.read_text()
print('non_ascii', sorted({c for c in text if ord(c)>127})[:20])
print('em_dash_count', text.count(chr(8212)))
print('smart_quote_count', sum(text.count(chr(c)) for c in [8220, 8221, 8216, 8217]))
PY
```

Result for the slots page:

```txt
non_ascii []
em_dash_count 0
smart_quote_count 0
```

Chrome check at mobile width showed no horizontal overflow:

```json
{"scrollWidth":500,"clientWidth":500,"offenders":[]}
```

## Diagram decisions made

### Current access chain

Purpose: show that the current experience is a temporary link chain rather than a course place.

Exploration structure:

```txt
GoHighLevel preview
  -> Firebase email HTML
  -> Email index
  -> Day section
  -> Breakout button
  -> PDF index
  -> Wistia page
```

Local evidence labels:

```txt
2 day sections
6 PDF indexes
35 Wistia videos
1 resource PDF
5 missing support features
```

Missing feature callouts:

```txt
No global nav
No search
No progress
No current-session state
No facilitator control surface
```

Constraint preserved: current state is not made ugly through messy styling. The route and intermediate layers carry the argument.

### Before and after structure comparison

Purpose: show the core redesign claim: same content, better structure.

Current panel:

```txt
Email preview as entry
Email index contains Day One and Day Two
Six breakout buttons open PDF indexes
PDF indexes link to 35 Wistia videos
One resource PDF sits inside the same flow
```

Proposed panel:

```txt
Sales School home as entry
Today supports the live Zoom moment
Day One and Day Two become navigation
Six breakout pages replace PDF indexes
Resources and Facilitator become peer support sections
```

### Proposed portal sitemap

Purpose: clarify MVP versus Phase 2 and show that Wistia remains the media layer.

Exploration structure:

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
```

Media layer note:

```txt
Wistia stays embedded or linked.
```

Phase 2 band:

```txt
Search / progress / transcript indexing / admin editing / cohort management / login
```

Constraint preserved: sitemap hierarchy is kept separate from live-session sequence.

### Live-break flow

Purpose: make the synchronous Zoom use case visible.

Exploration uses lanes:

```txt
Zoom
Facilitator
Student
Portal
```

Main route:

```txt
Live Zoom
  -> facilitator selects breakout
  -> facilitator cues students
  -> student opens Today
  -> portal shows active breakout
  -> student watches assigned sequence
  -> portal shows return prompt
  -> student returns to Zoom
```

Exception notes, not fully drawn as branches yet:

```txt
Cannot open Today
Wrong breakout
Student stuck
```

Constraint preserved: facilitator agency stays visible. The flow does not hide active-breakout control behind passive labels.

### Today page wireframe

Purpose: show Today as a current-session page, not a generic dashboard.

Exploration structure:

```txt
Course state: Day One / live now / Active breakout: Breakout 2
Facilitator-set status: Active, upcoming, complete, paused
Student task: Watch this breakout now
Watch queue: assigned videos
Resource slot: worksheet, script, or reading
Return instruction: time, link, or facilitator cue
Next action: resume, return, or ask for help
```

Constraint preserved: low fidelity. Final visual direction waits for references and brand assets.

### Scope overlay

Purpose: prevent the proposal from sounding like a full LMS build.

Exploration structure:

```txt
Phase 1: Course portal
Media layer: Keep Wistia
Phase 2: Platform options
```

## Recommended next steps

1. Reopen the local exploration page and inspect it:

```txt
http://127.0.0.1:8765/proposals/sales-school/slots/
```

2. Decide which exploration diagrams should be integrated into the live proposal.

Likely integration set:

- Replace the current access chain in Overview.
- Add before and after comparison between Overview and Map, or at the start of Map.
- Replace the proposed sitemap in Map.
- Replace the live-break flow in Experience.
- Refine the Today wireframe in Experience.
- Add the scope overlay only if Scope needs the extra decision frame.

3. Integrate the smallest useful set into:

```txt
~/Projects/whatarewecapableof/proposals/sales-school/index.html
```

4. If integrating the new CSS primitives, keep the `proposal-media.css` changes. If not integrating, revert the inserted block in `proposal-media.css`.

5. If the CSS primitives remain in use, update the cache-bust query in `index.html`:

Current:

```html
<link rel="stylesheet" href="/css/proposal-media.css?v=rules-20260427">
```

Suggested after integration:

```html
<link rel="stylesheet" href="/css/proposal-media.css?v=diagrams-20260427">
```

6. Review desktop and mobile widths before committing.

Useful local checks:

```bash
cd ~/Projects/whatarewecapableof
python3 - <<'PY'
from pathlib import Path
for path in [Path('proposals/sales-school/index.html'), Path('css/proposal-media.css')]:
    text = path.read_text()
    bad = sorted({c for c in text if ord(c) > 127})
    print(path, bad[:20], 'double_hyphen_count', text.count(chr(45) + chr(45)))
PY
git status -s -uall
```

Expected git state after integration, ignoring pre-existing `PROPOSALS.md`:

```txt
 M css/proposal-media.css
 M proposals/sales-school/index.html
 M PROPOSALS.md
```

Remember: `slots/index.html` is ignored by git.

## Conduct rules

- Use `~/.pi/...` canonical paths in shared docs.
- Follow `diagram-maker` for this diagram task.
- Keep diagrams WAWCO-native: live text, quiet rules, local labels, plain structure.
- Internal lines, boxes, rules, and boundaries should encode real structure only.
- Avoid generic SaaS diagram styling.
- Avoid excessive horizontal rules.
- Do not make the current state look bad through chaotic styling. Let route depth and intermediate layers carry the argument.
- Keep Wistia visible as the media layer.
- Keep the work at IA and link-flow level unless Noah asks for lesson-level content.
- Do not focus on transcripts unless requested.
- Do not use the old Graphviz diagrams as final proposal visuals.
- Preserve readable captions and accessible text equivalents.
- Mark current-state claims as sourced.
- Mark proposed-state claims as proposed or assumed.
- Preserve open questions: final client name, brand assets, design references, portal location, login, progress tracking, who controls active breakout, repeated cohorts, budget, timeline, maintenance model.
- No em dashes or double hyphens in Noah-facing writing.

## Exact fresh-session prompt

Copy this into a fresh session:

```md
# Fresh Session Prompt: Sales School Proposal Diagram Pass

We are continuing the Sales School proposal diagram pass after compaction.

First read:

- `~/.pi/agent/skills/diagram-maker/SKILL.md`
- `~/.pi/agent/skills/diagram-maker/references/01-diagram-brief-and-reasoning.md`
- `~/.pi/agent/skills/diagram-maker/references/05-sitemaps-and-information-architecture.md`
- `~/.pi/agent/skills/diagram-maker/references/06-flows-processes-and-handoffs.md`
- `~/.pi/agent/skills/diagram-maker/references/08-current-proposed-state-and-comparison.md`
- `~/.pi/agent/skills/diagram-maker/references/09-evidence-diagrams-traceability-and-integrity.md`
- `~/.pi/agent/skills/diagram-maker/references/10-critique-and-redesign-framework.md`
- `~/.pi/agent/skills/diagram-maker/references/11-web-implementation-and-accessibility.md`
- `~/.pi/agent/skills/diagram-maker/references/12-create-workflow-and-sales-school-test-case.md`
- `~/Projects/whatarewecapableof/proposals/sales-school/diagram-pass-handoff.md`
- `~/.pi/projects/-Users-noah--pi/memory/project_sales_school_portal.md`
- `~/Projects/austin-sales-school/content/inventory.md`
- `~/Projects/austin-sales-school/content/data/link-flow.json`
- `~/Projects/austin-sales-school/docs/current-site-flow-map.md`
- `~/Projects/austin-sales-school/docs/proposed-site-flow-and-sitemap.md`
- `~/Projects/austin-sales-school/docs/proposal-ia-and-ui-directions.md`

Primary files:

- `~/Projects/whatarewecapableof/proposals/sales-school/index.html`
- `~/Projects/whatarewecapableof/css/proposal-media.css`
- `~/Projects/whatarewecapableof/proposals/sales-school/slots/index.html`

Current state:

- The diagram-maker skill build is complete.
- A local exploration page exists at `proposals/sales-school/slots/index.html`.
- `slots/index.html` is ignored by git because `.gitignore` ignores `proposals/*/slots/`.
- `css/proposal-media.css` has a new inserted block of reusable diagram CSS classes.
- The live proposal `proposals/sales-school/index.html` has not yet been edited in this pass.
- `PROPOSALS.md` was already dirty before this work. Do not touch or revert it.

Task:

1. Inspect the local exploration page at `http://127.0.0.1:8765/proposals/sales-school/slots/`. Restart a local server from `~/Projects/whatarewecapableof` if needed.
2. Decide which upgraded diagrams should be integrated into the live proposal.
3. Integrate the smallest useful set into `proposals/sales-school/index.html`.
4. Keep or revert the `proposal-media.css` CSS block depending on whether the live proposal uses it.
5. If the CSS block remains in use, update the proposal-media cache-bust query in `index.html` from `v=rules-20260427` to a new diagram version.
6. Review desktop and mobile widths.
7. Run ASCII and dash checks.
8. Report exact changed files and any remaining open questions.

Diagram priorities:

1. Current access chain: trace the current route from GoHighLevel preview to Firebase email HTML to email index to day section to breakout button to PDF index to Wistia page. Include counts and missing-feature callouts.
2. Before and after comparison: show same content, better structure.
3. Proposed sitemap: show MVP hierarchy, all six breakout pages, Wistia as media layer, and Phase 2 as optional later scope.
4. Live-break flow: show Zoom, facilitator, student, and portal roles. Keep facilitator agency visible.
5. Today wireframe: show current-session state surface, not generic dashboard.
6. Scope overlay: use only if it improves the Scope section.

Constraints:

- Keep diagrams structural and restrained.
- Use live HTML/CSS text graphics, not image diagrams.
- Keep WAWCO-native quiet rules, local labels, and plain structure.
- Do not add heavy boxed framing or generic product-diagram styling.
- Internal lines, boxes, rules, and boundaries should encode real structure only.
- Do not make final brand or visual identity decisions.
- Do not use the old generated Graphviz diagrams as final visuals.
- Keep work at IA and link-flow level unless Noah asks for lesson-level content.
- Do not focus on transcripts unless requested.
- Preserve captions and accessible text equivalents.
- Mark current-state claims as sourced and proposed-state claims as proposed or assumed.
- No em dashes or double hyphens.
```
