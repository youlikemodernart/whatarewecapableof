# Client index pages

Created 2026-04-27.

Client index pages collect multiple active threads for one organization. They are client-facing by default. They should help a reader understand what we saw, what we are suggesting, which artifacts to open, and what decision comes next.

The first production example is Faith Driven Entrepreneur at `/work/fde`.

## Page role

A client index page is a sendable work surface, not an internal dashboard. It can include proposals, prototypes, published sites, course pages, reference links, and next decisions, but it should read as a concise explanation of what we are suggesting to the organization.

It should answer:

- What problem do we see?
- What are we suggesting?
- What work exists now?
- Which artifact should the reader open first?
- What could we carry for them?
- What needs to be decided together?

## Route and visibility

Default route:

```txt
/work/<organization-slug>
```

Use `/work/<slug>` before using `/clients/<slug>`. The word `client` can overstate a relationship before approval, contract, or shared language exists.

Default visibility:

- Direct-link
- `<meta name="robots" content="noindex, nofollow">`
- No public navigation link
- Root-relative local links
- Public only when Noah and Austin decide the relationship can be public

## Required page structure

Use this order unless the page has a specific reason to differ.

1. **Meta line**
   - Organization name
   - Page role, for example `Suggested work`
   - Month and year

2. **Title and intro**
   - Name the organization.
   - State what we are suggesting in plain language.
   - Avoid source-process language such as local paths, upstream repos, or internal migration notes.

3. **Open the work**
   - Place this high on the page, before long explanation.
   - Use underlined artifact links so the reader can identify selectable options quickly.
   - Each artifact gets one short use statement.

4. **What we see**
   - Name the problem or activation gap without overclaiming.
   - Keep it observable and factual.

5. **What we are suggesting**
   - List 2 to 4 suggested moves.
   - Each move should have a short label and one paragraph.

6. **What we could carry**
   - State the work we could take on.
   - This is the service bridge.

7. **Decisions to make together**
   - List questions or decisions that require the organization.
   - Keep this concise. It should not become a task tracker.

8. **Related paths**
   - Optional. Use for subpages, course paths, prototypes, or public context.

9. **Next conversation**
   - End with the concrete decision the next call should resolve.

## Copy rules

- Write for the organization, not for Noah and Austin internally.
- Do not include local filesystem paths, private repo links, upstream repo links, or implementation history unless the reader needs them.
- Do not imply approval, partnership, or client status that is not confirmed.
- Never use `WAWCO` in client-facing copy. Use `What are we capable of?` or rewrite around the agency name.
- Avoid diagnostic language that makes the organization sound careless. State what the current surface does and what the proposed work would make clearer.
- Keep links descriptive: `Foundation Course site`, `Campus Initiative proposal`, `Eight-week outline`.

## Visual rules

- Use the core type system: system UI for prose, Geist Mono for labels and metadata.
- Keep page titles, headings, artifact labels, and body-like content at the normal body size.
- Use mono uppercase for labels and status metadata.
- Use underlined links for primary artifacts.
- Avoid dashboard patterns: cards, shadows, badges, colored CTA systems, progress chips, and status widgets.
- Images can appear when they clarify the work or act as atmosphere tied to the organization.
- Read `design/rules-and-dividers.md` before adding section borders. No horizontal rule should appear immediately after media unless the rule has a new structural job.
- Use root-relative paths for local assets.

## Artifact row pattern

Each primary artifact should answer three questions.

```txt
[Status / visibility]
[Underlined artifact link]
Use this to review [specific job].
```

Example from `/work/fde`:

```txt
Published working site / Public production URL
Foundation Course site
Use this to review the public course landing experience, individual signup path, church group path, course outline, and support language.
```

## FDE precedent

The Faith Driven Entrepreneur page uses this structure:

- Open the work
- What we see
- What we are suggesting
- What we could carry
- Decisions to make together
- Course paths
- Next conversation

It uses three image placements from the FDE proposal media set:

- `fde-01-atmosphere.jpg` between the intro and `Open the work`
- `fde-14-classroom.jpg` after `What we see`
- `fde-10-community.jpg` after `What we are suggesting`

Those images act as section breaks, so the following sections suppress the top rule with `client-section--after-media`.
