# System constraints — whatarewecapableof

Companion to `taste-profile/profile.md`. The profile describes the aesthetic; this file describes how to build within it. Everything here is a specific value or rule, not a vague direction.

These constraints are the engineering contract for any implementation pass. When an attribute is ambiguous (multiple acceptable values), this file chooses one and states the reasoning.

---

## 1. Foundation: the baseline grid

The whole system is derived from one number: **24px baseline.**

Every vertical measurement — margin, padding, gap, line-height — is a multiple of 24. This is the GIF 2 / Loyal discipline made concrete.

### Why 24px

- Body size lands between 16px (mobile minimum for readability) and 18px (where it starts to feel large on desktop).
- Line-height 1.4–1.5 is the target for comfortable prose reading.
- 16 × 1.5 = 24. 17 × 1.412 = 24. 18 × 1.333 = 24. All three viable body sizes hit the same 24px baseline when paired with their appropriate line-height.
- Locking the baseline to 24 across all breakpoints lets spacing behave identically everywhere while body size shifts responsively.

### The math

```css
:root {
  --baseline: 24px;
  --body-size: 16px;          /* mobile default */
  --line-height: 1.5;         /* = 24px, the baseline */
  --font-size-ratio: 1.125;   /* major second — gentle hierarchy */
}

@media (min-width: 768px) {
  :root {
    --body-size: 17px;
    --line-height: 1.412;     /* 17 × 1.412 = 24, locked baseline */
  }
}

@media (min-width: 1280px) {
  :root {
    --body-size: 18px;
    --line-height: 1.333;     /* 18 × 1.333 = 24, locked baseline */
  }
}
```

### Spacing scale

All spacing values are multiples of `--baseline`. Named tokens:

```css
:root {
  --space-0: 0;
  --space-0-5: calc(var(--baseline) * 0.5);   /* 12px — exception, tight grouping only */
  --space-1: var(--baseline);                 /* 24px */
  --space-2: calc(var(--baseline) * 2);       /* 48px */
  --space-3: calc(var(--baseline) * 3);       /* 72px */
  --space-4: calc(var(--baseline) * 4);       /* 96px */
  --space-6: calc(var(--baseline) * 6);       /* 144px */
  --space-8: calc(var(--baseline) * 8);       /* 192px */
  --space-12: calc(var(--baseline) * 12);     /* 288px — page-scale voids */
}
```

**Hard rule:** no spacing value that isn't in this scale. No 10px, no 20px, no 32px. If a layout needs something between `--space-1` and `--space-2`, the layout is wrong.

The `--space-0-5` (12px) token exists for one case: grouping a line of mono metadata tightly with the sentence-case content directly below it. Use it sparingly. When in doubt, go up to `--space-1`.

---

## 2. Typography

### Families

```css
:root {
  --font-serif: 'Lyon Text', 'GT Sectra', 'Recoleta', 'EB Garamond', Garamond, serif;
  --font-mono: 'Söhne Mono', 'ABC Diatype Mono', 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
}
```

**Selection constraints:**
- Primary serif must be transitional or old-style. Avoid Didone (too display, too high-contrast for body prose).
- Mono must be geometric/technical, not slab. Avoid Courier descendants.
- Foundry tier required. Acceptable: Lineto, Colophon, Commercial Type, GT, Pangram Pangram, Grilli Type, OH no Type. Not acceptable: Google Fonts defaults (Roboto, Lato, Montserrat, Open Sans, Source Serif).
- Self-host with woff2 and subsetting. Do not use cross-origin font CDNs for the primary faces.

**Weights to license:** 400 regular + 400 italic, for both serif and mono. That's 4 files total. Nothing else.

**Bold usage (established 2026-04-22):** Bold (`<strong>` / font-weight 700) is accepted for one purpose: inline wayfinding within quieter text registers. The tab guide on proposal pages uses bold on tab names ("**Summary** is what we noticed. **Research** is the evidence...") so the reader can scan the three names without reading the full sentence. Bold is not used for headings, section labels, or structural emphasis. The flat heading hierarchy (all weight 400) remains the system's primary mode.

### Size scale

```css
:root {
  --size-xs: calc(var(--body-size) * 0.75);   /* ~12–14px: counters, pagination, fine print */
  --size-s: calc(var(--body-size) * 0.889);   /* ~14–16px: mono metadata, ALL CAPS labels, nav */
  --size-m: var(--body-size);                  /* 16–18px: body prose, most headings */
  --size-l: calc(var(--body-size) * 1.125);    /* ~18–20px: page titles, larger headings */
  --size-xl: calc(var(--body-size) * 1.266);   /* ~20–23px: signature moments only */
}
```

