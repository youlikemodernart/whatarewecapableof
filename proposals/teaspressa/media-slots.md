# Teaspressa media slots

This is the curation map for adding visual rhythm to the Teaspressa proposal. The slots are prompts, not a rigid template. A slot can be filled, changed, merged, or cut if the selected imagery does not earn its place.

Visual board: `proposals/teaspressa/slots/index.html` local-only while collecting and ignored by git.

Structured manifest: `proposals/teaspressa/media-slots.json`

Current direction: the local board should look like the proposal itself, with grey image frames placed in the reading flow. Use it to judge cadence before choosing final images.

Default frame: one body-width image or simple video. Start with 16:9. Use 4:3, 7:5, or 5:7 only when the surrounding text asks for it. Do not jump to diptychs, triptychs, or specimen grids unless Noah asks for that layout or one image cannot carry the point.

For Teaspressa, images may work as loose atmosphere. They do not need to prove the adjacent sentence. The placeholder copy should suggest what could go there, but the most important thing is seeing the frame exactly where it would live on the page.

Live Teaspressa proposal images intentionally have no visible captions. Keep descriptive alt text. Do not re-add figcaptions unless Noah asks.

Raw pulled Are.na assets live in `proposals/teaspressa/img/src/arena/`. Shopify wholesale scrape, contact sheets, tiles, and rough collage outputs live in `proposals/teaspressa/img/src/wholesale-products/`. Web-ready final crops should live in `proposals/teaspressa/img/`. Keep raw source files so framing can be adjusted without re-pulling.

To view the board locally:

```bash
cd ~/Projects/whatarewecapableof
python3 -m http.server 8888
```

Open:

```txt
http://localhost:8888/proposals/teaspressa/slots/
```

If the URL does not connect, check whether the local server is running. Do not commit or push this board while it is local-only.

## How to use this while collecting on Are.na

When you save an image, screenshot, video, or reference, add a short label to the block title or description. The most useful field is the slot ID.

Example:

```txt
slot: TS-04
section: subscription
job: proof
move: evidence plate
priority: high
note: Empty subscription page, supports Finding 03.
```

You can use only the slot line if you want to move quickly:

```txt
slot: TS-07
```

If an image could fit more than one place, use multiple slot lines:

```txt
slot: TS-01
slot: TS-07
```

## Slot index

| Slot | Name | Priority | What to collect |
|---|---|---:|---|
| TS-01 | Product world opener | Medium | Product, packaging, drink use, retail display, seasonal collection. |
| TS-02 | Wholesale buyer path | High | Live after Finding 01; single 16:9 image. |
| TS-03 | Analytics stack diagram | High | Deferred for now unless a diagram is requested. |
| TS-04 | Empty subscription infrastructure | High | Live after Finding 03; single 16:9 seasonal campaign image. |
| TS-05 | TikTok effort versus traction | Medium | TikTok profile, video grid, representative thumbnails. |
| TS-06 | Wedding and corporate inquiry flow | Medium | Wedding Shop, corporate gifting, custom kit or quote flow material. |
| TS-07 | Merchandising strength | High | Live after What's working; single 16:9 retail guide image. |
| TS-08 | Wholesale buyer tool artifact | Medium | Future-only reference; Scope Area 1 placeholder removed from the local draft before publish. |
| TS-09 | Seasonal subscription possibility | Low | Seasonal rotation, subscription ritual, limited flavor or box references. |
| TS-10 | Connected measurement path | Medium | No image required. Generated diagram from tool stack and scope. |
| TS-11 | Research catalog breath | Medium | Live in Research after Product catalog as 120-image product-only edge-to-edge wholesale collage. |

## Slot details

### TS-01: Product world opener

- Placement: after the opening company paragraph and before the stat row, or after the stat row if the numbers should land first.
- Beat: Recognition.
- Job: Atmosphere.
- Move: Specimen grid or quiet evidence plate.
- Need: three to six images that make the Luxe Mixer Cube system immediately legible.
- Select for: product system, packaging, use, retail context, seasonal range.
- Avoid: stock-feeling cocktail images, founder portraits, images where the product is not visible.

Are.na tags:

```txt
slot: TS-01
section: product
job: atmosphere
move: specimen grid
```

### TS-02: Wholesale buyer path

