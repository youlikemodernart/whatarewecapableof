# Proposal Composition Partner

Use this workflow when a What are we capable of? proposal is text-heavy and needs visual rhythm without forcing a rigid template.

The partner's job is to understand the proposal as an argument, then recommend or implement a small number of visual insertions that improve trust, pacing, and comprehension.

## Required reading

Before any proposal composition work, read:

1. `docs/directory-map.md`
2. `PROPOSALS.md`
3. `design/taste-profile/profile.md`
4. `design/system-constraints.md`
5. `design/proposal-composition-system.md`
6. `proposals/_template/index.html`
7. The active proposal file, for example `proposals/teaspressa/index.html`
8. Any client-specific source docs, screenshots, assets, or research notes named in `PROPOSALS.md`

If the task involves writing or revising client-facing proposal copy, also load Noah's writing style guidance before editing prose.

## Default mode

For ordinary consulting proposals, work text-first. The proposal should usually be drafted and structurally stable before this partner decides where images belong. Review first. Draft placements second. Implement final media last.

Unless Noah explicitly asks for final implementation, return a composition plan or create a local in-flow placeholder draft. The first visual artifact should usually be the actual proposal copy with grey image frames placed where the images would live. Noah can open that draft, collect assets, tag them on Are.na, and decide what belongs in each frame before the live proposal is edited.

Exception: when the proposal is creative-led or the offer depends on visual specimens, the visual pass may start during proposal production. Compassion is the reference case: the proposal form itself needed content examples and feed direction. In those cases, the consulting pipeline should mark the proposal as creative-led before drafting.

## What to preserve

- Left-anchored proposal surface.
- Restrained type-led visual language.
- Flat text-size hierarchy: body-like proposal content stays at `--size-m`.
- Root-relative asset paths.
- Sticky proposal header and tab behavior.
- Existing proposal tabs unless the content demands a different section model.
- Standard `?` tab CTA: bold `we`, `Let's find out.`, then `Book a call`.
- Noindex proposal behavior.
- Accessibility floors.
- The current tab scroll handler. Do not restore older tab scroll code.

## What to avoid

- Rigid proposal templates.
- Treating every image as proof when Noah is using it for atmosphere.
- Decorative images that have no relationship to the proposal's cadence.
- Generic stock imagery.
- Visuals that make the recipient look careless without helping them see a path forward.
- Large page-specific CSS when a reusable primitive can handle the move.
- Custom video controls unless native controls are visually unacceptable.
- Relative local asset paths such as `img/file.jpg`.
- Smooth-scroll tab activation changes.

## Workflow

### 1. Read the proposal as an argument

Identify the main claim, the reader's likely starting point, the proof offered, the proposed work, and the decision the page asks for.

Return one paragraph:

```md
The proposal argues that [client situation]. The strongest evidence is [evidence]. The densest sections are [sections]. The clearest visual opportunities are [opportunities].
```

### 2. Build a beat map

Map each major section or subsection.

Use this table:

```md
| Section | Beat | Reader task | Density | Trust requirement | Media opportunity |
|---|---|---|---|---|---|
| Summary intro | Recognition | See their business described accurately | Medium | Medium | Low |
```

Allowed beat labels:

- Orientation
- Recognition
- Observation
- Evidence
- Interpretation
- Possibility
- Offer
- Decision

Density values:

- Low
- Medium
- High

Trust requirement values:

- Low
- Medium
- High

### 3. Find fatigue and proof points

Mark places where the reader is likely to tire or where a claim needs visible grounding.

Common signals:

- repeated finding blocks
- abstract system prose
- long table without a visual summary
- before and after claim without a before and after object
- invisible infrastructure described only in text
- proposal section that depends on imagining a future deliverable
- mobile flow that becomes a long unbroken stack

### 4. Inventory assets

Classify each asset or potential asset.

```md
| Asset | Exists? | Source | Job | Quality | Confidence | Notes |
|---|---|---|---|---|---|---|
| Subscription page screenshot | Needs capture | teaspressa.com | Proof | High | High | Empty page supports finding 03 |
```

Job values:

- Proof
- Comparison
- Artifact
- Atmosphere
- Sequence
- Diagram
- Specimen
- Pause

Quality values:

- High
- Medium
- Low

Confidence values:

- High: known source, clear use, low risk
- Medium: likely useful but needs review
- Low: speculative or may distract

Are.na ownership rule:

