# Claude reference analysis — whatarewecapableof taste profile

_Synthesis deliverable. Primary output for the main agent to turn into a structured taste profile and system constraints._

Status: complete. All references analyzed, all sections populated. See `claude-raw-extraction-notes.md` for raw measurements and `claude-motion-frame-analysis.md` for the GIF frame-by-frame work.

---

## 1. Executive summary

The ten references converge on a site that treats typography as its sole visual material, deploys it on a locked baseline grid, and uses image absence as a deliberate compositional choice.

**Type system:** Mono + serif pair at one weight (400), one size, roles split by case (ALL CAPS metadata, sentence case content). Faces should be from the Apercu/Unica77/Garamond quality tier. Letterspacing is an animation axis; font weight is not.

**Grid:** Spacing = multiples of `fontSize × lineHeight`. Single column for index pages (content anchored top-left, generous void). Two-column midpoint split for detail pages. Every navigation page fits one viewport.

**Color:** Black on white. One accent maximum (near-pure blue for active state). Tonal grays permitted for surfaces, not for text hierarchy. GIF 2's ochre/mustard validates a warm background chord as an option.

**Motion:** Word-level and character-level repositioning on fixed baselines. Hold-heavy (60%+ at rest). Triggered by page load or state change, not scroll or hover. 4-8 second cycles.

**Imagery:** Zero on navigation pages. Present as content on work pages (can be dense). No hero images, no background images, no decorative photography.

**Hierarchy:** Carried by position, grouping, and case. Not by size, weight, or color. The reference set is extremely flat; heading levels are visually identical to body text.

**Dominant character:** Personal site built with institutional craft. Quiet, held, specific. The danger is drifting into featureless minimalism; the guard against it is a quality typeface, a real baseline grid, and one or two format moves specific to Noah and Caroline's practice (voice memo, hidden navigation, letterspacing animation).

The three primary influences are GIF 1 (type pairing + letterspacing motion), GIF 2 (baseline grid discipline + holdtime), and Loyal Gallery (the live proof that this system works at scale). Lola and Ellen Ole support the attitude and spatial generosity but not the typographic specifics. The static images validate type-as-form as an interest and set the quality bar for font selection.

## 2. Reference inventory

| Ref | Type | Source | User note (shortened) |
|-----|------|--------|------------------------|
| GIF 1 | Motion | cloudfront 21329965 | Type motion, mono + serif mix |
| GIF 2 | Motion | cloudfront 14698805 | Type motion, consistent line heights |
| loladementmyers.com | Live site | full site | White space, plain text, minimal images |
| ellenole.com | Live site | full site | "Voice memo as about page"; check whole site |
| loyalgallery.com | Live site | full site | Minimal imagery, plain type; prefer our kerning though |
| img1 | Static | cloudfront 12542289 | Plain, monochromatic, strong palette |
| img2 | Static | are.na (jpg) | Typography as unconventional shape/form |
| img3 | Static | cloudfront 42244809 | Type as form, reference only |
| img4 | Static | cloudfront 1553672 | (no caption — secondary to img3) |
| img5 | Static | cloudfront 14254329 | Quality typeface options |

## 3. Live site analysis

_To be drafted per site._

### 3.1 loladementmyers.com

**User note.** "Love all the white space, plain text, minimal images."

**Tech reality under the hood.** Squarespace theme with nearly all chrome stripped. The site's distinctive look comes almost entirely from Lola aggressively opting out of platform defaults, not from a custom stack.

**Type system.**
- One face for everything visible: `Arial, Helvetica, sans-serif`. Web fonts are declared (proxima-nova @ 300/400/600, squarespace-ui-font, social-icon-font) but `FontFace.status === "unloaded"` across all three JSON scrapes. Either intentional (feature-flagged off) or accidental (not loading the font CSS). Effect is the same: the site reads as system-font default — the absence of "designed" type is itself the design.
- Single weight: `400` regular. No italic, no bold anywhere.
- Body-copy scale on desktop: `11px` with `line-height: 8.8px` (compressed leading — 0.8 ratio). Links on desktop: `17px`. h1: `8px`, white on transparent (hidden/sr-only). These are smaller than any mainstream-site body sizes.
- Desktop reads at whisper volume. Mobile bumps dramatically (the same text looks roughly 17–20px tall in the 375px screenshot) — a deliberate break from responsive down-scaling. The mobile register is human-readable; the desktop register is forensic.
- `text-transform: lowercase` applied site-wide on body — even content stored in uppercase displays lowercase. Found explicitly on `/portfolio` where "(NOTICE THE MUNDANE + SIMPLIFY) + AMPLIFY =" is stored in caps but displayed as "(notice the mundane + simplify) + amplify =".
- No letter-spacing adjustments (`letter-spacing: normal`).
- `color: rgb(0,0,0)` text on `rgba(255,255,255,0)` transparent body over implicit white. True #000/#fff, no tonal wash.