- Placement: after Finding 01 in Summary, with possible reuse or expansion in Scope Area 1.
- Beat: Evidence.
- Job: Proof.
- Move: single body-width image placeholder by default.
- Need: a strong image near the wholesale/product-system claim. This can be atmosphere first; a proof screenshot can replace it if stronger.
- Live asset: `proposals/teaspressa/img/ts-02-wholesale-guide.jpg`.
- Visible caption: none, per Noah's request.
- Source asset: `proposals/teaspressa/img/src/arena/ts-02-wholesale-guide-45589756.png`.
- Select for: visible wholesale flow, login-gated structure, case-pack specificity, line-sheet or reorder implications.
- Avoid: product images that do not show wholesale flow, unreadable screenshots, over-cropped fragments.

Are.na tags:

```txt
slot: TS-02
section: wholesale
job: proof
move: evidence plate
priority: high
```

### TS-03: Analytics stack diagram

- Placement: after Finding 02 in Summary or at the start of Scope Area 3.
- Beat: Interpretation.
- Job: Diagram.
- Move: System diagram.
- Need: no external image required. The diagram should show six tools collecting independently: GA4, Hotjar, Clarity, Facebook Pixel, Klaviyo, Postscript.
- Select for: if you collect references, collect simple text-first system diagrams, not logo clouds.
- Avoid: generic funnels, logo clouds, fake dashboards.

Are.na tags for references:

```txt
slot: TS-03
section: analytics
job: diagram
move: system diagram
```

### TS-04: Empty subscription infrastructure

- Placement: after Finding 03 in Summary.
- Beat: Evidence.
- Job: Proof.
- Move: single body-width image placeholder by default.
- Need: seasonal product world, subscription ritual, or empty subscription page screenshot if proof is stronger.
- Live asset: `proposals/teaspressa/img/ts-04-seasonal-campaign.jpg`.
- Visible caption: none, per Noah's request.
- Source asset: `proposals/teaspressa/img/src/arena/ts-04-mothers-day-45587982.webp`.
- Select for: absence made visible, factual framing, seasonal product potential.
- Avoid: mocked subscription design before approval, anything that implies an active subscription offer if one does not exist.

Are.na tags:

```txt
slot: TS-04
section: subscription
job: proof
move: evidence plate
priority: high
```

### TS-05: TikTok effort versus traction

- Placement: after Finding 04 in Summary or inside Research under Content and social.
- Beat: Evidence.
- Job: Proof.
- Move: Evidence plate or quiet stat field.
- Need: TikTok profile screenshot, representative video grid, or three thumbnails showing production volume and hook pattern.
- Select for: volume of effort, clear profile metadata, representative content pattern.
- Avoid: picking weak individual videos just to make the critique harsher.

Are.na tags:

```txt
slot: TS-05
section: tiktok
job: proof
move: evidence plate
```

### TS-06: Wedding and corporate inquiry flow

- Placement: after Finding 05 in Summary or inside Scope Area 2.
- Beat: Interpretation.
- Job: Sequence.
- Move: Process strip or diptych.
- Need: Wedding Shop and corporate gifting page screenshots, plus custom kit or gifting imagery if it clarifies the vertical.
- Select for: page flow, manual quote implication, higher-order buyer value.
- Avoid: generic wedding mood imagery, full custom quoting UI mockup unless approved.

Are.na tags:

```txt
slot: TS-06
section: wedding
section: corporate
job: sequence
move: process strip
```

### TS-07: Merchandising strength

- Placement: inside What's working, after the paragraph on 100 plus collections and seasonal rotation.
- Beat: Recognition.
- Job: Specimen.
- Move: single body-width image placeholder by default.
- Need: one strong merchandising image that shows taste, seasonality, product range, or retail intelligence.
- Live asset: `proposals/teaspressa/img/ts-07-valentines-retail-guide.jpg`.
- Visible caption: none, per Noah's request.
- Source asset: `proposals/teaspressa/img/src/arena/ts-07-valentines-retail-guide-45589884.jpg`.
- Select for: distinct merchandising logics such as drink type, season, occasion, gift, retail, flavor.
- Avoid: six images that all say the same thing.

Are.na tags:

```txt
slot: TS-07
section: merchandising
job: specimen
move: specimen grid
priority: high
```

### TS-08: Wholesale buyer tool artifact

- Placement: Future only. The Scope tab placeholder after Area 1 was removed from the local draft before publish.
- Beat: Possibility.
- Job: Artifact/reference.
- Move: single body-width image placeholder by default.
- Need: line sheet, buyer guide, reorder tool, seasonal wholesale preview, retail catalog reference, or buyer-facing sales tool.
- Select for: buyer-facing clarity and usefulness.
- Avoid: another Teaspressa product mood image, SaaS dashboards, generic ecommerce screenshots, overdesigned line sheets that fight the WARWCO register.

