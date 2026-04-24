# Sitemap — whatarewecapableof.com

Revised 2026-04-22. Production live at `whatarewecapableof.com` (merged from draft 2026-04-22). Vercel linked to GitHub; push to `main` auto-deploys.

---

## Structure

```
whatarewecapableof.com

/                           HOME ("What are we capable of?" links to /question/)
├── /question/              Ethos page: the firm's worldview (hidden link from homepage question)
├── /coach/                 Austin's coaching vertical
│   └── /coach/book         Custom booking tool (Google Calendar API)
├── /consult/               Shared advisory vertical
└── /creative/              Noah's design/build vertical

Footer-only (secondary):
  ABOUT                     /about/
  CONTACT                   email in footer text (no dedicated page unless needed)

Non-navigation (direct link only):
  /proposals/teaspressa/    Proof-of-insight proposal (noindex, nofollow)
```

---

## Page-by-page

### `/` — Home

**Layout:** Primitive A (single-column, left-anchored). One viewport, no scroll.

**Content:**
- "What are we capable of?" as the primary typographic element. Clickable (links to `/question/`) but with no visible link styling — no underline, no color change. Cursor change on hover is the only signal. Serif, `--size-m` or `--size-l`. Takes up 60-70% of the viewport. Breathes.
- Below the question: `COACH  CONSULT  CREATIVE` as three mono ALL CAPS links. No descriptions. The words are self-explanatory.
- Footer visible at bottom: `ABOUT` link + contact info (email).

**What's NOT on this page:**
- No one-liner about the agency (for now; revisit if the page feels incomplete once built).
- No descriptions of the three verticals.
- No images.
- No hero, no animation on first load (motion is optional, added later if a specific moment earns it).

> **Decision note (2026-04-22):** Starting with approach B — question + three words, no descriptions. If it feels too bare once built, the first thing to try is a single-sentence agency line between the question and the verticals. If it still needs more, short one-line descriptions under each vertical name. Add in that order; don't skip to the heavy version.

---

### `/question/` — Ethos

**Access:** Hidden link from the homepage. Clicking the question text navigates here. No visible link styling on the homepage; cursor change on hover is the only signal. This is the Lola `+` pattern: content that rewards engagement.

**Layout:** Primitive A, scrollable.

**Content:**
- The question's origin: Jason Jaggard, *Beyond High Performance*. Not rhetorical; a practice.
- How each founder carries it: Austin through coaching (BHP-certified), Noah through research and design.
- What happens when both operate together.
- Community section: a living document. Collaborators, thinkers, practitioners in the firm's orbit. Will grow as the firm takes shape and the BHP corpus develops.

**Distinction from /about:** `/about` is biographical (who they are as people). `/question/` is intellectual and communal (what the firm believes, what it's investigating, who's in the conversation).

**Content pipeline:** Noah is developing a BHP-inspired corpus in a separate session. That material feeds into the "question in practice" and "community" sections here. Expect this page to evolve more than any other as the firm's worldview sharpens.

---

### `/coach/` — Coaching vertical

**Owner:** Austin.

**Layout:** Primitive A, scrollable. Landing content at the top, portfolio/testimonials below (single page, scroll-through).

**Content structure:**
1. **Offering section** (above fold): what Austin coaches, who it's for, what someone gets. Mono metadata labels (ALL CAPS), serif prose.
2. **Work section** (scroll to reach): past engagements, testimonials, outcomes. Grows over time.
3. **CTA:** link to `/coach/book` ("Book a call" or similar, styled as mono text link, not a button).

> **Decision note (2026-04-22):** Portfolio is integrated into the landing page (scroll-through) rather than a separate `/coach/work` page. Revisit when Austin has 5+ distinct engagements worth showing — at that point, a dedicated `/coach/work` index may make more sense for navigation.

---

### `/coach/book` — Booking tool

**Layout:** Primitive A. Minimal.

**Implementation:** Custom Google Calendar API integration (not Calendly). See implementation notes below.

**Content:**
1. Brief context line: what happens when you book (serif, one sentence).
2. Date selection: next 10 available days in mono.
3. Time slots for the selected date: available windows as clickable mono text.
4. Booking form: name, email, optional note. Three fields.
5. Confirmation state after booking.

**What this is NOT:**
- Not a Calendly embed.
- Not a full scheduling platform.
- No multiple event types, no payment, no team scheduling.
- Just: pick a time on Austin's calendar → it gets booked → both parties get notified.

---

### `/consult` — Consulting vertical

**Owner:** Shared (Noah + Austin).

**Layout:** Primitive A, scrollable. Same structure as `/coach`: offering at top, work below.

**Content structure:**
1. **Offering section:** what the advisory engagement looks like, what a client gets, how coaching + research + digital presence combine under one firm.
2. **Work section:** research briefs, proof-of-insight deliverables, case studies (when nameable). This is where the consulting pipeline's output becomes visible.

Will grow children later (e.g., individual case study pages using Primitive B with two-column layout) once there's enough content to warrant them.

---

### `/creative` — Creative vertical

**Owner:** Noah.

**Layout:** Primitive A, scrollable. Landing at top, portfolio below.

