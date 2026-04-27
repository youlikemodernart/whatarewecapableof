# Directory Map

Current as of 2026-04-25.

Project root: `~/Projects/whatarewecapableof/`

Production site: `https://whatarewecapableof.com`

## Core structure

```txt
~/Projects/whatarewecapableof/
  vercel.json
  index.html
  404.html
  about/index.html
  question/index.html
  coach/index.html
  coach/book/index.html
  book/index.html
  consult/index.html
  creative/index.html
  work/fde/index.html
  tracker/index.html
  proposals/
    _template/index.html
    belhaus/index.html
    compassion/index.html
    compassion/img/
    fde/index.html
    paste/index.html
    teaspressa/index.html
  css/
    tokens.css
    base.css
    typography.css
    layout.css
    components.css
    proposal-media.css
  js/
    booking.js
  api/
    _calendar.js
    availability.js
    book.js
  design/
    sitemap.md
    system-constraints.md
    rules-and-dividers.md
    taste-profile/profile.md
    reference-analysis/
  docs/
    directory-map.md
    agent-routing.md
    cursor-workflow.md
    tracker.md
    asset-inventory.md
    asset-inventory.json
    site-dashboard.html
  scripts/
    scan-assets.mjs
```

## Route map

| Public route | Source file | Role |
|---|---|---|
| `/` | `index.html` | Home page. Question, three verticals, footer. |
| `/question` | `question/index.html` | Ethos page. Intellectual home for the agency. |
| `/coach` | `coach/index.html` | Austin coaching vertical. |
| `/coach/book` | `coach/book/index.html` | Austin coaching booking tool UI. |
| `/book` | `book/index.html` | Discovery-call booking tool for proposal CTAs. |
| `/consult` | `consult/index.html` | Shared advisory vertical. |
| `/creative` | `creative/index.html` | Noah design and build vertical. |
| `/about` | `about/index.html` | Bios and contact. Footer-only access. |
| `/work/fde` | `work/fde/index.html` | Direct-link, noindex FDE client-facing work index. Collects the Campus Initiative proposal, Foundation Course site, working links, and decisions to confirm. Not in public navigation. |
| `/tracker` | `tracker/index.html` | Password-gated internal proposal tracker. Reads `PROPOSALS.md` through authenticated API data. |
| `/proposals/teaspressa` | `proposals/teaspressa/index.html` | Direct-link proposal. |
| `/proposals/compassion` | `proposals/compassion/index.html` | Direct-link proposal with image-heavy content. |
| `/proposals/belhaus` | `proposals/belhaus/index.html` | Direct-link proposal. |
| `/proposals/fde` | `proposals/fde/index.html` | Direct-link proposal migrated from Base44. |
| `/proposals/paste` | `proposals/paste/index.html` | PäSTE MVP build-outline proposal. |

The site uses directory-style pages: each route is a folder with an `index.html` file. Public handoffs should prefer no trailing slash, but implementation must be safe with either slash form.

## CSS architecture

| File | Responsibility |
|---|---|
| `css/tokens.css` | Baseline grid, responsive type sizes, spacing scale, color tokens. |
| `css/base.css` | Global reset and base element behavior. |
| `css/typography.css` | Type classes and text conventions. |
| `css/layout.css` | The two permitted layout primitives and page-level layout. |
| `css/components.css` | Navigation, footer, work lists, proposal tabs, booking form, repeated components. |
| `css/proposal-media.css` | Optional proposal media primitives: evidence plates, diptychs, specimen grids, process strips, timelines, diagrams, text graphics, maps, wireframes, excerpts, stat fields, and video plates. |
| `js/booking.js` | Shared booking UI controller used by `/coach/book` and `/book`. |

Design constraints live in `design/system-constraints.md`. Treat that file as the engineering contract for spacing, type, layout, color, and motion. Horizontal rule and divider guidance lives in `design/rules-and-dividers.md`; read it before creating new page structures, media-heavy pages, proposal pages, or client-facing work indexes.

## API files

| File | Role |
|---|---|
| `api/_calendar.js` | Shared Google Calendar auth, timezone conversion, booking type config, bookable slot generation, buffer enforcement, and free/busy helpers. |
| `api/availability.js` | Reads Austin's Google Calendar free/busy data and returns available slots for `type=coach` or `type=discovery`. |
| `api/book.js` | Books calendar events after availability is confirmed, enforces buffers, creates a Google Meet link, and sends attendee updates. |
| `api/_tracker.js` | Shared tracker authentication, signed-cookie session helpers, and `PROPOSALS.md` parsing. |
| `api/tracker-login.js` | Checks the tracker password and sets the private session cookie. |
| `api/tracker-logout.js` | Clears the tracker session cookie. |
| `api/tracker-data.js` | Returns parsed proposal tracker data only when the signed session cookie is valid. |

