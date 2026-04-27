# Audit report: WAWCO type-size hierarchy drift

Date: 2026-04-26

Target: `design/taste-profile/profile.md`, `design/system-constraints.md`, proposal composition docs, proposal template, active proposal pages, and the Sales School proposal.

Phase 1 fidelity: inapplicable. This is Noah's authored design system and proposal workflow, not a source-derived knowledge base.

## Intake

**System type:** hybrid. The taste profile and system constraints are a design reference system. The proposal composition files are workflow files. The `whatarewecapableof` agent is an agent definition that routes future workers into those files.

**Primary failure reported:** Noah has stated that WAWCO should not establish hierarchy through text size. Agents still produce proposal work where headings, tables, lists, diagrams, and mockups use size differences to imply rank.

**Operational evidence used:**

- Current Sales School proposal: `proposals/sales-school/index.html`
- Sales School generated assets: `proposals/sales-school/img/current-flow.png`, `proposed-sitemap.png`, `live-break-flow.png`, `today-wireframe.svg`
- Prior BELHAUS context audit: `docs/belhaus-context-update-audit-2026-04-26.md`
- Proposal composition memory: `~/.pi/projects/-Users-noah--pi/memory/reference_whatarewecapableof_proposal_composition.md`

## Phase 2: Function

### Scenario: Sales School proposal as operational history

**Brief:** Evaluate the active Sales School proposal for the reported failure: hierarchy carried by text size.

**System behavior:** The page itself uses mostly flat WAWCO proposal styles, but the embedded graphics and several local style rules use conventional product-diagram hierarchy.

**Good:**

- The page loads the locked WAWCO CSS stack and `proposal-media.css`.
- The prose surface keeps headings visually restrained in most sections.
- The proposal correctly frames the wireframe as structural only: "Final visual direction should follow the design references we collect later."

**Silent:**

- The proposal composition system says diagrams can be final HTML/CSS when readable text matters, but it does not require text-carrying diagrams to obey the same type-size contract as the page.
- The docs do not give an automatic rejection test for generated graphics that use large titles, colored cards, bold labels, and gray secondary text.

**Bad:**

- `today-wireframe.svg` uses `font-size="44"` with `font-weight="700"` for the main title, plus 24, 18, 16, 15, and 14px text levels. That is direct size hierarchy.
- The three PNG diagrams use large bold titles, rounded card boxes, colored outlines, tinted surfaces, and shadows. They are visibly generated from a generic SaaS diagram language rather than the WAWCO profile.
- `proposals/sales-school/index.html` sets `table`, `.scope-phase li`, `.placeholder-item p`, and `.proposal-output` to `--size-s`. Those elements carry body-like content, so the smaller size creates rank by text size.

**Output sample:**

```css
/* Sales School before audit */
table { font-size: var(--size-s); }
.scope-phase li { font-size: var(--size-s); }
.placeholder-item p { font-size: var(--size-s); }
.proposal-output { font-size: var(--size-s); }
```

**Severity:** Functional.

**Recommendation:** Replace text-carrying PNG/SVG diagrams with live WAWCO-native diagram primitives. Set body-like proposal elements to `--size-m`. Add a repository check that fails when the known bad selector patterns return.

### Scenario: Proposal template inheritance

**Brief:** Check whether a fresh proposal built from `_template` would repeat the error.

**System behavior:** `_template` is better than older pages. Tables and scope list items already use `--size-m`. The template still lacks an explicit prohibition that distinguishes role-sized metadata from rank-sized body content.

**Good:**

- `table` in `_template` uses `font-size: var(--size-m)`.
- `.scope-phase li` in `_template` uses `font-size: var(--size-m)`.
- The standard `h1`, `h2`, `h3`, and `p` behavior is near-flat.

**Silent:**

- The template does not include comments or QA instructions that prevent future agents from making `.proposal-output`, diagram paragraphs, tables, or scope lists smaller to make them subordinate.

**Bad:**

- Future agents can still copy older live pages instead of `_template`. Several old proposal pages still contain the bad `--size-s` body-like patterns.
- The docs phrase the rule as "size is role-based" but the CSS does not enforce it.

**Severity:** Functional.

**Recommendation:** Add an automated check and remove bad patterns from current live proposal files so old pages stop acting as bad examples.

### Scenario: Graphic-system or model-generated proposal assets

**Brief:** Evaluate whether generated proposal graphics are constrained by the taste profile.

