# PiOp direct-link internal page

The PiOp page lives at `/piop/` as a direct-link, noindex internal surface. It is not linked from the home page and is excluded from the public sitemap. It renders the Skills Library, explains how private repository access works for approved recipients, and prepares a setup prompt without installing anything from the page. The one-time and monthly support form remains hidden until live payment activation is approved and verified.

## Source and release model

The generated skills block in `piop/index.html` derives from the released `pi-skill-index/catalog/skills.json`. System-managed PiOp components are not presented as installable packages on this page. The catalog source is not copied into the public site.

Generate and verify the page against exact local release sources:

```sh
node scripts/sync-piop-catalog.mjs \
  --catalog /absolute/path/to/pi-skill-index/catalog/skills.json

node scripts/sync-piop-catalog.mjs \
  --catalog /absolute/path/to/pi-skill-index/catalog/skills.json \
  --check

node scripts/check-piop-page.mjs \
  --catalog /absolute/path/to/pi-skill-index/catalog/skills.json
```

`sync-piop-catalog.mjs` only rewrites content between the `PIOP_SKILLS_START` and `PIOP_SKILLS_END` markers and updates package and skill totals. It requires pinned install commands and the expected GitHub repository owner.

## Repository access

The page is direct-link and noindex. Package repositories remain private and GitHub remains the access gate. Access is granted manually through repository invitations. The site has no GitHub authentication, permission detection, invitation acceptance, or automatic enrollment.

Payment and repository access are separate. Checkout metadata sets `access_entitlement=none`. No checkout, payment, or subscription event may grant, revoke, or modify GitHub permissions.

## Stripe Checkout

The public form posts to:

```text
https://fin.whatarewecapableof.com/api/piop/checkout
```

The endpoint accepts integer USD amounts from $1 through $10,000 and a frequency of `once` or `monthly`. It creates a server-side Stripe Checkout Session and redirects the browser to Stripe. One-time support uses Checkout payment mode. Monthly support uses subscription mode.

Required production configuration:

- `PIOP_CHECKOUT_ENABLED=1`, the PiOp-specific circuit breaker
- `STRIPE_MODE=live` and `FIN_STRIPE_LIVE_LINKS_ENABLED=1`
- `FIN_STRIPE_FAKE=0`
- Existing WAWCO live Stripe secret and webhook configuration
- `PIOP_STRIPE_PRODUCT_ID`, containing the approved dedicated PiOp Stripe Product ID

The endpoint fails closed when the circuit breaker is off, fake mode is active, or the dedicated Product ID is absent or malformed. Creating the Stripe Product and setting production environment variables are live external changes and require explicit approval. The existing Fin webhook acknowledges these Stripe events; PiOp support needs no app-side entitlement or repository action.

The browser creates a per-attempt UUID that becomes the Stripe idempotency key, so browser retries reuse the same Checkout Session request. The endpoint limits bodies to 2 KB and applies a best-effort five-attempt, ten-minute, per-IP limit inside each warm function instance. Before live activation, add an enforceable platform-level per-IP rate rule and alerting for Checkout Session spikes. The application limit does not replace a Vercel firewall or another shared rate-control layer.

Run the no-network checkout smoke test:

```sh
cd apps/fin
npm run smoke:piop-checkout
```

## Deployment boundary

A site deployment, Fin deployment, Stripe Product creation, production environment-variable change, or platform rate-limit rule requires explicit approval. Before activation, verify the exact public page, the exact Fin commit, the platform rate rule, Stripe live configuration, a one-time Checkout Session, a monthly Checkout Session, return URLs, cancellation handling, and the absence of repository permission effects. The Skills Library page only prepares a setup prompt; it does not install packages or change repository permissions.
