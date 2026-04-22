# Claude visual analysis task: whatarewecapableof taste profile

Working directory: `/Users/noah/Projects/whatarewecapableof`

## Goal

Build a deep visual analysis packet for the taste profile work on `whatarewecapableof.com`.

This is analysis only. Do not modify site code. Do not redesign the site yet.

The main agent will use your analysis to build the structured taste profile and system constraints.

## Source input

Read this file first:
- `./taste-profile-042126.md`

## Output files

Write all findings to these files:
- `./design/handoffs/claude-reference-analysis.md`
- `./design/handoffs/claude-motion-frame-analysis.md`
- `./design/handoffs/claude-raw-extraction-notes.md`

If you save screenshots or downloaded source assets, place them under:
- `./design/reference-analysis/`

## Priority and weighting

Weight your own extraction and visual observation more heavily than the user's comments.
The comments are directional, but your job is to identify what is actually present in the references.

Focus on:
- layout character
- typography character
- spacing and density
- hierarchy behavior
- image absence or restraint
- the use of type as form
- color restraint
- motion in typography
- what patterns repeat across the reference set
- what should be treated as primary vs supporting influences

## Required analysis standard

Be very thorough about scraping the URLs for info.

For live websites, do not just glance at the homepage. Scrape and inspect them carefully.

For each live site:
1. Visit the homepage.
2. Inspect the global navigation and site structure.
3. Visit the most representative interior pages available from the main navigation.
4. For `ellenole.com`, inspect more than the about page. Check the broader site and note recurring patterns.
5. For `loladementmyers.com`, inspect enough pages to understand whether the homepage style persists or changes.
6. For `loyalgallery.com`, inspect homepage plus representative internal views if available.
7. On each site, capture screenshots at mobile, tablet, and desktop widths when the layout meaningfully changes.
8. Extract computed style data and CSS custom properties where available.
9. Record recurring measurements and patterns, not just impressions.
10. Note what appears constant across pages versus what is page-specific.

## Suggested browser procedure

Use the browser and devtools available in your environment.

For each live page you inspect:
1. Navigate to the page.
2. Wait for the page to settle.
3. Scroll enough to trigger lazy-loaded content.
4. Verify images are loaded before screenshotting.
5. Capture screenshots at approximately:
   - 375px wide
   - 768px wide
   - 1280px wide
6. Extract computed styles for major text elements and structural elements.
7. Save any useful raw notes to `./design/handoffs/claude-raw-extraction-notes.md`.

If useful, record data like:
- font families
- font sizes
- font weights
- line heights
- letter spacing
- text transform
- text color
- background color
- content width
- spacing rhythms
- presence of CSS variables

## Motion GIF analysis

There are two motion GIF references in the source note.

Analyze them frame by frame.

You do not need to describe duplicate frames one by one, but you do need to identify each distinct visual state and the transition logic between states.

For each GIF:
1. Download it locally if needed.
2. Extract frames or otherwise inspect the animation sequence carefully.
3. Describe:
   - typography used, including likely serif/monospace relationship
   - line-height behavior
   - alignment behavior
   - the motion system
   - pacing and rhythm
   - whether the motion clarifies hierarchy, creates form, or acts as atmosphere
   - what should transfer to the site and what should remain reference-only

## Image reference analysis

There are several static image references in the source note.

For each one:
- identify what it contributes
- say whether it is primary, supporting, or incidental
- note typography qualities, color logic, compositional moves, and any use of type as image or structure

## Deliverable structure

### `claude-reference-analysis.md`
Organize it like this:

1. Executive summary
2. Reference inventory
3. Live site analysis
   - site-by-site
   - page-by-page where relevant
4. Static image analysis
5. Cross-reference synthesis
6. Strongest recurring traits
7. Tensions or contradictions in the reference set
8. Primary influences
9. Supporting influences
10. Likely anti-patterns
11. Recommendations for the taste profile schema

For each reference, cover:
- what it contributes
- which pillars it most strongly influences: layout, typography, color, hierarchy, motion
- whether it should be weighted heavily, moderately, or lightly

### `claude-motion-frame-analysis.md`
Organize it like this:

1. GIF 1
   - distinct frame states
   - motion sequence
   - type system observations
   - transferable principles
2. GIF 2
   - distinct frame states
   - motion sequence
   - type system observations
   - transferable principles
3. Comparison of the two GIFs
4. Implications for `whatarewecapableof.com`

### `claude-raw-extraction-notes.md`
This can be rougher, but include:
- page URLs visited
- screenshots taken
- extracted style values
- CSS variable notes
- layout measurements if you captured them
- any browser observations that support the polished writeup

## Key judgment questions

Answer these clearly in the analysis:
- Is the dominant aesthetic editorial, institutional, personal, technical, or some mix?
- How restrained is the hierarchy?
- How much of the reference set depends on image absence?
- Where does typography carry the emotional and compositional load?
- Is the overall density sparse, measured, or severe?
- What kind of motion feels native to this direction?
- What should the future site avoid so it does not drift into generic minimalism?

## Constraints

- Analysis only.
- No site implementation.
- No rewriting `index.html`.
- Do not collapse everything into vague adjectives.
- Prefer concrete visual evidence over taste cliches.
- Save the work to the output files before finishing.