**Usage rules:**

| Token | Role | Face | Case |
|-------|------|------|------|
| `--size-xs` | Image counters, pagination, footnotes | mono | sentence |
| `--size-s` | Mono metadata, ALL CAPS labels, nav items, project-type tags | mono | ALL CAPS (for labels) or sentence |
| `--size-m` | Body prose, h1–h3 on most pages, list items | serif | sentence |
| `--size-l` | Page title (when title is given its own line), heading in a two-column detail page | serif | sentence |
| `--size-xl` | Landing lockup, single-moment title. Rare. | serif | sentence |

**Never use `--size-l` or `--size-xl` for every heading.** The gentle hierarchy is the point. A page can run entirely on `--size-m` with no visual heading-vs-body distinction, relying on position and grouping. That is the correct default.

### Line-height and letter-spacing

```css
:root {
  --line-height-tight: 1.1;    /* All-caps labels only */
  --line-height-body: 1.5;     /* Overridden per breakpoint above to maintain 24px baseline */
  --line-height-display: 1.2;  /* --size-xl only */

  --tracking-normal: 0;
  --tracking-caps: 0.02em;     /* Slight open for ALL CAPS labels */
  --tracking-expanded: 0.2em;  /* Choreographed moment only (GIF 1 justify-to-edges) */
}
```

Letterspacing animation (per GIF 1) is the only case where `--tracking-expanded` is used. Never as a default on any element.

### Case rules

- **ALL CAPS:** metadata labels, project-type tags ("PERFORMANCE", "FILM", "PROPOSAL"), footer contact blocks, page-number counters, nav links when they function as category markers rather than titles.
- **Sentence case:** all prose, all body, page titles, project client names, section labels that function as soft headings ("Selected work", "Upcoming"), link text within content.
- **Never:** title case (capitalize every major word), mixed case as emphasis, lowercase-everything (Lola voice marker, not a neutral system).

---

## 3. Color

```css
:root {
  --color-bg: #ffffff;
  --color-text: #000000;
  --color-text-muted: #000000;         /* Identical to text — no gray hierarchy. Alias for clarity. */
  --color-accent: rgb(0, 15, 255);     /* Active state. Not decoration. */
  --color-rule: #000000;               /* Any hairlines/borders, used rarely */
}

/* Optional, opt-in per page/section — not default */
:root {
  --color-surface-warm: #d3a021;       /* GIF 2 mustard; full-field chord, not accent */
  --color-surface-gray-100: #f4f4f4;   /* Subtle surface, never for text contrast differentiation */
}
```

**Rules:**
- Default background: `--color-bg`. Default text: `--color-text`.
- `--color-accent` is reserved for **active state only** — current page in nav, active tab, selected state in a list. Never for links-in-prose (they stay `--color-text`, differentiated by `text-decoration: underline`). Never for hover decoration alone.
- Any gray beyond white and black is opt-in per surface, not for text.
- No color is ever used to signal hierarchy. If you're tempted to make a label gray to deprioritize it, use position and grouping instead, or use mono (which reads as "metadata" through the face/case change).

### Contrast

Default palette gives ~21:1 contrast ratio (black on white). Well above WCAG AAA (7:1) for body text.

If using `--color-surface-warm` as a full-field background, verify contrast: `#000000` on `#d3a021` is roughly 8.5:1 — still AAA for normal text, but flag that bold or italic on this surface needs extra care.

---

## 4. Layout

### Breakpoints

```css
/* Mobile-first. These are the shift points, not the design targets. */
/* Mobile: 0-767px */
@media (min-width: 768px)  { /* Tablet */ }
@media (min-width: 1280px) { /* Desktop */ }
@media (min-width: 1600px) { /* Large desktop — same type size as 1280, just more whitespace */ }
```

Test content at 375px, 768px, 1280px, and 1600px. Do not design for viewport widths in between; the layout should adapt smoothly but be verified at these four.

### Content anchor and margins

```css
:root {
  --margin-inline: var(--space-2);        /* 48px at the sides */
  --margin-block: var(--space-2);         /* 48px top/bottom */
}

@media (min-width: 768px) {
  :root {
    --margin-inline: var(--space-3);      /* 72px */
    --margin-block: var(--space-2);       /* 48px */
  }
}

@media (min-width: 1280px) {
  :root {
    --margin-inline: var(--space-4);      /* 96px — generous */
    --margin-block: var(--space-3);       /* 72px */
  }
}
```

Content is **always left-anchored.** No `margin-inline: auto` on the main container. The page is a left-weighted composition, not a centered one.

### Content widths (narrow reading column)

