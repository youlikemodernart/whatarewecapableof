# Organization email expression: simplest renderer-resolution evaluation

Date: 2026-08-24
Status: deterministic rendering and minimal production integration complete; WAWCO voice profile revised to 1.2.0 after live-correspondence feedback
Decision owner: Noah

## Objective

Let the existing restricted-Markdown email renderer receive one explicit, validated organization expression profile while preserving WAWCO output, keeping WAWCO expression private, preventing client fallback to WAWCO, and leaving Gmail identity, signatures, approval tokens, and sends under the existing operator.

## Sources evaluated

- Accepted WAWCO profile: `email-expression/profiles/wawco/profile.json`.
- Provisional NEWW profile: `~/Projects/neww-ai-operating-system/projects/neww-email-expression/profile/profile.json`.
- Existing renderer and operator: `scripts/gmail-draft-markdown.mjs`, `gmail-draft-mime.mjs`, `gmail-draft-send.mjs`, `gmail-draft.mjs`.
- Existing profile validator: `scripts/email-expression-profile.mjs`.
- Current surface contract and 57-test regression suite.
- Recipient-neutral skill: `~/.pi/agent/skills/organization-email-expression/`.
- Design-system references on resolution, multi-brand separation, projection, expression, and migration.
- Software-construction references on deep modules and incremental integration.
- Email rendering constraints in `email-sms-marketing` reference 08.

No external research was needed. The decision is about local authority, current code, and accepted WAWCO behavior. Current email-client facts do not change the minimum architecture, and no proposed new vendor or compiler requires a web check.

## Verdict

Proceed with one small pure resolver inside the existing WAWCO codebase. Do not add a design-token platform, registry service, compiler package, inheritance system, or new deployable.

The first increment should end at local HTML and plain-text rendering. It should not touch Gmail account access, signature loading, draft creation, review, or sending.

Finding at evaluation time, resolved in profile 1.1.0: the earlier profile schema recorded the main visual roles but did not own every appearance decision hardcoded in the renderer. Treating the remaining WAWCO literals as a neutral baseline would have leaked WAWCO expression into NEWW and future client output. The accepted profile now covers the selected semantic roles needed for byte-identical resolution.

## Smallest complete architecture

```text
exact profile file
  -> existing closed validator
  -> resolveEmailPresentation(profile)
  -> frozen renderer-presentation object + resolution record
  -> renderMarkdownEmail(source, { figures, presentation })
  -> exact HTML + plain text + component summary
```

### One new module

Add `scripts/email-expression-resolver.mjs`.

It owns exactly one decision: translating a validated organization profile into the closed literal values the Markdown renderer needs.

Interface:

```js
const resolved = resolveEmailPresentation(validatedProfile);

resolved.presentation
resolved.record = {
  schemaVersion,
  profileId,
  profileVersion,
  profileSha256,
  rendererContractVersion,
  resolvedPresentationSha256
}
```

No network, account, provider, signature, recipient, message-body, filesystem discovery, or profile inference belongs in this module.

### One renderer seam

Change:

```js
renderMarkdownEmail(source, { figures })
```

To:

```js
renderMarkdownEmail(source, { figures, presentation })
```

The renderer must receive a fully resolved object. It must not read profile files, infer organizations, merge profiles, or access private bindings.

### One shadow CLI path

Add a local-only command or option that requires an exact profile path and writes a preview or structured render summary. Do not alter the production default in the first increment.

The existing hardcoded renderer remains callable as the rollback and comparison path.

## Shared baseline versus organization expression

### Shared and fixed

These protect compatibility, safety, or semantic meaning and should remain code-owned:

- restricted CommonMark grammar;
- rejection of raw HTML, embedded Markdown images, unsafe and relative URLs;
- semantic HTML element choice;
- table-based outer email structure and Outlook wrapper mechanism;
- inline CSS requirement;
- HTML escaping and sanitization;
- plain-text alternative generation;
- PNG/PDF validation, CID binding, MIME topology, byte and dimension hard ceilings;
- private preview controls;
- stored-MIME review, content hashes, exact-payload token, uncertain-send rule;
- link underlining and real text captions as usability behavior;
- global maximum capabilities that no organization profile may exceed.

### Organization-owned

These affect recognizable expression and must not silently remain WAWCO constants:

- content measure;
- body, heading, small, code, table, and caption type roles;
- line heights and weights;
- paragraph, section, list, blockquote, table, and figure spacing;
- text, muted text, link, rule, strong rule, quote rule, code surface, and highlight colors;
- highlight palette names and availability;
- border thickness and radius where they create visible character;
- figure width caps by aspect class;
- enabled components and organization-level maxima beneath global hard ceilings.

