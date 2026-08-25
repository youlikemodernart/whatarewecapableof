# Gmail monitor

Local Gmail intake for `hello@whatarewecapableof.com` and `noah@whatarewecapableof.com`.

Status as of 2026-08-01: read access works for both accounts. Compose scope is authorized for draft creation and approval-gated sending from `noah@whatarewecapableof.com` and from the accepted `kamp@whatarewecapableof.com` sendAs identity owned by the `hello@whatarewecapableof.com` mailbox. `npm run mail -- status` can read Gmail profiles for `hello@whatarewecapableof.com` and `noah@whatarewecapableof.com`.

The script uses the existing Google Workspace service account key from `.env.local` and domain-wide delegation. Exports are written locally and ignored by Git under `.mail/` unless an explicit output path is provided.

For project-context use, route through the shared mail-intake skill at `~/.pi/agent/skills/mail-intake/SKILL.md`. The WAWCO mail profile lives at `~/.pi/agent/mail/profiles/whatarewecapableof.yaml`, and the user-facing cheat sheet lives at `~/.pi/agent/mail/CHEATSHEET.md`.

Gmail reads currently use `scripts/gmail-monitor.mjs`; do not assume the `google-workspace` MCP exposes Gmail tools.

Draft creation and reviewed-draft sending use Gmail compose scope through `scripts/gmail-draft.mjs`. The helper resolves sender identity through the closed table in `scripts/gmail-mail-profiles.mjs`. For WAWCO house mail it separately loads the accepted expression profile at `email-expression/profiles/wawco/profile.json`, resolves its presentation through `scripts/email-expression-resolver.mjs`, and records the expression-profile ID, version, and SHA-256 in MIME. The helper can send only an existing policy-marked draft whose stored raw MIME passes the v1 validator and matches the SHA-256 approval token emitted by its review command. Policy headers and semantic hashes detect drift but do not cryptographically prove which program authored the MIME. The send request includes the reviewed raw MIME together with the draft ID and, for replies, the stored Gmail thread ID.

## Agent-authored client email standard

All WAWCO client email prepared by an agent must enter Gmail through `npm run mail:draft -- create`. General WAWCO mail uses `noah@whatarewecapableof.com`. Kamp Love mail uses the standing `kamp-love` profile and sends from `kamp@whatarewecapableof.com`. The helper automatically Bccs `noah@whatarewecapableof.com`, builds the profile's required system note and current signature, then creates a Gmail draft for review.

Required sequence:

1. Write and approve the intended recipient, subject, body, attachments, and reply context locally. Use `--body-markdown-file` for structured messages that need headings, lists, emphasis, links, or code blocks. Keep `--body-file` for literal plain text.
2. For Markdown messages, run `preview` and inspect the local HTML and plain-text alternatives. Review the reported heading, paragraph, list, soft-break, and hard-break counts, plus every `formatWarnings` entry. Then run the helper with `--dry-run`; confirm the exact `mailProfileId`, `mailProfileVersion`, and `mailProfilePolicySha256`. For WAWCO house mail also confirm `expressionProfileId`, `expressionProfileVersion`, and `expressionProfileSha256` match the accepted profile. Confirm `bodyFormat` is `markdown`, the profile's expected `systemNote` and `signatureHtml`, `defaultBcc` is `noah@whatarewecapableof.com`, `defaultBccApplied` is `true` unless Noah is already a recipient, and `mimeType` is `multipart/alternative` or `multipart/mixed` when files are attached. The default WAWCO path resolves to `wawco-house`; Kamp resolves to `kamp-love` and retains the legacy fixed presentation until a separate expression profile is approved.
3. Create the Gmail draft. For a reply, add bare `--reply`, `--thread-id`, `--in-reply-to`, and `--references`. The helper fails closed if any reply-thread field is absent, and treats any supplied threading field as reply intent. Confirm the dry-run reports `reply: true`, a non-empty `threadId`, and `hasInReplyTo` plus `hasReferences` as `true`.
4. Choose the clearest review surface: the rendered Gmail draft, chat, or a formatted local preview. Noah may send the reviewed draft manually from Gmail.
5. If Noah instead explicitly approves agent sending after review, run `npm run mail:draft -- review --draft-id DRAFT_ID` immediately before send. Include the same explicit `--mail-profile` used for any non-default approved profile; `hello@` review and send fail before Gmail access when `kamp-love` is omitted. Review fails closed unless policy markers, content digest, sender/account, Noah recipient policy, HTML safety, supported MIME nesting, PDF policy, inline-figure CID/PNG/alt/caption policy, attachment limits, and encoded size pass. Confirm recipients, subject, stored MIME structure, content digest, Markdown structure and warnings, PDF manifests, figure filename/dimensions/alt/caption/SHA-256, and the raw-MIME token against the approved local summary. Then use the emitted payload hash once with `npm run mail:draft -- send --draft-id DRAFT_ID --approval-token HASH`.
6. If sending returns an error, treat the outcome as uncertain. Do not retry automatically. Check Gmail Sent first because Gmail deletes the draft and creates a new sent-message ID after a successful send.

