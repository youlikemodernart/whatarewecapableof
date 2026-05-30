# WAWCO invoice studio

Status: Fin is the single source of truth.

The invoice studio now lives in the Fin app:

```text
https://fin.whatarewecapableof.com/invoices
apps/fin/
```

The earlier local Node/SQLite prototype has been retired as a separate implementation. Do not continue feature work in `scripts/invoice-studio.mjs` or `tools/invoice-studio/`; those files are no longer the canonical app surface.

## Run the canonical app locally

Use Vercel dev from the Fin app directory through the root convenience script:

```bash
cd ~/Projects/whatarewecapableof
npm run invoices
```

This serves the Fin app locally, usually at:

```text
http://127.0.0.1:3187
```

Automated smoke check:

```bash
npm run invoices:smoke
```

## Production app

```text
https://fin.whatarewecapableof.com/invoices
```

Vercel ownership status:

- Project `fin` is in the WAWCO Vercel team.
- The transfer was verified after Noah approved Neon integration policy acceptance.
- Local `apps/fin/.vercel/project.json` points to the WAWCO org and passed the local old-pointer audit. Do not deploy without a fresh explicit deployment gate.

The hosted app provides:

- Google Workspace login and allowlist gating.
- Hosted Postgres invoice draft storage through the Fin API.
- Invoice editor, draft list, duplicate, JSON export, preview, and print/PDF flow.
- Server-side invoice normalization and total calculation.
- Admin-created Stripe Checkout payment links from approved invoice snapshots.
- Read-only finance dashboard aggregates at `/finance`, including hosted invoice payment status.

## Invoice numbering

Preferred numbering format:

```text
CLIENT-MMDDYY-##
```

Example:

```text
SUBSTRATE-052626-01
```

Rules:

- `CLIENT` comes from the client invoice code field. If that field is blank, Fin derives a code from the client company, name, or email.
- `MMDDYY` comes from the invoice date.
- The suffix sequence resets globally per invoice date, not per client. If Substrate receives `SUBSTRATE-052626-01`, the next invoice dated 05/26/26 for another client is `OTHERCLIENT-052626-02`.
- Existing invoices keep their assigned numbers. Updating a draft does not regenerate its number.
- New numbers are assigned when a hosted draft is first saved.

## Boundary

The hosted invoice studio creates internal WAWCO invoices and admin-created Stripe Checkout links from approved immutable invoice snapshots. The custom Fin invoice and PDF remain the invoice of record; Stripe collects payment only.

The studio does not create Mercury invoices, send Mercury invoices, send Gmail, issue refunds, update external customers, change Stripe configuration, or perform bank/card actions.

Live Stripe link creation, client sends, refunds, Mercury, Gmail, payment, customer, and bank actions require explicit current-session approval and the relevant approval gate.

## Legacy local data

The previous local prototype stored drafts under:

```text
.finance/invoice-studio/invoices.db
```

That directory remains ignored and private. Do not commit or copy raw invoice/customer data into docs, memory, Git, or chat. If any old local drafts need to move into Fin, use a deliberate import plan with review and generic summaries only.
