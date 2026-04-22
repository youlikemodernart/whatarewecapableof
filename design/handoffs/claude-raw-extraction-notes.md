# Claude raw extraction notes

Working notes. Continuous append log. URLs visited, measurements, style values, observations that back up the polished synthesis.

---

## Run metadata

- Started: 2026-04-22 (Opus 4.7 restart run)
- Working directory: `/Users/noah/Projects/whatarewecapableof`
- Chrome remote debugging: `http://localhost:9222` (verified alive, Chrome 147)
- CDP script: `/tmp/site-scraper/inspect.js`
- Screenshot output dir: `./design/reference-analysis/screenshots/`
- Reuse artifacts: lola-home.json (initial scrape), lola screenshots at 375 / 768 / 1280, keyframes for both motion GIFs, five static reference images

## Reuse assessment

- `./design/reference-analysis/lola-home.json` — present but **shallow**. It captured computed styles, but the reported values (fontSize 8px / 11px / 17px, lineHeight 0px on most elements, h1 white on transparent) suggest the extractor caught hidden/decorative DOM nodes, not the visible content. Lola's site uses absolute-positioned floating text layers; the actual visible glyph sizes are larger than `querySelector('h1').fontSize` returns. Need to sample element-by-element or sample by location.
- Motion key frames extracted and sampled (gif1: 33 keys / gif2: 29 keys). Use only 6–8 per gif.
- Static images: 5 files in `./design/reference-analysis/images/`.

## Progress log

Section will be updated after each batch finishes.

---

## Batch 2 — Lola dement myers (from JSON + safe screenshots)

Completed 2026-04-22. No re-navigation (per restart protocol).

### Pages read
- `/` (home) — lola-home.json + lola-home2.json + 3 resized screenshots @ 375/768/1280
- `/all` (contact index) — lola-all.json + 3 resized screenshots
- `/portfolio` — lola-portfolio.json only (screenshots quarantined for oversize)

### Computed values (desktop 1280 home)
- `html`: Times 16px / lineHeight normal / color #000 / bg transparent (this is the UA default since no CSS font-family is set on `html` — the visible rendering inherits from body)
- `body`: Arial, Helvetica, sans-serif / 11px / lineHeight 0px / text-transform lowercase / color #000
- `p`: Arial 11px / lineHeight 8.8px / lowercase (the actual body text; 8.8 = 0.8 × 11)
- `a`: Arial 17px / lineHeight 0px / lowercase / padding 3.4px (links slightly larger than body copy; padding creates hit target)
- `nav`: Arial 17px / lowercase
- `h1`: Arial 8px / color white / (hidden label — sr-only style)
- No CSS variables declared. `cssVars: {}`.
- `fontCombos` reports only one active combo: Arial 11px 400 lowercase 8.8px.
- Web fonts declared but never load: squarespace-ui-font, social-icon-font, proxima-nova 300/400/600 — all `status: "unloaded"`. Rendering uses Arial fallback permanently.

### Layout values
- `containerWidths.section`: 1190 at desktop 1280 viewport (45px left margin equivalent inside a 1280-wide body, but content actually starts at `x=80` which suggests section padding of 80px — so effective content left edge 80px, right-edge ~1270).
- `containerWidths.header`: 50 (the peace-sign logo area; narrow left sidebar).
- First `<p>` rect on home: `x=80, y=53, w=1190, h=9`. 9px tall = the 8.8px line-height rounded.
- Each nav link (`<a>`) on /all has `h=13` — taller than p because of the 3.4px padding top+bottom.
- Portfolio scroll column: image links sit at `x=80, w=578`. Image rows at `y=96, 421, 746, 1071, ...` — delta of 325px per row (image + gap).
- Portfolio document height: 35,561px total at desktop. That is ~40 viewport heights of vertical scroll.
- Home document height: 900px (one viewport).

### Nav inventory (from home allLinks)
- `Menu` (no href) — mobile toggle
- `/` (logo link) — peace symbol
- `http://mailto:LOLAMDEMENTMYERS@GMAIL.COM` — malformed mailto but still clickable
- `https://loladementmyers.com/all` — text "lola dement myers" (hidden or positioned off-visible)
- `/blog`, `/shop`, `/outfit-log` — labeled text items
- 4× `+` links to `/portfolio`, `/posting`, `/earthday`, `/sex-talk` — unlabeled

