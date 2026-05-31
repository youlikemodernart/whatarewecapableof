module.exports = {
  "seedSlug": "sample-company-demo-7Vnyc9s3",
  "seedPasscode": "sample-demo",
  "deck": {
    "id": "ask-sample-company-seed",
    "title": "Sample Company Questions",
    "clientLabel": "Sample Company",
    "status": "published",
    "sensitivity": "medium",
    "passcodeRequired": true,
    "estimatedMinutes": 4,
    "welcome": {
      "title": "A few questions before we prepare your package",
      "eyebrow": "Sample Company",
      "body": "These questions help us prepare your project package correctly the first time. Most take a few seconds. When we suggest an answer, you will see why. If you are not certain about something, choose 'Not sure' and we will follow up. This takes about 4 minutes.",
      "privacy": "Please do not enter passwords, account numbers, or full tax ID numbers. If we need a sensitive document, tell us who can provide it and we will set up a secure way to share it."
    },
    "questions": [
      {
        "ref": "respondent-identity",
        "type": "identity",
        "section": "Identity",
        "prompt": "Who are we hearing from?",
        "contextText": "More than one person at your company may answer these, so we want to credit the right person.",
        "required": true,
        "fields": [
          {
            "key": "name",
            "label": "Name",
            "autocomplete": "name"
          },
          {
            "key": "email",
            "label": "Email",
            "autocomplete": "email"
          },
          {
            "key": "role",
            "label": "Your role",
            "autocomplete": "organization-title"
          }
        ]
      },
      {
        "ref": "company-legal-name",
        "type": "short_text",
        "section": "Filing basics",
        "prompt": "What is the company's exact legal name?",
        "contextText": "Use the name exactly as it should appear on official documents. If you are not sure of the exact form, tell us and we will confirm it.",
        "whyItMatters": "The name appears across checklists, document labels, and any preparer handoff.",
        "required": true,
        "placeholder": "Example: Sample Holdings LLC"
      },
      {
        "ref": "year-change-summary",
        "type": "long_text",
        "section": "Context",
        "prompt": "What changed in the business this year?",
        "contextText": "A few words are fine. Think about ownership, payroll, new accounts, new sources of revenue, large purchases, or activity in a new state. If nothing major changed, just say so.",
        "whyItMatters": "Changes in business activity can alter the documents requested, the preparer review path, and the questions that need follow-up.",
        "required": false,
        "placeholder": "Add anything that changed, or write 'nothing major.'"
      },
      {
        "ref": "records-available-now",
        "type": "multi_choice",
        "section": "Source availability",
        "prompt": "Which records can you share now?",
        "contextText": "Pick everything that is ready. Anything you cannot find yet, leave for later and we will follow up.",
        "whyItMatters": "This helps us see what is ready now and what we should ask about later.",
        "required": true,
        "recommendationRationale": "Starting with your bookkeeping export and bank statements usually moves things along fastest. You can send the rest after.",
        "choices": [
          {
            "ref": "bookkeeping-export",
            "label": "Bookkeeping export",
            "description": "General ledger, profit and loss, balance sheet, or similar.",
            "isRecommended": true
          },
          {
            "ref": "bank-statements",
            "label": "Bank statements",
            "description": "Statements for the accounts the business uses.",
            "isRecommended": true
          },
          {
            "ref": "payroll-records",
            "label": "Payroll records",
            "description": "Payroll reports, contractor payment summaries, or similar."
          },
          {
            "ref": "sales-tax-or-state-records",
            "label": "State, sales tax, or local records",
            "description": "Only if relevant to this year."
          },
          {
            "ref": "not-sure-records",
            "label": "Not sure yet",
            "description": "We will follow up so nothing gets missed.",
            "isNotSure": true,
            "createsFollowup": true,
            "requiresReview": true
          }
        ]
      },
      {
        "ref": "clarification-followup",
        "type": "yes_no",
        "section": "Follow-up",
        "prompt": "Can we follow up if something needs a quick clarification?",
        "contextText": "This lets us check a small detail with you instead of guessing.",
        "whyItMatters": "This lets us ask before treating an unclear answer as final.",
        "required": true,
        "recommendedChoiceRef": "yes",
        "recommendationRationale": "Saying yes keeps things moving without holding the whole package for one small question.",
        "choices": [
          {
            "ref": "yes",
            "label": "Yes, follow up when needed",
            "description": "Recommended.",
            "isRecommended": true
          },
          {
            "ref": "no",
            "label": "No, hold unclear items for review",
            "description": "We will set unclear items aside until you can review them.",
            "createsFollowup": true,
            "requiresReview": true
          }
        ]
      },
      {
        "ref": "review-path",
        "type": "single_choice",
        "section": "Review path",
        "prompt": "If a specialist question is still open, how should we handle it?",
        "contextText": "This tells us what to do with anything that is not settled yet, so an open question never turns into a decision by accident.",
        "whyItMatters": "Open tax questions should be reviewed before they become instructions.",
        "required": true,
        "recommendedChoiceRef": "specialist-review",
        "recommendationRationale": "We do not yet have enough to settle these on our own, so a specialist review is the safer call.",
        "choices": [
          {
            "ref": "specialist-review",
            "label": "Send it to a specialist to review",
            "description": "Recommended. Keeps specialist calls with a specialist.",
            "isRecommended": true,
            "createsFollowup": true,
            "requiresReview": true
          },
          {
            "ref": "finance-owner-decides",
            "label": "I will decide after I review the draft",
            "description": "Keeps the call with you."
          },
          {
            "ref": "pause-until-source-complete",
            "label": "Pause until all records are in",
            "description": "We will wait before going further.",
            "createsFollowup": true,
            "requiresReview": true
          },
          {
            "ref": "not-sure-review-path",
            "label": "Not sure",
            "description": "We will follow up to decide together.",
            "isNotSure": true,
            "createsFollowup": true,
            "requiresReview": true
          }
        ]
      },
      {
        "ref": "internal-draft-approval",
        "type": "approval_checkbox",
        "section": "Approval boundary",
        "prompt": "Can we use these answers to prepare your draft?",
        "contextText": "This lets us start preparing your package from what you told us. It does not file anything, send anything, or authorize a payment. Anything official comes back to you first.",
        "whyItMatters": "This gives clear permission to use your answers while keeping official approvals separate.",
        "required": true,
        "approvalText": "Yes, use my answers to prepare the draft. I understand this does not file, send, or pay anything, and that anything official will come back to me for approval.",
        "recommendationRationale": "We save the wording you agreed to along with your answer."
      }
    ]
  }
};
