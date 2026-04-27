# Motion GIF frame analysis

Two motion references from the taste profile. Analysis is frame-by-frame for distinct states (not every tween frame). Sampling 6–8 key frames per GIF.

**Post-production correction (2026-04-26):** This file is historical reference analysis. The live site type contract is system UI for prose, titles, and data display, plus Geist Mono for labels, metadata, navigation, and proposal chrome. Treat any mono-plus-serif transfer notes below as superseded inspiration, not implementation guidance.

Source files:
- `./design/reference-analysis/gifs/gif1-mono-serif-mix.gif` — note: "Motion in type that we are inspired by. Love the mix of monospace and serif readable font"
- `./design/reference-analysis/gifs/gif2-line-heights.gif` — note: "Motion in type we are also inspired by - cool that there are these consistent line heights"

Key frame directories:
- `./design/reference-analysis/frames/gif1-keys/` (33 frames)
- `./design/reference-analysis/frames/gif2-keys/` (29 frames)

---

## 1. GIF 1 — mono + serif mix ("Motion in type that we are inspired by")

Source: `gif1-mono-serif-mix.gif`, 2.3 MB. 33 key frames extracted (keys 000 through 157, step 5). Sampled 8 frames for distinct visual states.

### 1.1 Distinct frame states

| Frame | State description |
|-------|-------------------|
| 000 | Three stacked centered mono lines, all scrambled — random caps, punctuation, digits. `~WGBM! '` / `KX OHZVYBKDSYX YP SNOKC` / `524&7'0801&82&98`. Tight letterspacing, small point size. |
| 020 | First two lines have resolved to real words: `(MWRC) ®` / `AN EXPLORATION OF IDEAS`. Third line still rotating digits: `734°7+0801°82°98`. Hold pose. |
| 045 | All three mono lines resolved to final meaning: `(MWRC) ®` / `AN EXPLORATION OF IDEAS` / `746. 9/ 2023. 04. 10`. Letters are actively justifying outward — individual glyphs pulled apart with large gaps. A serif sentence has appeared lower in the frame: `Dedicating space to explore new territories`. |
| 060 | Header has fully justified to edge-to-edge width. Serif sentence now complete across two lines, centered, no justification: `Dedicating space to explore new territories / within art, design, and technology.` Serif is the clear focal object now. |
| 080 | Mono header is gone. Only the serif sentence remains, in the same vertical position. Pure hold. |
| 100 | Serif body still holding position. The mono header is re-appearing below it — in scrambled-again-but-different characters, indicating the loop is seeding back. |
| 125 | Serif body has migrated upward to the top of the frame, letters now also fully justified edge-to-edge (matching the mono header's earlier justification state). The mono header is below it, fully justified. Vertical order has inverted. |
| 155 | Loop resets. Fresh scrambled mono characters at center: `}NXSD~ &` / `BO FYQMPSBUJPO PG JEFBT` / `079%2&5356%37%43`. New random seed — not the same scramble as frame 000. |

### 1.2 Motion sequence (the loop)

1. **Scramble hold.** Three centered mono lines of random glyphs. Same character count per line as the resolved text (matched-width cipher).
2. **Decrypt, line by line.** Each line resolves top-down, letter-by-letter; hold for a breath when resolved.
3. **Horizontal justification.** Once all three lines are resolved, the letters of the mono block are pulled apart horizontally, stretching to the content column's max width. The line heights do not change — glyphs slide horizontally only.
4. **Serif reveal.** Simultaneously or just after justification completes, the serif body sentence types/fades in below the header.
5. **Header vacates.** Header dissolves / moves off while serif remains.
6. **Position swap and re-entry.** Serif migrates to the top position and itself justifies to full width. Mono header re-enters below in its own justified state.
7. **Re-scramble seed.** Loop cycles back to step 1, but with a fresh set of random glyphs (not a replay of the previous random sequence).

Rough timing inference from frame indices: scrambled hold ~0–20, decrypt ~20–40, justify+serif reveal ~40–60, serif hold ~60–90, layered display ~90–130, re-scramble ~130–157. So roughly 6–8s on a typical GIF frame rate.

### 1.3 Type system observations

- **Two typefaces only.** Monospace (all caps, roughly a geometric / technical mono — appears similar to ABC Diatype Mono, Söhne Mono, or a free GT America Mono cousin) and a serif (high-contrast, mid-width oldstyle; lowercase-dominant body; feels like an old-style or ITC Galliard descendant, possibly Times-like at small sizes).
- **All caps mono / sentence-case serif.** Roles are segregated. Mono = header / metadata / identifier / code. Serif = proposition / sentence / content.
- **Strict horizontal center axis.** Every line — including during justification — stays on the same vertical axis of the frame. There is no ragged alignment anywhere.
- **Consistent line heights throughout.** Even while letters spread horizontally to many times their "natural" width, each line holds its baseline. The letter spacing is the only thing that changes; leading is constant.
- **Matched-width cipher scramble.** The random glyphs at the start of the loop have the same character count as the resolved phrase, so the resolve-in-place animation never requires the block to change width or reflow.
- **Tight unjustified state vs. edge-to-edge justified state.** Two spacing extremes, no in-between. The motion is the transition between them.
- **No color.** Pure black on pure white (or near-pure #fff).

### 1.4 Transferable principles for whatarewecapableof.com

- **Role differentiation through the production pair.** Geist Mono handles identifiers, metadata, codes, dates, and navigation labels. System UI handles sentences, descriptions, and voice. This keeps the user's role-split preference while matching the live type contract.
- **Baseline discipline.** Lock line height regardless of letter-spacing theatrics. If animation happens, it should affect horizontal character distribution, not vertical rhythm.
- **Decrypt-in-place as an entry animation.** Optional, but the character-level cipher where the block never reflows (width matched to resolved text) is a strong trick that matches the restraint of the rest of the aesthetic.
- **Justification as a choreographed state, not a default.** The justified-to-edge state is a specific moment, not the resting layout. Use justification sparingly — it carries weight precisely because most of the time the text sits compact and centered.
- **Centered axis as grid.** A single vertical axis running through the frame is the grid. All text hangs on it.
- **Loop without exact repetition.** When restarting the cipher, pick fresh random glyphs. Avoid the "same GIF playing" look.
- **Hold poses matter.** The animation spends significant time at rest between transitions. Reading time and breathing room are built into the motion design.

### 1.5 What should stay reference-only

- The full decryption effect is a signature move of certain agency/studio sites (MWRC, Locomotive, etc.) and can read as "2022 agency trope" if literally reproduced. The principle (letter-level mono animation on a consistent baseline) transfers; the exact cipher-scramble visual should not be copied 1:1.
- Three-line metadata stack with wordmark + tagline + date code is a specific idiom; consider whether Noah + Caroline's site has anything that natural fits that structure before importing it.

---

## 2. GIF 2 — consistent line heights ("Motion in type we are also inspired by")

Source: `gif2-line-heights.gif`, 1.2 MB. 29 key frames (monotonically progressive — the motion accumulates rather than loops tightly). Sampled 7 frames.

Subject: an animated version of the "HOW CAN WE GATHER NOW?" poster (Prem Krishnamurthy / Washington Project for the Arts event poster, February 5, 2022, with Prem Krishnamurthy, Richard D. Bartlett, Natalia Lombardo, Asad Raza, Naoko Wowsugi, Tiffany Sia — presented by WPA with support from the Goethe-Institut and Eaton Workshop).

### 2.1 Distinct frame states

| Frame | State description |
|-------|-------------------|
| 000 | Square poster field. Warm mustard / goldenrod ground (approx `#D3A021`). Six title fragments scattered across the field at different Y positions but already at their correct X positions: GATHER upper-right, HOW upper-left, CAN mid-left, NOW mid-right, ? far-right, WE lower-center. Pure type, no imagery. |
| 002 | "WE" has moved up slightly. Below the scatter, a 3-column grid begins to seed: left column "on", center column "Saturday / February 5", right column punctuation "," and ",". The line height of these body rows is already locked. |
| 004 | More content accumulates in the 3-column grid: "on Saturday, / February 5, / 2022, / 2:00–3:30pm (EST)". Commas consistently stacked at the right edge. Title words still scattered. |
| 008 | Title words are now beginning to condense toward the top row. GATHER has stayed in place; HOW sits alone on line 2; CAN WE and NOW? have aligned onto line 3. Body grid has grown to include the full speaker list. |
| 013 | Title is fully resolved to a single line at top: `HOW CAN WE GATHER NOW?` Below it, the full event information 3-column block is visible, ending with full speaker list + credit line `PRESENTED BY WASHINGTON PROJECT FOR THE ARTS (WPADC.ORG) / WITH SUPPORT FROM THE GOETHE-INSTITUT AND EATON WORKSHOP.` This is the peak / resolved frame. |
| 020 | Title has un-condensed partially — `HOW` returns to left, `CAN WE` and `NOW?` break to separate lines. Body content is still mostly visible but beginning to empty bottom-up. |
| 028 | Near-reset — title words have returned close to their original scattered positions; body content mostly emptied. Loop re-seeds. |

### 2.2 Motion sequence

1. **Scattered start.** Six title fragments positioned in the square. Each fragment is already at its final X-position but at the wrong Y-position. Blank 3-column body grid below.
2. **Body accumulates bottom-up / inside-out.** Body rows appear one at a time, filling the 3-column template: LEFT = connective word (`on`, `with`), CENTER = content (date, names), RIGHT = comma. Line height is constant from the first row appearing.
3. **Title condenses vertically.** The six title fragments migrate upward along their fixed X-axes, settling into a single row at the top of the poster. Word order `HOW CAN WE GATHER NOW?` is preserved because X-positions were chosen to match the final left-to-right order.
4. **Peak hold.** Resolved title + full body grid + credit footer. Longest dwell time.
5. **Reverse.** Title partially disassembles upward/outward; body text empties bottom-up.
6. **Reset to scatter.** Title fragments return to starting positions. Loop repeats.

Roughly a "deposition / breathing" motion — the poster gathers itself, holds, then exhales back out. This is a much calmer rhythm than GIF 1's cipher-decryption.

### 2.3 Type system observations

- **One typeface only.** A single high-contrast serif (transitional / modern; looks like something in the Century / Cormorant / Editorial New family — possibly Lyon or similar). No secondary mono, no sans. Case toggling carries role differentiation: ALL CAPS for the title, sentence case for body.
- **Single weight.** Regular throughout; no bold or italic contrast.
- **Consistent baseline grid across rows.** This is the GIF's defining trait. Every row — body connective, body content, right-aligned comma — occupies the same line height. The commas on the right column are locked to the baselines of the words on the left and middle columns. No row is taller or shorter than the rest.
- **Three-column body grid.**
  - Col 1 (left, short): connective words like `on`, `with`. Left-aligned.
  - Col 2 (middle, widest): content (dates, names). Left-aligned.
  - Col 3 (right, minimal): trailing punctuation (`,` on every row). Right-aligned.
- **Generous column gutters.** The three columns sit far apart, with large empty regions between them. The spaces read as part of the composition, not as wasted room.
- **Title words occupy the upper half during scatter.** Only one title fragment (`WE` in frame 000) breaks into the lower half; after that, the scatter state visibly "floats" near the top. The bottom half is reserved for the body grid.
- **No leading change.** Even during the scatter/condense motion of the title, the word sizes do not change; they only reposition.
- **No image. No ornament.** Pure typographic poster. The entire visual force comes from letterforms in space.

### 2.4 Color note

The ground color reads as warm ochre / mustard ≈ `#D3A021` — more saturated than safety-yellow, less orange than amber. Paired with pure black text. High contrast, not punchy. A single chromatic chord plus black. This is NOT a neutral/monochrome-gray palette — it is an overt color choice used with the same restraint.

### 2.5 Transferable principles

- **Constant baseline grid is the "line height" trait.** The user's stated love of "consistent line heights" is specifically this: every row of body text — regardless of content length or column position — occupies exactly one leading unit. This is a baseline-grid discipline, not a typeface choice.
- **3-column grid with punctuation as its own column.** Generous gutters between function (connective), content (subject), and punctuation (rhythm). Turns what would be a run-on sentence into a visually countable stack.
- **Scatter-into-place as compositional motion.** When animation is used, it should be word-level repositioning against a fixed grid, not character-level. Objects migrate along stable axes; they do not morph, scale, or rotate.
- **Monotype serif-only can carry a whole design if the grid is disciplined.** You do not need pair contrast to separate title from body — case changes + scale + position are enough.
- **Color as an assignable surface, not a decoration.** A single warm ground + black type reads more confident than a pile of accent colors. Use color as a whole-field chord.
- **Bottom-up body accumulation + top-down title condensation.** These two motions meet in the middle — creates a gathered-composition feeling that literally matches "how can we gather now".

### 2.6 What should stay reference-only

- The exact scatter-to-align motion is specific enough to the poster's theme (gathering) that copying it wholesale would borrow the concept, not just the technique. Use the baseline-grid principle and the 3-column punctuation idea; design a different motion that suits `whatarewecapableof.com`'s own subject.
- The square 1:1 aspect ratio is poster-specific; for a site, the grid behavior matters more than the square format.

---

## 3. Comparison of the two GIFs

| Trait | GIF 1 (MWRC) | GIF 2 (How Can We Gather Now?) |
|-------|--------------|-------------------------------|
| Type system | Mono + Serif pair | Serif only |
| Case | Mono ALL CAPS / serif sentence case | ALL CAPS title / sentence body |
| Color | Black on white | Black on mustard ochre |
| Alignment axis | Single centered vertical axis | 3-column grid, left-biased |
| Motion primitive | Character-level cipher + horizontal justification | Word-level vertical repositioning |
| Line-height behavior | Fixed baseline across all states | Fixed baseline across all rows |
| Density transitions | Sparse ↔ sparse (text never crowds) | Sparse ↔ dense (content accumulates) |
| Loop style | Tight cyclical (scramble → resolve → reset) | Long cycle with deposition/exhale |
| Role of whitespace | Frame around a single lockup | Structural gutters between columns |
| Motion feels like | A signal decrypting | A poster assembling itself |
| Signature gesture | Justify-to-edges | Scatter-to-grid |

**Common ground:**

1. **Baseline/line-height discipline is non-negotiable in both.** Letters, spaces, and columns can rearrange, but the vertical rhythm is fixed. This is the single strongest inherited principle.
2. **No imagery.** Both GIFs rely entirely on type and space.
3. **Monotone palettes.** Each uses exactly one ground color + black, no gradients, no accents.
4. **Typography as the whole composition.** Scale, case, position, and timing carry all meaning.
5. **Motion serves hierarchy.** Animation is not decorative atmosphere; it reveals and re-reveals the information order.
6. **Restrained total glyph count.** Neither GIF loads the frame with dense blocks of text — there is always room around each element.

**Productive tension between them:**

- GIF 1 centers everything on one axis; GIF 2 uses a 3-column grid. Both are viable structures. The future site must pick its grid; it cannot do both at once without getting muddy. The better choice for a two-person partnership with content that will accrue over time is closer to GIF 2's multi-column grid — it scales. GIF 1's single-axis composition is better for a wordmark moment (a landing or intro lockup) than for browseable content.
- GIF 1 pairs mono + serif; GIF 2 uses serif only. Production resolves the tension as Geist Mono for metadata / navigation / identifiers and system UI for body prose, while taking grid discipline from GIF 2.

---

## 4. Implications for whatarewecapableof.com

**Strong, keep:**

- System UI + Geist Mono role split as the type system, translated from GIF 1's two-role prompt.
- A locked vertical baseline grid for body text, shared across columns and across sections (from GIF 2).
- A three-column layout pattern where punctuation or metadata lives in its own column (from GIF 2). E.g. a short left column for role/label, a wide center column for content, a narrow right column for date/status/tag.
- Monochrome or one-color-plus-black palette. Not gray-white-only. A chosen warm or cool ground works if used with GIF 2's discipline.
- Letterspacing as an actionable axis. Resting tight, expanding to edge-of-column in specific moments (from GIF 1).
- Hold time. Animations should spend most of their duration at rest; motion is punctuation, not ambience.

**Strong, avoid:**

- The literal character-scramble cipher. Over-saturated as an "agency site" trope. The principle transfers (letter-level mono animation); the exact visual does not.
- Per-element motion that rotates, scales, or tweens opacity for its own sake. Motion here is positional, not stylistic.
- Multiple typefaces or multiple weights. Both references use one or two faces and essentially one weight.
- Imagery. Both motion references commit fully to image-absence. Introducing photography to the site without a clear role will weaken the typographic stance.
- Centering everything. Center-axis works for a single lockup moment (GIF 1), not for structured content. Default to left-aligned with grid columns; reserve center for titles or signature moments.

**What motion feels native to this direction:**

- Word-level repositioning into a grid (GIF 2).
- Character-level letterspacing expansion on a fixed baseline (GIF 1).
- Appearance/disappearance by row, respecting the baseline grid.
- Durations on the order of 4–8 seconds per cycle; long hold poses between transitions.

**What motion should NOT be native:**

- Fades, scale-up entrances, parallax, ease-out bounces, scroll-driven kinetic type.
- Hover-triggered jitter. The references do not twitch.
- Random noise or flicker effects.