### Account-operator owned

These remain outside the neutral renderer:

- sender account, From address and display name;
- Bcc policy;
- system-note text and whether it is required;
- system-note presentation that is specific to the sending organization;
- private signature and postal address;
- Gmail draft, review, send, and recovery behavior.

The existing WAWCO system-note label and typography are WAWCO house expression. They must not become a neutral client default. A future client operator either supplies its own approved disclosure component or uses none under its approved policy.

## Minimum profile correction

Do not introduce generic token syntax. Extend `visual` with closed semantic groups the renderer already needs:

```json
{
  "visual": {
    "surfaceId": "...",
    "measurePx": 640,
    "typography": {
      "body": { "family": "system-sans", "sizePx": 16, "lineHeightPx": 24, "weight": 400 },
      "h1": { "sizePx": 24, "lineHeightPx": 30, "weight": 700 },
      "h2": { "sizePx": 20, "lineHeightPx": 26, "weight": 700 },
      "h3": { "sizePx": 17, "lineHeightPx": 24, "weight": 700 },
      "small": { "sizePx": 13, "lineHeightPx": 18 },
      "code": { "family": "system-mono", "sizePx": 14, "lineHeightPx": 20 }
    },
    "spacing": {
      "paragraphAfterPx": 16,
      "sectionBeforePx": 28,
      "listAfterPx": 20,
      "figureBeforePx": 8,
      "figureAfterPx": 24
    },
    "colors": {
      "text": "#202124",
      "mutedText": "#5F6368",
      "link": "#174EA6",
      "rule": "#DADCE0",
      "strongRule": "#5F6368",
      "quoteRule": "#BDC1C6",
      "surfaceMuted": "#F1F3F4",
      "highlight": "#FFE08A",
      "highlightText": "#202124"
    },
    "figures": {
      "landscapeMaxPx": 640,
      "squareMaxPx": 520,
      "portraitMaxPx": 440,
      "tallMaxPx": 360
    }
  }
}
```

Exact field grouping can be made slightly smaller during implementation if every current appearance literal still has one explicit owner. The decision rule is ownership coverage, not schema fullness.

Voice stays first-class in the profile but is not compiled into CSS. The AI loads the exact voice section and the render record carries the same profile identity. Human review continues to judge whether prose follows it.

## Validation rules

- Require one exact profile path.
- Require accepted status for WAWCO production parity; allow provisional only for explicitly local shadow rendering.
- Reject unknown fields.
- Reject profile-to-profile inheritance and per-message style overrides.
- Reject arbitrary HTML, CSS strings, functions, transforms, and remote assets.
- Reject component maxima above global renderer ceilings.
- Reject a disabled component found in the Markdown source.
- Reject unsupported fonts, colors, sizes, weights, spacing, and figure caps.
- Require `measurePx` to agree with the Outlook wrapper width emitted for that profile.
- Emit profile and resolved-presentation hashes in the local render summary.
- Do not add expression metadata to live MIME until local parity passes.

## Incremental implementation and checks

### Increment 1: pure local resolution

1. Expand the schema and WAWCO profile to cover current appearance roles.
2. Add the pure resolver.
3. Parameterize the renderer through one `presentation` object.
4. Keep the legacy no-argument path intact.
5. Render all existing fixtures through both paths.

Acceptance:

- WAWCO HTML and plain text are byte-identical between legacy and profile-resolved paths.
- Component summaries and warnings are identical.
- Identical profile and input produce identical output and hashes.
- Unknown, incomplete, or conflicting profile values fail before rendering.
- No Gmail or private signature access occurs.

### Increment 2: local NEWW shadow render

1. Use the same resolver with the provisional NEWW profile.
2. Render one post-conversation follow-up locally.
3. Verify disabled tables, code, blockquotes, and highlights are rejected when present.
4. Review whether the output is meaningfully distinct without importing WAWCO house devices.

This is a profile-evidence test, not production adoption. NEWW gets no account binding or send route.

### Increment 3: production migration, only after parity

1. Add expression-profile ID/version/hash to helper-built MIME and stored-MIME review under neutral expression-profile headers distinct from sender-policy headers.
2. Bind the WAWCO private account configuration to exact accepted profile `wawco.email.house@1.0.x`.
3. Create and review one self-addressed draft under explicit approval.
4. Keep the legacy renderer selectable for rollback through one bounded compatibility window.
5. Retire the legacy path only after observed use and a separate cleanup decision.