```css
:root {
  --content-width-prose: 64ch;    /* ≈ 560px — single reading column for body prose */
  --content-width-narrow: 40ch;   /* ≈ 350px — index pages, nav lists, tight content */
  --content-width-wide: 88ch;     /* ≈ 770px — when images or tables need width */
}
```

**Use the narrowest container that fits the content.** The "narrow" value matches Lola's ~350px text columns on desktop and gives generous right-margin whitespace.

### The two layout primitives

**Primitive A — Single-column, left-anchored (home, index, about, contact).**

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   [content-width-narrow]                                    │
│                                                             │
│   Identity                                                  │
│   ──                                                        │
│   List of things                                            │
│   Thing                                                     │
│   Thing                                                     │
│   Thing                                                     │
│   ──                                                        │
│   Secondary nav                                             │
│   ──                                                        │
│   Contact                                                   │
│                                                             │
│                                        (75%+ whitespace)    │
│                                                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

- Content starts at `var(--margin-inline)` from the left edge.
- Width: `var(--content-width-narrow)`.
- Vertical stack with `var(--space-1)` between sibling blocks, `var(--space-2)` between major groupings.
- Fits within `100vh` when the content count is small. Does not force scroll on navigation pages.
- Right side is empty. Do not add decorative elements to fill it.

**Primitive B — Two-column midpoint split (work detail, exhibition, proposal detail).**

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌─────────────────┐        ┌─────────────────────┐         │
│  │                 │        │                     │         │
│  │  Image(s)       │        │  Title              │         │
│  │  Media          │        │  Metadata (mono)    │         │
│  │  Counter        │        │                     │         │
│  │                 │        │  Prose              │         │
│  │                 │        │  Prose              │         │
│  │                 │        │  Prose              │         │
│  │                 │        │                     │         │
│  └─────────────────┘        └─────────────────────┘         │
│       left half                     right half              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

- Column split at exact viewport midpoint (50%).
- Left column: images, diagrams, media, or a small counter.
- Right column: prose at `var(--content-width-prose)`.
- Collapse to single column below 768px. On mobile the two columns stack vertically with `var(--space-2)` between them.
- Both columns anchor to the baseline grid — text rows align horizontally across the split.

**No other layout primitives are part of the system.** No three-column. No full-bleed. No cards-grid. No hero-above-body. If a page seems to need a different layout, interrogate the content first.

### Navigation pages fit the viewport

Every navigation/index page should fit in `100vh` at desktop. If content overflows 800px of vertical space at 1280px viewport width, reduce content count or split into sub-pages. Scrolling is for **content**, not for **chrome**.

---

## 5. Imagery rules

