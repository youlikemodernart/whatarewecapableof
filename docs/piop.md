# Canonical PiOp product reference

The canonical PiOp page lives at `/piop/`. It is a direct-link, noindex reference presented in an original encyclopedia style. The former editorial page was removed. `/piop/wiki/`, `/piop/skills/`, and `/piop/index.html` redirect permanently to `/piop/`.

The canonical page explains PiOp Minimal, Foundation, selected Modules, IS Terminal, graph-driven skill selection, the complete public-safe skill directory, delivery, references, and authority boundaries. It installs nothing, grants no source or account access, stores no recipient information, and contains no payment or direct-install surface.

## Source projections

Two reviewed data files generate bounded parts of the page:

- `scripts/data/piop-product.json`: PiOp 0.2.3 stable Foundation, extensions, Modules, and release state.
- `scripts/data/piop-skills.json`: 152 public-safe current graph skills, 12 categories, concise descriptions, and two under-review labels.

The locked product authority is `scripts/piop-product-authority.mjs`. Product and skill source presence remain separate from installation, configuration, authentication, availability, verification, readiness, profile selection, and current action authority.

The former standalone private-package catalog and its five repositories were retired on 2026-08-21. `scripts/piop-catalog-authority.mjs` and `scripts/sync-piop-catalog.mjs` remain fail-closed historical compatibility surfaces. They do not control the canonical page.

## IS Terminal reference

The page identifies IS as the recommended macOS terminal and persistent workspace host for PiOp while preserving the three-layer boundary:

- IS supplies the native terminal, panes, windows, and workspace host.
- Pi remains the agent runtime.
- PiOp supplies the portable operating setup, selected capabilities, recipient context, and authority boundaries.

The IS section is grounded in the verified private IS 0.1.7.15 release, source README, release notes, and downstream boundary. It covers terminal foundations, persistent workspaces, visible agent work, guarded control, shell semantics, appearance, pane-safe interaction, pinned updates, platform requirements, trust state, and attribution. It publishes no private repository URL, artifact digest, account detail, or install command. Access and installation remain separately requested recipient actions.

## Generate and verify

From the repository root:

```sh
npm run piop:sync
npm run piop:check
```

Equivalent direct commands:

```sh
node scripts/sync-piop-product.mjs \
  --product scripts/data/piop-product.json \
  --page piop/index.html

node scripts/sync-piop-skill-directory.mjs \
  --data scripts/data/piop-skills.json \
  --page piop/index.html

node scripts/check-piop-wiki.mjs \
  piop/index.html \
  scripts/data/piop-skills.json \
  scripts/data/piop-product.json
```

The checks verify:

- exact product and skill projection identities;
- PiOp 0.2.3 stable, 8 Foundation packages, 5 default extensions, and 6 Modules;
- the complete 152-entry public-safe skill directory and two under-review labels;
- IS 0.1.7.15, its trust statement, product relationship, and install/access boundary;
- canonical URL, noindex state, unique HTML IDs, and redirect configuration;
- absence of private source URLs, local paths, owner identities, operator-only product surfaces, and stale package-install claims.

## Delivery boundary

A use-case request receives manual closure, compatibility, scope, and risk review. If approved, What are we capable of? prepares a recipient-specific verified ZIP, shares it through private Google Drive, and supplies the exact setup prompt. A GitHub account is not required for recipient delivery.

Site deployment, IS access, recipient ZIP creation, Drive permissions, email, installation, app replacement, restart, credential use, provider actions, and other external effects require their current governing approval. Canonical-page presence grants none of them.
