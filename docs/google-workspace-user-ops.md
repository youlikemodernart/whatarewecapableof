# WAWCO Workspace user operations

Use `npm run workspace:admin -- ...` for approved WAWCO Google Workspace user diagnostics, creation, and password recovery.

## Boundary

Default posture: read-only.

External writes require explicit current-session approval. Approval must name the target user and action.

Allowed by this helper after approval:

- Read one WAWCO user metadata record.
- Create one standard `@whatarewecapableof.com` user with an external recovery email and temporary password.
- Reset one non-admin WAWCO user's password, set an external recovery email, and require password change at next login.

Not allowed by this helper:

- Gmail send, draft, archive, label, delete, or mailbox mutation.
- Group, alias, admin-role, license, org-unit, Drive, Docs, Sheets, Calendar, Chat, or Cloud Identity changes.
- Documenso resend/reminder/cancel or recipient changes.
- Google Cloud IAM, API enablement, service-account key changes, or DWD scope changes.

## Setup already verified

- WAWCO service account: `booking-tool@valid-complex-494323-p1.iam.gserviceaccount.com`.
- OAuth client ID: `103642820677979156058`.
- Broad 114-scope Domain-wide Delegation token exchange verified on 2026-06-04.
- Admin SDK API enabled manually by Noah and Admin Directory user read verified on 2026-06-05.
- DWD receipt: `~/.pi/private/wawco-google/dwd-verify/wawco-wide-dwd-verify-20260604T235419Z.json`.
- Admin Directory read receipt: `~/.pi/private/wawco-google/admin-sdk-verify/admin-sdk-user-verify-20260605T000635Z.json`.

## Commands

### Read one user

```bash
npm run workspace:admin -- status \
  --user user@whatarewecapableof.com \
  --receipt ~/.pi/private/wawco-google/workspace-admin/user-status-$(date -u +%Y%m%dT%H%M%SZ).json
```

What to check:

- `active` is true.
- `nonAdmin` is true unless the user is intentionally an admin.
- `recoveryEmailPresent` is true for collaborator accounts.
- `changePasswordAtNextLogin` is false after first login.
- `mailboxSetup` is true.

### Reset one user

Approval phrase:

```text
Approve WAWCO Workspace reset for <user>: set recovery email and reset password.
```

Command:

```bash
npm run workspace:admin -- reset \
  --user user@whatarewecapableof.com \
  --recovery-email person@example.com \
  --confirm RESET-WAWCO-USER \
  --i-understand-live-write USER-PASSWORD-RESET \
  --password-out ~/.pi/private/wawco-google/workspace-admin/user-temp-password.txt
```

Print to terminal or chat only when Noah explicitly approves printing the temporary password:

```bash
npm run workspace:admin -- reset \
  --user user@whatarewecapableof.com \
  --recovery-email person@example.com \
  --confirm RESET-WAWCO-USER \
  --i-understand-live-write USER-PASSWORD-RESET \
  --print-password
```

The receipt stores a hash of the temporary password, not the raw temporary password. Receipt paths must stay under `~/.pi/private` or project `.pi/private`.

### Create one user

Approval phrase:

```text
Approve WAWCO Workspace user create for <user>: create user with recovery email and temporary password.
```

Command:

```bash
npm run workspace:admin -- create \
  --user first@whatarewecapableof.com \
  --given-name First \
  --family-name Last \
  --recovery-email person@example.com \
  --confirm CREATE-WAWCO-USER \
  --i-understand-live-write USER-CREATE \
  --password-out ~/.pi/private/wawco-google/workspace-admin/first-temp-password.txt
```

After creation, verify status and confirm whether Google auto-assigned a license in Admin Console if licensing matters.

## New-user checklist

Before sending important documents or invitations to a new WAWCO address:

1. Create the user with external recovery email and temporary password.
2. Require password change at next login.
3. Verify the user is active, non-admin, mailbox setup, and recovery email present.
4. Give the temporary password through a private channel.
5. Ask the user to sign in and change the password.
6. Run a follow-up `status` check.
7. Only then send Documenso invitations, client docs, or time-sensitive links to the WAWCO address.

If the login is not confirmed yet, send critical signatures or files to the person's external email instead, or wait.

## Troubleshooting

If token exchange fails:

- Check the WAWCO DWD scope receipt and scope set.
- Check that `.env.local` has `GOOGLE_SERVICE_ACCOUNT_KEY`.
- Check `docs/google-workspace-access.md` and `~/.pi/agent/google/capabilities.json`.

If Admin Directory calls fail with API disabled:

- Admin SDK API must be enabled for project `valid-complex-494323-p1`.

If mutation fails:

- Verify the target is a non-admin WAWCO primary email, not an alias.
- Verify the target is not suspended unless `--allow-suspended-reset` is intentional and approved.
- Verify the impersonation subject is `hello@whatarewecapableof.com` or `noah@whatarewecapableof.com`.
- Verify the `--confirm` and `--i-understand-live-write` flags match exactly.
- Check the private receipt, then decide whether to use Admin Console manually.

## Security notes

- Treat temporary passwords as secrets even when they are short-lived.
- Prefer `--password-out ~/.pi/private/...` over printing in chat unless Noah explicitly asks to print.
- Delete private temporary password files after handoff.
- Do not commit receipts or password files.
- Do not use the broad DWD scopes as blanket permission. Every mutation still needs a specific approval gate.
