# PiOp direct-link internal page

The PiOp page lives at `/piop/` as a direct-link, noindex internal surface. It is not linked from the home page and is excluded from the public sitemap. It explains PiOp Minimal, Foundation, selected Modules, and the current graph-driven Skills Library model within the existing editorial page template. Foundation and Module rows are generated from the locked product projection at `scripts/data/piop-product.json`. Product-status copy distinguishes accepted source from recipient installation and readiness. The page installs nothing, grants no source access, and stores no recipient information. The one-time and monthly support form remains hidden until live payment activation is approved and verified.

## Skill selection and delivery authority

PiOp selects skills from its accepted capability graph according to the recipient's use case. The graph identifies skill identities and declared required relationships. It grants no installation, capability, profile, account, credential, or external-action authority.

A reviewed fulfillment selects the smallest useful root skills and carries each selected root's required closures and bounded runtime resources into a recipient-specific bundle. The bundle excludes the complete canonical library, raw source corpora, books, PDFs, benchmark evidence, and maintenance history.

The standalone private-package catalog and its five package repositories were retired on 2026-08-21. The former catalog is historical compatibility evidence only. It does not define current site availability, trigger per-skill repository publication, or control Foundation, Recipient Profile, nightly, or stable contents. `scripts/piop-catalog-authority.mjs` and `scripts/sync-piop-catalog.mjs` fail closed if invoked.

Recipient fulfillment remains separate from source authority. A use-case request receives manual closure, compatibility, scope, and risk review. If approved, What are we capable of? prepares a recipient-specific verified ZIP, shares that file through private Google Drive, and emails the exact copy-and-paste Pi setup prompt. A GitHub account is not required for recipient delivery.

## Verify the page

Generate and verify the Foundation and Module projection:

```sh
node scripts/sync-piop-product.mjs \
  --product scripts/data/piop-product.json

node scripts/sync-piop-product.mjs \
  --product scripts/data/piop-product.json \
  --check

node scripts/check-piop-page.mjs \
  --product scripts/data/piop-product.json

node --check js/piop.js
```

`check-piop-page.mjs` verifies the locked Foundation and Module projection, graph-driven skill-selection copy, unique HTML IDs, fulfillment and authority boundaries, the single allowed Stripe form action, and the absence of stale package selectors, repository URLs, Git sources, direct install commands, release digests, known private markers, and direct JavaScript network-send primitives across the page, JavaScript, and PiOp CSS.

## Use-case request behavior

The page links to a user-controlled email request. It asks for the desired outcome, recipient, and relevant working context rather than a package identifier. The site does not send the request, install a skill, select a profile, or access an account.

## Payment and fulfillment separation

Payment does not grant package access, change repository permissions, accelerate fulfillment, or alter skill review. Checkout metadata remains `access_entitlement=none`. No checkout, payment, or subscription event may grant, revoke, or modify GitHub, Drive, package, or recipient permissions.

## Stripe Checkout

The public form posts to:

```text
https://fin.whatarewecapableof.com/api/piop/checkout
```

The endpoint accepts integer USD amounts from $1 through $10,000 and a frequency of `once` or `monthly`. It creates a server-side Stripe Checkout Session and redirects the browser to Stripe. One-time support uses Checkout payment mode. Monthly support uses subscription mode.

Required production configuration:

- `PIOP_CHECKOUT_ENABLED=1`, the PiOp-specific circuit breaker;
- `STRIPE_MODE=live` and `FIN_STRIPE_LIVE_LINKS_ENABLED=1`;
- `FIN_STRIPE_FAKE=0`;
- existing WAWCO live Stripe secret and webhook configuration;
- `PIOP_STRIPE_PRODUCT_ID`, containing the approved dedicated PiOp Stripe Product ID.

The endpoint fails closed when the circuit breaker is off, fake mode is active, or the dedicated Product ID is absent or malformed. Creating the Stripe Product and setting production environment variables are live external changes and require explicit approval. The existing Fin webhook acknowledges these Stripe events. PiOp support needs no app-side entitlement or repository action.

The browser creates a per-attempt UUID that becomes the Stripe idempotency key, so browser retries reuse the same Checkout Session request. The endpoint limits bodies to 2 KB and applies a best-effort five-attempt, ten-minute, per-IP limit inside each warm function instance. Before live activation, add an enforceable platform-level per-IP rate rule and alerting for Checkout Session spikes. The application limit does not replace a Vercel firewall or another shared rate-control layer.

Run the no-network checkout smoke test:

```sh
cd apps/fin
npm run smoke:piop-checkout
```

## Deployment boundary

A site deployment, Fin deployment, Stripe Product creation, production environment-variable change, platform rate-limit rule, recipient ZIP, Drive permission change, or email requires its current governing approval. Before site deployment, verify the exact public page, generated request route, desktop and mobile behavior, keyboard flow, exact source diff, and absence of private repository or direct-install controls.
