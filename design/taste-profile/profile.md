---
name: whatarewecapableof
description: Personal site built with institutional craft. Mono + serif pair on a locked baseline grid, image absence as composition, motion as punctuation.
created: 2026-04-22
updated: 2026-04-22
reference-count: 10

layout:
  grid-type: compound
  density: low-medium
  content-width: narrow
  margin-character: generous
  whitespace: dominant
  symmetry: asymmetric

typography:
  primary: serif, transitional
  secondary: mono, geometric
  scale-ratio: 1.125
  body-size: 16-18px
  weight-range: 400 only
  spacing: normal
  alignment: left
  case: all-caps-ui
  line-height: 1.25-1.4

color:
  mode: light
  palette-strategy: neutral-plus-accent
  temperature: neutral
  saturation: desaturated
  contrast: high
  values:
    background: "#ffffff"
    surface: "#ffffff"
    text: "#000000"
    accent: "rgb(0, 15, 255)"

hierarchy:
  gradient: gentle
  dominance: position
  depth: 3
  image-role: absent

character:
  register: personal
  tension: low
  rhythm: measured
  motion: minimal
  ornamentation: none
---

# Taste profile: whatarewecapableof

This profile is for whatarewecapableof.com — the consulting agency Noah Glynn and Austin Rockwell are building together. The dominant character is **personal site built with institutional craft** — quiet authority rather than casual informality, with typography doing all the visual work.

Design collaborator: Caroline contributed taste direction during the reference-gathering phase (her notes appear verbatim in the reference log below, particularly on image absence and type as form).

The profile is built from ten references: two motion GIFs (MWRC cipher animation; How Can We Gather Now? poster), three live sites (loladementmyers.com, ellenole.com, loyalgallery.com), and five static images (a gray palette, three type-as-form pieces, one typeface-selection infographic). See the reference log at the bottom for the full accounting.

Every attribute in the YAML frontmatter traces to observable evidence from at least one reference. Where the references contradict each other (tight leading in Lola vs. grid-locked leading in Loyal), the prose below names the chosen resolution.

---

## Layout character

Left-anchored, baseline-locked, viewport-fitting.

Every vertical measurement is a multiple of the line-height unit. Loyal's system declares this explicitly — `--baseline: calc(1.7vw * 1.25)` — and applies it to every padding and margin: 1× for header padding, 2× for below-header gap, 1× for paragraph bottom padding. Lola applies the same principle implicitly (`margin-bottom: 11px` equals its body font size). The taste profile inherits this rule: **all vertical spacing is `fontSize × lineHeight × n`, always.**

Navigation and index pages fit within a single viewport. No scroll is required to see the site's top-level structure. Content-detail pages use a two-column midpoint split: left column for metadata, images, or pagination; right column for substantial prose. Loyal's exhibition page is the reference execution — left column 613px wide starting at x=27, right column 599px wide starting at x=640 (the exact viewport midpoint at 1280).

The right margin is generous to the point of feeling dominant. On navigation pages, content occupies less than 50% of the viewport width; the remaining whitespace is compositional, not empty. Lola's homepage puts its entire text stack in a ~300px column at top-left while the other 75% of the 1280-wide viewport is pure white. This is the register.

