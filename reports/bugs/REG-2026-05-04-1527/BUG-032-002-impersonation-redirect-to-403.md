# BUG-032-002 — Login on behalf (impersonation) redirects to /403 Access Denied

- **Run**: REG-2026-05-04-1527
- **Suite**: 032 — Auth Session & RBAC
- **Test cases**: AUTH-043 (and cascade: AUTH-044, AUTH-045, AUTH-046, AUTH-047, AUTH-062, AUTH-063, AUTH-064, AUTH-065 all BLOCKED)
- **Severity**: Medium (functional blocker for entire impersonation cluster — 9 tests)
- **Business rule**: BL-AUTH-006 (Impersonation context must replace admin context cleanly)
- **Edge case**: ECL-14.1
- **Confirmed**: false (preliminary — could be QA-env permission gap or single-browser session collision)
- **Browser**: playwright-chrome 148.0.0.0 on Windows (single context, shared cookies across tabs)
- **Environment**: Admin SPA https://vcst-qa.govirto.com → Storefront https://vcst-qa-storefront.govirto.com

## Steps to Reproduce

1. Open Admin SPA at `https://vcst-qa.govirto.com`, log in as `admin` / `Password1!`.
2. Navigate Contacts → search keyword `qa-agent-slot1` → click the "Agent Chrome" contact result.
3. In the contact blade, click the "1 Accounts" widget → click the `qa-agent-slot1@virtocommerce.com` row in the Accounts blade.
4. In the user-detail blade, locate the toolbar action **"Login on behalf"** (icon + label, top-right of blade).
5. Click "Login on behalf".

## Expected

A new browser tab opens to the storefront in the **impersonated user's context** (e.g., `/` or `/account/dashboard`), with:
- An **impersonation banner** at the top of every page including the impersonated user's name and a **Stop Impersonation** control.
- Catalog, prices, addresses, and cart reflecting the customer's account.

## Actual

A new tab opens at `https://vcst-qa-storefront.govirto.com/account/impersonate/c994fa34-dab9-4238-9c39-28756b3e547d` and **immediately redirects** to `https://vcst-qa-storefront.govirto.com/403`:

> **403** Access denied — You do not have permissions to access the requested page

Notably:
- The header DOES show "Agent Chrome" (impersonated user's name), the customer's ship-to address, and the customer's cart count (=6 / =7) — implying **partial context switch happened** before the route gate rejected.
- **No impersonation banner** is rendered anywhere on the 403 page.

## Diagnosis (two candidate root causes)

**(a) QA environment permission gap.** The admin user lacks the policy/scope required by the `/account/impersonate/{userId}` storefront route. Even though Admin SPA exposes the "Login on behalf" toolbar control, the storefront-side route gate rejects the resulting impersonation grant. Plausible if the impersonation policy was tightened recently and admin's permission set was not refreshed.

**(b) Single-browser cookie collision.** The same playwright-chrome browser context already had an active storefront session for **the same target user** (`c994fa34-dab9-4238-9c39-28756b3e547d` is qa-agent-slot1's own user_id). The existing storefront session cookies may be overriding the impersonation token grant, and the route gate rejects what looks like a redundant self-impersonation.

Cannot disambiguate in a single-browser-context test runner.

## Cascade impact

This blocks the entire 9-test impersonation cluster in suite 032: AUTH-043, 044, 045, 046, 047, 062, 063, 064, 065 — all marked BLOCKED in `032-results.json`.

## Recommendation

- **Re-run from a clean incognito browser context** (no prior storefront session) to eliminate the cookie-collision hypothesis.
- **Re-run with a target user that is NOT the same identity already signed into the storefront** (e.g., target slot 3's user from Admin while slot 1 is the storefront session) to fully isolate.
- If both reproduce → file a real bug against the storefront `/account/impersonate/:userId` route gate or admin's impersonation permission set.

## Evidence

- `reports/regression/REG-2026-05-04-1527/032-evidence/AUTH-043-admin-workspace.png`
- `reports/regression/REG-2026-05-04-1527/032-evidence/AUTH-043-customers-list.png`
- `reports/regression/REG-2026-05-04-1527/032-evidence/AUTH-043-search-result.png`
- `reports/regression/REG-2026-05-04-1527/032-evidence/AUTH-043-contact-detail.png`
- `reports/regression/REG-2026-05-04-1527/032-evidence/AUTH-043-accounts-blade.png`
- `reports/regression/REG-2026-05-04-1527/032-evidence/AUTH-043-account-detail.png` (shows "Login on behalf" toolbar)
- `reports/regression/REG-2026-05-04-1527/032-evidence/AUTH-043-impersonation-403.png` (the 403 result)