- If Noah owns the Are.na block, use the block metadata for slot ID, job, status, crop notes, and rationale.
- If Noah collected another person's block and cannot edit its description, use the Are.na skill to download the original media, reupload it to the project channel with source attribution, and then apply the project metadata to the owned block.
- Preserve attribution when reuploading collected media. Metadata control does not remove source responsibility.

### 5. Recommend insertions

Each recommendation needs an exact anchor and a reason. The default recommendation is a single body-width image or simple video inserted into the proposal flow. Use `16:9` first. Use `4:3`, `7:5`, or `5:7` when the surrounding copy asks for a different frame. Use diptychs, grids, tall paired screenshots, and more complex moves only when Noah asks for them or the argument clearly needs them.

```md
### 1. Empty subscription page evidence plate

- Placement anchor: after Finding 03 in the Summary tab.
- Media job: Proof.
- Composition move: Evidence plate.
- Asset: Screenshot of `/pages/tea-subscribe-page` at desktop and mobile.
- Rationale: The finding depends on the absence of content. Showing the empty page makes the observation concrete without adding more prose.
- Desktop treatment: Wide evidence plate extending to the right of the prose column.
- Mobile treatment: Full column image with mono caption below.
- Implementation complexity: Low.
- Risk: Low, if the screenshot is framed neutrally.
- Priority: High.
```

Priority values:

- High: materially improves trust or comprehension
- Medium: improves pacing or specificity
- Low: nice to have, likely defer

### 6. Cut or defer

List visual ideas that should not be used yet.

```md
## Cut or defer

- Founder portrait: no clear job in the current argument.
- Lifestyle product photo: would add atmosphere but does not support the findings.
- Full custom dashboard mockup: risks overpromising before discovery.
```

### 7. Create the local placeholder draft

When Noah wants to collect imagery, create or update:

```txt
proposals/<slug>/slots/index.html
```

This page should look like the proposal, not a separate planning board. Use the actual proposal copy and insert grey frames exactly where images would live. Each frame should show:

- slot ID
- default frame ratio
- one-line curation suggestion
- Are.na tag, for example `slot: TS-04`
- ownership status: owned block, collected block, or reuploaded owned copy

Keep the draft local-only and ignored by git unless Noah explicitly approves sharing it.

### 8. Implement final media only when asked

Implementation turns draft-slot media into public proposal assets. Move final crops from ignored `proposals/<slug>/img/src/` into tracked `proposals/<slug>/img/`, add `/css/proposal-media.css` to existing proposal pages before using media primitives, and insert only the approved media into the live proposal.

If Noah asks for final implementation, follow this structure before editing:

```md
Goal:
Allowed files:
Do not edit:
Assets needed:
Validation commands:
Expected handoff:
```

Default allowed files for a single proposal media pass:

- `proposals/<slug>/index.html`
- `proposals/<slug>/img/**`
- `css/proposal-media.css`, if adding reusable primitives
- `docs/asset-inventory.md` and `docs/asset-inventory.json`, only as generated scanner output

Default do-not-edit:

- other proposal pages
- shared API files
- booking files
- design reference extraction folders
- unrelated project docs

## Implementation rules

### Paths

All local assets must use root-relative paths:

```html
<img src="/proposals/teaspressa/img/subscription-empty.jpg" alt="...">
```

Do not use:

```html
<img src="img/subscription-empty.jpg" alt="...">
```

### Images

- Add descriptive `alt` text.
- Add `width` and `height` attributes when dimensions are known.
- Use captions for evidence, comparison, and artifact media.
- Atmosphere and product-world images can be captionless when adjacent text already supplies enough context and the caption would add noise.
- Do not remove captions from proof screenshots or artifacts unless the source context is visible inside the image.
- Use native aspect ratio unless the composition requires a fixed frame.
- For draft previews, use non-destructive CSS cropping first, typically `object-fit: cover` and `object-position` on a local source image.
- Preserve raw source files under ignored `proposals/<slug>/img/src/`; Noah may manually crop and overwrite these files before final export.
- Move only final deployable crops into `proposals/<slug>/img/`.
- Filled draft images should render without visible borders or frames unless the edge needs definition for evidence.
- Avoid cropping evidence screenshots. Cropping can weaken trust.

### Video

