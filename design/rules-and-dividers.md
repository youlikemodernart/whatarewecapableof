# Rules and dividers

Created 2026-04-27.

This note governs horizontal rules, section borders, and divider lines across What are we capable of? pages. It centralizes the rule-density decisions that first emerged in proposal work and now apply to client-facing work indexes and new page structures.

## Core principle

A rule is a structural mark. It should do a job the surrounding content is not already doing.

Use a rule when it marks a major argument turn, a formal grouping, a real comparison, a table boundary, or persistent chrome such as tabs and sticky headers. Remove the rule when spacing, sequence, media, or a clear label already creates the break.

One break is usually enough. If an image, video, diagram, artifact, timeline, or large typographic object ends a section, the next section should not start with another horizontal rule by default. The media has already reset the reader's attention.

## When rules earn their place

| Use a rule for | Why it earns the mark |
|---|---|
| Major argument turn | The page is asking the reader to shift tasks. |
| Formal grouping | Several items need to read as one unit. |
| Real comparison | Two sides, phases, states, or options need a shared edge. |
| Table structure | Header and body need a clear relationship. |
| Sticky chrome | Header, tabs, or navigation needs to stay legible while content moves. |
| Opt-in specimen boundary | An artifact needs to read as a formal object. |

## When to suppress a rule

| Suppress the rule after | Reason |
|---|---|
| Image | The image already creates a visual pause. |
| Video | The player surface already changes the reading mode. |
| Diagram | The diagram is its own structured object. |
| Artifact mockup | The artifact already carries an object boundary. |
| Timeline or process strip | The sequence already marks a new cadence. |
| Quiet stat field | The open field is the break. |
| Large text graphic | The graphic is the grouping device. |

Default behavior: no horizontal rule immediately after media. Use reduced spacing instead, usually `margin-top: var(--space-2)` and `padding-top: var(--space-1)`, adjusted to the page structure.

## Proposal-page rule

Proposal media already encodes this pattern in `css/proposal-media.css`:

```css
.proposal-media + .section-heading,
.proposal-evidence-plate + .section-heading,
.proposal-diptych + .section-heading,
.proposal-specimen-grid + .section-heading,
.proposal-process-strip + .section-heading,
.proposal-process-timeline + .section-heading,
.proposal-diagram + .section-heading,
.proposal-excerpt + .section-heading,
.proposal-stat-field + .section-heading,
.proposal-video-plate + .section-heading,
.proposal-text-graphic + .section-heading {
  border-top: none;
  padding-top: var(--space-1);
  margin-top: var(--space-2);
}
```

Use `.section-heading--ruled` only when the rule has a new structural job after the media.

## Client-index and new-page rule

For new page structures, do not assume every section starts with a top rule. If a section follows media, either give it an explicit no-rule class or write the page pattern so the following section suppresses its border.

Example:

```css
.client-section--after-media {
  border-top: none;
  padding-top: var(--space-1);
  margin-top: var(--space-2);
}
```

The name can change by page system. The behavior should not: media at the end of one section means the next section starts quieter unless a rule is explicitly earned.

## Text-carrying graphics

Text-carrying graphics are open by default. Add a rule only when the rule encodes structure. Avoid top-rule patterns on every item in a diagram, map, wireframe, or flow. Internal lines should show relationships, phases, ownership, or comparison, not decorate every block.

## QA checklist

Before shipping a page with images, diagrams, or artifacts:

- [ ] Does any image directly precede a ruled section break?
- [ ] If yes, does the rule have a job beyond adding another pause?
- [ ] Does every horizontal rule mark a turn, grouping, comparison, table boundary, or chrome boundary?
- [ ] Are any rules bracketing content by habit?
- [ ] Are text graphics open by default, with ruled variants only where structure requires them?
- [ ] On mobile, does the rule help scanning, or does it create a heavy stack of black lines?
