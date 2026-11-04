# [Sales Rep Hub] Removing any served organization from a rep silently ends the rep's storefront session; an open task dialog keeps sending anonymous mutations

Severity: Medium (proposed) · Provenance: PRE-EXISTING (membership/token handling; PR #26 adds no auth code) — related to VCST-6465 (removing the rep's CURRENT organization → /403), here the removed org is NOT the current one · Not filed yet (5-file: ask the operator)
Env: vcptcore-qa · platform 3.1085.0 · SalesRep 3.1016.0-pr-26-92d4 · Customer 3.1029.0 · theme 2.61.0-pr-2576-be2c · Firefox, 1920×1080, UTC+3
Account: a disposable rep serving AGENT-TEST-6314-ORG-A and -ORG-B (current organization switched to ORG-A first); fixture removed after the run.

## Steps
1. Sign in as a sales rep who serves two organizations; set the current organization to ORG-A.
2. My customers → ORG-B → Quick actions → **Schedule call**; pick a due date (do not save).
3. In the back office remove ORG-B from the rep (`PUT /api/sales-rep` without that organization — the membership is deleted).
4. Click **Save** in the still-open dialog, then **Save** again.

## Actual
- CreateSalesRepTask → HTTP 200, `errors[0]` "Anonymous access denied or access token has expired or is invalid." (`Unauthorized`), although the token was bound to ORG-A, which the rep still serves.
- `GetMe` returns "Anonymous"; the app navigates to `/sign-in?returnUrl=…` with **no message**.
- The Schedule call dialog **stays open on top of the sign-in page** with the draft; a second Save sends another anonymous mutation, again with no feedback. Nothing is written.

## Expected
Removing one served organization should not end the rep's session (the rep still serves ORG-A and holds sales-rep:access); at most, the removed customer becomes unavailable ("Customer not found or not in your customers."). If a session must end, the rep is told why, and no dialog survives the redirect.

## Evidence
screenshots/x1-04-save-after-removal-redirect-sign-in.png · screenshots/x1-05-second-save-dialog-over-sign-in.png · screenshots/x1-06-orgB-page-after-resignin-not-found.png · kb KB-1B066196 (disputed entry — this run is evidence for it on vcptcore), KB-8CDB8E6B
Side effect for VCST-6455 case A: the generic-toast path cannot be reached through the UI on this build, because the session ends first; the server's "Customer not found." refusal was confirmed through the API.