**Layout.**
- Left-anchored single column. Content starts at `x=80` across all pages (`80px` left gutter). Container width `1190px` at 1280px viewport, but actual content lives in a ~300px wide text column at top-left, occupying roughly 5–8% of the frame.
- No grid system in the conventional sense. More like a "margin + floating small elements" composition. The rest of the page is white.
- Header region (logo area): fixed ~50px wide at left. Home viewport: peace-sign glyph top-left at ~`x=10, y=25`. It's ~35×35px. It is the only graphic element on the homepage.
- Vertical stack of links with mid-weight spacing (`margin-bottom: 11px` per item, so items sit with one text-line of gap between them).
- Blank `+` glyphs used as links to unlabeled hidden pages (`/portfolio`, `/posting`, `/earthday`, `/sex-talk`). Unlabeled navigation as aesthetic: items visible only to those who hover or click.

**Content behavior across pages.**
- `/` (home): 1 image (favicon-equivalent peace symbol), 1 tagline ("lola dement myers (b.1997) does it for no reason."), 7 nav items (3 labeled, 4 symbolic `+`).
- `/all` (contact): pure text index — silk / twitter / are.na / instagram / new york city / email. No images at all besides the peace symbol.
- `/portfolio`: **110 images stacked in a single 578px-wide column**, each image row ~325px apart vertically, total document height 35,561px. This is a 100-screen scroll feed. Image-absence is a property of the navigation layer only. The work itself is dense image.
- The homepage also uses `/home2` as a variant route.

**Key insight.** The "no images, white space" read is true of the wayfinding (home, /all, nav) but reverses completely on the work pages. The aesthetic is not "minimalism as a total system"; it is "minimalism at the chrome, density at the content." The chrome is designed to disappear so the work can arrive un-framed.

**What it contributes to the taste profile.**
- Pillars: **layout (heavy), hierarchy (heavy), typography (moderate — via restraint not selection), color (incidental — pure B/W)**.
- Weight: **moderate-heavy**. Dominant for the site's stance toward its own interface (how small, how low-key, how un-decorated the chrome is). Not dominant for typography craft (Arial-default is a trick that works once; it is not a system transferable to a content-heavy site for a two-person partnership that will accrue).
- Transferable: image-free navigation, left-anchored single column on desktop, site chrome that retreats almost off-camera, hidden-link gestures (`+` as "there is more here, ask me").
- Not transferable as-is: 11px body type (illegible for partnership content with written proposals), lowercase-everything (feels specifically Lola's — a voice marker, not a neutral typographic discipline), Arial as the intentional display face (system-font-default is a 2012–2022 move that's currently generic; it does not pair well with the "quality typeface" reference).



### 3.2 ellenole.com

**User note.** "Voice memo as about page" — cool idea worth exploring. Check out her whole site.

**Site identity.** Ellen Nielsen (b. 1999). Director, guide, and artist. Portfolio of music-adjacent creative direction (Daniel Caesar, Yung Lean, Ye/Donda, Rick Owens, Pusha-T). Built with UnoCSS on a custom stack.

**Type system.**
- One face for everything: `Inter, "Helvetica Neue", Arial, sans-serif`. Inter is set in CSS but no web font files load (`fontsApi: []`), so it renders as Inter only on machines with it installed; falls back to Helvetica Neue or Arial otherwise.
- One combo: 10px / 12px line-height (1.2 ratio) / 400 weight / normal style / no text-transform.
- On the About page, audio player buttons ("(PLAY)", "(FS)") use `"Helvetica Neue"` explicitly — the only place a second font declaration appears. Same size, same weight.
- 10px at desktop is roughly half the size of conventional body copy. Like Lola, the site reads at whisper volume on desktop. Mobile renders the same content larger (~17-20px visually) due to viewport scaling.

**Layout.**
- 10px body padding all sides. Content anchored top-left.
- No grid, no columns. Pure vertical stack with spacing between groups.
- Homepage: name, "Selected work" label, ~25 project names, secondary nav (Blog / About / Archive), contact (Instagram / email). Total content height fits one viewport (800px at desktop). No scroll.
- About page: one-line bio, a large empty space, audio player at bottom-left, two scanned testimonial letters as images floating right of center. One viewport.
- Archive page: numbered items 09 through 01, top-left. No labels, dates, or context. One viewport.
- Every page fits within a single viewport — no scrolling anywhere.

**Navigation.**
- No nav bar, no hamburger, no persistent header. Name "Ellen Nielsen" at top left acts as implicit home link.
- Secondary pages (Blog, About, Archive) listed as plain text in the homepage stack.
- Project items are JS-driven `<div>` elements, not `<a>` tags. No semantic links for projects.
- Minimal DOM: 0 headings (h1-h3), 0 paragraphs on home. Content lives in plain divs.

