# BUG: Login-on-behalf Confirmation Modal Confirm Button Reads "OK" Instead of "Continue"

## Status: READY_TO_SUBMIT

**Severity:** Low (P3)
**Priority:** P3
**Component:** Storefront / Company Members / VcConfirmationModal (vc-frontend)
**Browser:** Firefox (playwright-firefox, locale en-US)
**Environment:** `https://vcst-qa-storefront.govirto.com` (vcst-qa)
**Platform Version:** 3.1026.0
**Theme Version:** `vc-theme-b2b-vue-2.49.0-pr-2280-8069-80690ef2` (PR #2280)
**Date:** 2026-05-14
**Reported By:** QA (qa-testing-expert)
**Suite / Case:** `regression/suites/Frontend/auth/082-auth-impersonation.csv` / IMP-039, IMP-041
**Related JIRA:** child of [VCST-4906 — Login On Behalf for Company Employee](https://virtocommerce.atlassian.net/browse/VCST-4906) — violates AC#3 *"Continue and Cancel buttons"*

---

## Summary

VCST-4906 AC#3 specifies the confirmation modal triggered by the "Login on behalf" action must expose **"Continue and Cancel buttons"**. On the implemented build, the modal shows **"OK"** (capitalized, primary, info-colored) and **"Cancel"** (outlined, secondary). The visible confirm-button label diverges from the literal AC text.

Root cause is that `members.vue` opens a generic `VcConfirmationModal` whose template hardcodes its action buttons to the i18n keys `ui_kit.buttons.cancel` and `ui_kit.buttons.ok` and does NOT expose any prop to override either label. Even passing a `confirmButton` or similar prop has no effect — the component does not accept such a prop. To honor AC#3, either:
- The shared `VcConfirmationModal` needs a `confirmText` (or similar) prop, OR
- `members.vue` needs to use a dedicated `LoginOnBehalfModal` component (similar to `EditCustomerRoleModal` / `InviteMemberModal` patterns already used on the same page).

---

## Steps to Reproduce

1. Sign in to `{FRONT_URL}/sign-in` as `SUPPORT_AGENT` (USR-001 John Mitchell). Password from `test-data/b2b/users.csv`.
2. Navigate to `{FRONT_URL}/company/members`.
3. Locate any active member that has a security account (e.g. David Kim, Emily Johnson, the Invited User row).
4. Click the row's **Actions** button (gear / 3-dot menu) → click **Login on behalf**.
5. Inspect the confirmation modal that opens. Record the exact button labels.

### Expected (per AC#3)

| Button | Label |
|---|---|
| Confirm (primary, blue) | **Continue** |
| Cancel (outline, secondary) | Cancel |

### Actual

| Button | Label |
|---|---|
| Confirm (primary, info-colored `rgb(43,126,168)`) | **OK** |
| Cancel (outline, secondary) | Cancel |

Same on both English and German locales — confirmed in morning evidence `IMP-047-01-modal-german.png` where the German modal reads "ABBRECHEN / OK" (not "Weiter" or "Fortfahren").

---

## Evidence

All artifacts under `tests/Sprint-current/VCST-4906/evidence/bug-verification-frontend/`:

| File | Content |
|------|---------|
| `bug2-01-modal-david-kim.png` | First repro: modal title "Login on behalf", buttons "Cancel" / "OK" |
| `bug2-02-modal-david-kim-correct.png` | Second repro: same modal title/buttons |
| `bug2-3-4-console.log` | Firefox console (0 errors, 3 warnings — unrelated) |
| `bug2-3-4-network.txt` | Network requests over the flow |

Programmatic DOM inspection of the modal (captured via `browser_evaluate` on the visible `[role="dialog"]`):

```json
{
  "title": "Login on behalf",
  "bodyText": "You are logging in on behalf of agent-test-imp-target-invited-20260514@mail.com. The session will be audited.",
  "buttons": [
    {"text": "", "className": "vc-dialog-header__close"},
    {"text": "Cancel", "className": "vc-button vc-button--color--secondary vc-button--outline--secondary"},
    {"text": "OK",     "className": "vc-button vc-button--color--info vc-button--solid--info"}
  ]
}
```

Cross-reference: morning evidence at `tests/Sprint-current/VCST-4906/evidence/IMP-039-03-modal-davidkim.png` (English) and `IMP-047-01-modal-german.png` (German) — both show "OK" / "Ok" as the confirm-button label.

**Console errors:** 0.
**Network errors:** 0 (modal is pure UI).

---

## Layer Validation

| Layer | Result | Notes |
|---|---|---|
| 1. Storefront (vc-frontend) | **FAIL — owning layer** | Two source-code paths involved: `members.vue` opens a `VcConfirmationModal` without a label override; `vc-confirmation-modal.vue` hardcodes the confirm-button label. |
| 2. Admin SPA | **N/A** | |
| 3. GraphQL xAPI | **N/A** | |
| 4. Platform REST | **N/A** | |

---

## Root Cause Analysis

### Source — `client-app/pages/company/members.vue` (PR #2280, blob `29f0153cde528d3fde3fd2158a226fec16dedf43`)

```typescript
function openLoginOnBehalfModal(contact: ExtendedContactType): void {
  const closeLoginOnBehalfModal = openModal({
    component: "VcConfirmationModal",
    props: {
      variant: "info",
      title: t("shared.company.login_on_behalf_modal.title"),
      text: t("shared.company.login_on_behalf_modal.text", {
        email: contact.extended.emails?.[0] ?? contact.fullName,
      }),
      onConfirm() {
        if (!contact.securityAccounts?.length) {
          return;
        }
        closeLoginOnBehalfModal();
        void router.push({ name: "Impersonate", params: { userId: contact.securityAccounts[0].id } });
      },
    },
  });
}
```

No `confirmButton` / `confirmText` / `okLabel` / `continueLabel` prop is passed.

### Source — `client-app/ui-kit/components/organisms/confirmation-modal/vc-confirmation-modal.vue` (PR #2280, blob `17ebe4e80c72dc6f9153b82e47bba87013779eb2`, 967 bytes total)

```vue
<template>
  <VcModal :title="title" :variant="variant" :icon="icon" @close="$emit('close')">
    {{ text }}
    <template #actions="{ close }">
      <VcButton v-if="!singleButton" :disabled="loading" color="secondary" variant="outline" @click="close">
        {{ $t("ui_kit.buttons.cancel") }}
      </VcButton>

      <VcButton :loading="loading" :color="variant" @click="$emit('confirm')">
        {{ $t("ui_kit.buttons.ok") }}      <!-- HARDCODED — no override prop -->
      </VcButton>
    </template>
  </VcModal>
</template>

<script setup lang="ts">
export interface IProps {
  singleButton?: boolean;
  icon?: string;
  title?: string;
  text?: string;
  variant?: "primary" | "secondary" | "info" | "success" | "warning" | "danger" | "neutral" | "accent";
  loading?: boolean;
}
withDefaults(defineProps<IProps>(), {
  variant: "danger", loading: false, icon: "warning",
});
</script>
```

The `IProps` interface contains no field for confirm-button label override; the template binds `$t("ui_kit.buttons.ok")` directly. The translation key resolves to:
- en.json: `ui_kit.buttons.ok` → `"Ok"` (rendered as "OK" by the parent button's text-transform CSS in the screenshot; the raw key is title-case "Ok")
- de.json: same key path — German "OK" (uppercase per German UI convention)

This is consistent across all 13 locales in the PR (`get_pull_request_files` confirms the locale files were touched by the PR but only to add the *new* impersonation strings — `ui_kit.buttons.ok` was not changed).

### Why this exists

VCST-4906 reused the existing `VcConfirmationModal` (a generic platform component) for speed. The AC text "Continue and Cancel buttons" was a copy-style requirement; nobody noticed the shared component didn't permit a label override. The two adjacent modals on the same page (`EditCustomerRoleModal`, `InviteMemberModal`) are dedicated single-purpose modals that own their own templates and labels — so the precedent for a `LoginOnBehalfModal` already exists.

---

## Suggested Fix

**Option A — Add a label-override prop to `VcConfirmationModal` (smallest change, benefits all callers):**

```vue
<script setup lang="ts">
export interface IProps {
  ...
  confirmText?: string;
  cancelText?: string;
}
</script>
<template>
  ...
  <VcButton v-if="!singleButton" ... @click="close">
    {{ cancelText || $t("ui_kit.buttons.cancel") }}
  </VcButton>
  <VcButton :loading="loading" :color="variant" @click="$emit('confirm')">
    {{ confirmText || $t("ui_kit.buttons.ok") }}
  </VcButton>
</template>
```

Then in `members.vue::openLoginOnBehalfModal`:

```typescript
props: {
  variant: "info",
  title: t("shared.company.login_on_behalf_modal.title"),
  text: t("shared.company.login_on_behalf_modal.text", {...}),
  confirmText: t("common.buttons.continue"),   // requires adding the key
  ...
}
```

Add `common.buttons.continue = "Continue"` to en.json and the equivalent ("Weiter" / "Fortfahren") to all 13 locale files in the PR.

**Option B — Dedicated `LoginOnBehalfModal` component (consistent with `EditCustomerRoleModal` pattern):**

Create `client-app/shared/company/components/login-on-behalf-modal.vue` with its own template using `<VcModal>` directly, owning its own action-button labels. More code but matches the existing `EditCustomerRoleModal`/`InviteMemberModal` siblings.

---

## Acceptance Criteria for Fix Verification

When the fix ships, re-run IMP-039 (and IMP-041, IMP-047 for de-DE):

- [ ] Modal confirm-button text reads **"Continue"** in en-US (NOT "OK", not "Ok")
- [ ] Modal cancel-button text continues to read "Cancel"
- [ ] Same wording (translated) appears in de-DE, fr-FR, ja-JP, and any locale touched by PR #2280 — locale parity must be maintained
- [ ] Clicking "Continue" still routes to `/account/impersonate/{userId}` (impersonation flow unchanged)

---

## References

- **JIRA Parent:** [VCST-4906 AC#3](https://virtocommerce.atlassian.net/browse/VCST-4906) — *"Continue and Cancel buttons"*
- **PR under test:** [VirtoCommerce/vc-frontend#2280](https://github.com/VirtoCommerce/vc-frontend/pull/2280) (`feat/VCST-4906-login-on-behalf`, head `80690ef2`)
- **Test cases:** suite 082 IMP-039 (member-action modal — happy path), IMP-041 (cancel from modal), IMP-047 (modal in non-default locale)
- **Source files (verified 2026-05-14):**
  - `vc-frontend/client-app/pages/company/members.vue` blob `29f0153cde528d3fde3fd2158a226fec16dedf43`
  - `vc-frontend/client-app/ui-kit/components/organisms/confirmation-modal/vc-confirmation-modal.vue` blob `17ebe4e80c72dc6f9153b82e47bba87013779eb2`