Do not originate or assemble agent-authored client email in a direct Gmail browser compose. Do not use `--system-note=none` for agent-authored client email unless Noah explicitly approves that exception in the current session. This standard does not constrain messages Noah personally writes and sends without agent assistance.

Run the local contracts with:

```bash
npm run email:profile:test
npm run email:resolver:test
npm run mail:draft:test
npm run email:profile -- validate
```

## Draft system note

For the local `noah@whatarewecapableof.com` path, the helper defaults to this system note:

```text
Drafted with our system. Replies go to Noah's inbox.

This note may be more direct or structured than a typical email. Thanks!
```

The exact flag `--system-note=none` suppresses it for one draft. `hello@whatarewecapableof.com` and other accounts receive no Noah note or private signature unless an approved mail profile applies; plain inputs remain plain text, while an explicit Markdown input still produces the structured HTML/plain alternatives. Case variants, whitespace variants, repeated flags, and space-separated forms are rejected. For the noah@ default path, the helper reads the private current-signature snapshot at `~/.pi/private/google-signatures/wawco/signature-snapshots/current-noah-signature.html`, verifies it through one nofollow descriptor as a direct mode-0600 regular file, and appends its sanitized form immediately after the system note. If that snapshot is missing or invalid, draft creation stops before Gmail client construction. Refresh the snapshot only through the approved signature workflow. Noah visually approved this transparent composition as the standing local default on 2026-07-19. This policy applies only to the local helper, not Gmail account signatures or manually composed Gmail.

## Kamp Love outbound profile

Use the standing Kamp Love profile whenever the email concerns Kamp Love work, is addressed to a Kamp Love organization or domain contact, or responds to mail received through `kamp@whatarewecapableof.com`:

```bash
npm run mail:draft -- create --mail-profile kamp-love \
  --to person@example.com \
  --subject "Subject" \
  --body-markdown-file ./body.md \
  --dry-run
```

The profile is fail-closed:

- Gmail account: `hello@whatarewecapableof.com`
- From identity: `kamp@whatarewecapableof.com`
- Display name: `Noah Glynn`
- Automatic Bcc: `noah@whatarewecapableof.com`
- System-note marker: `kamp-automated`
- Signature snapshot: `~/.pi/private/google-signatures/wawco/signature-snapshots/current-kamp-signature.html`

A distinct `--from-email` is rejected unless an approved mail profile owns it. Review and send commands for Kamp drafts must also include `--mail-profile kamp-love` so the helper impersonates `hello@` while validating `kamp@` as the only permitted From identity.

The profile inserts this system note:

```text
This email was prepared and sent through an automated system operated by What are we capable of? for Kamp Love.

Replies go to Noah Glynn at the Kamp Love technology and design inbox.
```

The deployed Gmail signature and local signature snapshot contain:

```text
Noah Glynn
Head of Technology and Design, Kamp Love
kamp@whatarewecapableof.com
What are we capable of?
```

There is no phone number. The signature uses the same restrained WAWCO layout as the other deployed signatures. The `kamp@` sendAs identity and signature were API-verified on 2026-08-01. No test email was sent.

