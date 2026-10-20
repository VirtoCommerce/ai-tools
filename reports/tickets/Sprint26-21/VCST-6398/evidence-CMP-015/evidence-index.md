# Evidence index — CMP-015 / R13-8: no organization switcher for a multi-org user (desktop)

**Verdict:** REPRODUCED (3/3 on desktop) · class REAL_BUG (product gap in vc-frontend-next), not TEST_DATA_DEFECT and not STALE_TEST
**Env:** TEST_ENV=vcst · storefront Ver. 3.1.0-pr-11-d67b-d67b0e0a (vc-frontend-next PR #11 head d67b0e0a) · platform 3.1086.0-pr-3139-5d63 · VirtoCommerce.Customer 3.1029.0 · ProfileExperienceApiModule 3.1021.0 · Xapi 3.1027.0
**Account:** `@td(MULTI_ORG_TF_BR.email)`; ids are in `test-data/aliases.vcst.json` → `MULTI_ORG_TF_BR`
**Source run:** REG-2026-10-20-1418 suite 098 CMP-015 (BLOCKED), shot `reports/regression/REG-2026-10-20-1418/screenshots/CMP-015-BLOCKED-account-menu-no-org-switcher.png`
**Captured:** 2026-10-20 15:30–15:38 UTC, `playwright-edge`, 1920x1080 + 390x844

| # | Slot | Artifact | What it shows |
|---|------|----------|---------------|
| A1 | Discriminator: data layer (REST, admin, read-only) | `network/rest-contact-memberships.txt` | Contact Approved, `organizations` = [TechFlow, BuildRight]. `POST /api/customer/organization-memberships/search` returns totalCount 2: both **Approved**, `isLocked=false`, `isCurrentlyLocked=false`. Both orgs status Active. **No membership drift.** |
| A2 | API layer (xAPI, signed in as the user) | `network/GetMe-GetPageContext-organizations.json` | `GetMe` 200, no `errors[]`: `contact.organizations.totalCount = 2`, current org BuildRight. The token's `organization_id` is BuildRight. The backend tells the client the user is multi-org. |
| A3 | Failure state, desktop, home | `screenshots/01-account-menu-no-organizations-section.png` | Account menu dialog: header "AgentTest MultiOrg / BuildRight", then Purchasing / Marketing / Corporate / User / Logout. No Organizations block and no `organizations-search`. |
| A4 | Repeat, desktop, /account/dashboard | `screenshots/02-dashboard-account-menu-no-organizations-section.png` | Same panel, no switcher. |
| A5 | Repeat, desktop, /compare (the CMP-015 page) | `screenshots/03-compare-account-menu-no-organizations-section.png` + `account-menu-dom-snapshot.yml` | Same panel. DOM snapshot has 0 matches for "organizations", "radio" and "organizations-search". |
| A6 | Next placement check, mobile 390 | `screenshots/04-mobile-390-my-organizations-switcher-present.png` | Main menu → Corporate → **My organizations** shows radios BuildRight (checked) and TechFlow. The switcher exists, but only below the desktop breakpoint. No radio was clicked, so the org context was not changed. |
| A7 | Console | `console/console-errors.log`, `console/console-warnings.log` | 0 errors, 0 warnings. The gap is silent. |
| A8 | Network list | `network/requests-mobile-session.txt`, `network/req-*.txt` (bearer and cookies redacted) | All GraphQL 200. No 4xx/5xx. |
| A9 | HAR | `results/VCST-6398/har/CMP-015-investigate-edge.har` (gitignored) | Whole session: sign-in, desktop x3, mobile. |
| A10 | Source | vc-frontend-next @ d67b0e0a `client-app/shared/layout/components/header/_internal/header-account-menu-panel.vue` L70-74, L110 | `<TopHeaderOrganizations v-if="IS_ORGANIZATION_SWITCHER_SHOWN && isMultiOrganization">` with `const IS_ORGANIZATION_SWITCHER_SHOWN = false;`. See root-cause.md. |
| A11 | Docs (VirtoOZ, StorefrontUserGuide → Company Members § Switch between your companies) | docs.virtocommerce.org/storefront/user-guide/account/company-members | "If you belong to more than one company, open your account menu and look under **Organizations**. Every company you belong to is listed…" |

**Trace / operation id:** not applicable. No request failed. Every request returned 200 with correct data, and the defect is a client-side render gate, so there is no failing server operation to correlate in App Insights. The `GetMe` response is at 15:32:43.566Z in the HAR.

**Mandatory slots:** failure screenshot + DOM ✔ · network list + body of the deciding request ✔ · console ✔ · HAR ✔ · versions ✔ · 3 attempts ✔ · alternatives ruled out ✔ (root-cause.md).