## Rejected alternatives

- DTCG Resolver or Style Dictionary: solves a larger multi-axis token problem and adds a second precedence model without a current need.
- General design-token schema: current need is one email renderer contract, not cross-platform token interchange.
- Profile registry service: exact local paths and immutable IDs are sufficient.
- Profile inheritance: obscures provenance and creates WAWCO-leak risk.
- Automatic profile selection from account, domain, cwd, or message language: wrong-organization risk.
- Arbitrary CSS or HTML in profiles: defeats the existing safety boundary.
- One renderer module per organization: duplicates compatibility and security knowledge.
- Provider logic in the resolver: mixes stable expression with perishable authenticated operations.
- Parameterizing every numeric HTML detail immediately: unnecessary until a visible organization difference or compatibility consequence requires it.
- External research or new packages: no local evidence gap currently justifies either.

## Cost and risk

Expected implementation surface:

- one new pure resolver module;
- one closed profile-schema revision;
- one parameter passed through the existing Markdown renderer;
- focused resolver and parity tests;
- no new dependency, service, datastore, provider, credential, or deployable.

Primary risk: accidentally classifying a WAWCO appearance decision as neutral and carrying it into NEWW. The explicit ownership inventory and NEWW shadow render are the falsifiers.

Secondary risk: profile and runtime schema diverge. Keep one validator path and test the accepted WAWCO and provisional NEWW fixtures against it.

## Increment 1 result

Implemented exactly the recommended local slice:

- added `scripts/email-expression-resolver.mjs` with no dependency, network, private-source, account, or provider access;
- extended the closed profile schema and accepted WAWCO profile 1.1.0 so every selected renderer role has explicit ownership;
- added one optional `presentation` argument to the existing Markdown renderer while retaining the legacy default as rollback;
- added profile component-limit enforcement and disabled-component rejection;
- added a resolution record with profile ID/version/hash, renderer-contract version, and resolved-presentation hash;
- proved deep equality between the resolved WAWCO presentation and the legacy contract;
- proved byte-identical HTML and plain text for the comprehensive fixture, all 12 existing Markdown fixtures across success and failure behavior, and a figure fixture;
- left Gmail, signatures, sender policy, MIME metadata, draft review, sending, and NEWW rendering unchanged.

Checks: profile 7/7, resolver 7/7, existing mail 57/57, JSON schema parse pass, production dependency audit previously zero vulnerabilities after the same dependency state.

Accepted WAWCO profile: `wawco.email.house@1.1.0`, SHA-256 `b7bfbb1ceb7d54c7c3919ccb2550e57fd945e56de9a3b6c7adc052df2a1c17bc`.

## Production integration result

After Noah approved the minimum cutover, the production WAWCO build path was wired to the accepted resolver. WAWCO MIME now carries three expression markers: profile ID, version, and SHA-256. Stored-MIME review binds those markers to the current accepted WAWCO profile before issuing the existing exact-payload approval token. No extra registry, runtime selector, renderer hash header, service, or dependency was added.

One approved self-addressed production check completed from `noah@whatarewecapableof.com` to the same address. Gmail returned `UNREAD`, `SENT`, and `INBOX`; no retry occurred. Message ID: `private Gmail Sent review, 2026-08-24`. Receipt: `.pi/fixtures/organization-email-expression/wawco-production-cutover/send-receipt.json`.

Final checks: profile 7/7, resolver 7/7, mail 58/58, dependency audit zero vulnerabilities.

## Voice-profile follow-up

Review of recent live client correspondence found a separate editorial issue: accurate internal reasoning was surfacing as overly semantic, status-like prose. Under Noah's approval, profile 1.2.0 adds recipient-facing translation, natural correspondence over status taxonomies, ordinary language before system terms, and an anti-rule against exposing the full semantic structure merely because the system can articulate it. The visual presentation is unchanged and remains byte-identical to the legacy contract.

Current accepted profile: `wawco.email.house@1.2.0`, SHA-256 `3efdf3e9597dd24e4a2c25200f2066e57ad7d736bed045f097850a9a6faa0243`.

## Recommendation

Treat WAWCO migration as complete. Keep the legacy no-argument presentation object as the immediate code rollback reference. Use the 1.2.0 voice rules for future drafting and evaluate them through ordinary correspondence. Keep NEWW provisional and unbound until a separately approved local shadow-render slice resolves its remaining voice and visual evidence gaps.
