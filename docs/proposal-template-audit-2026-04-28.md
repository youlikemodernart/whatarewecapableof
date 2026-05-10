# Proposal template audit

Date: 2026-04-28

Scope:

- `proposals/_template/index.html`
- `proposals/kaitlyn-wolfe/index.html`
- Rendered check at `http://localhost:8888/proposals/kaitlyn-wolfe/`

## Issues found

### 1. Sticky tab rule could be clipped

The new Kaitlyn Wolfe page used an overflowed sticky tab bar with a `::after` pseudo-element set to `width: 100vw`.

That creates a failure condition: when the tab container has `overflow-x: auto`, the pseudo-element can be clipped to the tab container instead of reaching the viewport edge. The computed pseudo width can still report as `100vw`, but the rendered line is bounded by the overflow container.

Fix applied:

- Make the tab bar itself full-bleed.
- Use `width: 100vw` on `.tabs`.
- Keep the negative inline margin and matching inline padding.
- Use a direct `border-bottom` on `.tabs`.
- Remove the oversized `::after` rule.

Verified at 1280px: `.tabs` renders from `x = 0` to `right = 1280`.

### 2. Section rules were defaulting on

The template still treated every `.section-heading` as a ruled heading. That recreated the rule-density problem already worked through in live proposals.

Fix applied:

- Default `.section-heading` has no rule.
- `.section-heading--ruled` is the opt-in class for a major argument turn or formal grouping.
- Existing local labels can use plain `.section-heading` without creating another horizontal line.

This matches the current proposal composition rule: horizontal rules mark structure, not text breaks.

### 3. Body copy was inheriting the full artifact column

The proposal column remains `64ch`, which is useful for tables, stat rows, diagrams, and media. Body paragraphs inside tabs were also using that full width, creating a wider reading measure than the WAWCO proposal voice wants.

Fix applied:

- Body-like prose inside proposal tabs now caps at `52ch`.
- Tables, media, stat rows, and structural artifacts can still use the wider `64ch` column.

### 4. Tab guide bolding was being cancelled

The proposal guide sentence uses `<strong>` around tab names so the reader can scan the guide before using the tab bar. The template CSS had reset `.proposal-guide strong` to regular weight, which cancelled the intended wayfinding.

Fix applied:

- `.proposal-guide strong` now uses `font-weight: 700`.
- The template comment now says to keep tab guide `<strong>` visible.
- Durable docs now record bold tab names as approved inline wayfinding.

Verified at 1280px on the Kaitlyn Wolfe page:

- `main`: 724px.
- body paragraphs: 589px.
- tab bar: 1280px full bleed.
- section headings: no border by default.

Verified at mobile width after changing the Kaitlyn Wolfe tab label from `Architecture` to `Process`:

- tab text: `Summary Process Scope Packet ?`.
- tab `scrollWidth` equals `clientWidth`.
- no tab-bar horizontal overflow.
- guide tab names compute to font weight `700`.

## Files changed

- `proposals/_template/index.html`
- `proposals/kaitlyn-wolfe/index.html`
- `docs/proposal-template-audit-2026-04-28.md`
- `design/proposal-composition-system.md`
- `docs/proposal-composition-partner.md`
- `~/.pi/projects/-Users-noah--pi/memory/reference_whatarewecapableof_proposal_composition.md`
- `~/.pi/projects/-Users-noah--pi/memory/project_whatarewecapableof.md`

## Validation

Ran:

```sh
cd ~/Projects/whatarewecapableof
npm run check:type-hierarchy
```

Result: passed.

## Proposal-specific final state

The Kaitlyn Wolfe proposal uses tabs: Summary / Process / Scope / Packet / ?. `Process` replaced `Architecture` to prevent mobile tab side scroll.

The Kaitlyn Wolfe ? tab keeps:

- `What are we capable of?`
- `Let's find out.`

It removes:

- `Book a call`
- the `/book` link

This is proposal-specific because the Kaitlyn outreach will not use the booking system.

## Remaining decision

Existing live proposal pages contain inline CSS forks. The template fix prevents future pages from recreating these issues, but existing pages will not inherit the changes automatically. If a live proposal shows the same artifacts, patch its inline CSS with the same three rules:

1. Full-bleed `.tabs` with direct `border-bottom`.
2. `.section-heading` plain by default, `.section-heading--ruled` opt-in.
3. Body prose capped at `52ch`, while structural objects keep the wider column.
4. Visible `<strong>` tab names in the proposal guide sentence.
