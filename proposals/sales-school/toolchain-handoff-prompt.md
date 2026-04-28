# Sales School diagram pass continuation prompt

Use this prompt in a fresh session to continue the Sales School diagram work with the new diagram-maker toolchain.

```md
We are continuing the Sales School proposal diagram pass after compaction.

First read these files completely:

- `~/.pi/agent/skills/diagram-maker/SKILL.md`
- `~/.pi/agent/skills/diagram-maker/tools/README.md`
- `~/Projects/whatarewecapableof/proposals/sales-school/image-diagram-handoff.md`
- `~/Projects/whatarewecapableof/proposals/sales-school/diagram-pass-handoff.md`
- `~/Projects/whatarewecapableof/proposals/sales-school/toolchain-handoff-prompt.md`

Then inspect these project files as needed:

- `~/Projects/whatarewecapableof/proposals/sales-school/index.html`
- `~/Projects/whatarewecapableof/css/proposal-media.css`
- `~/Projects/whatarewecapableof/proposals/sales-school/diagrams/src/generate-diagrams.py`
- `~/Projects/whatarewecapableof/proposals/sales-school/diagrams/svg/*.svg`
- `~/Projects/whatarewecapableof/proposals/sales-school/diagrams/png/*.png`
- `~/Projects/whatarewecapableof/proposals/sales-school/slots/image-diagrams.html`

Local preview:

- `http://127.0.0.1:8765/proposals/sales-school/slots/image-diagrams.html?v=wawco4`

If the local server is not running, restart it from the project root:

```sh
cd ~/Projects/whatarewecapableof
python3 -m http.server 8765
```

Current state:

- The live Sales School proposal still uses the HTML and CSS diagrams from an earlier pass.
- The generated image diagrams are previewed in a local ignored slots page.
- The SVG and PNG image set has been revised several times toward WAWCO style.
- The current image pass is simpler, white, black, neutral gray, and WAWCO blue.
- The custom SVG generator now includes a geometry engine with `Box`, layers, marker checks, approximate text fitting, `small_node()`, `layout_row()`, `band()`, and debug mode using `-d`.
- Diagram 02 is now explicitly optional. It may be cut from final integration because diagrams 01 and 03 carry the same argument with more useful detail.
- Strongest current integration candidates are 01, 03, 04, 05, and 06.
- Do not touch `PROPOSALS.md`. It was already dirty before this work.

New diagram-maker toolchain:

Tool directory:

```txt
~/.pi/agent/skills/diagram-maker/tools
```

Important files:

- `README.md`
- `schema/diagram.schema.json`
- `src/diagram-lint.mjs`
- `src/render-html-outline.mjs`
- `src/model-to-dot.mjs`
- `src/render-graphviz.mjs`
- `src/render-html-page.mjs`
- `src/check-web-diagram.mjs`
- `examples/sales-school-access-chain.yaml`
- `examples/sales-school-sitemap.yaml`

Use the toolchain as the first pass for any new or rebuilt diagram:

1. Brief the diagram.
2. Build a source model first.
3. Lint the source model.
4. Render an accessible HTML outline.
5. Render DOT and Graphviz SVG as a layout draft when the structure suits Graphviz.
6. Render a combined browser-review HTML page.
7. Browser-check the page with desktop screenshot, mobile screenshot, axe check, reduced-motion screenshot, and print PDF.
8. Revise the model before visual polish.
9. Only after the model and browser checks pass, adapt the result into the custom WAWCO SVG generator or into the proposal HTML.

Useful commands from the tools directory:

```sh
cd ~/.pi/agent/skills/diagram-maker/tools
npm run lint:examples
npm run render:examples
npm run check:web:examples
```

For a new model, use positional inputs:

```sh
cd ~/.pi/agent/skills/diagram-maker/tools
node src/diagram-lint.mjs path/to/model.yaml
node src/render-html-outline.mjs path/to/model.yaml path/to/output.html
node src/model-to-dot.mjs path/to/model.yaml path/to/output.dot
node src/render-graphviz.mjs path/to/model.yaml path/to/output.svg
node src/render-html-page.mjs path/to/model.yaml path/to/page.html
node src/check-web-diagram.mjs path/to/page.html
```

Toolchain model requirements:

- Root metadata: id, title, claim, audience, state, perspective, scale, timescale, scope, delivery, omissions, visual queries.
- Entities: stable IDs, labels, types, states, confidence, evidence references when available.
- Relations: stable IDs, endpoints, verbs, relation types, direction, confidence, evidence references when available.
- States: definition, visual cue, and text cue.
- Evidence records: source type, date, confidence, path when available.
- Legend entries: mark, meaning, and redundant cue.
- Accessibility: summary, reading path, text equivalent, and relation table for relation-heavy diagrams.

Linter catches:

- missing required fields
- duplicate IDs
- broken relation endpoints
- invalid state references
- invalid evidence references
- branch or decision relations without branch conditions
- weighted relations without units
- vague relation verbs
- color-coded legend entries without non-color backup
- missing accessibility text
- missing relation table for relation-heavy diagrams

Important distinction:

- The toolchain is the source-model and validation pipeline.
- Graphviz output is a layout draft, not a final client diagram.
- The WAWCO SVG generator remains the custom visual rendering layer for the current proposal images.
- Do not polish a diagram until its source model, linter output, accessible outline, browser checks, and text equivalent are sound.

Recommended next task:

Retry one diagram through the full toolchain, then decide whether to re-render the polished WAWCO image from the validated source model.

Best retry candidates:

1. Current access chain.
2. Proposed portal architecture.
3. Live-break operating flow with exception paths.
4. Current versus proposed comparison, if diagram 02 is still needed.
5. Today live surface as an annotated state surface.
6. Scope boundary as a status overlay or banded scope model.

Suggested immediate next move:

Use the new toolchain on the proposed portal architecture first. It has clear entities, hierarchy, states, kept media layer, optional later scope, and accessibility needs. Build a source model from the current diagram 03, lint it, render the HTML outline, render the Graphviz SVG draft, render the browser-review page, run the web check, then compare that validated model to the custom WAWCO SVG output.

Preserve constraints:

- Use WAWCO style: white background, black text, neutral gray rules, WAWCO blue for active path or selected state only.
- Do not use beige paper tones.
- Do not use Georgia, EB Garamond, Times New Roman, or any real serif.
- Keep Wistia visible as the media layer.
- Keep Phase 2 separate from MVP.
- Keep current-state claims sourced.
- Mark proposed-state claims as proposed or assumption.
- Keep captions and text equivalents when integrating into `index.html`.
- No em dashes or double hyphens in Noah-facing writing or visible diagram text.
- Avoid over-dense image text. Let the image expose structure and let captions or accessible text carry source notes.
- Do not integrate the generated PNGs into the live proposal until Noah approves the preview.

Current files to preserve:

- `proposals/sales-school/diagrams/src/generate-diagrams.py`
- `proposals/sales-school/diagrams/svg/*.svg`
- `proposals/sales-school/diagrams/png/*.png`
- `proposals/sales-school/slots/image-diagrams.html`
- `proposals/sales-school/image-diagram-handoff.md`
- `proposals/sales-school/toolchain-handoff-prompt.md`

Final checks before reporting:

Run the project whitespace diff check from `~/Projects/whatarewecapableof`.

When reporting, include changed files, current preview URL, whether the toolchain lint passed, where browser-check artifacts were written, and which diagrams remain candidates for final integration.
```