Do not commit secrets. Calendar credentials belong in Vercel environment variables.

## Asset structure

| Path | Role |
|---|---|
| `favicon.svg` | Browser favicon. |
| `favicon.png` | PNG favicon fallback. |
| `apple-touch-icon.png` | iOS home screen icon. |
| `og.png` | Site-wide Open Graph card for the home page. |
| `proposals/compassion/img/` | Compassion proposal images and feed composites. |
| `proposals/compassion/img/square/` | Square specimens used in the Compassion proposal content section. |
| `proposals/teaspressa/img/` | Live Teaspressa proposal images: Summary images TS-02, TS-04, TS-07, plus the Research TS-11 wholesale product collage. |
| `proposals/<slug>/img/src/` | Ignored local source/crop workspace for proposal media. Keep raw source files here until final crops are exported. |
| `proposals/teaspressa/img/src/arena/` | Ignored local source images pulled from the Teaspressa Are.na channel. |
| `proposals/teaspressa/img/src/wholesale-products/` | Ignored local Shopify wholesale product scrape, contact sheets, tiles, and rough collage outputs for TS-11. |
| `design/reference-analysis/` | Working design research assets, screenshots, frames, GIFs, and extracted reference material. |

Production page imagery currently lives inside proposal folders. Future creative work images should use a predictable public path such as `creative/<project>/img/` or a shared `public/images/` folder after that decision is made.

## Current asset findings

Run `npm run scan:assets` to refresh `docs/asset-inventory.md`, `docs/asset-inventory.json`, and `docs/site-dashboard.html`.

Current scan summary:

- 323 image assets total.
- 31 site and proposal assets.
- 27 proposal-content assets.
- 4 site-shell assets.
- 15 unreferenced site or proposal assets.
- 0 missing local asset references.
- 0 relative local asset references.
- 2 extension and file-data mismatches.

The active mismatches are:

- `proposals/compassion/img/08_26740334.png`: extension says PNG, file data says JPG.
- `proposals/compassion/img/square/02-day-in-life.png`: extension says PNG, file data says JPG.

## Proposal composition system

| File | Role |
|---|---|
| `design/rules-and-dividers.md` | Central horizontal rule and divider guidance. Covers rule density, no-rule-after-media behavior, proposal media heading suppression, and new page-structure checks. |
| `design/proposal-composition-system.md` | Strategy for adding visual rhythm to text-heavy proposal pages without turning them into rigid templates. |
| `docs/proposal-composition-partner.md` | Operating workflow for an AI or human partner reviewing proposal pacing, media jobs, asset opportunities, and implementation plans. |
| `proposals/teaspressa/media-slots.md` | Teaspressa media-slot curation guide for Are.na collection. |
| `proposals/teaspressa/media-slots.json` | Structured Teaspressa slot manifest. |
| `proposals/teaspressa/slots/index.html` | Local-only in-flow placeholder draft, ignored by git through `proposals/*/slots/`. It uses actual proposal copy and grey frames or draft images at the proposed insertion points. Do not deploy unless Noah approves. |
| `proposals/belhaus/media-slots.md` | BELHAUS media-slot curation guide for FAVE atmosphere, BEL-02 artifact assets, and generated system diagrams. |
| `proposals/belhaus/media-slots.json` | Structured BELHAUS slot manifest. |
| `proposals/belhaus/slots/index.html` | Local-only in-flow placeholder draft with accepted FAVE image placements, BEL-02 artifact draft, and diagram placeholders. Do not deploy unless Noah approves. |
| `docs/belhaus-graphics-generation-handoff.md` | Fresh-session handoff for generating BELHAUS proposal graphics through the graphic system or live HTML. |

## Path rules

Use root-relative paths for all local assets and internal links in HTML:

```html
<img src="/proposals/compassion/img/feed-current.jpg" alt="...">
<a href="/book">Book a call</a>
```

Avoid bare relative asset paths such as:

```html
<img src="img/feed-current.jpg" alt="...">
```

Vercel can serve directory pages with and without trailing slashes. Root-relative paths keep assets stable in both cases.

## Editing rules

- Edit source HTML, CSS, API files, docs, or scripts.
- Do not edit `design/reference-analysis/frames/` by hand. Those are extracted working frames.
- Do not rename proposal images without running `npm run scan:assets` and checking every affected HTML reference.
- Do not clean untracked or ignored proposal media workspaces until `git status --short --ignored` has been reviewed.
- Do not delete ignored `proposals/*/img/src/` assets without confirming with Noah; they may contain source images, manual crops, contact sheets, or draft collages.
- Preview locally before pushing: `python3 -m http.server 8888`, then open `http://localhost:8888`.
- Use Chrome or Safari review after structural HTML/CSS changes.
