# FDE Composition Session Handoff

Use this document to brief a separate AI on the full context of the FDE proposal composition session (April 25, 2026). The goal is to evaluate the decisions made, identify patterns worth systematizing, and decide how to integrate these into the broader proposal and graphic design workflow.

---

## Prompt for ChatGPT

You are being briefed on a working session between Noah Glynn and Claude Code (Opus 4.6). The session added images and visual rhythm to a text-first consulting proposal for Faith Driven Entrepreneur. The proposal lives at whatarewecapableof.com/proposals/fde and is part of a multi-proposal system Noah and Austin Rockwell run for their consulting agency, What are we capable of?

Your job: examine the complete context below, evaluate the decisions, work through them with Noah, and help discover a path forward for integrating what worked (and what didn't) into the agency's systems. Noah wants to interact with you coherently, not just read a summary.

### What the agency builds

Noah and Austin run a consulting agency at whatarewecapableof.com. They produce proposal pages for prospective clients. Each proposal is a static HTML page with tabbed sections (usually Summary/Research/Scope or Overview/Program/Investment), built from a shared design system: left-anchored layout, system font + Geist Mono type pair, 24px baseline grid, black on white, no decoration. Proposals are noindex, direct-link only.

There are currently five proposals: Teaspressa, Compassion, Belhaus, PäSTE, and FDE. Each was text-first. Teaspressa was the pilot for the proposal composition system (adding images after the text is stable). FDE is the second proposal to go through the full composition workflow.

### What happened in this session

**Starting state:** The FDE proposal was a text-only page migrated from a Base44 React build. Three tabs: Overview (why the campus initiative exists), Program (leader development model and yearly rhythm), Investment (rollout plan, deliverables, terms). No images, no visual rhythm.

**The composition partner workflow was executed in full.** This is a documented system at `docs/proposal-composition-partner.md` and `design/proposal-composition-system.md`. The workflow:

1. Read the proposal as an argument
2. Build a beat map (section-by-section: beat type, reader task, density, trust requirement, media opportunity)
3. Find fatigue and proof points
4. Inventory available and potential assets
5. Recommend insertions with exact anchors, media jobs, rationale, and priority
6. Cut aggressively
7. Create an in-flow placeholder draft (the "slot board")
8. Implement final media only when approved

**The beat map identified:** The Overview tab reads quickly (short findings). The Program tab is the densest (the touchpoints table and leader development layers are abstract system descriptions). The Investment tab has a long deliverables table that overlaps the phase descriptions. Six places where the reader would benefit from a visual break.

**The composition plan recommended 7 slots initially**, prioritized by impact:
- High: Mission quote excerpt, yearly rhythm diagram
- Medium-high: Process strip timeline
- Medium: Growth numbers card, leader development diagram, two atmosphere images
- Low: Church partnership atmosphere

### The Are.na curation loop

An Are.na channel (FDE Media) was the image curation surface. Noah tagged images with slot IDs (FDE-01 through FDE-09) to assign them. The channel started with 15 images (landscapes, faith markers, community photos, entrepreneurship stock). Two more were pulled from an Unsplash collection during the session (Sam Balye prayer photo, Cody Silver community walk). Claude downloaded all images, viewed them, and mapped them to slots based on the proposal's argument structure.

**Key curation decisions Noah made:**
- FDE-01 (Overview atmosphere): Desert dune, person with arms spread. Calling and beginning.
- FDE-02 (Overview, after Finding 03): Montana peak used as background for a graphic system numbers card.
- FDE-03 (Overview, after "What is already built"): Birds in formation used as background for a graphic system quote card. Noah chose birds over the dune sunset that Claude initially proposed.
- FDE-04 (Program, after leader layers): Bible flat-lay. Noah tagged this over the diagram card Claude recommended. Scripture grounding the curriculum claim.
- FDE-05 (Program, after touchpoints table): Yearly rhythm diagram (graphic system render, no photo).
- FDE-07 (Investment, before Investment heading): Cross at dusk. Moved from after the investment paragraph to before the heading during the session.
- FDE-08 (Program, after opening paragraph): Prayer gathering (Sam Balye). Noah initially had a Filson hunting group photo here but rejected it as "not very entrepreneurial, more so outdoorsy." Pulled the prayer photo from Unsplash to replace it.
- FDE-09 (Investment, between timeline and deliverables): Entrepreneur gesturing outside a building.

### The graphic system

Four YAML briefs were written for the graphic system at `~/Projects/graphic-system/briefs/fde/`. The graphic system renders HTML+CSS in Chrome and screenshots the result. Templates: `numbers-card`, `quote-card`, `diagram-card`.

**What was generated:**
1. **FDE-02 (numbers card):** "5 → 10" with Montana peak as background. Dark overlay, serif numbers, mono body text.
2. **FDE-03 (quote card):** "A ruthless fervor to advance the mission for God's glory, not our own." Birds in formation background, warm sunset tones showing through.
3. **FDE-04 (leader layers diagram):** Three-column diagram: Content → Opportunity → Coaching. Noah chose the Bible photo instead, so this render exists but wasn't used.
4. **FDE-05 (yearly rhythm diagram):** Four-column diagram: Weekly gatherings → Bi-weekly coaching → Semester events + cohorts → Annual conference. No background image, clean institutional-craft theme.

**Iteration on the graphics:**
- The quote card went through several rounds: background changed from dune sunset to birds (per Noah's Are.na tag), overlay opacity reduced from 0.3 to 0.15 to 0.05 (then switched to direct `opacity: 0.55` on the background layer) because the white wash was hiding the photo. Line break adjusted from "for God's\n" to "for\nGod's" and finally to the current break after "mission" so the second line reads "for God's glory, not our own."
- The numbers card line break was adjusted so "A launch playbook FDE owns after that." sits on its own line.
- Both cards had text size bumped up (quote from default ~66px to 88px, numbers from 160px/36px to 200px/44px) because they were too small at viewport scale.
- A `\n` → `<br>` escape was added to the quote-card and numbers-card templates to support explicit line breaks in briefs. This is a permanent system change.

**Open system question Noah flagged:** The graphic system should be informed by a specified taste profile (the YAML frontmatter that defines each project's aesthetic). Currently the system has hardcoded themes (`institutional-craft`, `warm-photographic`). The future state: each project's taste profile should generate or select the right theme automatically. This is noted as a system-wide open item, not per-project.

### Design decisions that became system patterns

**1. Horizontal rules after images.** When an image directly precedes a section heading, the `border-top` rule on the heading creates a double visual break. The image already resets attention. CSS rule added: `.proposal-media + .section-heading { border-top: none; padding-top: var(--space-1); margin-top: var(--space-2); }`. This was applied to 6 instances in FDE. Noah wants this added to `proposal-media.css` as a system primitive during the implementation pass (deferred from this session).

**2. Process strip redesign.** The original `proposal-process-strip` class uses horizontal flex with `overflow-x: auto`. On the FDE proposal, the third step (Scale) was hidden off-screen with no scroll affordance. Noah flagged this: "the content to the right when you scroll is essentially hidden unless you happen to know there is a scroll there." Redesigned as a vertical timeline with dots and connecting lines. This is page-specific CSS on FDE for now, but the pattern may replace or supplement the horizontal strip system-wide.

**3. ? tab standardization.** The ? tab (the CTA page at the end of every proposal) was inconsistent across proposals. FDE had an underlined "we"; Compassion had a bold "we" plus "Let's find out." Noah wanted them to match. FDE was updated to match Compassion: bold "we" (font-weight 700), "Let's find out." on the next line, "Book a call" link below. This should be codified in the template.

**4. Output line sizing.** The bold "Output:" lines in scope phases were rendering at `--size-m` (the serif body size), which read too loud with bold weight. Dropped to `--size-s` to match surrounding scope-phase body text. Bold kept for wayfinding.

**5. Image-to-heading spacing.** When a `proposal-media` element directly precedes a `section-heading`, the rule is suppressed and spacing is adjusted. This is the CSS-encoded version of a taste judgment: images provide their own visual break, so the rule becomes redundant and tightens the gap awkwardly.

### What the session produced

**Files created or modified:**
- `proposals/fde/index.html` — live proposal with 8 images, vertical timeline, rule suppression, ? tab update
- `proposals/fde/img/` — 8 production images (3 graphic system JPGs, 5 Are.na atmosphere JPGs, ~1.1MB total)
- `proposals/fde/media-slots.md` — slot documentation with curation notes
- `proposals/fde/slots/index.html` — local-only slot board (gitignored)
- `proposals/fde/img/src/arena/` — 17 source images from Are.na (gitignored)
- `~/Projects/graphic-system/briefs/fde/` — 4 YAML briefs
- `~/Projects/graphic-system/output/fde/` — 8 rendered PNGs (4 wide + 4 square)
- `~/Projects/graphic-system/templates/quote-card/template.mjs` — added `\n` → `<br>` support
- `~/Projects/graphic-system/templates/numbers-card/template.mjs` — added `\n` → `<br>` support

**Final slot map:**

| Slot | Tab | Position | Content | Source |
|---|---|---|---|---|
| FDE-01 | Overview | After intro paragraph | Desert dune, arms spread | Are.na (Omar Prestwich) |
| FDE-02 | Overview | After Finding 03 | "5 → 10" over Montana peak | Graphic system + Are.na |
| FDE-03 | Overview | After "What is already built" | Mission quote, birds in formation | Graphic system + Are.na |
| FDE-08 | Program | After opening paragraph | Prayer gathering | Are.na (Sam Balye) |
| FDE-04 | Program | After leader development layers | Bible flat lay | Are.na (Sixteen Miles Out) |
| FDE-05 | Program | After touchpoints table | Yearly rhythm diagram | Graphic system |
| FDE-06 | Investment | After three-phase plan | Vertical timeline (live HTML) | Built-in |
| FDE-09 | Investment | After timeline, before deliverables | Entrepreneur gesturing | Are.na (Vitaly Gariev) |
| FDE-07 | Investment | Before Investment heading | Cross at dusk | Are.na (Marcin Wlodarczyk) |

### What to evaluate

1. **The composition partner workflow itself.** Did the 8-phase process (read → map → inventory → propose → cut → draft → implement → review) produce the right results? Where did Noah override Claude's recommendations, and what does that reveal about the system's judgment calibration?

2. **Are.na as the curation surface.** Noah tagged images with slot IDs on Are.na, then Claude pulled them into the build. Is this the right loop? What's missing? The channel had 15 images before the session started; Noah added 2 during. The tagging convention (description field = "FDE-01") is informal.

3. **Graphic system integration.** Three of the nine visual moments used generated graphics (numbers card, quote card, diagram). The other six used photographs. Noah chose a photo over the diagram card for FDE-04. What does that say about when generated graphics earn their place versus when atmosphere photography does the work better?

4. **The horizontal-rule-after-images pattern.** This emerged as a taste judgment during the session and was encoded as CSS. Should the composition partner workflow include this check automatically? Should it be in `proposal-media.css` as a system default?

5. **Process strip redesign.** The horizontal scroll was invisible to users. The vertical timeline replacement is page-specific CSS. Should this become the default for the `proposal-process-strip` primitive, or should both options coexist?

6. **? tab standardization.** Should the ? tab be extracted into a shared include or documented as a template requirement?

7. **Graphic system taste profile integration.** The current themes are hardcoded. Noah flagged that the system should derive its visual treatment from a project's taste profile. What would that look like architecturally?

8. **The overall visual density.** FDE has 9 visual moments across 3 content tabs (plus the ? tab). Is that too many? The composition system says "a good proposal may need three visual insertions, not ten." FDE has 3 graphic-system renders + 5 atmosphere photos + 1 HTML timeline. Did the atmosphere photos earn their place, or did the session accumulate more images than the argument needed?

9. **The iteration loop on generated graphics.** The quote card went through ~5 rounds of adjustment (background swap, overlay tuning, line break positioning, text sizing). Is this normal creative iteration, or does it suggest the brief format needs richer defaults so the first render is closer to final?

### Questions for Noah

- Which images felt right immediately and which felt like compromises?
- Did any of the graphic system renders change how you think about what those cards can do?
- When you look at the live page now, where does your eye stop in a way that helps the argument, and where does it stop in a way that interrupts it?
- What would you change if you were showing this to Mark tomorrow?
- How did using Are.na as the curation surface compare to how you'd curate in Figma or a folder?