### Visual observations from screenshots (no re-browse)
- Desktop home: 1280px wide screenshot, peace sign top-left (~35px glyph), text cluster occupies upper-left ~300px-wide region from y≈50 to y≈290, then 800+ px of empty white below.
- Mobile home: peace sign scales up (~50px), text is visually much larger (~17–20px as rendered), same left-aligned stack. Text/whitespace ratio still favors white heavily.
- /all desktop: identical layout pattern — peace sign TL, Arial 11px stack of 6 items (silk/twitter/are.na/instagram/new york city/email), same 80px left margin.
- No background color, no borders, no rules, no dividers. Vertical stack relies entirely on `margin-bottom: 11px` per p.

### Cross-page constants
- Always #000 on #fff.
- Always Arial fallback.
- Always `text-transform: lowercase` on body.
- Always `x=80` left anchor.
- Always peace-sign as only graphic on navigation pages.
- Font weight and style never change.

### Cross-page variables
- Line count varies (home: ~10 items; /all: 6 items; /portfolio: 110 images in a column).
- Image density inverts between chrome pages (0–1 images) and work pages (110 images).
- The `+` glyph count is meta — 4 hidden pages exist.

---

## Batch 1 — Motion GIF frames

Completed 2026-04-22.

### GIF 1 frames examined
- key_000.png — scrambled mono 3-line stack (centered), white ground
- key_020.png — mono first 2 lines resolved `(MWRC) ®` / `AN EXPLORATION OF IDEAS`; third line still rotating digits
- key_045.png — all 3 mono lines resolved, letters justifying outward; serif "Dedicating space to explore new territories" appearing
- key_060.png — mono fully justified edge-to-edge; serif 2-line sentence fully visible, centered
- key_080.png — mono gone; only serif body on screen
- key_100.png — serif body holding; scrambled mono re-seeding below
- key_125.png — serif top (justified), mono bottom (justified): layered display state
- key_155.png — loop restart with fresh scrambled glyphs (different random seed than key_000)

GIF 1 key observations:
- Single centered vertical axis
- Mono (geometric, all caps) + Serif (oldstyle, sentence case)
- Matched-width cipher scramble (no reflow)
- Letterspacing is the motion axis, not line height
- Pure black on pure white
- Loop duration ~6–8s with hold poses

### GIF 2 frames examined
- key_000.png — six title fragments scattered on mustard ground, at final X-positions but wrong Y
- key_002.png — first 2 body rows appearing in 3-column grid
- key_004.png — body grid growing; commas stacking in right column
- key_008.png — title condensing to 3 rows; body grid larger
- key_013.png — resolved peak: 1-line title, full body, credit line
- key_020.png — title un-condensing; body emptying
- key_028.png — near-reset scatter state