**System behavior:** Documentation says to use the WAWCO profile, but the Sales School assets show that generated graphics can bypass the contract completely.

**Good:**

- The composition system already says live HTML/CSS can be the right final form when graphics carry readable words.
- The BELHAUS pass learned this lesson and used live table-like objects for readable proposal graphics.

**Silent:**

- No explicit rule says: if a graphic uses readable text, it must follow the same type-size contract as the proposal page.
- No generated-asset QA step checks embedded SVG `font-size`, `font-weight`, or visible rank-by-size.

**Bad:**

- Sales School graphics use a generic hierarchy stack: title larger than nodes, node title larger than note, active state colored, cards shaded, rounded and shadowed. The graphic conflicts with the page that contains it.

**Severity:** Structural for generated graphics, functional for Sales School.

**Recommendation:** Add a "text-carrying graphic contract" to `proposal-media.css`, `proposal-composition-system.md`, and `proposal-composition-partner.md`: readable proposal graphics should be live HTML/CSS by default; body-like labels stay `--size-m`; small mono text is reserved for labels, captions, counters, and source metadata.

## Phase 2: Architecture findings

### Finding: The taste profile has a loophole around `scale-ratio: 1.125`

**Observation:** The prose says no size-based hierarchy, but the YAML still advertises a scale ratio. Agents can read `1.125` as permission to make headings larger.

**Evidence:** `profile.md` says "Scale ratio sits near 1.0" and later "Do not let headings get bigger than 1.125x body." That still frames a maximum heading enlargement as a design option.

**Severity:** Functional.

**Recommendation:** Change the profile's type scale language from "gentle scale" to "flat rank." Keep small sizes only as role-specific apparatus, not hierarchy.

### Finding: System constraints still describe `--size-l` and `--size-xl` as heading/title options

**Observation:** The token table says `--size-l` is for page title or heading in two-column detail pages and `--size-xl` is for signature moments. This allows agents to reach for larger text when they see a title.

**Evidence:** `design/system-constraints.md` size table.

**Severity:** Functional.

**Recommendation:** Reframe `--size-l` and `--size-xl` as disabled-by-default exceptions. For proposal pages, recurring titles, headings, tables, scope lists, and diagram body text stay `--size-m`.

### Finding: Proposal docs contain a direct contradiction around `.proposal-output`

**Observation:** The composition system tells agents to use `.proposal-output` so output lines stay subordinate. The implemented pattern made those lines smaller.

**Evidence:** `design/proposal-composition-system.md` says "The smaller size preserves wayfinding." `css/components.css` and Sales School set `.proposal-output` to `--size-s`.

**Severity:** Functional.

**Recommendation:** Make `.proposal-output` inherit body size. Keep wayfinding through inline bold, placement, and the word "Output:" rather than smaller type.

### Finding: Existing proposal pages are bad training examples

**Observation:** Older proposal pages contain local CSS copied forward from pre-BELHAUS patterns.

**Evidence:** `proposals/teaspressa`, `compassion`, `fde`, `paste`, and `sales-school` contain `table` and `.scope-phase li` rules set to `--size-s`.

**Severity:** Structural.

**Recommendation:** Patch existing pages so future agents copying from live examples do not inherit the old mistake.

## Phase 3: Integration

### 3.1 Cold-start routing test: proposal visual pass

**Query/Task:** "Add a visual diagram to a WAWCO proposal."

**Expected behavior:** The agent reads the proposal composition partner, taste profile, system constraints, proposal composition system, template, and active proposal.

**Actual behavior risk:** The required files include the right rules, but current examples still show conflicting patterns. A model can satisfy the required reading and still copy an old page's `--size-s` tables or generated SaaS diagram style.

**Gap:** Good rules are not strong enough when examples contradict them.

**Fix:** Align current examples with the rule. Add automated checks for known recurring CSS mistakes.

### 3.2 Cross-file coherence: hierarchy contract

**Query/Task:** Compare `profile.md`, `system-constraints.md`, composition docs, memories, and active pages.

**Expected behavior:** All files should say the same thing about text size.

**Actual behavior:**

- Profile says no size-based hierarchy, but YAML uses `scale-ratio: 1.125`.
- System constraints permit `--size-l` for titles.
- Composition docs say body-like table text should stay `--size-m`, while `.proposal-output` was documented as intentionally smaller.
- Old pages still use `--size-s` for body-like content.

