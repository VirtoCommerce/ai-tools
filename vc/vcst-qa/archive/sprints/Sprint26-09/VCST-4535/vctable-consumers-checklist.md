# VcTable Consumer Regression Checklist — VCST-4535 (PR #2261)

**Source:** GitHub code search of `VirtoCommerce/vc-frontend` (head `dev`, sha `9314054`) on 2026-05-06.
**Total consumer files:** 11 (including the component itself).
**Adoption of new `VcTableColumn` API:** 9 of 10 consumer files have migrated; 1 file still uses legacy `columns` prop.

> Every file binding `@row-click` inherits the three bugs found in VCST-4535 testing:
> - **BUG-1 (P1):** row click opens new tab via `window.open(_blank)` instead of in-place SPA `router.push()` — verified on `orders.vue` + dashboard widget.
> - **BUG-2 (P2):** Space key does not activate `role="button"` rows.
> - **BUG-3 (P2):** Ctrl+click / middle-click silently ignored.

---

## Consumer Map

| # | File | Storefront URL / Surface | API in use | Likely binds `@row-click` | Auth required |
|---|------|--------------------------|------------|---------------------------|---------------|
| 1 | `client-app/shared/account/components/orders.vue` | `/account/orders` + `/account/dashboard` (widget) | new (VcTableColumn) | YES — confirmed (BUG-1/2/3 reproduce) | Yes |
| 2 | `client-app/pages/account/addresses.vue` | `/account/addresses` (personal accounts only — B2B users do not see this link) | new | Likely — addresses are clickable | Yes |
| 3 | `client-app/pages/company/info.vue` | `/company` / `/company/info` | new | Verify | Yes (B2B Org admin) |
| 4 | `client-app/pages/company/members.vue` | `/company/members` | new | NO — exploratory confirmed rows have no `role="button"` / `tabindex` | Yes (B2B Org admin) |
| 5 | `client-app/modules/quotes/pages/quotes.vue` | `/account/quotes` (quote requests list) | new | Likely — quote rows route to detail | Yes |
| 6 | `client-app/modules/purchase-requests/pages/purchase-requests.vue` | `/account/purchase-requests` (B2B feature) | new | Likely | Yes (B2B) |
| 7 | `client-app/modules/loyalty/pages/points-history.vue` | `/account/points-history` (Loyalty module) | new | Verify (history rows usually not clickable) | Yes |
| 8 | `client-app/shared/checkout/components/select-address-modal.vue` | Modal: checkout address-selection popup (VCST-4710/PR #129 scope) | new | Likely — addresses are selectable rows | Yes |
| 9 | `client-app/shared/catalog/components/product/variations-table.vue` | Embedded on PDP `/product/<slug>` for configurable products | new | Likely — variation rows route to variant or open quick-add | Optional |
| 10 | `client-app/shared/common/components/address-info-modal.vue` | Modal: address detail viewer (account + checkout reuse) | **legacy `columns` prop** | NO (read-only modal) | Yes |
| 11 | `client-app/ui-kit/components/organisms/table/vc-table.vue` | Component itself — UI-kit | n/a | n/a | n/a |

> Items 1, 4 already tested in QA. Items 2, 3, 5, 6, 7, 8, 9, 10 still need spot-check after BUG-1 fix.

---

## Section A — Already Tested (VCST-4535 main run)

### A.1 `orders.vue` — `/account/orders` + dashboard widget
- [x] Render PASS · row-click PARTIAL (BUG-1) · keyboard Enter PASS · Space FAIL (BUG-2) · pagination/sort/filter/search PASS
- [x] Cross-browser: Chrome + Firefox confirmed
- [x] Mobile 375 PASS · empty state PASS · skeleton alignment PASS
- [x] Dashboard "Latest Orders" widget — same component, same regression

### A.2 `members.vue` — `/company/members`
- [x] Renders cleanly with VcTable styling but rows are NOT clickable (no `role="button"`, no `tabindex`); BUG-1/2/3 do NOT apply.

---

## Section B — Pending Spot-Checks (post-BUG-1 fix retest)

For each pending consumer, verify after the row-click fix lands:
- Page renders without console errors / Vue warnings
- Row click navigates **in-place** (no new tab) when listener is bound
- Ctrl+click / middle-click open native new-tab (browser default), not double-tab
- Tab → Enter activates handler; Tab → Space activates handler
- Mobile 375 layout transforms correctly (stacked card or horizontal scroll)

### B.1 `/account/addresses` (`addresses.vue`) — personal account only
- [ ] Sign in as a **personal** (non-org) user (memory: B2B users do not see "Addresses").
- [ ] Verify the addresses table renders with at least Default + Address-Type + Full Address columns.
- [ ] Click on an address row → confirm intended action (edit modal? detail view?). Document.
- [ ] Edit / Delete inline action buttons within a cell still work (per BUG-3 fix, should not double-fire row-click).
- [ ] Empty state: account with zero addresses — no blank table.
- [ ] Mobile 375: row stacks correctly.

### B.2 `/company` or `/company/info` (`info.vue`)
- [ ] Sign in as B2B Org admin (memory: TechFlow org).
- [ ] Verify company-info page table renders (likely contracts or sub-orgs list).
- [ ] If rows are clickable, verify in-place navigation.
- [ ] Otherwise verify rows are decorative (no pointer cursor).

### B.3 `/account/quotes` (`quotes.vue`) — quote requests
- [ ] Requires test data: at least one Draft / Submitted / Approved quote in the test org.
- [ ] Verify quote list renders with Request #, Date, Status, Total columns.
- [ ] Click on a quote row → navigates to `/account/quotes/<id>` (in-place after fix).
- [ ] Status filter / pagination work.
- [ ] Empty state (account with no quotes) renders cleanly.

### B.4 `/account/purchase-requests` (`purchase-requests.vue`)
- [ ] Verify route exists (B2B feature; may require entitlement). Skip if unauthorized.
- [ ] Render + row-click behavior parallels `orders.vue`.
- [ ] Approval-action buttons in cells do not conflict with row-click.

### B.5 `/account/points-history` (`points-history.vue`)
- [ ] Sign in as user with Loyalty points history.
- [ ] Verify history table renders Date / Action / Points / Balance columns.
- [ ] Likely **not row-click navigable** (history is read-only) — verify cursor remains default.
- [ ] No regression on column widths or pagination.

### B.6 `select-address-modal.vue` — checkout address-selection popup
- [ ] Add product to cart, go to checkout.
- [ ] Click "Change shipping address" → modal opens with VcTable of saved addresses + facets (per VCST-4710 / PR #129 scope memory).
- [ ] Click on an address row → verify it selects the address and dismisses the modal.
- [ ] **Do NOT** verify on `/account/addresses` or ship-to popover (those are out of VCST-4710 scope per memory).
- [ ] State / Province facet only appears for USA / Canada (memory: `project_address_state_facet`).
- [ ] Search-by-name + facet filtering still works.
- [ ] Empty results state (no matches) renders cleanly.
- [ ] Keyboard: Tab to a row → Enter selects. Space — verify after BUG-2 fix.

### B.7 `variations-table.vue` — PDP configurable / variations
- [ ] Navigate to a configurable / multi-variation product (e.g. via search or catalog).
- [ ] Verify variations table renders with SKU, options, price, stock, qty columns.
- [ ] If a row is clickable (e.g. to switch the displayed variant or select for quick-add), verify in-place behavior.
- [ ] Quantity stepper inside a row cell does not trigger row-click (memory: B2B-store `qty_stepper_as_add_to_cart` — the (+) IS the add-to-cart trigger).
- [ ] Mobile 375: row stack / horizontal scroll preserved.

### B.8 `address-info-modal.vue` — legacy `columns` prop (NO VcTableColumn migration)
- [ ] Open any flow that surfaces this modal (account address detail, checkout address review).
- [ ] Verify modal renders without Vue warnings related to `columns` prop deprecation.
- [ ] Read-only: rows should NOT be clickable; verify no pointer cursor on hover.
- [ ] Confirm backward compatibility — this is the canonical legacy-API regression check for this PR.

---

## Section C — Cross-Cutting Risks

- [ ] **Same component, same bug surface** — fixing BUG-1/2/3 in the central `<VcTable>` `@row-click` handler propagates to all 9 consumers using the new API. Single-fix, single-retest.
- [ ] **address-info-modal regression scope** — verify the legacy `columns` prop path is NOT removed/broken by VCST-4535's refactor (the only canary for backward compat).
- [ ] **Storybook P0 (INFRA-1)** — Cloudflare Rocket Loader still blocks Storybook QA on `vcst-qa-storybook.govirto.com` for ALL consumers, not just `Organisms/Table`. Until that infra fix lands, all UI-kit story verification stays BLOCKED.

---

## Section D — Test Data Notes

| Surface | Required test data | Source |
|---------|--------------------|--------|
| `/account/orders` | ≥ 10 orders (mixed statuses) | Existing — verified in main run |
| `/account/addresses` | Personal user with ≥ 2 saved addresses | Use `USER2_EMAIL` (no org) per `.env` |
| `/company/info` + `/company/members` | B2B Org admin (TechFlow) | `USER_EMAIL` per `.env` |
| `/account/quotes` | ≥ 1 quote request in any state | May need to seed via Postman MCP |
| `/account/purchase-requests` | B2B entitlement + ≥ 1 PR | Verify feature is enabled in QA |
| `/account/points-history` | Loyalty-enabled user | Loyalty module is on (per packages.json `VirtoCommerce.Loyalty 3.1000.0`) |
| Checkout address-selection modal | Cart with shippable item + saved addresses | TechFlow org has snapshot at `test-data/addresses/techflow-org-addresses-state-20260423.json` |
| PDP variations | Configurable product with ≥ 2 variations | Use B2B virtual catalog root `9238c387-d779-40cb-b27d-5496a670a924` (memory) |

---

## Source Reference

- GitHub code search: `VcTable repo:VirtoCommerce/vc-frontend extension:vue` → 11 hits (incl. component definition)
- GitHub code search: `VcTableColumn repo:VirtoCommerce/vc-frontend extension:vue` → 10 hits (9 consumers + component)
- Diff: 1 consumer (`address-info-modal.vue`) does not import `VcTableColumn` → still on legacy `columns` API.
