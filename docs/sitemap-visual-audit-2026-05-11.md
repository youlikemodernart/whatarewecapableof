# Sitemap visual build and audit, 2026-05-11

## Files changed

- `api/sitemap-data.js` (new). GET endpoint returning the route model after tracker-session authentication. Reuses `requireSession` from `api/_tracker.js`.
- `sitemap/index.html` (new). Static shell with tracker-style login, SVG tree, nested text outline, and an exclusions list. Page-specific CSS is inlined in a `<style>` block. Shared `/css/*.css` was not modified.
- `docs/sitemap-visual-audit-2026-05-11.md` (new). This audit.

No edits to shared CSS, no edits to existing API files, no edits to `vercel.json`. No external services touched.

## Route inventory

40 tree nodes total: 31 page or system routes plus 9 section grouping nodes. The group nodes organize branches such as `/proposals` and `/apps`; they are labeled as section groupings when no standalone `index.html` exists.

- 8 public pages: `/`, `/question`, `/coach`, `/coach/book`, `/consult`, `/creative`, `/about`, `/book`
- 1 direct-link work page: `/work/fde`, grouped under `/work`
- 17 noindex pages under `/proposals`, `/apps`, `/demo`, `/instructions`, `/internal`, and `/review`
- 2 tracked Sales School toolchain pages: `/proposals/sales-school/diagrams/toolchain/03-portal-architecture-outline` and `/proposals/sales-school/diagrams/toolchain/03-portal-architecture-review`; these are marked `internal-visible` because they appear tracked and not covered by the current `.vercelignore` toolchain checks rule
- 2 password protected pages: `/tracker`, `/sitemap`
- 1 system page: `/404`
- 9 section grouping nodes: `/work`, `/proposals`, `/proposals/sales-school/diagrams`, `/proposals/sales-school/diagrams/toolchain`, `/apps`, `/demo`, `/instructions`, `/internal`, `/review`
- Plus a `tracker-session` relation subject used by `protects` relations for the two protected routes. It is not counted as a tree node.

The model is hardcoded in `api/sitemap-data.js`. To extend, append nodes to `ROUTE_NODES` and edges to `RELATIONS`. Order in `RELATIONS` controls visual order in the tree and outline.

### Exclusions

- `/docs` and `/docs/*` are blocked at `vercel.json`, including the tracked `docs/site-dashboard.html`
- `/design` and `/design/*` are blocked at `vercel.json`
- `/proposals/*/slots/` are local proposal planning artifacts excluded by `.vercelignore`
- `/proposals/*/diagrams/html/` are local diagram exports excluded by `.vercelignore`
- `/proposals/*/img/src/` are local source image workspaces excluded by `.vercelignore`

## Diagram brief

Visual reference: Are.na block 15946584, Quicksort. Sparse white field, blue hand-drawn-feeling ovals, thin blue connectors, black path labels. Page paths replace the numbered nodes from the reference.

The diagram is a vertical indented tree with the root at the top and one row per route. Each parent has a vertical spine running down to its last child, with horizontal stubs branching to each child. I picked this layout over a horizontal radial tree because:

- The widest level is `/` itself with 16 first-level children, which would be cramped in a horizontal arrangement on most screens.
- An indented tree mirrors the text outline below, so the visual and the assistive reading are isomorphic.
- Indented tree diagrams are a common reading convention for sitemaps and developer reference pages.

## Visual rationale

- Type: system UI for page chrome (per the WAWCO type contract) and Geist Mono for paths, notes, and section labels. No additional typefaces.
- Color: black text on white. The accent blue `rgb(0, 15, 255)` carries strokes, focus rings, and the protected-route marker. Nothing else is colorized.
- Hand-drawn feel: ellipses have per-row variation in `rx`, `ry`, and a small rotation jitter (up to roughly four degrees), all derived from a deterministic sine-based wobble function. Adding or reordering routes will reshuffle the wobble values; the wobble is not random per page load.
- Protected routes have a filled blue ellipse instead of an outline, plus the inline note "password protected" or "password protected, this page". The gate state is communicated by text, not by color alone.
- No cards, no shadows, no gradients, no colored chips, no rounded panels. Hierarchy comes from typography, opacity (`0.4` on notes and section labels), and the diagram itself.
- Section headings (Tree, Outline, Exclusions) use the proposal-design mono-label pattern at low opacity. They sit quietly above their content and never compete with the routes themselves.

## Accessibility notes

