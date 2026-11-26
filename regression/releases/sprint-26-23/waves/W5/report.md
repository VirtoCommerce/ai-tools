# W5 — B2B organizations, members, lists · REG-2026-11-26-0955-W5

Owner Elena Kutasina · vcst · Platform 3.1101.0 · theme 2.63.0-alpha.2681 · shared accounts (no persona set) · runners chunked by ~17 cases.

| Suite | Planned | Pass | Fail | Blocked | Skipped |
|---|---|---|---|---|---|
| 006 B2B Organization | 72 | 66 | 1 | 4 | 1 |
| 008 B2B Members | 40 | 22 | 1 | 11 | 6 |
| 007 B2B Lists & Shared | 77 | 46 | 8 | 10 | 13 |

## Before triage (owner) — 35 FAIL/BLOCKED without a ledger row
- **Known defects:** ORG-078 (locked org → `/connect/token` 400 ID2018, silent guest reload, KB-D59DDAAD); MBR-031 (VCST-6823, "Store manager" filter returns 0).
- **Rep-shared lists (007):** LIST-052/071 list missing from recipient's lists (KB-EAA7BA2F, KB-AA3C8721); LIST-053/070 notification lacks rep/list/org (KB-5AB85ADC); LIST-054 recipient has no remove control and `/403` despite Write (KB-018640B1); LIST-051 403 page shows no cause (VCST-5724, KB-50D03D62). LIST-045 expected-fail (not built); LIST-072 probably stale text.
- **ENV_CONFIG:** 008 MBR-004..008/019/023/033/036..038 — B2B-store `Customer.MembershipRolesWhitelist` is empty (KB-68D63D8C).
- **Data:** LIST-017..019/023..025 need two org-mates; `same_org_pair` in `agent-user-pool.csv` is wrong on vcst.
- **Runner / premise:** LIST-035/082 (getComputedStyle), ORG-070 (route interception), ORG-034/037/040, LIST-016/043 (single-recipient share design is stale).
- **Incidental, unconfirmed:** raw i18n `Sales_rep.navigation.link` flashes in `/company/members`; list-row remove announced as "Remove from cart"; "1 items selected" in every locale; two unnamed icon buttons in the 375px menu; org-switcher filter returns all orgs for "Fill-Fil" (KB-55B05609).
- **Stand:** BUILDRIGHT_ADMIN temporarily locked out ~07:01Z; PERSONAL_USER_VIRTO no longer signs in; IMPERSONATE_TARGET_BLOCKED is unlocked (re-lock before 082); `starmarket-platform.demo.govirto.com` images unresolvable.

## Re-run REG-2026-11-26-1200-RC (008, after the B2B-store role whitelist was restored)
11 member cases blocked by the empty whitelist: 7 pass, 2 fail, 2 blocked.
- **B2C-MBR-019 → VCST-7038** (Change role dialog preselects "Organization employee" instead of the member's role; Save disabled).
- B2C-MBR-037: stale — a revoked invite stays as an Inactive row (KB-F0E06A8A); case text fixed, re-run pending.
- B2C-MBR-033/038 blocked: BUILDRIGHT_ADMIN (test-carlos) cannot sign in. B2C-MBR-008 passed with an adapted check (same account).
- Invite e-mails are not delivered on vcst: SendGrid "Maximum credits exceeded" (MBR-006 verified on the notification journal).
- Promoted to Automated: B2C-MBR-006, 023, 036.
