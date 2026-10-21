# VCST-6132 — Testing checklist (FULL) · **Verdict: PASS WITH NOTES**

OTP sign-in falls back when the last-used organization is blocked · fix: vc-module-customer PR #321 (head `c54fcfe2`)
Env `TEST_ENV=vcptcore_qa1`, store `{{STORE_ID}}` · Customer `3.1030.0-pr-321-c54f` · Platform `3.1084.0-pr-3140` · Theme `2.61.0-pr-2575`
Model: `reports/ba/test-models/VCST-6132-2026-10-20.md` (amended by 3x) · Discovery: `reports/exploratory/SBTM-VCST-6132-2026-10-20.md`
Prior round: `reports/tickets/Sprint26-20/VCST-6132/` (FAST, 2026-10-16, API only, 11/11 PASS, storefront never run)

**Method.** Fixtures are created in the case (FIFTH RULE): disposable `AGENT-TEST-6132-*` Org A / Org B and one buyer
(userName == email) who is an active member of both, A first. Org A is made last-used through the header switcher, then its
state is changed through Admin REST. A fresh code is used per scenario, read from the notification journal (SMTP is down on
qa1). Every API sign-in sends `organization_id` = Org A. Shared personas are never mutated. Tear down at the end.

**Columns.** Model # = scenario row in the Test Model · Src = story S*/R*, gap G*, discovery 3x N* · Layer = UI (storefront,
`playwright-chrome`) or API (`/connect/token` REST).