Related WAWCO Google Workspace service-account notes live in `docs/google-workspace-access.md`.

## Restricted-file delivery

Gmail can accept an API send request and later block delivery of source bundles, executable files, or archive attachments. Treat a provider delivery notice as a post-send gate.

For an explicitly approved restricted-file delivery:

1. Do not resend the attachment or bypass provider policy through renaming, encoding, or encryption.
2. Upload only the verified artifact through the approved Drive write profile.
3. Grant file-level reader access only to the intended recipient. Do not use public, domain-wide, or folder-level sharing unless separately approved.
4. Verify file name, byte count, recipient permission, and the absence of public or domain permissions before sending a plain-text link.
5. Treat Gmail acceptance and Drive permission metadata as sender-side evidence only. They do not prove inbox placement, recipient download, or successful installation.

This rule does not authorize Drive uploads, sharing changes, or sends by default. Each delivery still needs current explicit approval. See `docs/google-workspace-access.md` for the approved OAuth write-profile boundary.

## Google Workspace setup

The booking tool service account has domain-wide delegation for Calendar and Gmail.

- Client ID: `103642820677979156058`
- Gmail read scope: `https://www.googleapis.com/auth/gmail.readonly`
- Gmail compose scope: `https://www.googleapis.com/auth/gmail.compose`

Admin console path, if this ever needs to be checked or restored:

1. Go to `admin.google.com`.
2. Security.
3. Access and data control.
4. API controls.
5. Domain-wide delegation.
6. Manage domain-wide delegation.
7. Edit the existing client ID above.
8. Add the required Gmail scopes.

Start with readonly. Compose is allowed for draft creation. Do not add modify or send-oriented workflows unless there is a specific approved workflow for labels, archiving, marking read, or sending.

Gmail API is enabled in the existing GCP project `valid-complex-494323-p1`.

Notes from setup attempt on 2026-04-30:

- `gcloud` cannot add Workspace domain-wide delegation scopes. That setting lives in Google Workspace Admin Console.
- The local active `gcloud` user `hello@whatarewecapableof.com` needed reauthentication, so non-interactive `gcloud services enable gmail.googleapis.com` could not run as the user.
- Activating the booking service account locally worked, but that service account does not have permission to enable APIs in the GCP project.
- After Noah added the Gmail readonly scope in Admin Console and enabled Gmail API in GCP, status checks passed for both monitored accounts.
- On 2026-05-02, compose scope was added through the prefilled Admin Console domain-wide delegation URL. `gmail.compose` now passes for `noah@whatarewecapableof.com`.

## Commands

Run from the repo root:

```bash
npm run mail -- status
npm run mail -- list --query 'newer_than:7d is:unread'
npm run mail -- export --query 'newer_than:30d (teaspressa OR compassion)' --out ~/Downloads/wawco-mail.md
```

Preview a Markdown email locally, then create a draft only after Noah asks for one:

```bash
npm run mail:draft -- preview --to person@example.com --subject 'Subject' --body-markdown-file ~/path/to/body.md --out /tmp/email-preview.html
npm run mail:draft -- create --dry-run --to person@example.com --subject 'Subject' --body-markdown-file ~/path/to/body.md
npm run mail:draft -- create --to person@example.com --subject 'Subject' --body-markdown-file ~/path/to/body.md
```

The restricted Markdown renderer supports headings, paragraphs, ordered and unordered lists, bold, italics, bounded inline highlights, inline code, fenced code blocks, blockquotes, HTTPS/HTTP/mailto links, horizontal rules, and bounded Markdown pipe tables. A single newline inside one Markdown paragraph is a CommonMark soft break and renders as a space. Use a blank line for a new paragraph. When a visible line break is intentional, such as inside a postal address, use an explicit CommonMark hard break: either two trailing spaces or a trailing backslash before the newline. Use `##` or another heading marker when a label should render as a heading. Raw `<br>` is rejected with all other raw HTML. Preview, dry-run, and final review report a deterministic Markdown structure summary; any soft break produces an advisory `markdown-softbreaks-render-as-spaces` warning. Do not ignore that warning until both alternatives match the intended line structure.