**Gap:** The rule exists, but it is distributed as a preference. It needs to be an invariant.

**Fix:** State the invariant in every routing surface and remove contradictory implementation examples.

### 3.3 Workflow-to-knowledge handoff: generated graphics

**Query/Task:** Follow the proposal composition workflow for a text-carrying diagram.

**Expected behavior:** The workflow routes to `proposal-media.css` and `system-constraints.md`.

**Actual behavior:** The workflow offers diagram moves but does not require the diagram's typography to obey WAWCO's type-size contract.

**Gap:** A generated graphic can be treated as media and escape the design system.

**Fix:** Add the text-carrying graphic contract: diagrams, maps, wireframes, and artifacts with readable text follow the same rules as the page. Live HTML/CSS is preferred.

### 3.4 Boundary test: client product mockups

**Query/Task:** "Make a low-fidelity wireframe for the client's final portal."

**Expected behavior:** The mockup can express structure without importing generic product UI styling.

**Actual behavior:** Sales School's `today-wireframe.svg` imports generic product hierarchy: 44px bold title, pills, colored badges, rounded cards, and muted secondary text.

**Gap:** The system does not distinguish a structural wireframe from a polished product interface.

**Fix:** Use WAWCO-native wireframe objects for proposal-stage mockups unless Noah explicitly asks to explore the client's final visual direction.

## Rebuild plan

### Errata

No source-text errata. Phase 1 did not apply.

### Structural changes

1. Treat "no text-size hierarchy" as a profile invariant, not a taste preference.
2. Add a text-carrying graphic contract to the proposal system.
3. Add an automated type-hierarchy check for known bad CSS and SVG patterns.
4. Patch current proposal pages so they no longer train future workers into the old pattern.

### Revised files

- `design/taste-profile/profile.md`
- `design/system-constraints.md`
- `design/proposal-composition-system.md`
- `docs/proposal-composition-partner.md`
- `css/components.css`
- `css/proposal-media.css`
- `proposals/*/index.html` where old body-like `--size-s` patterns remain
- `proposals/sales-school/index.html`
- `proposals/sales-school/img/today-wireframe.svg` if retained, or replaced by live HTML/CSS
- `scripts/check-type-hierarchy.mjs`
- `package.json`
- `~/.pi/agent/agents/whatarewecapableof.md`
- `~/.pi/agents/whatarewecapableof/AGENT.md`
- WAWCO project memory and proposal composition memory

### Architecture recommendation

Targeted restructuring. The core architecture is sound. The failure came from contradictory examples and weak enforcement, not from the whole design system.

### What was not changed

- The 24px baseline grid remains valid.
- The system UI plus Geist Mono role split remains valid.
- Proposal tabs, noindex behavior, root-relative paths, and sticky tab scroll handler are unrelated to this failure and should remain unchanged.
- The 3 to 5 visual insertion target remains valid.

## Rebuild applied in this pass

The audit findings were applied immediately.

**Profile and constraints:**

- `profile.md` now uses `scale-ratio: 1.0` and names flat ranked content as an invariant.
- `system-constraints.md` now treats `--size-l` and `--size-xl` as disabled-by-default exception tokens, not recurring heading sizes.
- The implementation checklist now rejects body-like proposal content set at `--size-s` or `--size-xs`.

**Proposal system:**

- `proposal-composition-system.md` and `proposal-composition-partner.md` now include a proposal typography invariant and a text-carrying graphic contract.
- `proposal-media.css` now provides live text-graphic primitives for flows, maps, and wireframes.
- `proposal-output`, process timeline paragraphs, specimen descriptions, diagram pre text, excerpts, and video transcripts now render at body size.

**Current proposals:**

- Existing proposal pages now load a versioned `proposal-media.css` URL for this update.
- Teaspressa, Compassion, FDE, PäSTE, and Sales School no longer use `--size-s` for table body text or scope list body text.
- Sales School's generic generated flow, sitemap, live-break, and Today wireframe graphics were removed and replaced with live WAWCO-native HTML/CSS objects.

**Guardrail:**

- Added `scripts/check-type-hierarchy.mjs` and `npm run check:type-hierarchy`.
- The check fails on the recurring bad patterns: small table body text, small scope lists, small output lines, small placeholder descriptions, small specimen descriptions, small process paragraphs, recurring `--size-l`/`--size-xl` use in proposals, and SVG text graphics with bold, oversized text, or generic Tailwind/SaaS palette values.
