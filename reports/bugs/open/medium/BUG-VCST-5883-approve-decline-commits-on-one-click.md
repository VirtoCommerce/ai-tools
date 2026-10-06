# "Approve / decline" commits the decision on one click — an untouched grid approves every line

- **Severity:** Medium (UX / error prevention)
- **Provenance:** IN-SCOPE — VCST-5883 (PR #27 Admin SPA Line items blade)
- **Environment:** vcptcore-qa1 · Return `3.1003.0-pr-27-51fc`
- **Found by:** `/qa-test VCST-5883` — visual lane (accidentally approved RET260928-00007) and checklist A1 (RET260928-00004)
- **Evidence:** `reports/tickets/Sprint26-19/VCST-5883/screenshots/4v-admin-lineitems-INCIDENT-auto-approved.png` · `4a-be-A1-new-00004-before-click.png` · `4a-be-A1-A16-00004-after-click.png`

## Steps to reproduce

1. Admin → Returns → a **Requested** return → **Line items**.
2. Without editing anything, click the toolbar button **Approve / decline**.

## Expected

The button opens the decision (or asks for confirmation) before a terminal, buyer-notifying decision is
recorded — the ticket describes "an Authorize dialog with per-line quantities".

## Actual

The per-line **Approved** cells are inline inputs pre-filled with the requested quantity. The button posts
`/authorize` immediately — no dialog, no confirmation — and every line is approved in full. Nothing on screen
says the grid values are what will be submitted. The decision cannot be undone and the buyer is emailed.

## Impact

One misclick approves the whole return. It happened during this test run to a tester who expected a form.
