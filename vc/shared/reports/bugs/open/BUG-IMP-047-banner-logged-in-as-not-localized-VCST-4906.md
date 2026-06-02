# BUG: Banner Connector "logged in as" NOT Localized in de-DE — CANNOT REPRODUCE

## Status: CLOSED — Cannot Reproduce on this build (verified 2026-05-14)

**Severity:** Low (P3) — but moot, since cannot reproduce
**Priority:** P3
**Component:** Storefront / Top header impersonation banner (vc-frontend)
**Browser:** Firefox (playwright-firefox, locale en-US + de-DE)
**Environment:** `https://vcst-qa-storefront.govirto.com` (vcst-qa)
**Platform Version:** 3.1026.0
**Theme Version:** `vc-theme-b2b-vue-2.49.0-pr-2280-8069-80690ef2` (PR #2280)
**Date:** 2026-05-14
**Reported By:** QA (qa-testing-expert, verifying morning agent's IMP-047 finding)
**Suite / Case:** `regression/suites/Frontend/auth/082-auth-impersonation.csv` / IMP-047 (impersonation banner in non-default locale)
**Related JIRA:** child of [VCST-4906 — Login On Behalf for Company Employee](https://virtocommerce.atlassian.net/browse/VCST-4906)

---

## Summary

The morning regression run flagged the impersonation banner connector "logged in as" as NOT localized in de-DE, with the implication that the English connector was being rendered between an operator-name and a target-name span even when the storefront UI was in German. This bug **does not reproduce** on the PR #2280 build deployed to vcst-qa as of 2026-05-14:

- The connector i18n key `shared.layout.header.top_header.logged_in_as` IS translated in `locales/de.json` to `"eingeloggt als"` — and this was in the `dev` branch already BEFORE PR #2280 was opened, so this is not a PR-introduced regression and never has been.
- Live verification with the storefront UI in German confirms the banner renders as `"John Mitchell eingeloggt als David Kim"` — correctly localized end-to-end.

Closing as **Cannot Reproduce** with evidence trail. If the morning agent observed the English connector in a German session, that was likely a stale-bundle / cache issue or a specific intermediate state during the locale switch; on a clean session after the locale fully loads, the connector is correctly localized.

---

## Verification Performed

1. Signed in as SUPPORT_AGENT (John Mitchell), impersonated David Kim via `{FRONT_URL}/account/impersonate/ec3031ac-6dd9-42e9-b7a7-0c10d9aac07b`.
2. Locale switched to Deutsch via the language switcher in the top bar (resulting URL: `https://vcst-qa-storefront.govirto.com/de/?cultureName=de-DE`, `<html lang="de-DE">`).
3. Inspected the banner DOM:

```json
{
  "html_lang": "de-DE",
  "operator_name_label": "John Mitchell",
  "operator_name_label_parent_text": "John Mitchelleingeloggt alsDavid Kim",
  "page_title": "QA & Home",
  "url": "https://vcst-qa-storefront.govirto.com/de/?cultureName=de-DE",
  "body_first_400": " Zum Hauptinhalt springenZum Footer springenSprache:de polski svenska ..."
}
```

The connector text reads **"eingeloggt als"** (German), NOT "logged in as" (English). Banner is fully localized.

4. Account menu popup also verified: revert button reads "Zurück zu John Mitchell" (German), confirming the entire impersonation chrome is correctly localized.

---

## Evidence

All artifacts under `tests/Sprint-current/VCST-4906/evidence/bug-verification-frontend/`:

| File | Content |
|------|---------|
| `bug4-debug-01-after-cultureName-param.png` | Pre-switch state — page still in English with URL query `?cultureName=de-DE` (confirms the query param ALONE does not switch locale; user must click the language switcher) |
| `bug4-01-banner-german.png` | Post-switch German storefront with impersonation banner — connector clearly reads "eingeloggt als" |
| `bug4-02-revert-german.png` | Account menu popup in German showing "Zurück zu John Mitchell" |

Source-code reference:

| Locale file | Key | Value | Branch |
|---|---|---|---|
| `locales/en.json` | `shared.layout.header.top_header.logged_in_as` | `"logged in as"` | `dev` + PR `feat/VCST-4906-login-on-behalf` |
| `locales/de.json` | `shared.layout.header.top_header.logged_in_as` | `"eingeloggt als"` | `dev` + PR `feat/VCST-4906-login-on-behalf` |

Both branches verified via direct `raw.githubusercontent.com` download on 2026-05-14.

---

## Layer Validation

| Layer | Result | Notes |
|---|---|---|
| 1. Storefront (vc-frontend) | **PASS** | i18n key correctly translated in de.json; banner template `top-header.vue` reads `$t("shared.layout.header.top_header.logged_in_as")` |
| 2. Admin SPA | **N/A** | |
| 3. GraphQL xAPI | **N/A** | |
| 4. Platform REST | **N/A** | |

---

## Root Cause Analysis — Why the Morning Agent May Have Seen This

Possible explanations for the earlier observation:

1. **MCP cache staleness**: per memory entry `feedback_mcp_browser_cache`, the storefront's `max-age=4h` cache on theme bundles can keep stale i18n catalogs in memory. The German banner string is in the same theme bundle as the new PR #2280 keys; if the agent's browser session had cached an older bundle that lacked the post-PR catalog merge, the fallback might have displayed English.
2. **Intermediate state during locale switch**: vc-frontend's i18n switch is asynchronous — between the click on "Deutsch" and the full reload, the banner can re-render once with English strings before the new locale catalog finishes loading. If the agent screenshotted in that ~1-second window, they could have caught the English connector.
3. **`?cultureName=de-DE` query param alone does NOT switch locale**: I verified directly that hitting `{FRONT_URL}/?cultureName=de-DE` keeps the UI in English (`<html lang="en-US">`, all UI strings English). The agent must use the language switcher UI to actually load the German catalog — the URL changes to `/de/`. If they relied on the query param alone, the operator chip would render half in English/half in localized text (operator-name + English connector + target-name in whatever the user's profile locale happened to be).
4. **Verified PRE-EXISTING**: the de.json `logged_in_as` key was in `dev` BEFORE PR #2280 was opened. Even if the bug existed before, it is not a VCST-4906 regression — therefore it cannot block this PR.

---

## Resolution

**Mark VCST-4906 IMP-047 as PASS** on this build. The banner connector is correctly localized; the morning observation was likely a stale-bundle or intermediate-render artifact, not a real defect.

If a similar observation is reported again:
1. Verify the URL path includes `/de/` (full locale prefix), not just `?cultureName=de-DE` query param
2. Verify `document.documentElement.lang === "de-DE"`
3. Hard-refresh (Ctrl+Shift+R) to bypass MCP cache (per `feedback_mcp_browser_cache` memory)
4. Inspect `[data-test-id="operator-name-label"]`'s sibling spans to capture the exact rendered connector text
5. If the English connector still appears, file a fresh bug with full reproduction steps including the URL pattern, html lang attribute, and a Network panel screenshot showing which `locales/*.json` was actually loaded

---

## References

- **JIRA Parent:** [VCST-4906](https://virtocommerce.atlassian.net/browse/VCST-4906)
- **PR under test:** [VirtoCommerce/vc-frontend#2280](https://github.com/VirtoCommerce/vc-frontend/pull/2280) (`feat/VCST-4906-login-on-behalf`, head `80690ef2`)
- **Test case:** suite 082 IMP-047 (banner in non-default locale)
- **i18n source files (verified 2026-05-14):**
  - `vc-frontend/locales/en.json` `logged_in_as = "logged in as"`
  - `vc-frontend/locales/de.json` `logged_in_as = "eingeloggt als"` (PRE-EXISTING; in `dev` baseline)
- **Memory references:**
  - `feedback_mcp_browser_cache` — explanation for stale-bundle false positives
  - `feedback_verify_source_data_before_bug` — confirm source data before filing
