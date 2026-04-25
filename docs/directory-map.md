# Directory Map

Current as of 2026-04-25.

Project root: `~/Projects/whatarewecapableof/`

Production site: `https://whatarewecapableof.com`

## Core structure

```txt
~/Projects/whatarewecapableof/
  index.html
  about/index.html
  question/index.html
  coach/index.html
  coach/book/index.html
  book/index.html
  consult/index.html
  creative/index.html
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
    taste-profile/profile.md
    reference-analysis/
  docs/
    directory-map.md
    agent-routing.md
    cursor-workflow.md
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
| `css/proposal-media.css` | Optional proposal media primitives: evidence plates, diptychs, specimen grids, process strips, diagrams, excerpts, stat fields, and video plates. |
| `js/booking.js` | Shared booking UI controller used by `/coach/book` and `/book`. |

Design constraints live in `design/system-constraints.md`. Treat that file as the engineering contract for spacing, type, layout, color, and motion.

## API files

| File | Role |
|---|---|
| `api/_calendar.js` | Shared Google Calendar auth, timezone conversion, booking type config, bookable slot generation, buffer enforcement, and free/busy helpers. |
| `api/availability.js` | Reads Austin's Google Calendar free/busy data and returns available slots for `type=coach` or `type=discovery`. |
| `api/book.js` | Books calendar events after availability is confirmed, enforces buffers, creates a Google Meet link, and sends attendee updates. |

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
| `design/reference-analysis/` | Working design research assets, screenshots, frames, GIFs, and extracted reference material. |

Production page imagery currently lives inside proposal folders. Future creative work images should use a predictable public path such as `creative/<project>/img/` or a shared `public/images/` folder after that decision is made.

## Current asset findings

Run `npm run scan:assets` to refresh `docs/asset-inventory.md`, `docs/asset-inventory.json`, and `docs/site-dashboard.html`.

Current scan summary:

- 319 image assets total.
- 27 site and proposal assets.
- 23 proposal-content assets.
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
| `design/proposal-composition-system.md` | Strategy for adding visual rhythm to text-heavy proposal pages without turning them into rigid templates. |
| `docs/proposal-composition-partner.md` | Operating workflow for an AI or human partner reviewing proposal pacing, media jobs, asset opportunities, and implementation plans. |
| `proposals/teaspressa/media-slots.md` | Teaspressa media-slot curation guide for Are.na collection. |
| `proposals/teaspressa/media-slots.json` | Structured Teaspressa slot manifest. |
| `proposals/teaspressa/slots/index.html` | Local-only visual placeholder board, ignored by git through `proposals/*/slots/`. Do not deploy unless Noah approves. |

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
- Do not clean untracked proposal assets until `git status --short` has been reviewed.
- Preview locally before pushing: `python3 -m http.server 8888`, then open `http://localhost:8888`.
- Use Chrome or Safari review after structural HTML/CSS changes.
