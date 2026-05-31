# Ask deck import contract: `ask.deck.v0`

This contract is for AI-session-generated question decks imported into WAWCO Ask. It is the primary setup path for v0. The manual builder remains a later fallback.

## Boundary

- Do not include raw email, Slack, message, transcript, credential, or client source text in the deck packet.
- Store only the question text needed for a respondent to answer.
- Respondents use a private link and passcode. Imported decks cannot disable the passcode. Google OAuth is admin-only.
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
- an `ask_deck_events` audit row

The passcode is returned once to the importing admin or CLI output. Do not commit it or paste it into durable memory.
