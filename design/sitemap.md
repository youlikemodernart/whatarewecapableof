# Sitemap — whatarewecapableof.com

Revised 2026-05-15. Production live at `whatarewecapableof.com`. Vercel linked to GitHub; push to `main` auto-deploys.

---

## Structure

```
whatarewecapableof.com

/                           HOME: name + focused AI systems tagline + email
├── /question/              Ethos page: direct route only, not linked from homepage
├── /coach/                 Legacy/direct coaching vertical, not linked from homepage
│   └── /coach/book         Austin coaching booking flow (Google Calendar API)
├── /consult/               Legacy/direct advisory vertical, not linked from homepage
├── /creative/              Legacy/direct design/build vertical, not linked from homepage
├── /about/                 Legacy/direct bios page, not linked from homepage
└── /book                   Discovery-call booking flow for proposal CTAs

Homepage contact:
  hello@whatarewecapableof.com as the only visible link

Non-navigation (direct link only):
  /tracker/                 Password-gated internal proposal tracker (noindex, nofollow)
  /proposals/teaspressa/    Proof-of-insight proposal (noindex, nofollow)
  /proposals/compassion/    Compassion Causes proposal (noindex, nofollow)
  /proposals/belhaus/       Belhaus proposal (noindex, nofollow)
  /proposals/fde/           Faith Driven Entrepreneur proposal (noindex, nofollow)
```

---

## Page-by-page

### `/` — Home

**Layout:** Primitive A (single-column, left-anchored). One viewport, no scroll.

**Content:**
- "What are we capable of?" as the primary typographic element. It is plain text, not a link. System UI via `--font-serif`, bumped one role step to `--size-l` for the current stripped homepage. The baseline remains 24px.
- `DEVELOPING SYSTEMS AND ARTIFICIAL INTELLIGENCE SOLUTIONS` as the focused positioning line. It sits in the old nav slot above the footer, using Geist Mono, ALL CAPS, `--size-s`, and the same apparatus scale as the footer email.
- Footer visible at bottom: `hello@whatarewecapableof.com` as the only homepage link.

**What's NOT on this page:**
- No `COACH / CONSULT / CREATIVE` nav.
- No About link.
- No hidden `/question/` link from the question text.
- No images.
- No hero, no animation on first load.

> **Decision note (2026-05-15):** The homepage was narrowed to name, focused AI systems positioning, and email because Noah wants the public offer to be more specific for now. Earlier vertical language made the firm feel broader than the current sales focus. Existing vertical and ethos routes remain in the repo as direct or legacy surfaces, but the homepage no longer advertises them.

---

### `/question/` — Ethos

**Access:** Direct route only in the current homepage iteration. The homepage question text is plain text and does not link here. The earlier hidden-link pattern is parked while the public homepage focuses on the narrower AI systems offer.

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
1. **Offering section** (above fold): what Austin coaches, who it's for, what someone gets. Mono metadata labels (ALL CAPS), system UI prose.
2. **Work section** (scroll to reach): past engagements, testimonials, outcomes. Grows over time.
3. **CTA:** link to `/coach/book` ("Book a call" or similar, styled as mono text link, not a button).

> **Decision note (2026-04-22):** Portfolio is integrated into the landing page (scroll-through) rather than a separate `/coach/work` page. Revisit when Austin has 5+ distinct engagements worth showing — at that point, a dedicated `/coach/work` index may make more sense for navigation.

---

### `/coach/book` — Austin coaching booking tool

**Layout:** Primitive A. Minimal.

**Implementation:** Custom Google Calendar API integration (not Calendly). Uses the shared booking UI and API with booking type `coach`.

**Content:**
1. Brief context line: what happens when you book (system UI, one sentence).
2. Date selection in mono.
3. Time slots for the selected date as clickable mono text.
4. Booking form: name, email, required purpose, optional note. Four fields.
5. Confirmation state after booking.

**What this is NOT:**
- Not a Calendly embed.
- Not a full scheduling platform.
- Not the acquisition/discovery-call route for proposal CTAs.
- Just: pick a time on Austin's coaching calendar flow, it gets booked, both parties get notified.

---

### `/book` — Discovery-call booking tool

**Access:** Direct link from proposal CTAs. Not in primary nav.

**Layout:** Primitive A. Minimal. Same shared booking UI as `/coach/book`.

**Implementation:** Custom Google Calendar API integration using booking type `discovery`.

**Availability rules:** Thursday and Friday, 10am to 1pm Arizona time. Calls are 30 minutes. A 15-minute buffer is enforced around meetings, so the default generated starts are 10:00, 10:45, 11:30, and 12:15 when the window is fully open.

**Content:** Same shared booking form as `/coach/book`: name, email, required purpose, optional note.

**Intention:** This route is for acquisition/discovery calls from proposals and CTAs. It keeps that inbound path separate from Austin's coaching business page while sharing the same calendar infrastructure.

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

Short paragraph bios. Mono section labels (ALL CAPS) for each person's name, system UI prose for the bio. Contact as a third section below the bios.

Footer placement means visitors who want this page will find it; visitors who don't won't be distracted from the three verticals.

> **Format note:** The voice-memo option (Ellen Ole pattern) is still worth revisiting. The current text bios work as scaffolding but could evolve into audio, photography, or a more distinctive format once the firm's voice is clearer.

---

### Contact

**Access:** Footer only. Likely NOT a dedicated page — just text in the footer.

**Content:** `hello@whatarewecapableof.com` as a mailto link. Possibly Austin's email separately if coaching inquiries should route differently. Location if relevant.

If a contact form is ever needed, it becomes `/contact` as a minimal page. For now, footer text is sufficient. The booking tool at `/coach/book` handles Austin's coaching inbound path. The booking tool at `/book` handles proposal CTA discovery calls.

