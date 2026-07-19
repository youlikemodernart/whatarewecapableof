# Ask deck import contract: `ask.deck.v0`

This contract is for AI-session-generated question decks imported into WAWCO Ask. It is the primary setup path for v0. The manual builder remains a later fallback.

## Boundary

- Do not include raw email, Slack, message, transcript, credential, or client source text in the deck packet.
- Store only the question text needed for a respondent to answer.
- Respondents use a private link and passcode. Imported decks cannot disable the passcode. Google OAuth is admin-only.
- A link-only, human-readable URL is deliberately not an import option. It can only be applied through the authenticated admin access-reconfiguration path to a published low- or medium-sensitivity deck with zero response rows. The caller must explicitly acknowledge that anyone with the URL can open the welcome screen.
- Imported responses are review evidence only. They must not trigger external sends or workboard updates automatically.

## Top-level shape

```json
{
  "schemaVersion": "ask.deck.v0",
  "title": "2026 planning questions",
  "clientLabel": "Sample Company",
  "status": "published",
  "sensitivity": "medium",
  "estimatedMinutes": 4,
  "sourceLabel": "AI session, 2026-05-31",
  "sourceSummary": "Sanitized summary of why these questions are being asked. Do not include raw source text.",
  "welcome": {
    "title": "A few questions before we continue",
    "body": "Short respondent-facing setup copy.",
    "privacy": "Only WAWCO can review these answers."
  },
  "questions": []
}
```

## Supported question types

- `identity`
- `short_text`
- `long_text`
- `multi_choice`
- `single_choice`
- `yes_no`
- `approval_checkbox`

Every question needs a stable lowercase `ref`, a supported `type`, a respondent-facing `prompt`, and optional `section`, `contextText`, `recommendationRationale`, and `required` fields.

Identity questions can declare an exact `fields` array using `name`, `email`, and/or `role`. Each field may set `label` and `required`. When `fields` is omitted, legacy decks keep the required name, email, and role defaults. Email uses server-side validation.

```json
{
  "ref": "respondent-identity",
  "type": "identity",
  "prompt": "Who is submitting this form?",
  "required": true,
  "fields": [
    { "key": "name", "label": "Your name" },
    { "key": "email", "label": "Kamp Love email" }
  ]
}
```

## Link-only access reconfiguration

Link-only access is an admin-only exception for a specific existing deck. It is not valid inside `ask.deck.v0` import JSON. The authenticated, CSRF-protected admin endpoint accepts a deck ID and an access object:

```json
{
  "id": "ask_deck_example",
  "access": {
    "mode": "link-only",
    "publicSlug": "campaign-discovery",
    "publicExposureAcknowledged": true
  }
}
```

Rules:

- The deck must be published and have zero `ask_responses` rows, including started drafts.
- High-sensitivity decks cannot use link-only access.
- `publicSlug` uses lowercase letters, numbers, and single dashes. It must be unique.
- The old private slug stops resolving when the new link-only slug is applied.
- Link-only metadata shows only the intentional title, client label, and welcome copy. It does not reveal questions until the respondent selects `Begin questions`.
- A started or submitted response permanently blocks further access-mode changes. This prevents a shared link from being changed underneath an active response set.
- Switching back to `passcode` creates a new random slug and passcode. No prior passcode is returned or retained by the access reconfiguration event.

## Zero-response question revision

A published deck can receive a new question-schema version without changing its deck ID, access mode, or public URL. This is an authenticated, CSRF-protected admin PATCH with `"action": "revise-questions"`, a deck ID, and a replacement `questions` array.

- It preserves the existing title, client label, welcome, sensitivity, and access settings.
- It rejects any deck with a started, submitted, reviewed, or void response.
- It uses the same deck-row lock as response start, so a response cannot begin against a version being replaced.
- Revisions record only question count and schema hash in the audit event, not raw question text.
- After a response starts, question revisions are locked and require a new human decision.

Choice questions need unique choice `ref` values and respondent-facing labels. Choice flags can mark review work without showing internal language to the respondent:

- `isRecommended`
- `createsFollowup`
- `createsBlocker`
- `isNotSure`
- `requiresReview`

## Import outputs

Successful import generates:

- a high-entropy public slug
- a respondent URL
- a high-entropy passcode for every imported deck
- an `ask_deck` row and `ask_deck_version` row
- an `ask_deck_events` audit row that records the safe default access mode

The passcode is returned once to the importing admin or CLI output. Do not commit it or paste it into durable memory.
