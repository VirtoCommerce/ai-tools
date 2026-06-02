# BUG-007-001: List set to "Anyone (readonly)" cannot be reverted, renamed, or modified

**Run:** REG-2026-05-04-1527
**Suite:** 007 — B2C Lists & Shared
**Test cases impacted:** B2C-LIST-007 (rename), B2C-LIST-011 (toggle Private/Shared)
**Severity:** High
**Priority:** P1
**Browser:** Edge (playwright-edge)
**Environment:** https://vcst-qa-storefront.govirto.com
**Build:** Ver. 2.48.0-pr-2274-0307-0307f38b
**User:** Carlos Rodriguez (BuildRight org)
**Discovered:** 2026-05-05

## Summary
After setting a list's Sharing option to **"Anyone (readonly)"** and saving, re-opening **List settings** shows all editable fields disabled — List name, Description, Sharing options combobox, AND the Save button. This means once a list has been published with a public link, the user cannot:
- Rename the list
- Edit description
- Change sharing back to **Private** or to **Organization**
- Save any changes at all

Effectively, public-shared lists are immutable from the UI. The only way to "revert" sharing is to delete the list entirely and recreate it, which forces users to lose curated items.

## Steps to Reproduce
1. Sign in to storefront as B2B user (any org).
2. Navigate to /account/lists.
3. Create a new list ("Create list" button); name it; keep Sharing = Private; Create.
4. Open the list; click **List settings**.
5. Change Sharing options dropdown to **Anyone (readonly)**.
6. Click **Save**. (Modal closes; list now shows Shared badge on /account/lists tile.)
7. Re-open **List settings** for the same list.

## Expected
- List name, Description, Sharing options remain editable.
- Save button enables when any field changes.
- User can switch sharing back to Private (link should be invalidated, badge should revert).
- User can rename the list at any time.

## Actual
- **List name** input: `disabled` attribute set; cannot type.
- **Description** textarea: `disabled` attribute set; cannot edit.
- **Sharing options** combobox: `disabled` attribute set; dropdown cannot be opened (the toggle button is enabled visually with `cursor=pointer` and gets `--active` modifier on click, but no listbox appears because the underlying combobox refuses to expand).
- **Save** button: permanently disabled.
- The only available action is **Cancel** or **Close**.

This is non-discoverable destructive UX: a user who shares a list publicly is locked out of all subsequent editing.

## Evidence
- Screenshot: `reports/regression/REG-2026-05-04-1527/007-evidence/list-settings-shared-disabled.png` — shows full settings dialog with all fields disabled including the "Save" button (just an empty rounded shape).
- DOM probe (snippet):
  ```
  comboboxDisabled: true
  comboboxAriaExpanded: "false"
  toggleDisabled: false
  nameDisabled: true
  saveBtnDisabled: true
  ```
- Public link captured: `https://vcst-qa-storefront.govirto.com/shared-list/1b396e5b-879b-43da-9145-03d391d0cbae`
- The shared-list URL renders correctly (read-only product list with order summary) — the shared list feature itself works; only the **revert** path is broken.

## Cross-Layer Checks
- Console: no JS errors related to the disabled state.
- Network: no error on settings dialog open; xAPI call returns wishlist data without write permissions for owner once status is "Anyone".

## Suspected Root Cause
The settings form likely keys disabled state on a `wishlist.scope === "Public"` flag instead of `wishlist.editable` / `wishlist.canEdit`. The owner of a shared list should retain full edit + revoke rights; only non-owner readonly viewers should see the disabled state.

## Workaround
None. User must Delete the list and recreate it as Private.

## Related test cases
- B2C-LIST-007 — Rename/Edit List (FAIL when applied to a Shared list)
- B2C-LIST-011 — Mark List Private/Shared (FAIL — cannot toggle back)
- B2C-LIST-025 — Shared List - Remove Shared Access (would FAIL for the same reason if scope was not "Organization" but "Anyone")
