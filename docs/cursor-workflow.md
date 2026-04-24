# Cursor Workflow

Current as of 2026-04-24.

Cursor's job on this project is visual command surface: directory navigation, HTML/CSS review, image preview, and careful manual edits.

Open the project:

```bash
cursor ~/Projects/whatarewecapableof
```

## First workspace layout

Use a split layout:

```txt
Left sidebar:
  Explorer focused on proposals/, css/, design/, docs/

Editor group 1:
  docs/directory-map.md
  docs/asset-inventory.md

Editor group 2:
  proposals/compassion/index.html
  css/components.css

Preview tabs:
  docs/site-dashboard.html through Simple Browser
  proposals/compassion/img/
  docs/asset-inventory.json
```

## Files to pin

Pin these tabs at the start of a session:

1. `docs/directory-map.md`
2. `docs/asset-inventory.md`
3. `design/system-constraints.md`
4. `proposals/compassion/index.html` when working on proposal imagery.
5. `css/components.css` when working on proposal or shared components.

## Explorer focus areas

| Folder | Use |
|---|---|
| `proposals/` | Proposal templates and client-specific pages. |
| `proposals/compassion/img/` | Active image-heavy asset folder. |
| `css/` | Shared site and proposal styling. |
| `design/` | Taste profile, system constraints, reference work. |
| `docs/` | Operational map, routing, asset inventory. |
| `scripts/` | Tooling for audits and inventories. |

Collapse `.git`, `.vercel`, and `design/reference-analysis/frames/` during normal site work. The frames folder is useful for design research, but it is noisy during page editing.

## Search recipes

Find all local image references:

```txt
(src|href)="[^"]+\.(png|jpg|jpeg|webp|gif|svg|avif)
```

Find fragile bare image paths:

```txt
src="img/|href="img/|url\(img/
```

Find Compassion proposal image references:

```txt
/proposals/compassion/img/
```

Find root-relative CSS and favicon links:

```txt
/css/|/favicon|/apple-touch-icon|/og.png
```

Find inline styles that may need extraction later:

```txt
style="
```

## Image review procedure

1. Run `npm run scan:assets` before opening the image folder.
2. Open `docs/asset-inventory.md` beside `proposals/compassion/img/`.
3. Sort the image folder by name.
4. Compare the referenced files in the inventory to the actual folder contents.
5. Preview any file listed as unreferenced before deleting, renaming, or moving it.
6. Check extension mismatches before uploading or optimizing.
7. After any edit, run `npm run scan:assets` again.

Current files that need visual review:

- `proposals/compassion/img/08_26740334.png`: extension says PNG, file data says JPG.
- `proposals/compassion/img/square/02-day-in-life.png`: extension says PNG, file data says JPG.
- Every unreferenced file listed in `docs/asset-inventory.md`.

## Local preview

From project root:

```bash
python3 -m http.server 8888
```

Open the dashboard inside Cursor with `Simple Browser: Show`:

```txt
http://localhost:8888/docs/site-dashboard.html
```

Open the site preview:

```txt
http://localhost:8888
http://localhost:8888/proposals/compassion
http://localhost:8888/proposals/compassion/
```

For proposal pages, check both slash forms. If images load in one form and break in the other, a relative asset path probably slipped in.

## Safe edit loop

```txt
1. Check git status.
2. Run npm run scan:assets.
3. Open directory map and asset inventory in Cursor.
4. Make one bounded edit.
5. Run npm run scan:assets again.
6. Preview locally.
7. Review git diff.
8. Hand off to pi or Claude for second-pass review if the change touches structure or design constraints.
```

## Cursor prompt for this project

Use this when starting a Cursor chat inside the repo:

```txt
Read docs/directory-map.md, docs/asset-inventory.md, docs/agent-routing.md, design/sitemap.md, and design/system-constraints.md before proposing edits.

We are working on whatarewecapableof.com, a static Vercel site using directory-style index.html routes. Use root-relative paths for local assets and links. Preserve the design constraints: 24px baseline, quiet typography, no gray hierarchy, two layout primitives, minimal motion.

For this session, focus on the specific task I give you. Do not rename or delete images unless I explicitly ask. After any asset or HTML change, run npm run scan:assets and report missing references, relative local asset references, and unreferenced site/proposal assets.
```