**The voice memo.**
- The About page is: one sentence of self-identification + an audio recording labeled "Ellen Nielsen Introduction" + two scanned recommendation letters.
- The audio player is pure text: "(PLAY)" and "(FS)" as `<button>` elements, plus a scrubber line. No custom audio chrome, no waveform visualization, no timestamps.
- The testimonial letters are photographed/scanned physical documents, including handwritten signatures. They are images of paper, not styled text.
- The voice memo REPLACES a written bio. The choice is: "hear me describe myself rather than reading about me." This is a format decision, not a feature.

**Content behavior.**
- Navigation/index pages: zero images, pure text.
- The About page is the only page with images (scanned letters) and media (voice memo).
- Project list format: "Client Name PROJECT TYPE" — mixed case where the client is title case and the project type is ALL CAPS. This creates a subtle two-register rhythm in the text without any weight or size variation.
- Archive numbers (01-09) are opaque — they require clicking to discover what they contain.

**Key insight.** This site goes further than Lola in stripping away interface. Lola keeps a peace symbol and some symbolic `+` navigation hints. Ellen Ole has no icons, no symbols, no images on navigation pages, no semantic HTML structure. The entire interface is a flat list of text at 10px. The voice memo is the single most distinctive move: it trades the standard written bio for a spoken one, which is a statement about presence, medium, and the limits of text.