| # | Model | Src | Layer | Condition | Expected | Result |
|---|---|---|---|---|---|---|
| 1 | #1 | S2, R2b | UI | [JOURNEY] A locked, B active → sign in by code | signed in, header **Org B**, token claim B; after unlock + sign out/in by code → header **Org A** | PASS — claim B, header B; after unlock → A (4a-ui-01-*) |
| 2 | #1 | — | Admin | Sign-in log for #1's two sign-ins | two rows, Type `OTP`, Outcome success | PASS — 2 rows OTP, success (REST sign-in-log) |
| 3 | #2 | S1 | UI+API | A removed (Member of companies) → sign in by code | 200, claim B, header Org B; no `invalid_organization_id` | PASS — UI header B + API 200 claim B |
| 4 | #3 | S3 | UI+API | A Invited → sign in by code | 200, claim B, header B; A absent from switcher | PASS — UI B, A absent; API claim B |
| 5 | #4 | S3 | UI+API | A Rejected → sign in by code | 200, claim B, header B; A absent from switcher | PASS — UI B, A absent; API claim B |
| 6 | #5 | S3, 3x N2 | UI+API | A Deleted → sign in by code | 200, claim B, header B; A not offered | PASS — UI B; API claim B |
| 7 | #6 | S2, 3x N1 | UI | Switcher after #1's fallback | A listed **disabled with a padlock** (not selectable), B selected; clicking A changes nothing | PASS* (Q2 open) — Expected came from 3x N1, build-derived; A disabled+padlock, tooltip "This organization is locked…", click fires nothing (4a-ui-07) |
| 8 | #7 | S4a | UI+API | A and B both locked → sign in by code | 200, **no** `organization_id` claim; no org label, no switcher | PASS* — 200, no claim, no org selected/label ({SPEC} S4); Organizations list still shows A+B disabled — my "no switcher" over-specified the SPEC (Q2) |
| 9 | #8 | S4b | API | A and B both Rejected (otp_email) | 400 `invalid_grant`, exactly one `errors[]` entry, code `user_is_rejected_in_organization`; same as password | PASS — 400, 1 entry user_is_rejected_in_organization, = password |
| 10 | #8 | S4b, G-10, 3x N5 | UI | Same state, verify-step message | org-specific message per BL-AUTH-013, no internal org id shown | FAIL — raw English server text with org GUID (F2, pre-existing, Low) |
| 11 | #9 | S4b | API | A and B both Invited (otp_email vs password) | 400, one entry, `user_invitation_pending_in_organization`; parity | PASS — 400 user_invitation_pending_in_organization, parity |
| 12 | #10 | S4b | API | A and B both Deleted (otp_email vs password) | 400, one entry, `user_is_removed_from_organization`; parity | PASS — 400 user_is_removed_from_organization, parity |
| 13 | #11 | 3x N6 | API | A removed + B Rejected, otp_email vs password | both 200, no `organization_id` claim (parity) | PASS — both 200, no claim |
| 14 | #11 | 3x N8 | UI | Same state in the storefront | signed in, name only; `/company/info` → `/account/dashboard` | PASS — name only, /company/info → /account/dashboard |
| 15 | #12 | S4 parity | API | A locked + B Rejected, otp_email vs password | identical outcome on both grants | PASS — both 200, no claim (identical) |
| 16 | #13 | R1 | API | Password: A removed / locked / Rejected, B active | 200, claim B each (password fallback not regressed) | PASS — 200 claim B ×3 |
| 17 | #14 | R2 | UI | Both active, A last-used → sign in by code | header **Org A** (last-used respected) | PASS — header A (control distinguishes Current=B) |
| 18 | #15 | R3, G-8 | UI+API | Explicit switch (`refresh_token`) to an org locked / removed mid-session | 400 `user_is_locked_in_organization` / `invalid_organization_id`; header unchanged | PASS* — fresh-token refresh: 400 user_is_locked_in_organization / invalid_organization_id; mid-session membership write revokes tokens by design (KB-D1D30720) → UI silent sign-out (F3, pre-existing, Low); never lands in the blocked org |
| 19 | #15 | R3 | UI | Switcher A ↔ B with both active | each switch lands in the chosen org | PASS — A↔B each lands |
| 20 | #16 | G-8 | API | Login on behalf (impersonate) naming an org the buyer is locked in | refused with the org code; no token for another org | PASS — impersonate refused with org code, no substitution (KB-DC2411FF) |
| 21 | #17 | G-5 | API | Contact `CurrentOrganizationId` after #1's fallback / after #8 | = B after fallback; unchanged when no org resolved | PASS — A→B after fallback; unchanged when nothing resolved / on 400 |
| 22 | #18 | G-7, 3x N3 | UI | localStorage org key after fallback, reload, next sign-in | key stays A; next code sign-in sends A; after restore, lands A | PASS — key stays A; next sign-in sends A; after unlock → A |
| 23 | #19 | G-1, G-6 | API+UI | Wrong code, A blocked | `invalid_code` inline, never an org code; `CurrentOrganizationId` unchanged | PASS — 400 invalid_code, inline "That code didn't work.", Current unchanged |
| 24 | #20 | 3x N4 | UI | Email typed in a different letter case than userName | last-used org is still sent ({SPEC}); 3x observed it dropped (suspect S1) | FAIL — no organization_id sent, lands B (F1, pre-existing, Low) |
| 25 | #21 | G-12 | API | Globally locked-out buyer, A blocked | global lockout code, no org fallback | PASS — user_is_locked_out / user_is_temporary_locked_out, no fallback |
| 26 | — | AC-T | API | Every 200 above: decode the access token | `organization_id` claim as stated per row | PASS — every 200 decoded per row |
| 27 | — | 3x | UI | One accessible org left (#6) | Organizations list hidden, header shows name only | PASS — no Organizations list, name only |
| 28 | #1 | 1d C6 | API | Global lock flag after #1's org lock (`/security/users/{id}/locked`) | `locked: false` — org lock never touches the account (BL-AUTH-012) | PASS — locked:false |
| 29 | #14 | 1d C27 | UI | First code sign-in in a fresh browser (no stored org key) | no `organization_id` sent; resolves by the BL-AUTH-015 chain, 200 | PASS — nothing sent, 200, claim A |

**Not run, and why.**
- MFA sign-in is out of scope: it ships with VCST-5904.
- #22, the fallback target versus the default/current org (3x N7: picks list order, ignores Default and Current), waits for
  the developer's answer to Q1. No case is written for it.
- Sign-in log `organizationId: null` and `failureReason: Unknown` are an observation that goes to Q3, not a check.

**Coverage.** Every atomic condition maps to a row above, or to the `Not run` list with a reason. The 23 authored Artifact-A
cases are `PENDING-A` until `3-cases`: 13 in suite 104 (UI) and 10 in suite 105 (API); #22 was dropped.

**Run results (2026-10-19/20 UTC).** 4a UI 22:01–22:25Z (playwright-chrome) · 4a API 22:01–22:10Z (REST) · C1 `REG-2026-10-20-0125`: 21 PASS / 5 FAIL / 3 BLOCKED.
- C1 FAILs are all expected: OTP-036 (F2), OTP-041 (F1), and CUST-110/111/113 (RE-BASE: the password fallback returns 200, so the stale assertions need rewriting).
- C1 BLOCKED (lane infrastructure, no product result): B2C-MBR-020, COMP-E2E-005, AUTH-075.
- `PASS*` means re-graded against the ticket `{SPEC}` because my checklist Expected was stricter than the spec. The reason is given inline.
- Every condition the ticket names passes on both surfaces. The 2 FAIL rows are pre-existing storefront gaps that PR #321 did not introduce.
- Not filed (below severity floor): F1–F4 + the switcher a11y note. Drafts are in `reports/bugs/open/low/*VCST-6132*`.
