# FDE Media Slots

Slot map for the Faith Driven Entrepreneur campus initiative proposal.

Are.na channel: [FDE Media](https://www.are.na/what-are-we-capable-of/fde-media) (currently empty, awaiting curation)

Graphic system briefs: `~/Projects/graphic-system/briefs/fde/`

## Slots

### FDE-01 / Overview atmosphere

- **Tab:** Overview
- **Anchor:** After intro paragraph, before stat row
- **Job:** Atmosphere
- **Source:** Are.na (`slot: FDE-01`)
- **Ratio:** 16:9
- **Suggestion:** Campus gathering, student community, or university setting. Something that places the reader in the world of the initiative before the numbers land.
- **Priority:** Medium
- **Status:** Awaiting Are.na curation

### FDE-02 / Growth trajectory numbers card

- **Tab:** Overview
- **Anchor:** After Finding 03 (student leadership), before Finding 04
- **Job:** Proof / Pause
- **Source:** Graphic system (`numbers-card` template)
- **Brief:** `briefs/fde/fde-02-growth.yml`
- **Ratio:** 16:9 (1920x1080)
- **Content:** "5 → 10" clubs, with supporting text about the build trajectory
- **Priority:** Medium
- **Status:** Brief written, awaiting render

### FDE-03 / Mission language quote

- **Tab:** Overview
- **Anchor:** After "What is already built" paragraph, before "What we would want to confirm"
- **Job:** Atmosphere / Proof
- **Source:** Graphic system (`quote-card` template)
- **Brief:** `briefs/fde/fde-03-mission-quote.yml`
- **Ratio:** 16:9 (1920x1080)
- **Content:** "A ruthless fervor to advance the mission for God's glory, not our own."
- **Priority:** High
- **Status:** Brief written, awaiting render

### FDE-04 / Leader development layers diagram

- **Tab:** Program
- **Anchor:** After the three leader development layers (Content, Opportunity, Coaching), before "Five touchpoints"
- **Job:** Diagram
- **Source:** Graphic system (`diagram-card` template)
- **Brief:** `briefs/fde/fde-04-leader-layers.yml`
- **Ratio:** 16:9 (1920x1080)
- **Content:** Three columns: Content (curriculum in community), Opportunity (lead real gatherings), Coaching (bi-weekly with entrepreneurs)
- **Priority:** Medium
- **Status:** Brief written, awaiting render

### FDE-05 / Yearly rhythm diagram

- **Tab:** Program
- **Anchor:** After the five touchpoints table, before "Operating principle"
- **Job:** Diagram
- **Source:** Graphic system (`diagram-card` template) or text-first HTML diagram using `proposal-diagram` primitive
- **Brief:** `briefs/fde/fde-05-yearly-rhythm.yml`
- **Ratio:** 16:9 (1920x1080)
- **Content:** Five touchpoints mapped across the academic year: weekly gatherings as baseline pulse, bi-weekly coaching, semester events, national cohorts, yearly conference
- **Priority:** High
- **Status:** Brief written, awaiting render
- **Note:** This is the single highest-value visual in the proposal. The touchpoints table asks the reader to hold five rhythms simultaneously; the diagram makes them spatial.

### FDE-06 / Build timeline process strip

- **Tab:** Investment
- **Anchor:** After the three-phase plan, before the deliverables table
- **Job:** Sequence
- **Source:** In-page HTML using `proposal-process-strip` primitive
- **Ratio:** N/A (horizontal strip)
- **Content:** 3 steps: Recruit and build (now through Dec 2026) → Launch (Jan 2027) → Scale (Sep 2027)
- **Priority:** Medium-high
- **Status:** Can be implemented directly in HTML, no external asset needed

### FDE-07 / Church partnership atmosphere

- **Tab:** Investment
- **Anchor:** After investment paragraph, before "What a conversation would confirm"
- **Job:** Atmosphere
- **Source:** Are.na (`slot: FDE-07`)
- **Ratio:** 16:9
- **Suggestion:** Church community, mentor relationship, or local partnership visual. Something that grounds the investment ask in the real world it serves.
- **Priority:** Low
- **Status:** Awaiting Are.na curation

## Cut or defer

- **Full campus rollout map:** Speculative without knowing the first 5 campuses. Risks overpromising geography.
- **Launch playbook artifact mockup:** The playbook doesn't exist yet. Mocking it too specifically overpromises.
- **J.D. Greear / Henry Kaestner curriculum screenshot:** No access to the video series. Defer to conversation follow-up.
- **Student director profile card:** Too early, risks being generic.

## Implementation order

1. Graphic system renders (FDE-02, FDE-03, FDE-04, FDE-05)
2. In-page process strip (FDE-06)
3. Are.na atmosphere images when curated (FDE-01, FDE-07)
