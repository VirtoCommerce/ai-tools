# Sprint 26-22 · W5 Company & organization — report

Owner: Aleksandra Mitricheva · env `vcst` (Platform 3.1097.0, theme 2.62.0-alpha.2647, Customer 3.1033.0,
ProfileExperienceApi 3.1024.0) · sub-task VCST-6801 · 2026-11-12

## Result

All 141 cases have a result (latest result per case, `cases.json`): **122 PASS · 4 FAIL · 5 BLOCKED · 10 SKIPPED**.
Every FAIL and BLOCKED case has a ledger row (`untriaged` 0). Every FAIL is a filed product bug.

| Suite | Cases | PASS | FAIL | BLOCKED | SKIPPED |
|---|---|---|---|---|---|
| 006 B2B Organization | 71 | 61 | 1 | 5 | 4 |
| 008 B2B Members | 40 | 32 | 2 | 0 | 6 |
| 011b B2B Company E2E | 30 | 29 | 1 | 0 | 0 |

Runs (each re-run replaces the earlier result of the cases it re-ran):

| Run | Cases | Why |
|---|---|---|
| REG-2026-11-12-0725-W5 | 141 | first run — 129 BLOCKED on sign-in (owner's vcst passwords out of date) |
| -0837-W5b · -0914-W5c · -1008-W5d | 56 · 70 · 8 | after the passwords were reset, group by group |
| -1023-W5e | 17 | after the B2B-store roles whitelist was set |
| -1214-W5f · -1235-W5g · -1248-W5h · -1315-W5i | 15 · 4 · 4 · 1 | re-runs of the 15 repaired cases (W5g: correct password name; W5h: whitelist re-applied; W5i: B2C-MBR-033 setup fixed) |

## FAIL — all filed

| Cases | Bug | Severity | New in sprint |
|---|---|---|---|
| B2C-ORG-057 | **VCST-6826** — mobile menu "My organizations" list collapses to ~2 px at 400% zoom (320×225); organizations cannot be seen or selected. `vc-frontend` `multi-organisation-menu.vue:104`, WCAG 1.4.10. In bundles v15 and v16 | Medium | no (VCST-4357, 2025-12) |
| B2C-MBR-031, B2C-MBR-025 | **VCST-6823** — Role filter offers a role that matches no member: `organization.contactRoles` counts memberships of contacts not linked to the org. `vc-module-profile-experience-api`. No storefront/Admin flow creates the trigger; only a direct membership POST or legacy data | Low | no (VCST-5450) |
| COMP-E2E-022 | **VCST-5314** (existing, in Draft since 2026-06-22) — membership create without `userId` answers 500 with raw SQL names; comment added that it still reproduces | High | no |

## BLOCKED

| Cases | Verdict | What unblocks it |
|---|---|---|
| B2C-ORG-055, 058, 070 | NOT_TESTABLE | need `page.route` / CDP throttling, forbidden in MCP lanes by the `enforce-real-user` hook — Playwright `.spec` twins |
| B2C-ORG-042 | DATA | a dedicated >N-organization frontend-lane fixture |
| B2C-ORG-031 | ENV_CONFIG | `PERSONAL_USER_VIRTO_PASSWORD` in the owner's `.env.local` |

## Case repairs (this PR)

15 cases re-based to the documented / observed behaviour and **re-run green** (B2C-MBR-025 still fails only on
VCST-6823, B2C-ORG-057 now fails only on VCST-6826 — both intended):
- no-org sign-in renders the dashboard, org data stays refused (B2C-ORG-045/050/051, COMP-E2E-024; BL-AUTH-016, KB-CFF49BB0);
- Delete keeps the member row as Inactive, per the storefront user guide (B2C-MBR-023, COMP-E2E-001);
- re-invite through the Invite dialog (B2C-MBR-033); invite default = first whitelisted role (B2C-MBR-004);
- setups create contacts with `organizations` (B2C-ORG-040, B2C-MBR-031, B2C-MBR-033, COMP-E2E-025);
- data the case owns per the FIFTH RULE (B2C-MBR-040 sets TechFlow roles and restores them; B2C-MBR-041 on a dedicated zero-membership contact);
- zoom by CSS-viewport equivalence + WCAG 2.5.8 spacing exception (B2C-ORG-057).

## Changes made on vcst during this wave (owner's decisions)

- **Passwords reset to the owner's values:** ORG_USER (test-emily), MULTI_ORG_USER and every `b2b/users` account with
  `{{B2B_USER_PASSWORD}}`. Anyone on the old values must take the current ones from the team secret store.
- **`Customer.MembershipRolesWhitelist` on B2B-store** set from an empty override to the seeder's 7 roles
  (`npm run seed:membership-roles`), **left in place**. It was emptied again at 12:14:46 UTC under `admin` (by whom is
  not established) and re-applied at ~12:47 UTC on the owner's decision.
- **B2B-store white-labeling `themePresetName`** switched Mercury → Red for one case and restored (read back).
- `seed:membership-lock` torn down after every run; `:verify` OK (its V6 line reads a stale id — backlog).

## Open

Nothing blocks the wave's own record. Left for others: the three `.spec` twins, the >N-org fixture, the missing
secret, and the two filed bugs. Wave stays **TRIAGED** until those `OPEN:` rows close.