Inline highlights use `==text==` and render with the approved sun-yellow background. The only named alternative is `=={hot-pink}text==`, reserved for rare special emphasis. The renderer rejects raw HTML, Markdown images, relative links, in-document fragment links, unsafe URL schemes, unknown highlight colors, multiline highlights, and highlights above the count or length limits. Fragment links are excluded because heading anchors and client support are unreliable in email. Link-like text inside inline or fenced code remains inert code. Tables are limited to two per message, three columns, twenty body rows, and 500 characters per cell; the plain-text alternative uses pipe-delimited rows. Use stacked bold-label and list records when content needs four or more fields.

System Email Surface v1.2 may embed one direct local PNG through CID MIME. V1.3 permits a maximum-two vertical sequence by repeating `--inline-image` and its positionally matching `--image-alt`. Captions are omitted for all figures or supplied once per position; use `--image-caption=` for an intentionally empty caption. Each file is nofollow-read once, PNG-signature, IHDR fields, chunk bounds, CRCs, IDAT, and IEND checked, hashed, and limited to 2 MiB, 2400 pixels per side, and 8 million pixels. Figures are never upscaled and use aspect-ratio-aware display caps. Remote images, Markdown image syntax, galleries, and side-by-side layouts remain rejected. The private preview uses exact data URIs plus an image-disabled structural simulation; outbound MIME uses reviewed CID parts.

```bash
npm run mail:draft -- preview \
  --to person@example.com \
  --subject 'Table and figure fixture' \
  --body-markdown-file ~/path/to/body-with-table.md \
  --inline-image ~/path/to/figure.png \
  --image-alt 'Descriptive image text' \
  --image-caption 'Optional real text caption.' \
  --out /tmp/email-preview.html
```

A two-figure sequence uses repeated flags:

```bash
npm run mail:draft -- preview \
  --to person@example.com \
  --subject 'Two-figure sequence fixture' \
  --body-markdown-file ~/path/to/body.md \
  --inline-image ~/path/to/first.png \
  --inline-image ~/path/to/second.png \
  --image-alt 'Description of the first image' \
  --image-alt 'Description of the second image' \
  --image-caption 'First caption.' \
  --image-caption= \
  --out /tmp/two-figure-preview.html
```

Existing `--body` and `--body-file` inputs remain literal plain text and cannot carry inline figures.

Use `--dry-run` to validate headers without creating a draft. After Noah reviews and explicitly approves sending the exact draft, review and send it with:

```bash
npm run mail:draft -- review --draft-id DRAFT_ID
npm run mail:draft -- send --draft-id DRAFT_ID --approval-token SHA256_FROM_REVIEW
```

Defaults:

- Accounts: `hello@whatarewecapableof.com`, `noah@whatarewecapableof.com`
- Query: `newer_than:14d -in:spam -in:trash`
- Max messages per account: `10`

Limit to one account:

```bash
npm run mail -- list --account hello@whatarewecapableof.com --query 'newer_than:7d'
```

Export JSON instead of Markdown:

```bash
npm run mail -- export --format json --query 'newer_than:30d from:example.com'
```

Include message bodies in terminal output:

```bash
npm run mail -- list --body --query 'newer_than:7d subject:proposal'
```

## Gmail search examples

- `newer_than:7d is:unread`
- `newer_than:30d from:client@example.com`
- `newer_than:30d (teaspressa OR compassion OR belhaus)`
- `to:hello@whatarewecapableof.com newer_than:14d`
- `subject:(proposal OR invoice OR deck) newer_than:30d`

## Privacy and storage

- Do not commit `.mail/` exports.
- Do not store raw email exports in project memory.
- Convert email into an observation ledger before updating project memory, agents, skills, proposal files, or task lists.
- Preserve source pointers when useful: account, Gmail message ID, thread ID, date, and subject.
- If an email contains credentials, tokens, passwords, private links, or confidential client material, summarize only the durable operational fact and omit the secret.