- **Navigation pages (home, about, contact, index, archive):** zero images. If a mark is used (logo, glyph), it is small (<40px on any dimension), monochrome, and positioned at the top-left with the identity text.
- **Work/project detail pages:** images are allowed, can be dense (Lola's 110-image portfolio is the upper limit precedent).
- **Formats:** JPG for photography, SVG for diagrams/marks, WebP/AVIF for optimization. No GIF for motion (use CSS or Lottie).
- **Sizing:** fit into the left column of Primitive B. Never full-bleed. Never backgrounded behind text.
- **Aspect ratios:** use the source's native ratio. Do not crop to fit. Do not stretch.
- **Image dimensions at source:** cap at 1600px on the long edge (for site use; originals at higher resolution are fine in the asset library).
- **Alt text:** required. Descriptive, not redundant with caption.

No decorative photography. No hero images. No background images. No icon libraries beyond what the site specifically needs (which should be very little — possibly zero icons, using text labels instead per Ellen Ole's pattern).

---

## 6. Motion

### Duration limits

| Motion type | Min | Max | Default |
|-------------|-----|-----|---------|
| State transition (nav change, reveal) | 200ms | 400ms | 300ms |
| Letterspacing expansion (GIF 1 move) | 600ms | 1200ms | 900ms |
| Looping ambient animation | 4s | 8s | 6s cycle, with 60%+ hold |

### Allowed properties

Only these may be animated:

- `transform: translateX/translateY` (position)
- `transform: translateZ(0)` (GPU hint, no visual effect)
- `opacity`
- `letter-spacing` (GIF 1 justify-to-edges motion)

### Disallowed properties

Never animated:

- `scale`, `rotate`, `skew` — not in the reference set, reads as decorative
- `border-radius`, `box-shadow`, `filter`, `backdrop-filter` — foreign to the profile
- `background-color`, `color` — state colors change, they don't animate
- `width`, `height` — layout jank, redundant with transform

### Easing

- Default: `linear` or `ease`
- Allowed: `cubic-bezier(0.25, 0.1, 0.25, 1)` (ease-in-out), `cubic-bezier(0.4, 0.0, 0.2, 1)` (Material standard)
- Forbidden: spring physics, elastic curves, back-out, bounce. No overshoot.

### Triggers

- Page load (once)
- State change (navigation, selection)
- Looping, for signature moments only, with `prefers-reduced-motion: reduce` killing the loop

Forbidden triggers:
- `:hover` for decorative motion (underline appearance is fine; letter-spacing jitter is not)
- `scroll` for parallax or kinetic type
- `:focus-within` beyond standard focus indicators

### Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

No exceptions.

---

## 7. Component rules

### Links

- Body prose links: `color: var(--color-text)` with `text-decoration: underline`. Underline is always on. No hover-appear underlines.
- Nav links: no underline, `color: var(--color-text)`. Current page takes `color: var(--color-accent)`.
- External links: distinguished only if useful (e.g., small mono `(EXT)` marker inline); no icon.

### Nav

- Horizontal nav on desktop, comma-separated inline on mobile (Loyal's pattern).
- No hamburger menu.
- No dropdowns.
- Max ~5 top-level items. If more are needed, fold into content pages.

### Footer

- Mono, `--size-s`, ALL CAPS.
- Contact (email), location if relevant, copyright/year.
- Can be at bottom of page or pinned to bottom of viewport on one-viewport pages.

### Lists (work index, project list)

Format per Ellen Ole:

```
Client Name PROJECT TYPE
Client Name PROJECT TYPE
Client Name PROJECT TYPE
```

- "Client Name" in serif sentence case at `--size-m`.
- "PROJECT TYPE" in mono ALL CAPS at `--size-s`, same line, separated by a single space or a tab.
- One list item per line. `var(--space-0-5)` (12px) between items — tight grouping.
- Each item a link (semantic `<a>`, not a JS-driven div).

### Forms

If a form is ever needed (contact, subscribe):
- Serif for labels, mono for input
- `--size-m`
- No placeholder-as-label
- Underline below input, no box border
- Submit button: underlined text, no box

### Buttons

Prefer links to buttons. When a button is required (form submit, JS-driven action):
- Text-only. No box, no rounded corners, no background.
- Mono, `--size-s`, underlined.
- Use sentence case for CTAs. Avoid all-caps action text; it reads too loud in this system.
- Parentheses like Ellen Ole's `(PLAY)`, `(FS)` remain optional for utility controls, not primary CTAs.

---

## 8. Accessibility floors

These are non-negotiable. They override any attribute in the profile if there's conflict.

- **Font size minimum:** 14px for any text content. `--size-xs` (12–14px depending on body-size scale) must be used sparingly — counters and fine print only, never for body or nav.
- **Color contrast:** WCAG AAA (7:1) for body text, AA (4.5:1) for large text. The `#000000 on #ffffff` default exceeds this by an order of magnitude.
- **Touch targets:** 44 × 44px minimum for any interactive element on touch devices. Add invisible padding if needed; never shrink the visible element to hit the target.
- **Keyboard navigation:** all interactive elements reachable and operable via keyboard. Visible focus indicator always present (use `:focus-visible` for the outline).
- **Semantic HTML:** proper heading hierarchy (`h1` → `h2` → `h3`) even though visually they may all render at the same size. Use `<nav>`, `<main>`, `<article>`, `<footer>` for structure.
- **Alt text:** required on all content images. `alt=""` only for decorative images (which, per profile, should not exist on chrome pages anyway).
- **Audio/video:** transcripts required for voice memos or any recorded speech (Ellen Ole's voice memo would need a transcript for compliance).
- **Reduced motion:** honored via `prefers-reduced-motion`. See section 6.

---

## 9. Performance budget

Navigation/index pages:
- Total page weight < 250KB
- Font files ≤ 120KB total (4 woff2 files, subset to Latin basic + punctuation)
- CSS < 15KB minified
- No client-side JS required for content rendering. Progressive enhancement only.

Content detail pages:
- Total page weight < 2MB (includes images)
- Images lazy-loaded below the fold
- WebP/AVIF with JPG fallback
- CSS inline-critical for above-fold, async for rest

---

## 10. File and code structure

```
whatarewecapableof/
├── index.html              # Home
├── about.html              # About (likely with voice memo per Ellen Ole reference)
├── work/
│   ├── index.html          # Work list
│   └── <project>.html      # Individual project pages
├── contact.html            # Contact (Lola /all pattern)
├── css/
│   ├── tokens.css          # All CSS custom properties (sections 1-3 above)
│   ├── base.css            # Reset + foundation styles
│   ├── typography.css      # Font-face, type classes
│   ├── layout.css          # The two primitives
│   └── components.css      # Nav, footer, lists, links
├── fonts/
│   ├── <serif>-regular.woff2
│   ├── <serif>-italic.woff2
│   ├── <mono>-regular.woff2
│   └── <mono>-italic.woff2
├── assets/
│   └── work/
│       └── <project>/
│           └── *.jpg       # Project images, pre-sized
├── og.png
├── favicon.svg
├── favicon.png
└── apple-touch-icon.png
```

CSS loading order in HTML:
1. Reset
2. `tokens.css` (custom properties)
3. `typography.css` (including `@font-face`)
4. `base.css`
5. `layout.css`
6. `components.css`
7. Page-specific styles (if any) inline in a `<style>` block at page bottom

No build step required. Keep the site static and plain. A build step can be added later (for minification, subsetting) but it is not a prerequisite.

---

## 11. Implementation checklist

Before merging any implementation pass, verify:

- [ ] All vertical spacing is a multiple of `--baseline` (24px). Inspect with the browser devtools; no ad-hoc values.
- [ ] Body text is 16px (mobile), 17px (tablet), or 18px (desktop). No values in between, no smaller.
- [ ] Line-height is set so `font-size × line-height = 24px` on body elements. Inspect the computed value.
- [ ] Only two font families are loaded (one serif, one mono), each with regular + italic only. No bold, no light.
- [ ] No `font-weight` value other than `400` appears in any stylesheet.
- [ ] Text color is `#000` (or `var(--color-text)`) everywhere except the single blue accent for active state.
- [ ] No gray text values (`#666`, `#999`, `rgba(0,0,0,0.5)`, etc.) anywhere.
- [ ] Navigation pages have zero `<img>` elements (or one small mark, ≤40px).
- [ ] No `border-radius` over 4px, no `box-shadow`, no `linear-gradient`, no `filter` (except opacity animations).
- [ ] No hover motion beyond underline-presence/absence or color change.
- [ ] No scroll-triggered animation.
- [ ] `prefers-reduced-motion` media query kills all loops.
- [ ] Semantic HTML used throughout (proper heading hierarchy, `<nav>`, `<main>`, `<footer>`, `<article>`).
- [ ] All interactive elements keyboard-reachable with visible `:focus-visible` indicator.
- [ ] All content images have descriptive alt text.
- [ ] Lighthouse: accessibility ≥ 95, performance ≥ 90.
- [ ] Every page tested at 375, 768, 1280, 1600 viewport widths.

---

## 12. Open questions to resolve before implementation

These are decisions the constraints can't make alone — they require Noah and Austin's input (with Caroline weighing in on taste/design questions where relevant).

### Resolved (2026-04-22)

2. ~~**Content model.**~~ **Resolved.** See `design/sitemap.md`. Three verticals (`/coach`, `/consult`, `/creative`) with integrated portfolio (scroll-through, not separate pages). About and contact are footer-only. Custom booking tool at `/coach/book` via Google Calendar API. Revisit portfolio-as-separate-pages when any vertical has 5+ items.

### Still open

1. **Specific typefaces.** The profile specifies tier and classification; the selection happens during Phase 4 of the create workflow. Candidates to audition: Lyon Text + Söhne Mono; GT Sectra + ABC Diatype Mono; Recoleta + JetBrains Mono. Licensing cost varies from free (JetBrains Mono) to $300–500 per family for the foundry serifs. Budget matters here.
3. **About page format.** Ellen Ole's voice memo is flagged as a strong direction. Confirm whether Noah + Austin want to record one, write a one-sentence bio, use photography (exception to image-absence — flagged), or something else entirely.
4. **Motion ambitions.** The profile permits letterspacing expansion and word-level repositioning as signature moments. Are there specific moments to build (landing sequence, work-item entry, etc.), or does the site start motion-free with moves added later?
5. **CMS vs. static.** Current state is static HTML. As content accrues, does a lightweight CMS (11ty, Astro, Hugo) become worth it? Recommend static until the project list exceeds ~15 items.
6. **Accent color.** Blue is the reference default. Other options within the "one near-pure state color" constraint: a saturated red (`#e50000`), a saturated green (`#00c000`), a saturated magenta. Blue works; document if a different color is preferred.
7. **Warm ground option.** GIF 2's mustard is validated as an optional full-field surface. Is there a page (about? contact? a specific work page?) where a warm background would earn its place, or stay all-white?

These questions should be answered during Phase 1 of the create workflow (Understand), before any code is written.
