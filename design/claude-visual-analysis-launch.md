# Launch prompt for Claude visual analysis — continuation run (Opus 4.6 1M context)

You are doing a deep visual analysis pass for the taste profile of `whatarewecapableof.com`.

Working directory: `/Users/noah/Projects/whatarewecapableof`

**This is a CONTINUATION run.** A prior Opus 4.7 session produced partial work that is already on disk. Read the three handoff files first. Do NOT restart from zero; pick up where the last session left off.

Existing handoff state (as of this restart):
- `./design/handoffs/claude-motion-frame-analysis.md` — ~19KB. Likely complete or near-complete. Verify and fill any gaps only.
- `./design/handoffs/claude-reference-analysis.md` — partial. Reference inventory done. Lola analysis in progress. Ellen Ole and Loyal Gallery not yet analyzed. Static image analysis, cross-reference synthesis, recurring traits, influences, anti-patterns, and taste-profile-schema recommendations all still to do.
- `./design/handoffs/claude-raw-extraction-notes.md` — partial. Metadata, reuse assessment, and Lola batch 2 in progress.

Read each of these files before doing anything else, so you know what's already captured.

Analysis only — do not touch `index.html`.

## Start here

1. Read `./taste-profile-042126.md` (the user's reference list).
2. Read `./design/claude-visual-analysis-task-opus46.md` (detailed task spec). Use its structure and judgment questions.

## HARD image constraints (read first, never violate)

The API rejects any multi-image request where any single image has a dimension over 2000px. Previous runs died on this.

- **Never use `fullPage` screenshots.** Viewport screenshots only.
- **Viewport caps:** desktop 1280×800, tablet 768×1024, mobile 375×667. Never larger.
- **Never pass more than 3 images to a single tool call.** Read images one at a time unless you have a specific reason to compare, and even then max 3.
- **If an image file in this repo is over 1900px in any dimension, do not read it.** The only oversized artifacts remaining are in `./design/reference-analysis/_quarantine/` and `_originals/`. Ignore those folders entirely.
- **All files currently under `./design/reference-analysis/images/`, `screenshots/`, and `frames/gif*-keys/` are safe** (verified under 1600px on the long edge).

## Motion GIF workflow

Pre-extracted key frames exist:
- `./design/reference-analysis/frames/gif1-keys/` — 32 key frames of gif1 (the monospace + serif mix), 600×600 each
- `./design/reference-analysis/frames/gif2-keys/` — 29 key frames of gif2 (line heights), 1080×1080 each

Do not touch `./design/reference-analysis/frames/gif1/` or `gif2/` — those are the full 158 and 29 frame sequences, too many to load.

Sample 6–8 distinct states per GIF. For gif1, pick roughly: key_000, key_030, key_055, key_080, key_105, key_130, key_155 (spread across the 158-frame animation). For gif2 (29 monotonically progressive frames), pick: key_000, key_005, key_010, key_015, key_020, key_025, key_028.

Read them one at a time. Write observations to `claude-motion-frame-analysis.md` after each GIF.

## Live site workflow

Chrome is running with remote debugging on port 9222. Use `mcp__chrome-devtools__*` tools.

For each page, the procedure is:

1. `new_page` or `navigate_page` to the URL.
2. `resize_page` to the target viewport: 1280×800 for desktop, 768×1024 for tablet, 375×667 for mobile.
3. Wait for the page to settle (`wait_for`).
4. `take_screenshot` with default settings (viewport only — NOT `fullPage: true`).
5. For computed styles, use `evaluate_script` to pull `getComputedStyle` values for representative elements: html, body, h1–h4, p, a, nav elements, main content container.

**If you need to see content below the fold**, scroll with `evaluate_script({ function: "() => window.scrollTo(0, window.innerHeight)" })` then take another viewport screenshot. Do this at most 2–3 times per page. Never capture `fullPage`.

### Lola Dement Myers (`loladementmyers.com`)

Already scraped. Reuse:
- `./design/reference-analysis/screenshots/lola-home_{mobile,tablet,desktop}_*.png` — resized to safe dimensions
- `./design/reference-analysis/screenshots/lola-all_*_*.png` — resized
- `./design/reference-analysis/screenshots/lola-home2_*_*.png` — resized
- `./design/reference-analysis/lola-home.json` — computed styles
- `./design/reference-analysis/lola-all.json`
- `./design/reference-analysis/lola-home2.json`
- `./design/reference-analysis/lola-portfolio.json` — computed styles for /portfolio (screenshots quarantined as unreadable, but the JSON has all the text, sizes, layout boxes you need)

Do not re-navigate to Lola. Summarize from the JSONs and the resized screenshots.

### Ellen Ole (`ellenole.com`)

Fresh work. The user flagged "voice memo as about page" as distinctive. Check:
- `/` (home)
- `/about` (the voice memo idea)
- Any project/portfolio pages linked from nav

Capture viewport screenshots at 1280×800 and 375×667 for each page. Save to `./design/reference-analysis/screenshots/ellenole-<page>_<breakpoint>_<width>.png`. Extract computed styles and save to `./design/reference-analysis/ellenole-<page>.json`.

### Loyal Gallery (`loyalgallery.com`)

Fresh work. Check:
- `/` (home)
- 1–2 representative interior pages

Same screenshot + JSON pattern.

## Static image reference workflow

5 images in `./design/reference-analysis/images/`:
- `img1-monochrome-palette.jpg` (1438×730) — color palette reference
- `img2-arena-typo-form.jpg` (595×600) — type as form
- `img3-type-as-form.jpg` (813×1600, resized from 976×1921) — type as form
- `img4-type-form-2.jpg` (700×500) — type as form
- `img5-quality-typeface.png` (1054×974) — typeface quality

Read one at a time. Note typography character, color logic, compositional moves, whether each should weight primary/supporting/incidental.

## Deliverables (all in `./design/handoffs/`)

Write each file incrementally. Save after every batch.

### `claude-reference-analysis.md`
1. Executive summary
2. Reference inventory
3. Live site analysis (site-by-site)
4. Static image analysis
5. Cross-reference synthesis
6. Strongest recurring traits
7. Tensions or contradictions
8. Primary / supporting influences
9. Likely anti-patterns
10. Recommendations for the taste profile schema

For each reference: what it contributes, which pillars (layout, typography, color, hierarchy, motion), and weight (heavy / moderate / light).

### `claude-motion-frame-analysis.md`
GIF 1, GIF 2, comparison, implications for whatarewecapableof.com. Per the spec.

### `claude-raw-extraction-notes.md`
Rough working notes: URLs visited, screenshots taken, extracted style values, CSS variables, measurements, observations.

## Weighting

Per the user's own note, **weight your visual extraction over the user's written comments**. The comments are directional context, not ground truth.

## Key judgment questions to answer explicitly

- Editorial, institutional, personal, technical, or a mix?
- How restrained is the hierarchy?
- How much of the reference set depends on image absence?
- Where does typography carry the emotional and compositional load?
- Sparse, measured, or severe density?
- What kind of motion feels native to this direction?
- What should the future site avoid to not drift into generic minimalism?

## Stop condition

Stop when all three handoff files exist with every section populated. Do not write CSS, HTML, or any site implementation.