- `<meta name="robots" content="noindex, nofollow">` is set.
- The SVG is `role="img"` with a `<title>` and `<desc>` element. Both label the diagram concisely and point readers to the outline below for the full hierarchy.
- The outline carries the same information in semantic `<ul>` and `<li>` elements. A screen reader user gets the route tree in standard list semantics.
- Protected routes are marked redundantly:
  - filled ellipse in the SVG
  - blue path label in the outline (a color signal)
  - explicit inline note "password protected" or "password protected, this page" in both views
- The login form uses a labeled password input with `autocomplete="current-password"` and `required`. The error message uses `role="alert"`.
- After successful login the title receives focus, so a keyboard user lands inside the content.
- The logout button is keyboard reachable in the sticky header.
- `:focus-visible` is honored across the form input and the button styles inherited from base.css.

## Responsive notes

- The SVG sits inside a horizontally scrollable wrapper (`overflow-x: auto`). On a wide desktop the entire tree fits without scrolling. On phones the user can pan horizontally to read deeper labels.
- The text outline is always rendered. It is the primary reading surface on mobile and for assistive tech. The SVG is supplementary.
- The sticky header collapses to a column layout below 767px, matching the existing tracker style.
- `tokens.css` already scales `--body-size`, `--margin-inline`, and `--line-height` at 768px and 1280px, so the page picks up those steps without overrides.

## Risks and ambiguities

- `/404` appears as a child of `/` through a `contains` relation. It is a system response, not a navigable child of the homepage. The verb is used loosely. If a stricter model is preferred, `/404` could be lifted out of the tree and rendered in a separate "system" section.
- `/work/fde` is marked as a direct-link surface. Its indexing status was not explicitly stated in the brief, so I labeled it "direct-link" rather than "noindex". Confirm if it should also be `noindex`.
- The two tracked Sales School toolchain HTML files are marked `internal-visible` because the route inventory found them in Git and the current `.vercelignore` excludes only `proposals/*/diagrams/toolchain/checks/`, not the two root toolchain HTML files. Confirm whether those should remain route-visible, be added to `.vercelignore`, or be moved under an ignored path.
- The `tracker-session` entity used as the subject of `protects` relations is a label I introduced so the verb has a non-route subject. It is not a route. If a future schema requires only route entities, this could be folded back into the `access: "protected"` field on the route nodes and the relation dropped.
- Character widths for SVG sizing are estimated at 8px per path character and 7px per note character at the chosen font sizes. Geist Mono is monospace, so the estimate is stable, but if the font fails to load and the fallback `ui-monospace` is wider, labels may extend past the calculated SVG width. The wrapper is `overflow-x: auto`, so the page degrades by scrolling, not by clipping.
- Drawing ellipses with a small rotation means the connector stubs terminate roughly at the unrotated left edge of each ellipse. At up to four degrees of rotation the discrepancy is sub-pixel, so it is not visible at thin stroke widths.

## Verification run

- `node -c api/sitemap-data.js`: parse check on the API. Pi should re-run this after pulling.
- `git status --short -- api/sitemap-data.js sitemap/index.html docs/sitemap-visual-audit-2026-05-11.md`: confirms only the three intended files are staged.
- API smoke: Pi simulated the Vercel handler with local `TRACKER_PASSWORD` and `TRACKER_SESSION_SECRET`. Unauthenticated `GET /api/sitemap-data` returned 401, authenticated `GET` returned 31 pages and 40 tree nodes, and `POST` returned 405.
- Browser smoke: Pi ran a local static/API smoke server with a test tracker session and captured headless Chrome screenshots at 1280 x 900 and 390 x 844. The rendered page showed the sitemap content, meta count, tree, and logout control. The mobile screenshot confirmed the intro and meta line fit the narrow viewport while the SVG tree remains horizontally scrollable.
- Still verify against the real local Vercel dev server before production:
  1. The login form appears on first load if no tracker session exists.
  2. After password entry, the tree and outline render with the page count and tree-node count in the meta line.
  3. The `/tracker` and `/sitemap` rows show a filled ellipse plus the "password protected" note in both the SVG and the outline.
  4. The page is keyboard reachable, including the logout button.
  5. The SVG can be horizontally scrolled on a narrow viewport without clipping labels.
  6. If the user already has a tracker session from `/tracker`, `/sitemap` skips the login form and shows the tree immediately.

## Deploy

Production deploy was not done. No commits, no pushes, no external services touched. The route exists on disk only.