The site admits one exception: work or content pages, when they accrue images, can reach density (Lola's portfolio is a single-column 110-image feed, 35,561px tall). Density is permitted **only where the work is the subject** — not in the chrome, the nav, or the about.

## Typographic character

Two faces, one weight, one scale, role-based case.

The mono handles metadata, navigation, project codes, dates, and identifiers. The serif handles prose, propositions, descriptions, titles, and voice. This pairing comes from the user's explicit preference ("love the mix of monospace and serif readable font" — GIF 1) and is the profile's defining move.

Quality bar: the faces should come from the Apercu / Söhne Mono / Diatype Mono tier for mono and the Lyon / Garamond / GT Sectra / Recoleta tier for serif. Loyal's Unica77 LL sets the standard for typographic care in the reference set — a custom Lineto face with optical refinement. Lola uses Arial and Ellen Ole uses Inter; both sites work because every other decision is extreme, but the user's stated preference (img5, "quality typeface options," and "prefer the typography, kerning, etc of what currently exists on the site") indicates this profile should not lean on system fonts.

Weight is 400 only. No bold, no semibold, no light. Emphasis comes from italic (Loyal's `<em>` for exhibition title mentions) or ALL CAPS, both used sparingly.

Scale ratio sits near 1.0 between headings and body. The schema's 1.125 (major second) best captures this — hierarchy is subtle, not structural. In practice, `h1`, `h2`, `h3`, and `p` may all render at the same size and weight, distinguished only by position and content. A smaller secondary size is reserved for counters, pagination, or incidental metadata (Loyal's 13.4px image counter) — not for body copy.

Body size sits at 16–18px at desktop. The reference sites go smaller (Lola 11px, Ellen Ole 10px, Loyal 21.76px via viewport scaling), but the smaller sites risk illegibility for a partnership that will host proposals and project text. Loyal's larger setting is closer to the right target for content that needs to be read, not just seen.

Letterspacing is normal at rest. Letterspacing-expanded-to-edge-of-column (GIF 1's justify-to-edges move) is a specific choreographed state, not a default — used to mark a moment, not to texture every heading.

Line-height range 1.25–1.4. Grid-locked. The "consistent line heights" the user loves in GIF 2 come from every row of body text — regardless of column or content — sitting on the same baseline. This is a discipline, not a preference.

Text-transform: sentence case for content, ALL CAPS for labels, metadata, project roles, and footer contact blocks. No title case. No lowercase-everything (that's Lola's voice marker, not a neutral discipline).

Alignment: left. Center alignment is reserved for signature lockup moments — a single title, an intro mark, a landing moment — not for default columns.

## Color character

Black on white, one accent maximum.

The primary chord is `#000000` text on `#ffffff` background. All three reference sites operate in this palette. Surface colors, gradient fills, and background tints do not appear.

One accent is permitted: near-pure blue (`rgb(0, 15, 255)`, slightly less electric than `#0000FF`), reserved for structural state indication — active nav, current page, or an interactive state that needs to declare itself. Loyal's execution is the reference: the nav link for the current section (e.g., "Exhibitions" while viewing an exhibition page) turns this blue. No other state colors appear.

The gray palette reference (img1, with ten tonal steps from Smoke Gray to Black) opens the door for mid-gray surfaces or subtle background field differentiation, but **gray is not a text-hierarchy tool.** No `color: #666` for secondary content, no lighter weight in metadata through color alone. The reference sites achieve restraint by refusing this trick.

A warm ground chord (GIF 2's mustard/ochre `#D3A021`) is validated as an optional alternate palette — pairing a single saturated surface with pure black type — but it is not the default.

Saturation: desaturated except for the one structural blue. Temperature: neutral (the warm option, if used, is a whole-field chord, not an accent). Contrast: high.

## Hierarchy character

Radically gentle. Carried by position, grouping, and case.

In the reference set, headings do not enlarge. `h1`, `h2`, `h3`, body paragraphs, and nav links all render at identical or near-identical size and weight. The visual hierarchy comes from three mechanisms, in order of strength:

1. **Position.** Content at the top of a page is the most important; the reading axis descends. The home page leads with identity (name/mark), then work index, then secondary nav, then contact — this order is constant across all three live sites.
2. **Grouping.** Elements sitting together (with consistent spacing) read as a unit; elements separated by a baseline multiple read as distinct. Loyal's two-column content page is the clearest execution — the metadata column and the prose column are clearly separated groups without any dividing line or heading.
3. **Case.** ALL CAPS mono for metadata, role, and project-type labels; sentence case serif for content. The case change carries what a designer would usually solve with weight or size. Ellen Ole's project list ("Daniel Caesar PERFORMANCE") is the clearest demonstration: same size, same weight, same face — only the case of the project type differs, and that single mechanism establishes role differentiation.

Image role on the interface layer is **absent.** Home, index, about, archive, and navigation pages carry no imagery (or at most a single small mark, like Lola's peace symbol or Loyal's single exhibition thumbnail). On content pages, images can be dense — but this is an allowed departure, not the default. The taste profile's first instinct at any new page is "no image."

Depth is 3: site index → content index → content detail. The chrome stays flat at each level.

## Distinguishing features

The profile would become a different aesthetic if any of these changed. These are the protected attributes.

**1. The mono + serif pairing at one weight.**
One sans face by itself reads as Ellen Ole (minimal, extreme, type-as-interface-as-default). One serif by itself reads as GIF 2 or Loyal (institutional, poster-like, editorial). A sans+serif pairing (e.g., Helvetica + Garamond) reads as conventional editorial. Mono + serif, both at 400, is the specific combination: a typography system where the metadata sounds different from the prose, and the two voices never blend into one.

**2. The locked baseline grid as compositional law.**
The whitespace in this profile is not "generous" — it is specific. Every vertical measurement is `lineHeight × n`. Changing this to ad-hoc spacing ("a little more air here, a little less there") converts the aesthetic from structured-minimalism to formless-minimalism, which looks superficially similar but reads as sloppy under any sustained attention. GIF 2 shows this as a motion principle; Loyal shows it as a live system.

**3. Image absence as interface composition.**
The chrome must read as text and space only. On the homepage, the about page, and the index pages, there is no image. This is Caroline's explicit preference ("it has no images and I kind of like that") and the unanimous practice of the three reference sites at the interface layer. Introducing a hero image, a background photograph, or decorative graphics anywhere in the navigation shell breaks the stance. Images belong inside the work, not around it.

## Anti-patterns

Explicit rules against the most common drifts.

- **No font-weight variation.** 400 only. Emphasis through italic or ALL CAPS, not bold. No "light" or "thin" weights either — the single weight is the statement.
- **No gray text for hierarchy.** No `color: #666` or `#999` for secondary content. Position and grouping do that work. Text is `#000` (or near-`#000`); the accent is blue; there is no third text color.
- **No hero images, full-bleed photography, or decorative graphics on navigation pages.** The homepage must feel like text until the user chooses to enter work.
- **No hamburger menus, mobile drawers, or expanding navigation.** Every nav item is visible text at every breakpoint. Loyal collapses the nav onto a single comma-separated line on mobile rather than hiding it behind an icon. This profile follows that.
- **No centered full-page layouts.** Center alignment is reserved for specific lockup moments (a single title, a signature). The default reading axis is left-aligned.
- **No hover-triggered motion, scroll-triggered parallax, or entrance animations.** Motion is choreographed, hold-heavy (animations spend ≥60% of their duration at rest), triggered by page load or state change. Not ambient. Not reactive. Not decorative.
- **No ease-out bounces, elastic transitions, or spring physics.** The motion here is deliberate and quiet.
- **No more than one accent color.** The blue is the entire color departure from black and white. Adding a second accent (red for errors, green for success, purple for links) breaks the restraint.
- **No rounded corners over 4px, no drop shadows, no gradients.** None of the references use these; introducing them would read as "template styling."
- **No card UI.** Content sits directly on the background. No bordered containers, no box-shadow "cards," no hover-lift effects on list items.
- **No size-based hierarchy.** No 48px headings next to 16px body. Scale stays tight (1.125 ratio maximum). If something needs to be bigger, ask whether it needs to be first instead.
- **No title case.** Sentence case for content, ALL CAPS for metadata. Title Case Of Every Word looks tentative; it belongs to newsletter SaaS.
- **No "About Us" as conventional long-form prose.** Ellen Ole's voice memo reframes the format: consider whether the introduction to Noah and Austin's practice could be audio, film, image, silence, or a single sentence rather than three paragraphs.
- **No `text-transform: lowercase` on the whole site.** That is Lola's voice marker. Borrowed, it reads as imitation.
- **No system-font defaults presented as deliberate.** Arial, Inter, and system-ui fonts are not the target even though two reference sites use them. The user's preference for "quality typefaces" (img5, and stated admiration of Loyal's Unica77) overrides the system-default trick.

## Reference log

Each reference is listed with its pillar weighting (which attribute groups it most strongly informed) and its influence rating (heavy / moderate / light / incidental).

### Primary influences (heavy weight)

**GIF 1 — MWRC "An Exploration of Ideas"**
- Source: cloudfront 21329965, 2.3MB animated GIF
- User note: "Motion in type that we are inspired by. Love the mix of monospace and serif readable font"
- Contributes: the two-face pairing decision (mono + serif), letterspacing as a motion axis, baseline discipline during animation, hold-heavy pacing
- Pillars: typography (heavy), motion (heavy)
- Resolution: the pairing is adopted as the type system; the specific cipher-decryption animation is NOT adopted (too strongly associated with agency sites). Letterspacing expansion to column edge is a transferable choreographed moment.

**GIF 2 — How Can We Gather Now? (Prem Krishnamurthy / WPA poster)**
- Source: cloudfront 14698805, 1.2MB animated GIF
- User note: "Motion in type we are also inspired by - cool that there are these consistent line heights"
- Contributes: the locked-baseline-grid principle (the user's "consistent line heights"), three-column layout with punctuation as its own column, scatter-to-grid motion, word-level (not character-level) animation, warm-ground color option
- Pillars: layout (heavy), typography (moderate), motion (heavy), color (supporting — validates warm chord)
- Resolution: the baseline-grid-as-law principle is adopted verbatim. The three-column-with-punctuation idea is a specific pattern available for content pages. The scatter-to-gather motion is reference-only (too specific to the poster's theme of gathering).

**loyalgallery.com**
- Source: full site, home + /exhibitions/until/, scraped at 375/768/1280px
- User note: "Minimal imagery, lots of plain type... prefer the typography, kerning, etc of what currently exists on the site"
- Contributes: the viewport-relative type scale with explicit baseline-grid CSS variables, single-weight semantic HTML hierarchy, two-column detail layout, active-state blue accent as the entire color departure from B/W, Unica77 LL as proof that a quality typeface defines the register
- Pillars: typography (heavy), layout (heavy), color (heavy), hierarchy (moderate)
- Resolution: the reference system architecture. Not the specific Unica77 LL face (that belongs to Loyal), but the discipline — quality custom font, baseline-grid math, single weight, semantic HTML, one blue for active state. The mono/serif pairing (from GIF 1) is the addition that makes this profile its own aesthetic rather than a Loyal clone.

### Supporting influences (moderate weight)

**loladementmyers.com**
- Source: full site, home + /all + /portfolio, scraped at 375/768/1280px (portfolio screenshots quarantined for oversize; JSON reuse only)
- User note: "Love all the white space, plain text, minimal images"
- Contributes: chrome-disappears-to-show-work principle, left-anchored single-column navigation pages, hidden-link aesthetic (the `+` glyphs pointing to unlabeled pages), image-density-at-content while image-absent-at-chrome, one-viewport navigation pages
- Pillars: layout (moderate), hierarchy (moderate), typography (light — via restraint, not craft)
- Resolution: the stance is adopted (interface as whisper, work as shout), but not the specific implementation. Lola's 11px Arial everything-lowercase is a Lola voice marker, not a transferable system. The site uses Squarespace with all platform fonts unloaded; the effect works through the accumulated extremity of every other decision, which is not a repeatable design method for a partnership whose content will accrue over time.

**ellenole.com**
- Source: full site, home + /about + /archive, scraped at 375/768/1280px
- User note: "Voice memo as about page — cool idea worth exploring. Check out her whole site"
- Contributes: the voice-memo-as-bio format idea (non-text content replacing expected text), extreme structural flatness, project-list case differentiation (title case client + ALL CAPS project type), one-viewport pages across the entire site, navigation without icons or symbols
- Pillars: hierarchy (moderate — via its radical flatness), layout (light), typography (incidental — Inter default)
- Resolution: the voice-memo format concept is flagged for consideration; the specific execution (10px Inter, no semantic HTML, opaque archive numbering) is not adopted. Ellen Ole goes further than Lola in stripping interface, but the absence of semantic HTML and the 10px default sacrifice accessibility for attitude — a trade this profile does not make.

**img1 — Monochrome palette swatch card**
- Source: cloudfront 12542289, JPG
- User note: "Love the plain color palette here - monochromatic but strong"
- Contributes: opens the tonal-gray range as a valid surface palette (Smoke Gray through Thunder Gray through Black, ten steps)
- Pillars: color (supporting)
- Resolution: gray surfaces and background field tones are permitted; gray text for hierarchy is not. The palette validates mid-tone neutral surfaces as compatible with the taste, not as required.

**img5 — "Stop searching for new fonts" infographic**
- Source: cloudfront 14254329, PNG
- User note: "Great example of quality typeface options"
- Contributes: the quality-bar signal — Apercu, Circular, Caslon, Garamond, Didot, Baskerville are in the target tier; Roboto, Lato, Montserrat are below it
- Pillars: typography (supporting — meta, about selection principle)
- Resolution: governs the `primary` and `secondary` type attributes in the YAML. The selection happens during the create workflow's Phase 4, but this reference sets the threshold.

### Incidental influences (light weight)

**img2 — Glass Tableware in Still Life (exhibition title on label shape)**
- Source: are.na, JPG
- User note: "Typography is used to create unconventional shapes and forms"
- Contributes: the principle that type can define a shape (type AS boundary, not type IN boundary)
- Pillars: typography (incidental)
- Resolution: the principle is acknowledged; the specific print execution (curved text along a label arch) does not transfer to the web. If the site has a landing-moment lockup, this principle is available; otherwise, it's background.

**img3 — Vertical goal list**
- Source: cloudfront 42244809, JPG
- User note: "prob wouldn't directly ref this but it's cool"
- Contributes: text at varying lengths generates visual form (ragged right edge as shape)
- Pillars: typography (incidental)
- Resolution: the user brackets this explicitly as "cool but not for reference." Validates the broader principle (typography can create visual structure without graphic elements) but is not a pattern to import.

**img4 — Rectangle 8 / Rectangle 32 (concrete poetry book spread)**
- Source: cloudfront 1553672, JPG
- User note: none (secondary to img3)
- Contributes: text as architectural boundary — letters forming the walls of a rectangle, the void is the content
- Pillars: typography (incidental)
- Resolution: print-specific and experimental-bookwork-specific. Reinforces the img2/img3 principle that type is a structural material, but not directly transferable.

---

## Tensions the profile explicitly resolves

**Typographic default (Arial, Inter) vs. typographic craft (Unica77, Garamond).**
Resolution: choose quality. The user's own stated preference for "quality typefaces" and for Loyal's typography overrides the Lola/Ellen Ole default-font trick, which relies on extreme surrounding discipline that this site cannot guarantee across years of evolving content.

**Mono + serif love (GIF 1) vs. mono-face reality of the three live sites.**
Resolution: honor the explicit preference. Adopt the mono + serif pairing. Apply it with the one-weight, baseline-grid discipline shared by all three live sites. The pairing is this profile's specific contribution; it doesn't exist in the live reference set.

**Image absence (Caroline's note) vs. image-density on work pages (Lola's portfolio).**
Resolution: split by layer. Interface and chrome are image-absent. Content pages may be image-dense when the work is the subject. The rule of thumb: "if the page is about the work, images are allowed; if the page is about getting to the work, images are not."

**Tight leading (Lola, 0.8 ratio) vs. grid-locked leading (Loyal, 1.25).**
Resolution: follow Loyal and GIF 2. Tight leading is Lola-specific sparse-content trick; it fails for prose. Lock line-height to 1.25–1.4 and derive all spacing from it.

**10px whisper body (Lola, Ellen Ole) vs. readability for partnership content.**
Resolution: use intimate scales selectively. Pagination counters, metadata labels, and incidental text may run small (12–13px). Body copy and prose must sit at 16–18px minimum.

---

## Notes for the create workflow

When this profile enters Phase 2 (Strategy) of 11-create-workflow.md, the strongest constraints in order:

1. **Baseline grid first.** Before any content placement, establish `fontSize × lineHeight` as the vertical unit. Every margin, padding, and gap inherits from it.
2. **Type system second.** The mono and serif faces are selected per Phase 4 guidance (typo-06-selection.md), bounded to the quality tier defined by img5.
3. **Single weight, near-flat scale.** Do not introduce bold. Do not let headings get bigger than 1.125× body.
4. **Left anchor, asymmetric composition.** Default to content at left with right margin dominant. Center alignment is a signature moment, not a default.
5. **No images on chrome.** Navigation, about, home, and index pages have no hero images. Only content pages (work, proposals, detailed writing) may carry imagery.
6. **Motion as punctuation.** If motion is specified, it is hold-heavy, triggered by state change, and positional (not stylistic). Default to no motion; add it only where it earns its place.
7. **Black on white default; one blue accent for state; one optional warm ground.** No second accent.

When this profile enters the critique framework (10-critique-framework.md), failures to flag: weight variation, size-based hierarchy, gray text for secondary content, hero images on nav pages, micro-animations on hover, multi-color palettes, and anything that feels "template minimal" rather than "specific minimal."
