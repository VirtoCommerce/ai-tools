# VP-9034 — Delete Confirmation Popup Enhancement

**Generated:** 2026-03-24
**Source ticket:** [VP-9034](https://virtocommerce.atlassian.net/browse/VP-9034) (VC Platform dev)
**Reference implementation:** [VCST-4452](https://virtocommerce.atlassian.net/browse/VCST-4452) — Customers module (contacts + companies) — Done
**Requested by:** Infosys (sustaining support, Platform 3.832.15)

---

## User Story

### Extend Delete Confirmation Popup to 10 Backend Modules

| Field | Value |
|-------|-------|
| **Epic** | VP-9034 — Delete Confirmation Popup Enhancement |
| **Type** | Story |
| **Module** | Platform-wide (Pricing, Marketing, Order, Assets, Store, Security, Notifications, Inventory, Taxes, CatalogPublishing) |
| **Priority** | High |
| **Effort** | L (10 module integrations + reusable component extraction) |
| **Requested by** | Infosys |

**As a** Platform Administrator,
**I want** the same delete confirmation popup (already implemented in the Customers module per VCST-4452) to appear in the Pricing, Marketing, Order, Assets, Store, Security, Notifications, Inventory, Taxes, and CatalogPublishing modules,
**So that** I am protected from accidental bulk deletion of business-critical records across all backend modules, with a consistent and predictable user experience.

### Background

The Customers module (VCST-4452 / VP-8961) already has a working delete confirmation popup that:
- Displays the count of selected items (e.g., "You are about to delete 5 items")
- Requires the user to type "yes" (case-sensitive) to enable the Delete button
- Has Delete and Cancel buttons

This story extends the same pattern to the 10 remaining modules identified by Infosys. Ideally, the existing Customers implementation should be extracted into a **reusable platform-level component** so all modules (including future custom modules) can adopt it without duplicating dialog code.

---

### Acceptance Criteria

**AC1: Item count displayed in confirmation popup**
```gherkin
Given I am a Platform Administrator in any of the 10 target modules
  And I have selected one or more items for deletion
When I click the Delete button in the toolbar
Then a confirmation popup appears displaying "You are about to delete N item(s)"
  where N matches the exact count of selected items
```

**AC2: Text input confirmation required**
```gherkin
Given the delete confirmation popup is displayed
When I look at the popup
Then I see a text input field with a prompt to type "yes" to confirm
  And the Delete button is disabled by default
```

**AC3: Delete enabled only when "yes" is typed (case-sensitive)**
```gherkin
Given the delete confirmation popup is displayed
When I type "yes" (lowercase, exact match) in the text input
Then the Delete button becomes enabled

When I type "Yes", "YES", "y", or any other value
Then the Delete button remains disabled
```

**AC4: Successful deletion on confirm**
```gherkin
Given the Delete button is enabled (I have typed "yes")
When I click the Delete button
Then the selected items are deleted
  And the popup closes
  And the list view refreshes without the deleted items
  And a success notification is shown
```

**AC5: Cancel aborts deletion**
```gherkin
Given the delete confirmation popup is displayed
When I click the Cancel button
Then the popup closes
  And no items are deleted
  And the selection state is preserved
```

**AC6: All 10 modules covered**
```gherkin
Given the enhancement is deployed
Then the delete confirmation popup works consistently in:
  | Module            | Entity types affected                    |
  | Pricing           | Price lists, price list assignments       |
  | Marketing         | Promotions, content items, coupons       |
  | Order             | Orders, payment transactions             |
  | Assets            | Assets, asset folders                    |
  | Store             | Stores                                   |
  | Security          | Users, roles                             |
  | Notifications     | Notification templates, notification log |
  | Inventory         | Fulfillment centers, inventory records   |
  | Taxes             | Tax providers, tax rates                 |
  | CatalogPublishing | Published catalog entries                 |
```

**AC7: Reusable component for custom modules (stretch goal)**
```gherkin
Given a module developer building a custom module
When they need a delete confirmation popup
Then they can import the shared component/composable from the platform
  And configure it with their entity label and delete callback
  And get the full confirmation UX without writing custom dialog code
```

**AC8: Negative — Empty selection**
```gherkin
Given I have no items selected in the list view
When I attempt to trigger deletion
Then the Delete button in the toolbar is disabled or hidden
  And no confirmation popup appears
```

**AC9: Negative — Popup dismissal resets input**
```gherkin
Given I opened the confirmation popup and typed partial text
When I click Cancel or close the popup
  And then reopen the popup by selecting items and clicking Delete again
Then the text input field is empty
  And the Delete button is disabled
```

---

### Out of Scope

- Customers module — already implemented (VCST-4452)
- Soft-delete or recycle bin functionality
- Cascading delete warnings (e.g., "This order has 3 shipments")
- Batch delete progress indicator for large selections
- Delete audit logging (separate concern)

### Dependencies

- VCST-4452 (Done) — Customers module reference implementation
- VP-9034 — Parent request from Infosys
- Access to each module's admin blade/list component for integration

### Definition of Done

- [ ] Delete confirmation popup appears in all 10 modules when deleting selected items
- [ ] Popup displays correct item count
- [ ] "yes" (case-sensitive) text input required to enable Delete button
- [ ] Cancel button closes popup without side effects
- [ ] Successful deletion removes items, refreshes view, shows notification
- [ ] Existing Customers module behavior is unaffected
- [ ] Reusable component/composable extracted (or documented for follow-up)
- [ ] QA verified in all 10 modules
- [ ] Infosys notified and sign-off obtained

---

### UI/UX Notes

- Match the exact popup design from the Customers module (VCST-4452) — same layout, same wording
- Popup should be modal (blocks interaction with background)
- Text input placeholder: `Type "yes" to confirm`
- Delete button: destructive style (red)
- Cancel button: neutral/secondary style
- Item count message format: "You are about to delete **N** item(s)" — bold the number
- The popup should work for both single and bulk selections (N=1 included)

### Technical Notes

- **Recommended approach:** Extract the existing Customers module popup into a shared component in `@virtocommerce/platform-core` (or equivalent shared package), then import it in each module
- **Composable API pattern:** `useDeleteConfirmation({ entityLabel, onConfirm })` — modules pass their own delete API call as callback
- **Each module integration** involves: finding the list blade, locating the delete toolbar action, wrapping it with the confirmation composable
- **Modules may have multiple entity types** (e.g., Marketing has promotions, content items, and coupons) — each list blade with a delete action needs the popup
- **No backend changes required** — this is purely a frontend/admin UI enhancement
- **Platform version:** 3.832.15 (sustaining support — ensure backward compatibility)

### Test Scenario Matrix

| # | Scenario | Type | Priority |
|---|----------|------|----------|
| 1 | Single item delete — popup shows count=1 | Functional | P0 |
| 2 | Bulk select 5+ items — popup shows correct count | Functional | P0 |
| 3 | Type "yes" — Delete button enables | Functional | P0 |
| 4 | Type "Yes" / "YES" / "y" — Delete button stays disabled | Negative | P0 |
| 5 | Click Cancel — no deletion, popup closes | Functional | P0 |
| 6 | Click Delete after typing "yes" — items removed | Functional | P0 |
| 7 | Reopen popup — text input is empty, Delete disabled | Regression | P1 |
| 8 | No items selected — Delete toolbar button disabled | Negative | P1 |
| 9 | Verify popup in each of 10 modules (parameterized) | Cross-module | P0 |
| 10 | Customers module unchanged after deployment | Regression | P0 |
| 11 | Select all items on page — count matches | Boundary | P1 |
| 12 | Delete last item on page — pagination adjusts | Boundary | P2 |
| 13 | Concurrent deletion (item deleted by another user) — graceful error | Edge case | P2 |
