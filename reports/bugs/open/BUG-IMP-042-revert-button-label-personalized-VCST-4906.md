# BUG: Revert Action Labelled "Back to {operatorName}" Instead of Literal "Revert back to own account"

## Status: READY_TO_SUBMIT (DOCUMENTATION-VS-IMPLEMENTATION MISMATCH — Product decision needed)

**Severity:** Low (P3)
**Priority:** P3 — open to product owner interpretation; may be "Won't Fix — by design improvement"
**Component:** Storefront / Top header + Mobile main menu (vc-frontend)
**Browser:** Firefox (playwright-firefox, locale en-US + de-DE; 375×667 and 1920×1080)
**Environment:** `https://vcst-qa-storefront.govirto.com` (vcst-qa)
**Platform Version:** 3.1026.0
**Theme Version:** `vc-theme-b2b-vue-2.49.0-pr-2280-8069-80690ef2` (PR #2280)
**Date:** 2026-05-14
**Reported By:** QA (qa-testing-expert)
**Suite / Case:** `regression/suites/Frontend/auth/082-auth-impersonation.csv` / IMP-042, IMP-043
**Related JIRA:** child of [VCST-4906 — Login On Behalf for Company Employee](https://virtocommerce.atlassian.net/browse/VCST-4906) — diverges from AC#5b literal *"Revert back to own account"*

---

## Summary

VCST-4906 AC#5b specifies the revert action visible to the impersonating operator should read **"Revert back to own account"**. The implemented design ships a personalized label:

- **Desktop (account menu popup):** `"Back to John Mitchell"` (`data-test-id="back-to-operator-row"`)
- **Mobile (hamburger main menu):** `"Back to John Mitchell"` (`data-test-id="mobile-back-to-operator-button"`)
- **German locale (account menu popup):** `"Zurück zu John Mitchell"`

This is a **documentation-vs-implementation mismatch** rather than a defect. The personalized form is arguably better UX (it tells the operator exactly which identity will be restored), is consistently applied in source code, and is fully localized in all 13 PR locale files. We do not recommend a code fix; we recommend the product owner update the AC text to match.

---

## Steps to Reproduce

### Desktop (1920×1080)

1. Sign in to `{FRONT_URL}/sign-in` as `SUPPORT_AGENT` (USR-001 John Mitchell). Password from `test-data/b2b/users.csv`.
2. Navigate to `{FRONT_URL}/account/impersonate/ec3031ac-6dd9-42e9-b7a7-0c10d9aac07b` (IMPERSONATE_TARGET = David Kim, USR-007).
3. Wait for the impersonation flow to land on `/` (storefront home in David Kim's context — header chip shows "John Mitchell logged in as David Kim").
4. Click the **David Kim** account-menu trigger (`data-test-id="account-button"`).
5. Inspect the dropdown popup that opens. Find the row with `data-test-id="back-to-operator-row"`. Record its label.

### Mobile (375×667)

6. Resize the viewport to 375×667.
7. Click the hamburger (Main menu) button.
8. Look for the row with `data-test-id="mobile-back-to-operator-button"`. Record its label.

### German locale

9. (Optionally) switch the storefront locale to Deutsch via the language switcher (URL becomes `/de/`).
10. Repeat steps 4–5. Record the German label.

### Expected (per AC#5b literal)

| Surface | Label |
|---|---|
| Desktop popup | "Revert back to own account" |
| Mobile menu | "Revert back to own account" |
| German | "Zum eigenen Konto zurückkehren" (or equivalent) |

### Actual

| Surface | Label |
|---|---|
| Desktop popup | **"Back to John Mitchell"** |
| Mobile menu | **"Back to John Mitchell"** |
| German | **"Zurück zu John Mitchell"** |

The `{name}` parameter is interpolated from `operator.contact?.fullName || operator.userName`. The literal "Back to {name}" template is the same in all 13 PR locale files — so the divergence from AC text is deliberate and global.

---

## Evidence

All artifacts under `tests/Sprint-current/VCST-4906/evidence/bug-verification-frontend/`:

| File | Content |
|------|---------|
| `bug3-01-banner-desktop-en.png` | Impersonated home; header shows "John Mitchell logged in as David Kim" |
| `bug3-02-account-popup-revert-en.png` | Desktop account-menu popup with "Back to John Mitchell" visible |
| `bug3-03-mobile-menu-revert.png` | Mobile (375×667) main-menu with "Back to John Mitchell" |
| `bug4-01-banner-german.png` | German locale impersonated home; banner = "John Mitchell eingeloggt als David Kim" |
| `bug4-02-revert-german.png` | German account-menu popup with "Zurück zu John Mitchell" |

Programmatic DOM evidence:

```json
{
  "back_to_operator_row_text": "Back to John Mitchell",
  "back_to_operator_row_visible": true,
  "data-test-id": "back-to-operator-row"        // desktop
}
```

```json
{
  "text": "Back to John Mitchell",
  "testId": "mobile-back-to-operator-button"    // mobile
}
```

```json
{
  "back_to_operator_row_text": "Zurück zu John Mitchell",
  "back_to_operator_visible": true              // de-DE
}
```

**Console errors:** 0. **Network errors:** 0.

---

## Layer Validation

| Layer | Result | Notes |
|---|---|---|
| 1. Storefront (vc-frontend) | **FAIL on literal AC match** — but functionally correct and well-localized | i18n key `shared.layout.header.top_header.back_to_operator = "Back to {name}"` (en) / `"Zurück zu {name}"` (de) |
| 2. Admin SPA | **N/A** | |
| 3. GraphQL xAPI | **N/A** | |
| 4. Platform REST | **N/A** | |

---

## Root Cause Analysis

### Source — `client-app/shared/account/composables/useImpersonate.ts` (PR #2280)

```typescript
const backToOperatorLabel = computed(() =>
  operator.value
    ? t("shared.layout.header.top_header.back_to_operator", {
        name: operator.value.contact?.fullName || operator.value.userName,
      })
    : "",
);
```

The label is computed reactively from the active operator object and interpolated into the i18n string. This is *deliberate parameterization*, not a wiring oversight.

### Source — `client-app/shared/layout/components/header/_internal/top-header.vue` (PR #2280)

The `back-to-operator-row` (desktop) and `mobile-back-to-operator-button` (mobile) elements both bind to the same `backToOperatorLabel` computed.

### i18n keys (PR #2280 head)

```
locales/en.json: "back_to_operator": "Back to {name}"
locales/de.json: "back_to_operator": "Zurück zu {name}"
locales/es.json, fi.json, fr.json, it.json, ja.json, no.json, pl.json, pt.json, ru.json, sv.json, zh.json: similar pattern
```

All 13 locales were added in this PR (the key is **new** to PR #2280 — `dev` baseline does not have `back_to_operator`). So this is a deliberate UX choice: the implementer wrote the key with `{name}` interpolation in mind, and every locale received a translation that matches the format.

### Test-ID corroboration

The presence of two distinct `data-test-id` values (`back-to-operator-row` for desktop, `mobile-back-to-operator-button` for mobile) — both named with the term "operator" — strongly suggests the implementer was thinking of this as "Back to {the operator}" rather than "Revert" terminology. Consistent with the personalized label.

---

## Suggested Resolution

**Recommended: Update the AC text — do NOT change the code.**

The personalized label "Back to {operatorName}" is:
- More informative for the operator (especially in a multi-tenant or shared-workstation scenario)
- Already correctly translated in all 13 locales
- Consistent with the test-id naming (`back-to-operator-row`)
- A clearly intentional choice (not an oversight)

Recommend amending VCST-4906 AC#5b to:

> AC#5b: Account menu shows a "Back to {operatorFullName}" link (or equivalent localized form) that returns the operator to their own session.

If the product owner insists on the literal AC text, the fix would be:

```diff
- "back_to_operator": "Back to {name}"
+ "back_to_operator": "Revert back to own account"
```
in en.json (and 12 other locales), and remove the `{ name: operator.value.contact?.fullName || operator.value.userName }` interpolation in `useImpersonate.ts`. This is a 14-file change with no behavior delta.

---

## Acceptance Criteria for Resolution Verification

**If "Update AC" route:**
- [ ] JIRA AC#5b text updated to reflect "{operatorFullName}" personalization
- [ ] Test case IMP-042 (and IMP-043 mobile) Expected_Result column updated in `082-auth-impersonation.csv`
- [ ] No code change

**If "Update Code" route (not recommended):**
- [ ] All 13 locale `back_to_operator` strings updated to the literal AC text
- [ ] `useImpersonate.ts::backToOperatorLabel` no longer passes the `name` parameter
- [ ] Both desktop popup (`data-test-id="back-to-operator-row"`) and mobile menu (`data-test-id="mobile-back-to-operator-button"`) display the new static label
- [ ] No regression in revert functionality

---

## References

- **JIRA Parent:** [VCST-4906 AC#5b](https://virtocommerce.atlassian.net/browse/VCST-4906) — *"Revert back to own account"*
- **PR under test:** [VirtoCommerce/vc-frontend#2280](https://github.com/VirtoCommerce/vc-frontend/pull/2280)
- **Test cases:** suite 082 IMP-042 (desktop popup), IMP-043 (mobile menu)
- **Source files (verified 2026-05-14):**
  - `vc-frontend/client-app/shared/account/composables/useImpersonate.ts` blob `413bf48070e2afe5600a76551bf11b709efabb2c`
  - `vc-frontend/client-app/shared/layout/components/header/_internal/top-header.vue` (PR #2280 modified)
  - `vc-frontend/client-app/shared/layout/components/header/_internal/mobile-menu/menus/main-menu.vue` (PR #2280 modified)
  - `vc-frontend/locales/en.json` `back_to_operator = "Back to {name}"`
  - `vc-frontend/locales/de.json` `back_to_operator = "Zurück zu {name}"`
- **Memory references:**
  - User preference: when documentation and implementation diverge and the implementation is functionally correct + well-localized, surface the divergence for product-owner decision rather than auto-filing as a defect