GIF 2 key observations:
- Single serif typeface, ALL CAPS title + sentence body
- 3-column grid: connective word | content | trailing comma
- Locked line height across every row regardless of column
- Mustard/ochre ground (~#D3A021) + black text
- Word-level motion along fixed X-axes
- ~10s cycle; long peak hold
- Square 1:1 format (poster/IG aspect)

---

## Batch 3 — Ellen Ole / Ellen Nielsen (ellenole.com)

Completed 2026-04-22 (Opus 4.6 continuation).

### Pages scraped
- `/` (home) — reused existing screenshots + JSON from prior run
- `/about` — fresh scrape: 3 screenshots + JSON
- `/archive` — fresh scrape: 3 screenshots + JSON

### Computed values (desktop 1280 home)
- `body`: Inter, "Helvetica Neue", Arial, sans-serif / 10px / lineHeight 12px / color #000 / bg transparent
- `fontCombos`: single combo — Inter 10px 400 normal 12px #000 (29 occurrences)
- No h1, h2, h3, p elements on home — all content is in plain `<div>` elements
- 0 images, 0 video, 0 SVG on home
- Only 3 `<a>` tags: Blog (external hereismyblog.com), Instagram @__e____n, email
- Project list items are JS-driven divs, not links or semantic elements
- `--un-*` CSS variables indicate UnoCSS framework
- Web fonts: none loaded (fontsApi empty)
- bodyChildWidths: 1260, 1260 (body padding 10px × 2 = 20px subtracted from 1280)
- documentHeight: 800px (one viewport, no scroll)

### /about page
- 1 video element (the voice memo — "Ellen Nielsen Introduction")
- 8 images (likely video poster frames or testimonial letter scans)
- 1 `<p>`: "Director, guide and artist Ellen Nielsen (b. 1999)"
- 2 buttons: "(PLAY)" and "(FS)" in Helvetica Neue 10px — audio player controls as text
- Two scanned testimonial letters displayed as images (from Zachary Bergel and Knox)
- Right arrow (→) at x=1264 aligned with the bio line — back/nav indicator
- documentHeight: 504px visible content in 800px viewport

### /archive page
- Content: "09 08 07 06 05 04 03 02 01" — numbered items, reverse chronological
- 0 images, 0 links, 0 headings, 0 paragraphs
- Same single font combo: Inter 10px 400 12px #000
- documentHeight: 170px content in 800px viewport
- Archive items are unlabeled numbers — no dates, titles, or descriptions

### Visual observations
- Desktop home: name top-left, "Selected work" label, then a stacked list of ~25 projects in format "Client Name PROJECT TYPE" (e.g., "Daniel Caesar PERFORMANCE", "Yung Lean FOREVER YUNG TOUR")
- Navigation items (Blog, About, Archive) grouped below projects with spacing
- Contact (Instagram, email) at bottom, also with spacing
- Text cluster occupies ~160px wide at top-left on desktop; 85%+ of viewport is white
- Mobile: text is visually larger (~17-20px rendered) but same content structure
- About page: voice memo replaces written bio entirely; testimonials as scanned physical letters
- Archive: cryptic numbered list — requires interaction to reveal content

### Cross-page constants
- Always Inter 10px / 12px line-height
- Always #000 on transparent/white
- Always 10px body padding
- Always single font weight (400), no italic, no bold
- No navigation bar — name at top serves as home link (implicit)
- No images on navigation/index pages
- One-viewport documents (no scroll needed on any page)

### Cross-page variables
- About page introduces Helvetica Neue for audio player buttons
- About page has images (testimonial letters) and video (voice memo)
- Project items on home have mixed case: client name in title case, project type in ALL CAPS

---

## Batch 4 — Loyal Gallery (loyalgallery.com)

Completed 2026-04-22 (Opus 4.6 continuation).

### Pages scraped
- `/` (home) — fresh scrape: 3 screenshots + JSON
- `/exhibitions/until/` (current exhibition) — fresh scrape: 3 screenshots + JSON

### Computed values (desktop 1280 home)
- `body`: "Unica77 LL", Helvetica, sans-serif / 21.76px / lineHeight 27.2px / color #000 / bg transparent
- Unica77 LL: custom web font, loaded and active (only font that loads; Montserrat 300/500 and Open Sans 300/600 declared but unloaded — CMS/platform defaults not used)
- Font size is viewport-relative: `--fontSize: 1.7vw` → 21.76px at 1280px viewport
- Line height: `--lineHeight: 1.25` → 27.2px
- Baseline grid variable: `--baseline: calc(1.7vw * 1.25)` — spacing = line height
- `--baseWidth: calc(1.7vw * 1.25)` — same as baseline
- Single weight (400) throughout; italic used only for exhibition title mentions in body text (`<em>`)
- h1 ("LOYAL"), h2 ("Upcoming exhibition"), h3 ("UNTIL") — all same size/weight as body text, differentiated only by position and content
- Proper semantic HTML: nav, header, main, footer, article, h1-h3, p
- text-transform: uppercase on footer only

### Layout values
- Header padding: 27.2px (1× baseline)
- Main padding-top: 54.4px (2× baseline)
- Footer padding: 27.2px (1× baseline)
- Nav: LOYAL at x=27, nav items start at x=640 (exact viewport midpoint)
- Nav items: Exhibitions (x=640), Artists (x=851), Books (x=1019), About (x=1182)
- Two-column grid on exhibition page: left column (x=27, ~613px), right column (x=640, ~599px)
- Article width on exhibition page: 613px (right column)
- All spacing multiples of 27.2px baseline

### Color
- #000 on transparent/white across all pages
- Active nav state: rgb(0, 15, 255) — nearly pure blue, applied to "Exhibitions" link when on exhibition pages
- CSS variables reference button hover color #000fff (same blue) and danger hover #ff0000 (red, likely unused)
- No other color in use

### Home page
- 1 image (likely exhibition thumbnail)
- Content: "Upcoming exhibition" label, exhibition block (UNTIL / Tianyue Zhong / April 15–May 13, 2026)
- Footer: Opening hours (Wed-Fri 12-5, Sat 12-3) + address (SANDGATAN 7, 223 50 LUND, SWEDEN) + phone + email
- documentHeight: 800px (one viewport)

### Exhibition page (/exhibitions/until/)
- Two-column layout: left half for image/navigation, right half for text
- Small counter "1" at 13.4px (smaller type for image pagination)
- Exhibition info in right column: title, artist, dates, then 6 substantial paragraphs of exhibition text
- 2 images total
- documentHeight: 2650px (scrollable — the first page in either site that requires scrolling)
- 8 paragraphs, 8 links

### Mobile
- Nav collapses: "LOYAL" left, "Exhibitions, Artists, Books, About" right (comma-separated, same line)
- Single column — exhibition text flows full width
- Type remains viewport-relative (1.7vw scales down to ~6.4px at 375px — very small)
- Footer stacks vertically

---

## Batch 5 — Static image references

Completed 2026-04-22 (Opus 4.6 continuation).

### img1-monochrome-palette.jpg (1438×730)
- Physical color swatch card: 10 gray tones in a 2×5 grid
- Top row: 74 Smoke Gray, 70 Storm Gray, 56 Fashion Gray, 14 Gray Sky, 26 Slate Gray
- Bottom row: 12 Studio Gray, 84 Dove Gray, 54 Charcoal, 27 Thunder Gray, 20 Black
- Range: warm-neutral light gray to pure black
- Labels in compressed sans-serif, ALL CAPS
- Gradient from warm-cool mid-grays to near-black; no pure white in the palette
- User note: "Love the plain color palette here - monochromatic but strong"

### img2-arena-typo-form.jpg (595×600)
- Book/exhibition title set inside a rounded-corner label/tab shape
- "Glass Tableware in Still Life" curves along the arch of the label; "Glass" rotated 90° on left edge
- "Yoko Andersson Yamano and 18 Painters" set smaller inside, centered
- Serif face (transitional, possibly Garamond or similar)
- Type follows the physical shape contour — text AS boundary, not text IN boundary
- Warm paper/card texture background
- User note: "typography is used to create unconventional shapes and forms"

### img3-type-as-form.jpg (813×1600)
- Vertical list of ~40 goals/aspirations, all lowercase, no punctuation
- Left-aligned, single sans-serif face (Helvetica or similar), single weight, single size
- Items range from short ("llc", "book") to long ("stand for everything bend for nothing")
- The progressive lengthening creates a triangular/wedge silhouette — the ragged right edge IS the visual form
- Content is deeply personal: "not get a job", "find patience", "speak to myself honestly", "define my business"
- Black on white
- User note: "prob wouldn't directly ref this but it's cool"

### img4-type-form-2.jpg (700×500)
- Book spread from a concrete/visual poetry publication
- Text runs along the perimeter of each page, forming rectangular frames
- Words flow continuously around the border (top → right → bottom → left)
- Large empty center labeled "rectangle 8" and "rectangle 32"
- Small serif text, warm paper color
- Inverted text along bottom edges
- No user caption (secondary reference)

### img5-quality-typeface.png (1054×974)
- Infographic: "Stop searching for new fonts"
- Two tiers (Starter Pack / Second Level) across 4 categories (Sans-Serif, Serif, Script, Display)
- Notable sans recommendations: Futura, Apercu, Proxima Nova, Helvetica, Circular, Gotham, Avenir Next
- Notable serif recommendations: Caslon, Garamond, Didot, Clearface, Recoleta, Noe Display, Times, Baskerville
- Mix of high-quality foundry faces (Apercu, Circular) and accessible alternatives (Poppins, Merriweather)
- Principle: curate a small stable of reliable fonts rather than chase novelty
- User note: "Great example of quality typeface options"

---

