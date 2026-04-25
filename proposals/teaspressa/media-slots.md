# Teaspressa media slots

This is the curation map for adding visual rhythm to the Teaspressa proposal. The slots are prompts, not a rigid template. A slot can be filled, changed, merged, or cut if the selected imagery does not earn its place.

Visual board: `proposals/teaspressa/slots/index.html` local-only while collecting and ignored by git.

Structured manifest: `proposals/teaspressa/media-slots.json`

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
| TS-02 | Wholesale buyer path | High | Wholesale store, login gate, case-pack view, buyer-facing material. |
| TS-03 | Analytics stack diagram | High | No image required. Generated diagram from known tool stack. |
| TS-04 | Empty subscription infrastructure | High | Empty subscription page screenshot, optional seasonal product contrast. |
| TS-05 | TikTok effort versus traction | Medium | TikTok profile, video grid, representative thumbnails. |
| TS-06 | Wedding and corporate inquiry flow | Medium | Wedding Shop, corporate gifting, custom kit or quote flow material. |
| TS-07 | Merchandising strength | High | Six images showing different merchandising logics. |
| TS-08 | Wholesale buyer tool artifact | Medium | References for line sheets, reorder tools, mobile buyer pages, catalog pages. |
| TS-09 | Seasonal subscription possibility | Low | Seasonal rotation, subscription ritual, limited flavor or box references. |
| TS-10 | Connected measurement path | Medium | No image required. Generated diagram from tool stack and scope. |

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
- Move: Evidence plate or diptych.
- Need: screenshots or images showing the wholesale store, login gate, case-pack product view, or buyer-facing wholesale material.
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
- Move: Evidence plate.
- Need: screenshot of the empty subscription page and, if helpful, a related seasonal product or collection image.
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
- Move: Specimen grid.
- Need: six product, collection, retail, or seasonal images that demonstrate Teaspressa's merchandising system.
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

- Placement: after Scope Area 1, once wholesale buyer tools have been introduced.
- Beat: Possibility.
- Job: Artifact.
- Move: Document excerpt or artifact plate.
- Need: references for wholesale line sheets, retail buyer tools, mobile reorder experiences, or campaign catalog pages.
- Select for: buyer-facing clarity and usefulness.
- Avoid: SaaS dashboards, generic ecommerce screenshots, overdesigned line sheets that fight the WARWCO register.

Are.na tags:

```txt
slot: TS-08
section: wholesale
job: artifact
move: document excerpt
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
move: system diagram
```

## Selection rule

Collect more than we use. The proposal should probably use four to six visual insertions, not all ten slots. The high-priority slots to fill first are:

1. TS-02: Wholesale buyer path
2. TS-04: Empty subscription infrastructure
3. TS-07: Merchandising strength
4. TS-03: Analytics stack diagram, generated from known facts

Then consider TS-05 and TS-06 if the page still needs rhythm or proof.
