# WAWCO finance dashboard

Local read-only dashboard for WAWCO finance review. The hosted Fin app also has a `/finance` route at `https://fin.whatarewecapableof.com/finance`; Vercel project `fin` is now owned by the WAWCO Vercel team, and local `apps/fin/.vercel/project.json` points to WAWCO. Hosted `/finance` reads Fin invoice records, approved derived finance summaries, and hosted invoice payment status.

This local dashboard combines ignored local artifacts:

- Mercury snapshots under `.finance/`, including accounts, cards, transactions, invoices, customers, and categories
- expected recurring costs from `.finance/recurring-expenses.json`
- local invoice studio drafts from `.finance/invoice-studio/invoices.db`

Personal invoice drafts whose payee is Noah Glynn are excluded from the WAWCO dashboard. Those drafts stay usable in the invoice studio for Noah's separate client billing, but they do not count toward WAWCO open invoice totals or invoice status blocks.

The local dashboard does not call Mercury, Stripe, Gmail, Google Workspace, or any external service. Hosted `/finance` does not create payment links itself; Stripe Checkout links are created from the protected Invoice Studio admin action after invoice approval. Refresh external source data separately through approved read-only tools.

## Start

```bash
npm run finance
```

Open:

```text
http://127.0.0.1:3191/finance
```

Smoke check:

```bash
npm run finance:smoke
```

## Refresh Mercury data

Run a read-only Mercury snapshot. Raw files stay under ignored `.finance/`.

```bash
npm run mercury -- snapshot \
  --out .finance/snapshots/mercury-$(date -u +%Y%m%dT%H%M%SZ) \
  --posted-start 2026-05-01 \
  --posted-end 2026-05-31 \
  --limit 200
```

The dashboard automatically reads the latest `.finance/snapshots/mercury-*` or `.finance/snapshot-*` folder unless `--snapshot` is passed.

## Recurring costs file

Private path:

```text
.finance/recurring-expenses.json
```

Schema:

```json
{
  "updatedAt": "2026-05-27T00:00:00.000Z",
  "items": [
    {
      "id": "example-ai-tool",
      "name": "Example AI Tool",
      "vendor": "Example Vendor",
      "category": "AI tools",
      "plan": "Example monthly plan",
      "cadence": "monthly",
      "expectedMonthlyCents": 99900,
      "lastObservedChargeCents": 99900,
      "nextRenewalDate": "2026-06-01",
      "status": "future estimate",
      "expenseTiming": "future-estimate",
      "paymentSource": "personal",
      "confidence": "example only",
      "source": "example source",
      "notes": "Replace with a real private item in .finance/recurring-expenses.json."
    }
  ],
  "observations": [],
  "notes": []
}
```

Use `expectedMonthlyCents: null` when the item is known but the exact amount needs verification. Use `expenseTiming: "future-estimate"` and `paymentSource: "personal"` for subscriptions Noah is funding personally today but expects WAWCO to carry later. Those count toward the future stack estimate, not current WAWCO-incurred spend.

## Card labels file

Private path:

```text
.finance/card-labels.json
```

The dashboard uses this file to turn masked Mercury cards into service labels. Mercury's current CLI card output exposes card metadata such as active status, type, last four, and name-on-card, but not a reliable custom service label. The local label file fills that gap.

Schema:

```json
{
  "updatedAt": "2026-05-27T00:00:00.000Z",
  "labels": [
    {
      "cardId": "private-card-id-from-snapshot",
      "lastFourDigits": "1234",
      "label": "Example service card",
      "purpose": "Subscription card for one software vendor",
      "expectedMerchants": ["Example Vendor"],
      "notes": "Private note.",
      "active": true
    }
  ],
  "notes": []
}
```

Use `label` for the dashboard-facing service name and `expectedMerchants` for sanity checks against transaction counterparties. Keep this file ignored under `.finance/`.

## Interpretation model

The dashboard separates finance facts by confidence and timing:

- `current recurring`: a known WAWCO-incurred monthly cost. Reconcile it against the settled Mercury charge when it posts.
- `future estimate`: a likely future WAWCO cost that is not yet company-incurred, including software Noah currently pays for personally or planned subscriptions that have not posted.
- `observed card expense`: a vendor card charge from the selected Mercury snapshot month.
- `possible personal-funded`: a card-charge batch with a nearby Ally/Allied transfer for the same or similar amount. Treat this as a review signal, not proof.
- `unmatched`: a charge or estimate that needs human review before it becomes recurring, reimbursed, or ignored.

Card expense totals count vendor transactions. Mercury Credit repayment movements are excluded from observed vendor spend so the same card purchase is not counted twice.

## What the dashboard shows

- available and current Mercury cash balance
- selected-month money in, money out, and net cash movement
- known expected monthly recurring cost total, separated into current WAWCO-incurred cost and tentative future estimate
- recurring cost unknowns that need verification
- top spend counterparties for the selected month
- active Mercury cards from the snapshot
- selected-month card spend grouped by card payment method
- observed card expenses as vendor charges only, excluding Mercury Credit repayment movements to avoid double counting
- possible personal-funding signals when a same-day card-charge batch is followed by a nearby Ally/Allied transfer for the same or similar amount
- Mercury invoice status and local or hosted Fin invoice status
- hosted Stripe Checkout link and online-payment status where available
- review queue for missing snapshots, unknown recurring costs, and uncategorized spend

## Boundaries

- Local dashboard: no external writes.
- Hosted Fin: Stripe Checkout links are created only by an admin from approved invoice snapshots; `/finance` itself remains a dashboard/read surface.
- No Mercury invoice creation, Mercury sending, Gmail sending, refunds, customer changes, card, transaction-category, Google Workspace, or billing changes without the relevant current-session approval.
- No raw finance exports in Git, project memory, docs, or chat.
- The local browser app is unauthenticated and loopback-only by default. Use `--allow-network` only for a deliberate private-network review.

## Relationship to invoice studio

The dashboard reads the same local SQLite database used by `npm run invoices`. It can show local invoice draft and issued totals, but it does not create or send invoices. It filters out private-payee invoice drafts whose payee/from profile is Noah Glynn so personal invoices do not appear in WAWCO finance totals. Mercury invoice creation, customer changes, invoice sends, payments, and transaction categorization remain approval-gated finance writes.
