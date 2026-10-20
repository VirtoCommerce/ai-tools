# Root cause: QUOTE-005 / R13-2, quote detail unit price contradicts the line total

**Confidence:** HIGH. **Layer:** storefront UI (Vue component wiring). **repoKind:** frontend. **Repo:** `VirtoCommerce/vc-frontend-next`. The same code is in upstream `vc-frontend`.
**Classification:** REAL_BUG, design-independent. **Severity:** P3 / Low. Upgrade to Medium if the PO treats the approval page as price-critical (rationale below).
**NEW_WITH_MERGE:** **no.** It is pre-existing and was not introduced or changed by PR #11.

## 1. What the server sends (it is correct)
`GetQuote` (`network/quote-op-response.json`): Xerox `listPrice 349`, `selectedTierPrice {quantity 2, price 314.10}`; Canon `listPrice 189`, `selectedTierPrice {quantity 3, price 170.10}`; `totals.subTotalExlTax 1265` (list x qty), discount 126.50, `grandTotalInclTax 1366.20`. The proposal is present and consistent, so the data layer is ruled out.

## 2. What the UI renders (from the same data)
| Layout (`.vc-line-items` container) | "Price per item" | Qty | Total | unit x qty = total? |
|---|---|---|---|---|
| wide, > 56rem (1920px) | 349.00 (list) | 2 | 628.20 | **no** (698.00) |
| narrow, <= 56rem (375px) | 314.10 (proposal) | 2 | 628.20 | yes |

The page shows one label with two different values depending on width. On the wide layout no struck-through list total or "list price" wording explains the gap. Both the footer and the summary are labelled "Subtotal", but they show different amounts: 1,138.50 (proposal) and 1,265.00 (list).

## 3. Source (vc-frontend-next `d67b0e0a` = PR #11 head; byte-identical on `dev`)
- `client-app/modules/quotes/components/quote-line-items.vue` passes `:actual-price="item.selectedTierPrice?.price"`, `:list-price="item.listPrice"` and `:total="item.extendedPrice"` (selectedTierPrice.price x quantity). It passes **no `show-placed-price` and no `list-total`**.
- `client-app/ui-kit/components/molecules/line-item/vc-line-item.vue`:
  - narrow property (`vc-line-item__property-price`, hidden at `width > containers.4xl`): `<VcProductPrice :list-price="actualPrice || listPrice">`, which shows **314.10**;
  - wide column (`vc-line-item__price`, hidden at `width <= containers.4xl`): `:actual-price="showPlacedPrice ? actualPrice : listPrice"`, which shows **349.00**;
  - total: `:list-price="showPlacedPrice ? total : listTotal" :actual-price="total"`. With no `listTotal` it shows only 628.20, with no struck list total.
- Contrast: cart and order lines go through `VcLineItems :items` → `prepareLineItem()` (`core/utilities/line-items/index.ts`). That path forwards `showPlacedPrice` from the line item and also `listTotal`. In list-price mode the unit cell is therefore paired with a struck list total. The quote component skips that path and passes neither prop. That is the defect.

## 4. Alternatives ruled out
| Alternative | Evidence | Verdict |
|---|---|---|
| By design (deliberately show list price) | The column has no list/proposed label. The SAME component shows the proposal at narrow width under the same label. List-price mode elsewhere always comes with a struck `listTotal`, which the quote never passes. VirtoOZ (Storefront user guide, Quote Requests) only says Ordered means "ordering the goods at the proposed prices" and says nothing about showing list as unit. | ruled out |
| Data drift / wrong fixture | GetQuote returns the correct list and proposal values. Totals are server-consistent. | ruled out |
| Stale build / cache | Footer read live `3.1.0-pr-11-d67b-d67b0e0a`, `?cb=` cache-buster | ruled out |
| Flaky / timing | 3/3 attempts on 2 quotes (Proposal sent and Ordered), identical values; also identical to the chrome-lane run | ruled out |
| Merge regression (PR #11) | PR #11's only change to `quote-line-items.vue` is `+:validate-on-mount` (quantity a11y). `vc-line-item.vue` is not in the PR. The file's last price-wiring change on `dev` predates 2025-10 (`38fbb592`, VCST-4094). Upstream `vc-frontend` `dev`/`master` has identical lines. kb has it on theme 2.59 and 2.60.0-alpha. | ruled out, pre-existing |

## 5. Invariant
`BL-PRICE-008` violation signal: "line total ≠ qty × unit price" (DECLARED). The precedence `BL-UI invariant > design spec` applies, so a design choice cannot rescue the wide layout. Docs carry no requirement either way. This is a released behaviour that is undocumented, so it counts as a finding.

## 6. Fix direction (for /qa-fix, not applied)
Minimal and single-file: in `quote-line-items.vue` add `show-placed-price` to `<VcLineItem>`. The wide cell then shows 314.10 with 349.00 struck, matching the narrow layout and the total. The alternative, if the PO wants list as the unit, is to pass `:list-total` (list x qty) so the gap is explained, and to fix the narrow property to match. Optionally upstream the same fix to `vc-frontend`. Test: a vitest on `quote-line-items` asserting that the wide price cell renders `selectedTierPrice.price`.

## 7. Severity rationale
Totals, summary and the order placed on Approve are correct (408.24 order honoured the quoted prices per QUOTE-007). The harm is a misleading unit price on the page where a buyer decides to Approve, and the value changes with viewport. Low by impact; Medium is arguable because it is an approval/price surface.

## 8. Incidental (separate, not part of this bug)
The tab title on the detail page reads "QA & Quote request #" with no number (the H1 is correct). BUG_015_005 (raw i18n keys on hard load) was not seen on this client-side navigation path.
