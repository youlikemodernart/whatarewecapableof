# PiOp direct-link internal page

The PiOp page lives at `/piop/` as a direct-link, noindex internal surface. It is not linked from the home page and is excluded from the public sitemap. It explains the current PiOp product shape: PiOp Minimal as the delivery model, Foundation as the dependable baseline, and Modules as selected additions. It also renders a safe projection of the released Skills Library, lets someone assemble a desired skill set, and generates a reviewable fulfillment request. Product-status copy must distinguish accepted source from recipient installation and readiness. The page installs nothing, grants no source access, stores no recipient information, and contains no payment surface.

## Source, catalog, and delivery authority

Private GitHub is the source authority for each package's signed history, exact version, tests, and reproducible release evidence. The released `pi-skill-index/catalog/skills.json` is the site availability authority. `scripts/piop-catalog-authority.mjs` locks the accepted schema version, catalog version, and exact catalog SHA-256. Generation and checking fail unless the supplied local file is byte-identical to that accepted release artifact. The page includes only records whose catalog status is `verified-private`.

The public projection includes:

- package name and description;
- exact released version;
- recommended scope and risk tier;
- included skill methods;
- declared external-access and credential boundaries;
- a package-data boundary that distinguishes data shipped in the release from runtime handling of user-provided content.

The public projection excludes:

- repository URLs;
- Git package sources;
- install and removal commands;
- release archive digests;
- GitHub invitation or permission controls.

A released Library entry and PiOp Minimal default acceptance are separate states. For example, the standalone Dual Harness 0.3.0 release may appear as a requestable Library package while the project-local PiOp Minimal Dual Harness candidate remains unaccepted for the integrated default. A file from another path is accepted only when its bytes match the locked released-catalog digest. A modified candidate or stale copy fails closed.

Recipient fulfillment is separate from source authority. A selected set becomes a request for manual compatibility, scope, and risk review. If approved, What are we capable of? prepares a recipient-specific verified ZIP, shares that file through private Google Drive, and emails the exact copy-and-paste Pi setup prompt. A GitHub account is not required for recipient delivery.

## Generate and verify the page

Generate and verify the page against an exact local release source:

```sh
node scripts/sync-piop-catalog.mjs \
  --catalog /absolute/path/to/pi-skill-index/catalog/skills.json

node scripts/sync-piop-catalog.mjs \
  --catalog /absolute/path/to/pi-skill-index/catalog/skills.json \
  --check

node scripts/check-piop-page.mjs \
  --catalog /absolute/path/to/pi-skill-index/catalog/skills.json

node --check js/piop.js
```

`sync-piop-catalog.mjs` rewrites only the content between the `PIOP_SKILLS_START` and `PIOP_SKILLS_END` markers and updates package and skill totals. Before rendering, it requires:

- an exact match to the locked catalog SHA-256, schema version, and catalog version;
- `verified-private` status;
- the expected private GitHub owner;
- an exact version-pinned Git source and install command;
- a valid release archive SHA-256;
- complete skill and boundary descriptions.

Those private source and install fields are validation evidence only. The generator never renders them. When a catalog record says `private_data: none`, the public projection states that no private data ships in the package and directs runtime handling back to the selected method and active request. This avoids implying that a text-processing skill cannot receive user-provided content.

`check-piop-page.mjs` verifies the authority lock, per-package article projection, unique HTML IDs, fulfillment boundary copy, the single allowed Stripe form action, and the absence of repository URLs, Git sources, direct install commands, release digests, GitHub invitation controls, known private markers, and direct JavaScript network-send primitives across the page, JavaScript, and PiOp CSS.

## Skill-set request behavior

The browser keeps the current selection in memory only. It does not use local storage, cookies, an account, or a server-side request API. The review section appears in source order after the package list as soon as one package is selected. The top summary is a keyboard-accessible shortcut that moves focus to the review heading. Remove and clear actions return focus to a surviving control before their current section disappears. Without JavaScript, package descriptions and delivery instructions remain readable, selection controls stay hidden, and the static request-email link remains available.

The generated request contains:

- editable recipient and project placeholders;
- selected package names, versions, scopes, and risk tiers;
- the private-GitHub source-authority statement;
- the recipient-specific ZIP and private-Drive delivery request;
- the email setup-prompt request;
- an instruction not to substitute versions or expand account, credential, or organization access without confirmation.

The user may copy the request or open a prefilled email. Opening an email is a user-controlled navigation action. The site does not send it.

## Payment boundary

The private PiOp page contains no payment or support form. Fulfillment remains independent of payment, package access, and repository permissions.

## Deployment boundary

A site deployment, recipient ZIP, Drive permission change, or email requires its current governing approval. Before site deployment, verify the exact private page, catalog projection, generated request, desktop and mobile behavior, keyboard flow, the exact source diff, and the absence of private repository or direct-install controls.