Are.na tags:

```txt
slot: TS-08
section: wholesale
job: artifact
move: single image
```

### TS-09: Seasonal subscription possibility

- Placement: after Scope Area 2, only if recurring revenue needs a concrete visual object beyond TS-04.
- Beat: Possibility.
- Job: Artifact.
- Move: Specimen or evidence plate.
- Need: seasonal rotation, limited flavors, subscription boxes, or recurring product ritual references.
- Select for: subscription logic, product cadence, seasonal anticipation.
- Avoid: generic subscription box inspiration.

Are.na tags:

```txt
slot: TS-09
section: subscription
section: seasonal
job: artifact
move: specimen grid
```

### TS-10: Connected measurement path

- Placement: after Scope Area 3 or before What a conversation would look like.
- Beat: Offer.
- Job: Diagram.
- Move: System diagram.
- Need: no external image required. Generate a diagram showing independent tools becoming a shared measurement layer.
- Select for: if collecting references, find simple measurement architecture diagrams or annotated event-flow examples.
- Avoid: fake data dashboards, overly technical implementation diagrams.

Are.na tags for references:

```txt
slot: TS-10
section: analytics
job: diagram
```

### TS-11: Research catalog breath

- Placement: Research tab, after the Product catalog table and the paragraph about 152 products and seasonal collections.
- Beat: Evidence.
- Job: Atmosphere.
- Move: single edge-to-edge collage preview generated from Shopify wholesale product images.
- Need: review the 120-image product-only edge-to-edge collage and decide whether the accessory-free version is stronger than the denser A+B comparison.
- Source manifest: `proposals/teaspressa/img/src/wholesale-products/manifest.json`.
- Contact sheet for review: `proposals/teaspressa/img/src/wholesale-products/contact-sheets/clean-candidates-top-40.jpg`.
- Live asset: `proposals/teaspressa/img/ts-11-wholesale-product-collage.jpg`.
- Visible caption: none, per Noah's request.
- Source rough asset: `proposals/teaspressa/img/src/wholesale-products/collages/ts-11-wholesale-product-collage-120up-products-cubes-top-v2-edge-15x8.jpg`.
- Source rough manifest: `proposals/teaspressa/img/src/wholesale-products/collages/ts-11-wholesale-product-collage-120up-products-cubes-top-v2-edge-15x8.json`.
- Previous sorted asset: `proposals/teaspressa/img/src/wholesale-products/collages/ts-11-wholesale-product-collage-120up-products-sorted-edge-15x8.jpg`.
- Previous unsorted product-only asset: `proposals/teaspressa/img/src/wholesale-products/collages/ts-11-wholesale-product-collage-120up-products-no-t-edge-15x8.jpg`.
- Dense comparison asset: `proposals/teaspressa/img/src/wholesale-products/collages/ts-11-wholesale-product-collage-169up-ab-no-t-edge-13x13.jpg`.
- Earlier rough assets: `ts-11-wholesale-product-collage-176up-edge-16x11.jpg`, `ts-11-wholesale-product-collage-160up-edge-16x10.jpg`, and `ts-11-wholesale-product-collage-180up-edge-15x12.jpg`.
- Status: live in `proposals/teaspressa/index.html`; generated from A-clean/B-usable product images, excluding sample/T-logo placeholders, obvious accessories, glassware, signage, and display fixtures. The sorted grid groups rows by product family with the narrow stick and mini cube packs in the top rows, then tea line, then kits/gifts/boxed collections, then tallboys. The tiles use tight square crops and no gutters, strokes, or borders.
- Select for: catalog breadth, product clarity, seasonal merchandising, ability to give the Research tab air before the wholesale and technology sections.
- Avoid: another image that repeats an existing Summary image, tiny product details that do not read at text width, overly decorative campaign images.

Are.na tags:

```txt
slot: TS-11
section: product catalog
job: atmosphere
move: single image
```

## Selection rule

Collect more than we use. The proposal should probably use five or fewer visual insertions unless the page clearly asks for more. Current live placements are:

1. TS-02: Wholesale buyer path, Summary
2. TS-04: Empty subscription infrastructure, Summary
3. TS-07: Merchandising strength, Summary
4. TS-11: Research catalog breath, Research

TS-08 is parked for a future pass; the Scope-tab placeholder was removed before publish.

Then consider TS-03, TS-05, or TS-06 only if the page still needs clarity, rhythm, or proof.