**Content structure:**
1. **Offering section:** web design, implementation, digital presence strategy. What Noah builds and for whom.
2. **Work section:** past projects with images. **This is where image density lives.** Project images are allowed here (per the taste profile's rule: images as content on work pages, zero on chrome).

When individual projects have enough depth, they become child pages (`/creative/<project>`) using Primitive B (two-column: images left, description right). For now, the portfolio is integrated into the single scrolling page.

---

### `/about` — About

**Access:** Footer only. Not in the primary navigation with the three verticals.

**Layout:** Primitive A. One viewport if possible.

**Content (built 2026-04-22):**
- **Austin Rockwell:** Executive coach, organizational leader, Kamp Love founder. BHP-trained and certified.
- **Noah Glynn:** Research, design, implementation.
- **Contact:** `hello@whatarewecapableof.com`

Short paragraph bios. Mono section labels (ALL CAPS) for each person's name, serif prose for the bio. Contact as a third section below the bios.

Footer placement means visitors who want this page will find it; visitors who don't won't be distracted from the three verticals.

> **Format note:** The voice-memo option (Ellen Ole pattern) is still worth revisiting. The current text bios work as scaffolding but could evolve into audio, photography, or a more distinctive format once the firm's voice is clearer.

---

### Contact

**Access:** Footer only. Likely NOT a dedicated page — just text in the footer.

**Content:** `hello@whatarewecapableof.com` as a mailto link. Possibly Austin's email separately if coaching inquiries should route differently. Location if relevant.

If a contact form is ever needed, it becomes `/contact` as a minimal page. For now, footer text is sufficient. The booking tool at `/coach/book` handles the primary inbound path for coaching.

---

## Navigation model

**Primary nav** (visible on every page, top of viewport):

```
COACH    CONSULT    CREATIVE
```

Mono, ALL CAPS, `--size-s`, left-anchored. Active page gets `--color-accent` (blue). Comma-separated on mobile.

**Footer nav** (visible on every page, bottom):

```
ABOUT    hello@whatarewecapableof.com
```

Mono, ALL CAPS, `--size-s`. Email is a mailto link.

**No secondary nav in the header.** About and contact are footer-only. This keeps the header to exactly three items.

---

## Depth map

| Level | Pages | Layout |
|-------|-------|--------|
| 0 | `/` (home) | Primitive A, one viewport |
| 1 | `/coach`, `/consult`, `/creative` | Primitive A, scrollable (landing + integrated portfolio) |
| 2 | `/coach/book` | Primitive A, one viewport (booking tool) |
| 2 | `/creative/<project>` (future) | Primitive B (two-column: images + text) |
| 2 | `/consult/<case>` (future) | Primitive B (two-column: deliverable + context) |
| — | `/about` | Primitive A, one viewport, footer-access only |

Max depth: 2 from the primary nav. 3 counting home as level 0.

---

## Booking tool implementation notes (Google Calendar API)

**Scope:** Austin's primary Google Calendar, one event type (60-min call by default), 14 business days of availability, and Central time display.

**Stack:**
- Two Vercel serverless functions:
  - `GET /api/availability?date=YYYY-MM-DD` reads Austin's Google Calendar free/busy, returns open slots within business hours
  - `POST /api/book` double-checks availability, creates a calendar event with a Google Meet link, and sends invite emails to attendees
- Frontend: static HTML + vanilla JS (no framework needed for 3 fields and a time picker)
- Auth: Google service account with domain-wide delegation impersonating `austin@whatarewecapableof.com`; `BOOKING_CALENDAR_EMAIL` controls the impersonated calendar owner

**UI in the taste system:**
- Date display: mono, `--size-s`, ALL CAPS day names
- Time slots: mono, `--size-m`, clickable text (underline on hover per link rules)
- Form fields: serif labels, mono inputs, underline-below-input (no box border)
- Submit: `(BOOK)` in mono, parenthesized per the Ellen Ole button pattern
- Confirmation: serif sentence ("Booked. Check your email for the calendar invite.")
- Loading states: replace content with "..." or similar; no spinner animation

**Implemented:** Availability and booking use Vercel serverless functions plus `googleapis`. Booking creates events on Austin's primary calendar, adds the visitor and `austin@kamplove.org` as attendees, and creates a Google Meet link.

**Additional requirement (2026-04-22):** Booking events must also notify `austin@kamplove.org` (Austin's other email). Add as attendee on the created event so Google sends the invite there too.

**Resolved blocker (2026-04-24):** Google Workspace migration is complete, Austin has logged in, and domain-wide delegation can impersonate `austin@whatarewecapableof.com` for Calendar API access.

---

## Decisions log

| Decision | Made | Revisit trigger |
|----------|------|-----------------|
| Portfolio integrated into service landing pages (scroll-through) rather than separate `/work` pages | 2026-04-22 | When any vertical has 5+ portfolio items worth distinct pages |
| Homepage: question + three vertical names, no descriptions | 2026-04-22 | After first build — if it feels too bare, try adding a one-liner first, then per-vertical descriptions |
| About and contact in footer only, not in primary nav | 2026-04-22 | If user research shows visitors can't find about/contact |
| Custom booking tool (Google Calendar API) over Calendly | 2026-04-22 | If implementation takes >2 days or the UX isn't clean enough; Calendly inline embed is the fallback |
| Contact as footer text, not a dedicated page | 2026-04-22 | If a contact form or more complex routing (different inboxes per vertical) becomes necessary |
| Homepage question links to /question/ (no visible styling) | 2026-04-22 | If users don't discover the ethos page; consider a subtle hover effect |
| /question/ as ethos vs /about as biographical | 2026-04-22 | If the distinction confuses visitors |
| About page as text bios (scaffold) | 2026-04-22 | Voice memo, photography, or richer format when the firm's voice is clearer |
| URL pattern: always `<name>/index.html` for clean paths | 2026-04-22 | Permanent; `about.html` style 404s on Vercel |
