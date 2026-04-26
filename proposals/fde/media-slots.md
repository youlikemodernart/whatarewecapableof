# FDE Media Slots

Slot map for the Faith Driven Entrepreneur campus initiative proposal.

Are.na channel: [FDE Media](https://www.are.na/what-are-we-capable-of/fde-media)

Graphic system briefs: `~/Projects/graphic-system/briefs/fde/`

## Final slot map

### FDE-01 / Overview atmosphere

- **Tab:** Overview
- **Anchor:** After intro paragraph, before stat row
- **Job:** Atmosphere
- **Source:** Are.na, Omar Prestwich dune image
- **Deployable asset:** `proposals/fde/img/fde-01-atmosphere.jpg`
- **Ratio:** 3:2 source, displayed fluid in proposal column
- **Status:** Live
- **Note:** Establishes the proposal world before the first stat row.

### FDE-02 / Growth trajectory numbers card

- **Tab:** Overview
- **Anchor:** After Finding 03, before Finding 04
- **Job:** Proof / Pause
- **Source:** Graphic system, `numbers-card` template
- **Brief:** `~/Projects/graphic-system/briefs/fde/fde-02-growth.yml`
- **Deployable assets:**
  - `proposals/fde/img/fde-02-growth.jpg`
  - `proposals/fde/img/fde-02-growth-mobile.jpg`
- **Content:** 5-to-10 arrow for first-year growth. Five by January 2027. Ten by September 2027. Launch playbook after that.
- **Status:** Regenerated and live
- **Override log:** Rebuilt as a type-led profile graphic instead of using the mountain image as a full background. The earlier mountain-poster direction overdramatized the proof point. The live version keeps the claim clear and operational.

### FDE-03 / Birds and sunset atmosphere

- **Tab:** Overview
- **Anchor:** After "What is already built" paragraph, before "What we would want to confirm"
- **Job:** Atmosphere
- **Source:** Are.na, birds in formation at sunset
- **Deployable asset:** `proposals/fde/img/fde-03-birds.jpg`
- **Content:** Plain image, no generated quote overlay.
- **Status:** Live
- **Override log:** Removed the generated quote card and mobile quote card from the live proposal. Noah asked for the birds and sunset image to appear as a plain image.

### FDE-08 / Program atmosphere

- **Tab:** Program
- **Anchor:** After Program opening paragraph, before Leader development framework
- **Job:** Atmosphere
- **Source:** Are.na / Unsplash, Sam Balye prayer image
- **Deployable asset:** `proposals/fde/img/fde-08-prayer.jpg`
- **Ratio:** 3:2
- **Status:** Live
- **Override log:** Replaced the earlier outdoor group image because it read more outdoorsy than entrepreneurial or formative.

### FDE-10 / Program community image

- **Tab:** Program
- **Anchor:** After the three leader development layers, before "Five touchpoints"
- **Job:** Atmosphere / student movement
- **Source:** Are.na / Unsplash, Cody Silver community walk image tagged FDE-10
- **Deployable asset:** `proposals/fde/img/fde-10-community.jpg`
- **Ratio:** 3:2
- **Status:** Live
- **Override log:** Replaced the generated "Formation has layers" graphic. The diagram repeated the adjacent layer descriptions and brought in a large serif treatment that did not match the live whatarewecapableof page aesthetic. The FDE-10 image keeps the Program section human and campus-specific before the touchpoints table.

### FDE-05 / Yearly rhythm diagram

- **Tab:** Program
- **Anchor:** After the five touchpoints table, before "Operating principle"
- **Job:** Diagram / Working memory reduction
- **Source:** Graphic system, `diagram-card` template, `rhythm` kind
- **Brief:** `~/Projects/graphic-system/briefs/fde/fde-05-yearly-rhythm.yml`
- **Deployable assets:**
  - `proposals/fde/img/fde-05-yearly-rhythm.jpg`
  - `proposals/fde/img/fde-05-yearly-rhythm-mobile.jpg`
- **Content:** Weekly gatherings, biweekly coaching, semester events, national cohorts, annual conference.
- **Status:** Regenerated and live
- **Note:** This remains the highest-value diagram. The table asks the reader to hold five cadences at once; the diagram makes cadence visible through mark density and position. The current render is compact, left-aligned, no-serif, and profile-driven through `~/Projects/whatarewecapableof/design/taste-profile/profile.md`. All marks now sit on a shared 32-week axis. The weekly cadence uses 32 heavier baseline marks. Biweekly coaching uses 16 marks aligned to every other weekly mark; the earlier render incorrectly matched the weekly count because the template checked `weekly` before `biweekly`.
- **Text equivalent:** The adjacent HTML touchpoints table carries the detailed alternative.

### FDE-06 / Build timeline

- **Tab:** Investment
- **Anchor:** After the three-phase plan, before Deliverables
- **Job:** Sequence
- **Source:** In-page HTML using the shared `.proposal-process-timeline` primitive
- **Ratio:** N/A
- **Content:** Recruit and build, Launch, Scale
- **Status:** Live
- **Note:** Uses the shared vertical timeline primitive. The earlier horizontal process strip was rejected because the off-screen third step had no reliable scroll affordance.

### FDE-09 / Investment atmosphere

- **Tab:** Investment
- **Anchor:** After the Investment opening paragraph, before "Three-phase plan"
- **Job:** Atmosphere / Human presence
- **Source:** Are.na, Vitaly Gariev entrepreneur image
- **Deployable asset:** `proposals/fde/img/fde-09-entrepreneur.jpg`
- **Ratio:** 16:9 crop from 1080x608 source
- **Status:** Live
- **Decision:** Kept. Noah likes it for now.

### FDE-14 / Investment section image

- **Tab:** Investment
- **Anchor:** After the deliverables table, before the "Investment" section heading
- **Job:** Section reset / student presence
- **Source:** Are.na / Unsplash, Vitaly Gariev classroom image tagged FDE-14
- **Deployable asset:** `proposals/fde/img/fde-14-classroom.jpg`
- **Ratio:** 16:9 crop from 1080x608 source
- **Status:** Live
- **Decision:** Replaces the horizontal rule before the Investment heading. The image supplies the section break, and the shared media-to-heading rule suppresses the redundant heading rule.

## Removed slots

### FDE-04 / Leader development layers diagram

- **Former tab:** Program
- **Former anchor:** After the three leader development layers, before "Five touchpoints"
- **Former deployable assets:**
  - `proposals/fde/img/fde-04-leader-layers.jpg`
  - `proposals/fde/img/fde-04-leader-layers-mobile.jpg`
- **Former brief:** `~/Projects/graphic-system/briefs/fde/fde-04-leader-layers.yml`
- **Status:** Removed from live markup and removed from active graphic-system briefs after Noah asked to replace it with an image.
- **Decision:** The generated layer diagram repeated adjacent text and introduced a bookish serif treatment. The Program section now uses FDE-10 as the visual break.

### FDE-07 / Cross at dusk

- **Former tab:** Investment
- **Former anchor:** Before Investment heading
- **Former deployable asset:** `proposals/fde/img/fde-07-cross.jpg`
- **Status:** Removed from live markup and removed from tracked deployable assets after confirming no references remained.
- **Decision:** The cross made the Investment section feel spiritually manipulative. The Investment section should remain operational: plan, deliverables, stat row, terms, and confirmation questions.

## Visual count exception

The default proposal composition target is 3 to 5 visual moments. FDE remains a documented exception with 9 visual moments:

1. FDE-01 overview atmosphere
2. FDE-02 growth card
3. FDE-03 birds and sunset atmosphere
4. FDE-08 program atmosphere
5. FDE-10 program community image
6. FDE-05 yearly rhythm diagram
7. FDE-06 investment timeline
8. FDE-09 investment atmosphere
9. FDE-14 investment section image

Rationale: each tab has a different cadence problem. Overview needs proof and mission atmosphere after a dense argument start. Program needs one human campus image between the formation model and the touchpoints table, plus one cadence diagram for the yearly rhythm. Investment needs the timeline to keep the rollout operational, one human image before the plan, and one student-presence image to reset the Investment section without a hard rule. The removed FDE-07 cross is the cut that keeps the Investment section from becoming emotionally coercive.

## Cut or defer

- **Full campus rollout map:** Speculative without knowing the first 5 campuses. Risks overpromising geography.
- **Launch playbook artifact mockup:** The playbook does not exist yet. Mocking it too specifically overpromises.
- **J.D. Greear / Henry Kaestner curriculum screenshot:** No access to the video series. Defer to conversation follow-up.
- **Student director profile card:** Too early, risks being generic.
- **FDE-04 leader-layers graphic:** Removed from live use. The image replacement fits the page better.
- **FDE-07 cross:** Removed for tone.