- Use `preload="metadata"`.
- Use `playsinline`.
- Use a poster image.
- Add captions or transcript for spoken material.
- Avoid autoplay.
- Store very short prototype clips in the proposal folder only if file size is reasonable.
- Move repeated or large video to object storage once video becomes routine.

### CSS

- Prefer reusable proposal media primitives.
- Keep spacing on the 24px baseline.
- Use CSS custom properties already defined in `tokens.css`.
- Avoid adding new colors.
- Suppress the section-heading rule when a proposal visual directly precedes the heading; use `.section-heading--ruled` only when the rule carries a new grouping job.
- Use rules to group, introduce, or compare content. Do not bracket every artifact by default.
- If a diagram carries substantial readable text, live HTML/CSS may be the final artifact. Do not force a bitmap when live text reads better at proposal width.
- Use size for role, never rank. Body prose, proposal titles, section headings, scope phase titles, scope lists, table body cells, output lines, placeholder descriptions, specimen descriptions, and readable diagram text stay at `--size-m`. Small mono type is for labels, metadata, captions, counters, table headers, source notes, nav, and tabs.
- Use `.proposal-process-timeline` for 3 to 5 text steps by default. Use `.proposal-process-strip` only when lateral movement has a job and the overflow affordance is visible.
- Use `.proposal-output` for output lines inside scope phases; keep it at body size. Inline bold is allowed for `Output:` wayfinding, not structural hierarchy.
- Prefer live HTML/CSS for diagrams, maps, wireframes, and artifact mockups that carry readable words. If an SVG or bitmap carries readable text, it still follows the same size contract and avoids generic SaaS hierarchy: large bold titles, colored cards, gray secondary text, rounded boxes, shadows, and multi-size text ladders.
- Avoid shadows, rounded card treatments, gradients, and decorative surfaces.
- Keep media treatment quieter than the content it supports.
- The proposal template loads `/css/proposal-media.css` for future proposals. Existing proposal pages do not inherit template changes automatically. Add the stylesheet link to any existing proposal page before using proposal media classes.

### Accessibility

- Preserve heading order.
- Do not hide source text inside images.
- Provide transcript or equivalent for video with speech.
- Keep keyboard and focus behavior unchanged.
- If a media object is interactive, test keyboard operation.

### Performance

- Compress images before committing.
- Keep proposal media under the smallest size that still reads clearly.
- Lazy-load images below the first viewport when appropriate.
- Do not lazy-load the first major visual if it becomes the LCP element.
- Run the asset scanner after path or asset changes.
- In tabbed proposals, hidden-tab lazy images can false-fail validation. Check visible active-tab images only and scroll each active image into view before testing load state.

## Slot board preview

Slot boards are local-only in-flow composition drafts unless Noah approves deployment. They should show the actual proposal text with grey image frames or draft images placed in the reading flow. They are ignored by git via `proposals/*/slots/`.

To view a board locally, serve the project root:

```bash
cd ~/Projects/whatarewecapableof
python3 -m http.server 8888
```

Then open the board. Example:

```txt
http://localhost:8888/proposals/teaspressa/slots/
```

If the URL does not connect, check whether the local server is running.

Do not commit or push slot boards while they are local-only. If Noah later wants a board shared, move it intentionally into a public route and document that decision.

## Review checklist

Before handing off a composition plan or implementation, answer:

- Does every visual insertion have a clear job?
- Does the proposed rhythm match the argument's rhythm?
- Does the full proposal stay within the 3 to 5 visual target, or is the exception documented?
- Are the strongest proof points visible?
- Are any visuals merely decorative?
- Does the page still feel like What are we capable of?
- Does any hierarchy depend on text size? If yes, revise before handoff.
- Are all body-like proposal elements at `--size-m`: scope lists, table bodies, output lines, placeholder descriptions, specimen descriptions, and readable diagram text?
- Does mobile reading improve?
- Do captions make the media self-explanatory?
- Are all assets path-safe with and without a trailing slash?
- Are video and image accessibility requirements covered?
- Did we cut enough?
- If the page is tabbed, did validation account for hidden lazy images rather than checking every image in the DOM?

## Handoff format

```md
## Handoff

### Composition summary
- ...

### Recommended insertions
- ...

### Assets needed
- ...

### Files changed
- ...

### Commands run
- ...

### Validation status
- Passed:
- Not run:

### Open questions
- ...

### Override log
| Slot | System recommendation | Noah decision | Reason | Pattern learned |
|---|---|---|---|---|
```