---

### `/tracker/`: Proposal tracker

**Access:** Direct URL only. Password-gated. Not linked from the public site navigation.

**Layout:** Internal two-column operating view in the whatarewecapableof visual system: proposal list on the left, selected proposal detail on the right. No cards, no status-color system, no imagery.

**Source of truth:** `PROPOSALS.md`. The tracker reads parsed proposal data through authenticated API data. It should not become a second proposal database.

**Comments:** Notes are captured locally in the browser and exported as Markdown for manual ingestion into `PROPOSALS.md`. This keeps v1 low-bloat and avoids automatic source-file mutation.

**Security:** Password session is handled through signed HttpOnly cookies. Required Vercel env vars: `TRACKER_PASSWORD_HASH` or `TRACKER_PASSWORD`; recommended: `TRACKER_SESSION_SECRET`.

---

## Navigation model

**Homepage navigation:** none. The current homepage has no visible nav links. The only link is the footer email.

**Homepage positioning line:**

```
DEVELOPING SYSTEMS AND ARTIFICIAL INTELLIGENCE SOLUTIONS
```

Mono, ALL CAPS, `--size-s`, left-anchored, placed where the old three-word service nav sat.

**Interior or legacy page nav:** `/coach`, `/consult`, `/creative`, `/about`, and `/question` may still contain the older nav or page structure. They are direct or legacy routes until Noah decides whether to remove, redirect, or rebuild them.

---

## Depth map

| Level | Pages | Layout |
|-------|-------|--------|
| 0 | `/` (home) | Primitive A, one viewport |
| 1 | `/coach`, `/consult`, `/creative` | Primitive A, scrollable (landing + integrated portfolio) |
| 1/direct | `/book` | Primitive A, one viewport (discovery-call booking tool) |
| 2 | `/coach/book` | Primitive A, one viewport (coaching booking tool) |
| 2 | `/creative/<project>` (future) | Primitive B (two-column: images + text) |
| 2 | `/consult/<case>` (future) | Primitive B (two-column: deliverable + context) |
| — | `/about` | Primitive A, one viewport, footer-access only |

Max depth: 2 from the primary nav. 3 counting home as level 0.

---

## Booking tool implementation notes (Google Calendar API)

**Scope:** Austin's primary Google Calendar, two booking types, and Arizona time display (`America/Phoenix`, Mountain Standard Time year-round).

**Booking types:**
- `coach`: `/coach/book`, Austin coaching page, default 60-minute calls, weekday 9am to 5pm rules unless env vars override.
- `discovery`: `/book`, proposal CTA flow, Thursday and Friday 10am to 1pm Arizona time, 30-minute calls, 15-minute buffer.

**Stack:**
- Two Vercel serverless functions:
  - `GET /api/availability?type=coach|discovery&date=YYYY-MM-DD` reads Austin's Google Calendar free/busy, returns open slots within that booking type's rules.
  - `POST /api/book` double-checks availability, enforces buffers, creates a calendar event with a Google Meet link, and sends invite emails to attendees. Request body includes `type`.
- Shared frontend script: `/js/booking.js`. Both `/coach/book` and `/book` use the same static HTML structure with different `data-booking-type` values.
- Auth: Google service account with domain-wide delegation impersonating `austin@whatarewecapableof.com`; `BOOKING_CALENDAR_EMAIL` controls the impersonated calendar owner.

**UI in the taste system:**
- Date display: mono, `--size-s`, ALL CAPS day names.
- Time slots: mono, `--size-m`, clickable text (underline on hover per link rules).
- Form fields: system UI labels, mono inputs, underline-below-input (no box border).
- Submit: `Book a call` in mono, sentence case, underlined, no box.
- Confirmation: system UI sentence ("Booked. Check your email for the calendar invite.").
- Loading states: replace content with "..." or similar; no spinner animation.

**Implemented:** Availability and booking use Vercel serverless functions plus `googleapis`. Booking creates events on Austin's primary calendar, adds the visitor and `austin@kamplove.org` as attendees, and creates a Google Meet link.

**Additional requirement (2026-04-22):** Booking events must also notify `austin@kamplove.org` (Austin's other email). Add as attendee on the created event so Google sends the invite there too.

**Resolved blocker (2026-04-24):** Google Workspace migration is complete, Austin has logged in, and domain-wide delegation can impersonate `austin@whatarewecapableof.com` for Calendar API access.

---

## Decisions log

| Decision | Made | Revisit trigger |
|----------|------|-----------------|
| Portfolio integrated into service landing pages (scroll-through) rather than separate `/work` pages | 2026-04-22 | When any vertical has 5+ portfolio items worth distinct pages |
| Homepage narrowed to name, AI systems positioning line, and email | 2026-05-15 | When the offer broadens beyond systems and artificial intelligence solutions |
| Homepage email is the only visible link | 2026-05-15 | If visitors need a booking path, about context, or portfolio proof on the homepage |
| Custom booking tool (Google Calendar API) over Calendly | 2026-04-22 | If implementation takes >2 days or the UX isn't clean enough; Calendly inline embed is the fallback |
| Contact as footer text, not a dedicated page | 2026-04-22 | If a contact form or more complex routing (different inboxes per vertical) becomes necessary |
| Homepage question is plain text, not linked | 2026-05-15 | If the ethos page becomes part of the public homepage path again |
| /question/ as ethos vs /about as biographical | 2026-04-22 | If the distinction confuses visitors |
| About page as text bios (scaffold) | 2026-04-22 | Voice memo, photography, or richer format when the firm's voice is clearer |
| URL pattern: always `<name>/index.html` for clean paths | 2026-04-22 | Permanent; `about.html` style 404s on Vercel |
