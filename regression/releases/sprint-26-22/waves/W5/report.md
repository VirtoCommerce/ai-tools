# Sprint 26-22 · W5 Company & organization — report

Owner: Aleksandra Mitricheva · env `vcst` (Platform 3.1097.0, theme 2.62.0-alpha.2647, Customer 3.1033.0,
ProfileExperienceApi 3.1024.0) · sub-task VCST-6801 · 2026-11-12

## Result

All 141 cases have a result (latest result per case, `cases.json`): **110 PASS · 12 FAIL · 9 BLOCKED · 10 SKIPPED**.
Every FAIL and BLOCKED case has a ledger row (`untriaged` 0).

| Suite | Cases | PASS | FAIL | BLOCKED | SKIPPED |
|---|---|---|---|---|---|
| 006 B2B Organization | 71 | 57 | 4 | 6 | 4 |
| 008 B2B Members | 40 | 27 | 5 | 2 | 6 |
| 011b B2B Company E2E | 30 | 26 | 3 | 1 | 0 |

Five runs, each replacing the earlier result of the cases it re-ran:

| Run | Cases | Why |
|---|---|---|
| REG-2026-11-12-0725-W5 | 141 | first run — 129 BLOCKED on sign-in (owner's vcst passwords out of date) |
| REG-2026-11-12-0837-W5b | 56 | cases that did not need the failing accounts; `seed:membership-lock` allowed |
| REG-2026-11-12-0914-W5c | 70 | after ORG_USER / MULTI_ORG_USER passwords were reset |
| REG-2026-11-12-1008-W5d | 8 | after the B2B_USER_PASSWORD accounts were reset — 8/8 PASS |
| REG-2026-11-12-1023-W5e | 17 | after the B2B-store roles whitelist was set — role dialogs work |

## FAIL by verdict

- **REAL_BUG (1 defect, not new in this sprint, DRAFT):** B2C-MBR-031 (+ B2C-MBR-025) — the `/company/members`
  Role filter offers "Store manager", which returns no members. `organization.contactRoles` aggregates roles over every
  membership record of the org, `organization.contacts` lists only contacts linked to it; on TechFlow 10 of 29
  memberships have an unlinked contact. Route: `vc-module-profile-experience-api`, P3. Replaces the stale draft
  `reports/bugs/open/medium/BUG-members-role-facet-static-list.md` (blamed a static vc-frontend list). Evidence:
  `reports/regression/REG-2026-11-12-0914-W5c/evidence/B2C-MBR-025/` (owner's machine). kb KB-356A2FB9.
- **DUPLICATE:** COMP-E2E-022 → **VCST-5314** (500 with raw SQL on membership create without `userId`; orphan
  membership with `userId:""`). Still reproduces; the ticket has been in **Draft** since 2026-06-22 — schema
  disclosure in an error body deserves a look.
- **TEST_DEFECT (9):**
  - B2C-ORG-045/050/051, COMP-E2E-024 — a user with no accessible org now signs in with no organization (BL-AUTH-016,
    VCST-5281 Done) instead of the old /403 or Forbidden. Access boundary re-checked live: no org data leaks
    (KB-CFF49BB0).
  - B2C-MBR-023, COMP-E2E-001 — Delete keeps the row as Inactive, as the storefront user guide documents. The confirm
    dialog copy ("delete … from the company members list") contradicts the guide — observation, not filed.
  - B2C-MBR-033 — no Resend on a declined row; re-invite works through the Invite dialog (KB-BAEBCDA7).
  - B2C-MBR-004 — the default invite role is the first whitelisted role, not a fixed one.
  - B2C-ORG-057 — the touch-target probe counts a hidden 1×1 radio; the 560×20 rows meet the WCAG 2.5.8 spacing
    exception. Ruled differently (strict 24×24), it becomes a P3 vc-frontend bug.

## BLOCKED causes and the fix for each

| Cases | Verdict | Fix |
|---|---|---|
| B2C-ORG-055, 058, 070 | NOT_TESTABLE | need `page.route` / CDP throttling, which the `enforce-real-user` hook forbids in MCP lanes — Playwright `.spec` twins |
| B2C-ORG-040, COMP-E2E-025 | TEST_DEFECT | setup must create the contact with `organizations` [TechFlow, BuildRight] |
| B2C-ORG-042 | DATA | a dedicated >N-org frontend-lane fixture |
| B2C-MBR-040 | DATA | case sets TechFlow `Organization.Roles` itself and restores it |
| B2C-MBR-041 | DATA | bind a zero-membership contact (MULTI_ORG_USER has a human-made Valvo membership) |
| B2C-ORG-031 | ENV_CONFIG | `PERSONAL_USER_VIRTO_PASSWORD` into the owner's `.env.local` |

## Changes made on vcst during this wave (owner's decisions)

- **Passwords reset to the owner's values:** ORG_USER (test-emily), MULTI_ORG_USER and every `b2b/users` account with
  `{{B2B_USER_PASSWORD}}` (ACME_*, TECHFLOW_BUYER, BUILDRIGHT_ADMIN, …). Anyone using the old values must take the
  current ones from the team secret store.
- **`Customer.MembershipRolesWhitelist` on B2B-store** set from an empty override to the seeder's 7 roles
  (`npm run seed:membership-roles`) and **left in place**. `--teardown` would restore the empty pre-state.
- **B2B-store white-labeling `themePresetName`** switched Mercury → Red for B2C-ORG-064 and restored to Mercury
  (read back).
- `seed:membership-lock` torn down after every run; `:verify` OK. Its "V6 IS NO LONGER LOCKED" line reads a stale
  hardcoded membership id — V6 (IMPERSONATE_TARGET_BLOCKED) is intact (its only membership is locked).

## Case and fixture repairs

Not applied on this branch. Each `OPEN:` row in `ledger.csv` names its repair; they go through
`/qa-review-tests suite <ID> --fix` (one author per suite CSV), and the repaired cases are re-run before they are
called fixed.