**What it contributes to the taste profile.**
- Pillars: **hierarchy (heavy — via its radical flatness), layout (moderate — single-stack simplicity), typography (light — Inter default, no craft in the font choice itself)**.
- Weight: **moderate**. The voice-memo idea and the extreme structural minimalism are influential as concepts. The specific type choices (Inter at 10px) are less transferable than the attitude they express.
- Transferable: the format idea of non-text content replacing expected text (voice memo as bio), project-list typography where case changes carry all the role differentiation (no bold, no size change), one-viewport pages, and the principle that navigation pages should be as lightweight as possible.
- Not transferable as-is: 10px body text (same legibility concern as Lola), zero semantic HTML (accessibility and SEO cost), Inter as the sole face (generic, does not match the "quality typeface" reference), completely opaque archive numbering (requires Noah + Caroline's content to have enough mystery to earn this).


### 3.3 loyalgallery.com

**User note.** "Another awesome site overall with minimal imagery, lots of plain type, we are inspired by the minimalism of these, but prefer the typography, kerning, etc of what currently exists on the site." Also: "It has no images and I kind of like that" (Caroline).

**Site identity.** Loyal Gallery. Contemporary art gallery in Lund, Sweden (Sandgatan 7, 223 50 Lund). Gallery program with exhibitions, artists roster, and book publications. Custom CMS with proper semantic HTML.

**Type system.**
- One face: `Unica77 LL, Helvetica, sans-serif`. Unica77 LL is a custom web font from Lineto, actively loaded. It is the only face that loads; Montserrat (300/500) and Open Sans (300/600) are declared in the font stack but remain `status: "unloaded"` — platform/CMS defaults that the gallery's design overrides.
- Unica77 is a redrawing of Haas Unica (1980), itself a synthesis of Helvetica, Univers, and Akzidenz-Grotesk. It reads clean, geometric, slightly narrower than Helvetica, with better optical refinement. This is a deliberate typographic investment — not a default or freebie.
- Font size is viewport-relative: `--fontSize: 1.7vw`. At 1280px viewport = 21.76px. At 375px mobile = ~6.4px (extremely small).
- Line height: `--lineHeight: 1.25`, so `27.2px` at desktop. The baseline grid (`--baseline: calc(1.7vw * 1.25)`) equals the line height, and ALL spacing (padding, margins, gaps) is expressed as multiples of this unit.
- Single weight (400 regular) for everything. Italic (`<em>`) used only for exhibition title mentions within body paragraphs. No bold anywhere.
- `text-transform: uppercase` on footer (address/contact) only. All other text is sentence case.
- Hierarchy is carried entirely by position, grouping, and content — h1, h2, h3 are all the same size and weight as body text.

**Layout.**
- Two-region header: LOYAL at x=27 (left), nav items starting at x=640 (exact midpoint). Nav items are spaced roughly evenly across the right half: Exhibitions, Artists, Books, About.
- All padding and spacing is multiples of 27.2px (the baseline unit): 27.2px (1×), 54.4px (2×).
- Homepage: header, "Upcoming exhibition" section label, current exhibition block (title / artist / dates), large empty space, footer with hours + address. One viewport, no scroll.
- Exhibition detail page: two-column layout. Left half (x=27, ~613px wide) contains image(s) with a small counter ("1" at 13.4px — the only text at a different size). Right half (x=640, ~599px wide) contains exhibition info and full press text. Document height: 2650px (the first scrollable page in any of the reference sites).
- Footer: opening hours at left, uppercase address block starting at midpoint (x=640).

**Color.**
- Black (#000) on transparent/white everywhere. Zero surface color, zero accent — except one: the active nav link turns `rgb(0, 15, 255)` — a near-pure blue, slightly less electric than `#0000FF`. This appears when viewing exhibition pages ("Exhibitions" highlights blue). No other state colors visible.
- CSS variables declare `--bgColor-buttonPrimary-hover: #000fff` (the same blue) and `--color-buttonDanger-hover: #ff0000`, but these are framework presets that don't appear in the visible design.

**The math of the spacing system.**
- `--fontSize: 1.7vw`
- `--lineHeight: 1.25`
- `--baseline = --baseWidth = 1.7vw × 1.25`
- Header top padding: 1× baseline (27.2px)
- Below-header gap: 2× baseline (54.4px)
- Paragraph bottom padding: 1× baseline (27.2px)
- Main bottom padding: ~14.7× baseline (400px — this is the large void between content and footer on exhibition pages)
- Footer padding: 1× baseline (27.2px)
- Everything snaps to the baseline grid. This is the GIF 2 principle made real in a live site.

**Key insight.** Loyal Gallery is the most architecturally rigorous site in the reference set. Where Lola and Ellen Ole achieve minimalism through aggressive stripping (small type, no semantics, no structure), Loyal achieves it through disciplined structure (proper HTML hierarchy, a genuine baseline grid, a considered typeface, viewport-relative scaling). The result looks similar at a glance — lots of white, minimal imagery, text-forward — but the underlying approach is fundamentally different. Loyal could scale to more content without breaking; Lola and Ellen Ole would have to invent structure they currently don't have.

**What it contributes to the taste profile.**
- Pillars: **typography (heavy — via Unica77 and the baseline grid), layout (heavy — the two-column + baseline system), hierarchy (moderate — flat but structured), color (incidental — B/W + one blue state)**.
- Weight: **heavy**. This is the strongest single-site reference for how the type system and grid should work. The user's own note confirms this — they admire these sites' minimalism but prefer "the typography, kerning, etc of what currently exists on the site," which implies Loyal's level of typographic care is closer to their target than Lola/Ellen Ole's more casual defaults.
- Transferable: viewport-relative type scale with a baseline grid that governs all spacing; single high-quality sans face used at one size across hierarchy levels (position + content carry the differentiation); two-column layout for content pages; active-state color as the only departure from B/W; semantic HTML structure.
- Not transferable as-is: Unica77 specifically (it is a Lineto face that belongs to Loyal's identity); the extreme viewport-scaling at mobile (6.4px at 375px is too small — would need a floor); the lack of a mono/serif pair (the user explicitly loves the mono + serif mix from GIF 1, which Loyal doesn't have).


## 4. Static image analysis

### 4.1 img1 — Monochrome palette reference

**Source.** Physical color swatch card. 10 swatches in a 2×5 grid. Top row: Smoke Gray, Storm Gray, Fashion Gray, Gray Sky, Slate Gray. Bottom row: Studio Gray, Dove Gray, Charcoal, Thunder Gray, Black.

**User note.** "Love the plain color palette here — monochromatic but strong."

**What it contributes.** A tonal vocabulary beyond the binary of pure black and pure white. The palette runs from warm-neutral light gray through cool-blue mid-grays to pure black, with each step named evocatively (Smoke, Storm, Thunder). This suggests the user is open to a palette that includes tonal gray steps rather than a stark #000/#fff pair. The "strong" quality the user identifies comes from the palette's restriction to a single hue family (neutral gray) used with range and confidence.

**Pillar.** Color (primary), hierarchy (supporting — tonal steps can carry weight).

**Weight.** Supporting. This is a color-logic reference, not a layout or typographic one. It opens the door for the taste profile to include a gray tonal scale rather than locking to two-value contrast.

### 4.2 img2 — Type as shape (Glass Tableware)

**Source.** Book or exhibition title for "Glass Tableware in Still Life — Yoko Andersson Yamano and 18 Painters." Text is set inside and along the contour of a rounded-corner label/tab shape on warm paper stock.

**User note.** "Caroline and I acknowledged how we enjoy the way the typography is used to create unconventional shapes and forms."

**What it contributes.** Text used as a physical boundary maker. "Glass" runs vertically along the left edge; "Tableware in Still Life" curves along the arch at the top. The type IS the shape, not a label applied to a shape. The face is a transitional serif, set at one weight, and the visual interest comes entirely from the path the text follows. Compositionally, this is a restrained graphic move — one shape, one face, one line of text, no ornament.

**Pillar.** Typography (primary — type as form).

**Weight.** Supporting. The user values this as a concept (type creating shape) rather than as a directly copyable element. The curved text path is specific to print/exhibition identity; for the web, the transferable principle is that typography can create visual structure without images or decorative elements.

### 4.3 img3 — Type as form (goal list)

**Source.** A vertical list of ~40 personal aspirations ("llc", "book", "loans", "studio" ... "stand for everything bend for nothing"), all lowercase, no punctuation. Single sans-serif face, single weight, left-aligned.

**User note.** "Another great example of using type to create form — prob wouldn't directly ref this but it's cool."

**What it contributes.** The progressive lengthening of items (short at top, long at bottom) creates a triangular/wedge silhouette. The ragged right edge IS the visual form — no graphic element, just the natural shape of text at varying lengths. Also notable: the content is deeply personal, intimate, aspirational. The form is inseparable from the voice.

**Pillar.** Typography (primary — type as form), hierarchy (supporting — the visual shape is hierarchy-free, a flat list with no emphasis).

**Weight.** Incidental. The user explicitly brackets this as "cool but wouldn't directly reference." It validates a principle (text quantity and length can generate visual shape) but is not a design to import.

### 4.4 img4 — Type as boundary (rectangle book)

**Source.** Book spread from a concrete/visual poetry publication. Text runs continuously around the perimeter of each page, forming rectangular frames. The center of each page is an empty void labeled "rectangle 8" and "rectangle 32." Small serif text, warm paper.

**User note.** None (secondary to img3).

**What it contributes.** Text as architectural boundary. The words form the walls of a rectangle; the content area is the void inside. This inverts the normal relationship — usually text fills a container; here, text defines the container. Also demonstrates: text can run vertically, text can be read in non-linear paths, text can be structural rather than informational.

**Pillar.** Typography (primary — type as structure).

**Weight.** Incidental. No user commentary, and the execution is specific to concrete poetry / experimental bookwork. The principle (text can be structural) reinforces img2 and img3, but the form itself is not transferable to a portfolio/partnership site.

### 4.5 img5 — Quality typeface reference

**Source.** Infographic titled "Stop searching for new fonts." Two tiers (Starter Pack / Second Level) across 4 categories (Sans-Serif, Serif, Script, Display). Notable sans: Futura, Apercu, Proxima Nova, Helvetica, Circular, Gotham, Avenir Next. Notable serif: Caslon, Garamond, Didot, Clearface, Recoleta, Noe Display, Times, Baskerville.

**User note.** "Great example of quality typeface options."

**What it contributes.** A signal about type quality standards. The user values deliberate font selection over default choices. The "Starter Pack" leans toward established foundry faces (Apercu from Colophon, Circular from Lineto, Caslon, Garamond, Didot, Baskerville) rather than free-tier Google Fonts. This reference, combined with the user's stated preference for "the typography, kerning, etc of what currently exists on the site" (referring to Loyal Gallery's Unica77), indicates the taste profile should specify a quality typeface with optical refinement, not a system font or a free sans-serif.

**Pillar.** Typography (primary — typeface selection).

**Weight.** Supporting. It is a meta-reference about font selection principles, not a visual to emulate. But it strongly qualifies the type direction: whatever faces are chosen should be from the Apercu / Circular / Caslon / Garamond tier, not from the Roboto / Lato / Montserrat tier.


## 5. Cross-reference synthesis

The ten references (2 GIFs, 3 live sites, 5 static images) cluster around three core convictions:

### 5.1 Typography is the primary material.

Every reference treats type as the dominant visual element. The live sites have minimal or zero imagery on their navigation pages. The GIFs use no imagery at all. Three of the five static images explicitly explore type as shape, boundary, or form. The remaining two (palette and font list) support the type system rather than replacing it. No reference in the set relies on photography, illustration, color gradients, or decorative graphics for its visual identity.

### 5.2 Restraint is systematic, not aesthetic.

The minimalism in these references is not "clean" as a surface quality. It is structural: one typeface (or two, max), one weight, one or two sizes, spacing derived from a single baseline unit, color limited to black + one accent at most. Lola achieves this by stripping platform defaults. Ellen Ole achieves it by using no semantic structure at all. Loyal Gallery achieves it by building a rigorous baseline grid. The motion GIFs achieve it by holding poses longer than transitions. In every case, restraint is a constraint system, not a mood.

### 5.3 Image absence is a load-bearing decision.

Caroline: "It has no images and I kind of like that." Across the reference set, image absence is not an omission — it is a compositional choice that forces typography to carry all visual weight. Lola's homepage has one glyph (peace symbol). Ellen Ole's homepage has zero images. Loyal Gallery's homepage has one small exhibition image. The GIFs are pure type on a field. The taste profile should treat image absence as a positive constraint, not a placeholder state.


## 6. Strongest recurring traits

1. **Single-face type systems.** Every live site uses one typeface for all visible content. GIF 2 uses one serif. Only GIF 1 introduces a second face (mono + serif), and even there the pairing is strict role-based, not decorative.

2. **Single weight.** 400 regular across all three live sites. No bold anywhere in the reference set except the implicit weight of ALL CAPS.

3. **Black on white (with minor exceptions).** All sites: #000 on transparent/white. GIF 2: black on mustard. Loyal Gallery: one blue for active state. The palette swatch (img1) suggests tonal gray is acceptable. No gradients, no shadows, no background textures.

4. **Type size as whisper or breath, not as shout.** Lola: 11px. Ellen Ole: 10px. Loyal: 21.76px (but viewport-relative, so 6.4px at 375px). The reference set trends toward text that is smaller than expected, with generous surrounding space.

5. **One-viewport pages.** Every homepage in the set fits within a single viewport. Scrolling happens only on content-detail pages (Lola's portfolio feed, Loyal's exhibition text). Navigation and index pages are single-screen compositions.

6. **Spacing derived from type.** Loyal explicitly: `--baseline = fontSize × lineHeight`. Lola implicitly: `margin-bottom: 11px` = body font size. Ellen Ole implicitly: 12px line-height as the vertical rhythm. Spacing is a function of the type system, not an independent variable.

7. **Flat hierarchy.** Headings, body, links, and labels are the same size and weight. Differentiation is carried by position, grouping, and case (ALL CAPS for metadata/roles, sentence case for content).

8. **Left-anchored content.** Content sits at the left edge with large empty right/bottom regions. Loyal adds a midpoint split for its two-column layout, but the primary reading axis is always left-to-top-left.

9. **Holdtime in motion.** Both GIFs spend more time at rest than in transition. The "pose" is the primary state; movement is punctuation.

10. **Proper content at the top, contact/metadata at the bottom.** All three sites stack: identity → work index → secondary nav → contact. The vertical reading order is consistent.


## 7. Tensions or contradictions

### 7.1 Typographic craft vs. typographic default

The user cites Loyal Gallery's typography/kerning as a standard ("prefer the typography, kerning, etc of what currently exists on the site") and includes a "quality typeface" reference (img5). But two of the three live sites use system or near-system fonts: Lola uses Arial, Ellen Ole uses Inter. There is a tension between admiring the rigor of Unica77 LL and being drawn to sites where the font choice is deliberately un-precious. The resolution: the admired quality lives in how the type is deployed (size, spacing, restraint), not necessarily in the face itself, but the explicit preference for "quality" suggests the final system should use a considered face, not a default.

### 7.2 Mono + serif love vs. mono-face reality

The user explicitly loves "the mix of monospace and serif readable font" from GIF 1. But all three live site references are single-face systems. No site in the set uses a mono/serif pairing. The motion reference validates the pairing as desirable; the live references demonstrate that single-face systems work. The resolution: the taste profile should specify a mono/serif pairing (honoring the explicit preference) but use it with the same one-weight, same-size discipline as the single-face sites.

### 7.3 Image absence as principle vs. image-dense work pages

Lola's homepage is imageless, but /portfolio is a 110-image vertical feed. The principle "no images" applies to the chrome, not to the content. The taste profile should distinguish between interface imagery (avoid) and content/work imagery (may be dense when present). Noah and Caroline's site will need to present their work at some point; the question is not whether images appear but where they appear.

### 7.4 10px text vs. readability

Three references use body text below 12px at desktop. This creates the desired hushed, intimate register but sacrifices readability. The user's stated preference for "quality typography" and "kerning" implies they care about how text reads, not just how it looks at a distance. The resolution: use the intimate scale selectively (metadata, labels, secondary content) rather than for all body copy.

### 7.5 Tight leading vs. baseline-grid discipline

Lola uses 0.8 line-height (compressed leading). Loyal uses 1.25 (generous, grid-locked). GIF 2 demonstrates locked baseline grids as a primary virtue. These are opposite leading strategies. The resolution: follow the GIF 2 / Loyal principle. Tight leading is a Lola-specific trick that works for her sparse content but would fail for longer text.


## 8. Primary influences

| Reference | What it governs | Why it leads |
|-----------|----------------|-------------|
| GIF 1 (MWRC) | Type pairing decision (mono + serif), letterspacing as motion axis, baseline discipline | Only reference that demonstrates the pairing the user explicitly loves; sets the two-face system |
| GIF 2 (How Can We Gather Now?) | Baseline grid as structural law, word-level motion, holdtime > transition time | Strongest single demonstration of the grid principle that Loyal Gallery also uses |
| loyalgallery.com | Type scale system (`vw`-relative + baseline), single-weight hierarchy, two-column layout, semantic structure | Most architecturally mature site in the set; validates that minimalism can be rigorous, not just stripped |

These three references together define the core system: mono + serif pairing (GIF 1), deployed on a locked baseline grid (GIF 2 + Loyal), with hierarchy carried by position and case rather than weight or size (Loyal).


## 9. Supporting influences

| Reference | What it supports | Role |
|-----------|-----------------|------|
| loladementmyers.com | Chrome-disappears-to-show-work principle, left-anchored layout, one-viewport navigation pages, hidden navigation as aesthetic | Validates the attitude and spatial generosity; does not provide the type system |
| ellenole.com | Voice-memo-as-about-page format idea, extreme structural flatness, project-list case differentiation | Provides one distinctive format concept and confirms the flat-hierarchy direction; the specific implementation (10px Inter, no semantics) is not the target |
| img1 (monochrome palette) | Opens the tonal range from binary B/W to a gray scale | Permits the taste profile to include mid-gray tones, not just #000/#fff |
| img5 (quality typeface) | Sets the quality bar for font selection | Tells the system to pick from the Apercu / Caslon / Garamond tier |

## 9.1 Incidental influences

| Reference | What it validates | Why it stays incidental |
|-----------|-------------------|----------------------|
| img2 (Glass Tableware label) | Type can define a shape, not just fill one | Print-specific execution; the principle matters, the form does not transfer |
| img3 (goal list) | Text at varying lengths generates visual form | User explicitly says "wouldn't directly ref this" |
| img4 (rectangle book) | Text as architectural boundary | Concrete poetry / experimental bookwork, not web design |


## 10. Likely anti-patterns

These are things the taste profile should explicitly warn against, because they are where "minimalist portfolio site" typically drifts:

1. **Generic minimal template look.** The sites in this reference set are not "minimal templates" — they are idiosyncratic. The danger is building something that reads like a Squarespace "minimal" theme rather than a site with a specific point of view. Avoid: centered hero section, full-bleed header image, card grids, "Featured Project" carousels.

2. **System-font defaults presented as deliberate.** Lola and Ellen Ole make system/near-system fonts work through extreme surrounding restraint. Copying the font choice without the spatial discipline produces a site that looks unfinished. The user's stated preference for quality typefaces means the final system should not use Arial, Inter, or system-ui as the primary face.

3. **Gray text for hierarchy.** The reference set achieves hierarchy without text color variation — no `color: #666` or `color: #999` for secondary content. Position and case do the work. Using gray text to signify "less important" is the most common betrayal of this direction.

4. **Micro-animations on hover/scroll.** Both GIFs demonstrate that motion should be choreographed and hold-heavy. Hover-triggered fades, scroll-driven parallax, entrance animations that fire once and never repeat — all of these violate the holdtime principle.

5. **Image-forward hero.** Caroline: "It has no images and I kind of like that." The homepage should not lead with photography. If images appear, they should be deep in the content flow (like Lola's /portfolio scroll feed or Loyal's exhibition detail), not at the top of the page.

6. **Multi-weight type scale.** The reference set is single-weight across the board. Introducing bold, semibold, or light creates hierarchy the references deliberately avoid. If emphasis is needed, use italic (Loyal's pattern for exhibition titles) or ALL CAPS, not weight.

7. **Colored accents beyond one.** Loyal's single blue for active state is the maximum color intervention in the reference set. Multiple accent colors, gradient fills, or color-coded categories would break the palette discipline.

8. **Hamburger menus, mobile drawers, or expanding navs.** All three sites flatten their navigation into visible text at every breakpoint. The nav is always readable without interaction. Hiding navigation behind an icon contradicts the "everything is visible text" principle.

9. **"About Us" page as conventional prose.** Ellen Ole's voice memo is a format challenge: what if the about page is not text? The taste profile should at least flag that a conventional written bio is not the only option.

10. **Centering everything.** The reference set is predominantly left-aligned. Centering is used sparingly (GIF 1's lockup) or not at all. A full-page center-aligned layout is the most common way minimalist sites lose tension.


## 11. Recommendations for the taste profile schema

Based on the full reference set, the taste profile schema should capture these dimensions:

### 11.1 Type system

- **Pairing:** Mono + serif (from GIF 1). Mono for metadata, navigation, dates, labels, identifiers. Serif for prose, descriptions, voice, and propositions.
- **Weights:** One (400 regular). If italic is needed, use it for titles or emphasis only (Loyal's `<em>` pattern).
- **Scale:** One size for body, nav, headings. A second smaller size only for counters/pagination (Loyal's 13.4px counter) or metadata. No large display sizes.
- **Quality bar:** Foundry-level faces. Sans: Apercu, Suisse Mono, Söhne Mono, or ABC Diatype Mono tier. Serif: Garamond, Lyon, or GT Sectra tier. Not system fonts, not Google Fonts.
- **Case:** ALL CAPS for metadata/roles/project-types. Sentence case for everything else. No title case, no lowercase-everything.
- **Letterspacing:** Normal at rest. Expanded letterspacing as a specific choreographed moment (GIF 1 principle), not a default.

### 11.2 Grid and spacing

- **Baseline grid:** All vertical spacing = multiples of `fontSize × lineHeight`. No ad-hoc pixel values.
- **Column system:** Single column for navigation/index pages. Two-column (midpoint split) for content-detail pages.
- **Content anchor:** Left-aligned, generous right margin. Content occupies less than 50% of the viewport width on navigation pages.
- **Viewport fit:** Navigation/index pages fit in one viewport. Content pages scroll when needed.

### 11.3 Color

- **Primary:** Black (#000 or near-black) on white/off-white.
- **Accent:** Maximum one. Near-pure blue (Loyal's `rgb(0,15,255)` or similar) for active/state indication, not for decoration.
- **Tonal range:** Mid-gray tones permitted for background fields or subtle surface differentiation (img1 palette), but NOT for text color hierarchy.
- **Warm option:** Mustard/ochre (GIF 2's `#D3A021`) is validated as a potential background chord, not as a guaranteed palette element.

### 11.4 Imagery

- **Navigation pages:** Zero images (or one small mark/glyph). Type and space carry the composition.
- **Content pages:** Images appear as content, not as decoration. When present, they can be dense (Lola's portfolio feed). When absent, the page must still feel complete.
- **No hero images, no background images, no decorative photography.**

### 11.5 Motion

- **Primitive:** Word-level or character-level repositioning on a fixed baseline (GIF 1 + GIF 2). Not fades, scales, or rotates.
- **Holdtime:** Animations spend ≥60% of their duration at rest. Motion is punctuation.
- **Trigger:** Page load or state change only. Not scroll, not hover.
- **Duration:** 4-8 seconds per cycle. Long, slow, breathable.
- **Letterspacing expansion:** Valid as an occasional choreographed move, but not as a looping ambient effect.

### 11.6 Hierarchy

- **Mechanism:** Position (top = most important), grouping (visual proximity = related), and case (ALL CAPS = metadata, sentence case = content).
- **Not through:** Font size, font weight, text color, borders, background shading, or icons.
- **The "flat hierarchy" test:** Can someone looking at the page identify what is a heading and what is body text? If they cannot distinguish by size or weight, they should be able to distinguish by position and grouping alone.

### 11.7 Format ideas to preserve

- **Voice memo as about page** (Ellen Ole). Consider non-text formats for self-description.
- **Hidden navigation** (Lola's `+` links). Some content can be discoverable without being listed.
- **Numbered archive without labels** (Ellen Ole). Opacity as a navigation aesthetic, for content that earns it.
- **Chrome disappears to show work** (Lola). The interface should feel temporary; the content should feel permanent.

### 11.8 The dominant aesthetic

Answering the judgment questions from the task spec:

- **Editorial, institutional, personal, technical, or a mix?** A mix of institutional and personal. Loyal Gallery provides the institutional grid discipline and typographic rigor. Lola and Ellen Ole provide the personal scale (whisper volume, intimate addressing). The GIFs provide editorial motion pacing. The result should feel like a personal site built with institutional craft — quiet authority, not casual informality.
- **How restrained is the hierarchy?** Extremely. Heading levels, body text, navigation, and metadata are all the same size and weight. Only position, grouping, and case differentiate them.
- **How much of the reference set depends on image absence?** Almost entirely. Every navigation/index page in the set is text-only. Image absence is not a gap — it is the composition.
- **Where does typography carry the emotional and compositional load?** Everywhere. Type is the material, the structure, and the voice. There is nothing else.
- **Sparse, measured, or severe density?** Sparse trending toward measured. Not severe — the spacing is generous, not punitive. The pages breathe. But the content count is low (few elements per page), which creates the sparseness. When content accrues (Loyal's exhibition text, Lola's portfolio), it is set at normal density within its column.
- **What kind of motion feels native to this direction?** Positional (word/character migration along fixed axes), letterspacing expansion on a locked baseline, and accumulation/deposition (content appearing/disappearing by row). Hold-heavy. Not ambient, not decorative, not scroll-triggered.
- **What should the future site avoid to not drift into generic minimalism?** (1) A considered typeface, not a default. (2) A baseline grid, not just "lots of whitespace." (3) One or two distinctive format moves (voice memo, hidden navigation, letterspacing animation) that are specific to Noah and Caroline's practice, not available in a template. (4) Content density when presenting work — the navigation is sparse, but the work itself can be rich. (5) A single accent color used structurally (active state), not decoratively. Generic minimalism is spacious but featureless; this direction should be spacious and specific.

