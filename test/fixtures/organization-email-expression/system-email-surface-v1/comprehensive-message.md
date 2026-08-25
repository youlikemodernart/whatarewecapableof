# System Email Surface v1

This fixture checks the complete candidate baseline in one message. It includes **strong emphasis**, *quiet emphasis*, `inline code`, and a [descriptive HTTPS link](https://example.invalid/system-email-surface).

A deliberate line break follows this sentence.  
This sentence should begin on the next line without becoming a new paragraph.

## Ordered sequence

1. Review the recipient, subject, body, and attachments.
2. Inspect both MIME alternatives.
3. Confirm the reviewed payload before any send.

## Unordered and nested detail

- The HTML alternative should preserve hierarchy.
- The plain-text alternative should remain useful.
  - Nested items should retain their relationship.
  - Long items should wrap naturally without fixed-height containers.
- A native PDF attachment should remain separate from the body.

### Component status

| Component | Version | State |
| --- | --- | --- |
| Core text | 1.0 | Approved |
| Data table | 1.1 | Candidate |
| Inline figure | 1.2 | Candidate |

**Fallbacks**

- Core text: plain text.
- Data table: pipe-delimited rows.
- Inline figure: alt text and caption.

### Quoted context

> A local browser preview verifies generated structure and presentation.
>
> It does not emulate Gmail, Apple Mail, or Outlook.

---

### Code examples

Use `npm run mail:draft:test` for the local contract suite.

```bash
npm run mail:draft -- preview \
  --to preview@example.invalid \
  --subject "System Email Surface v1 fixture" \
  --body-markdown-file .pi/fixtures/system-email-surface-v1/comprehensive-message.md \
  --out .pi/fixtures/system-email-surface-v1/comprehensive-preview.html
```

For questions, use [email](mailto:hello@example.invalid).

The final paragraph tests ordinary prose after every supported block type. The body should end cleanly before the system note and private signature.
