# Business Logic Proposals — /qa-review-bl 2026-07-27 (Phase 4c, cart domain — 4-candidate scope)

> Scope: exactly the 4 candidates surfaced by `/qa-test-lifecycle` run TLC-2026-07-27-1311's cart-CSV
> work. Audit trail: `reports/knowledge/BL-AUDIT-2026-07-27.md`. **Applied** this run: `BL-CART-001`
> (DRIFT, PDP-vs-cart-line split) and `BL-CART-008` (amend, coupon persist+re-price) — both cleared the
> evidence bar (source + live fresh this run, docs N/A per §1a) and are live in
> `knowledge/oracles/business-logic.md`. The two items below did **not** clear the bar this run — held
> as drafts with a re-audit trigger, not failures.

---

## Held — PROPOSED-BL-PRICE-009: Cart line prices silently re-derive from the active price list on reload; no customer-facing change indicator exists

- **Why held:** Source is strong and fresh this run; docs is legitimately N/A (implementation/cache
  mechanics). But the rule's core claim — that a line's price actually changes after an admin-side
  price-list edit — was **not exercised live this run** (deliberately, to avoid a destructive price
  mutation on a shared fixture). Only the "no indicator exists" half was live-observed. Per the
  applicable-axes bar this is UNGROUNDED for the refresh clause → hold, not apply.
- **Proposed severity:** P1-data
- **Proposed rule:** On every cart load/query (not merely on a cart-mutating action), each line's price
  and tier are re-derived from the current price list for the cart's currency/customer — the returned
  price is never the value frozen at add-time. There is **no user-facing price-change indicator**: no
  UI element, banner, or copy renders when a line's price differs from what it was when added; the only
  related copy is the generic disclaimer that totals are "not final until you complete your order." Do
  **not** promote a rule asserting a customer-visible notification — none exists as-built.
- **Evidence gathered this run:**
  - **Source (fresh):** `vc-module-x-cart CartAggregateRepository.InnerGetCartAggregateFromCartNoCacheAsync`
    calls `aggregate.UpdatePrices(lineItem, cartProduct)` + `SetLineItemTierPrice` for every line on every
    cart rebuild, using freshly-loaded `CartProduct` data (current price list) — not the persisted price.
    Separately, a `CartLineItemPriceChangedValidator` **does** run per line and appends findings to
    `aggregate.ValidationWarnings` (a distinct list from `ValidationErrors`), and the GraphQL `CartType`
    schema (`Schemas/CartType.cs`) exposes a `validationWarnings` field — so the backend has a formal
    "price changed" signal. A repo-wide search of `vc-frontend` for `validationWarnings` returned **0**
    hits — the storefront never queries or renders this field.
  - **Live (fresh, partial):** repeated inspection of the `/cart` Order Summary and per-line areas found
    no price-change affordance anywhere — consistent with the source finding that the field is unconsumed.
    The actual "price changes after an admin edit → line re-prices on reload" behavior was **not**
    live-exercised (no admin price mutation was made against a shared `AGENT-TEST-*` fixture this run).
  - **Docs:** N/A — implementation/cache-refresh mechanics; VirtoOZ guides do not narrate this (§1a).
- **Re-audit trigger:** on a future `/qa-review-bl` pass, provision (or reuse a disposable, non-shared)
  single-use product fixture, change its price via Admin, then reload the storefront cart to confirm (a)
  the line price/tax/subtotal actually update and (b) whether the `CartAggregateRepository` in-memory
  cache (`_platformMemoryCache` keyed by cart id, invalidated by cart mutation or a promotion change
  token — **not** by a price-list change) causes any observable staleness window before the next
  cart-mutating action clears it. If confirmed, promote with both axes fresh; also route the unconsumed
  `validationWarnings` field to `ba-doc-writer`/dev backlog as a UX gap, not a BL violation.
- **Note for the 9 mis-cited cases (CART-024/028/029/030/043/044/076/077/097):** do not repoint them to
  `BL-PRICE-001` (discount stacking — wrong domain) or to this proposal (not yet a real ID). Leave the
  `Business_Rule` cite as a coverage gap for `/qa-test-lifecycle` Phase 3 until `BL-PRICE-009` is promoted.

---

## Held — PROPOSED-BL-CART-016: Guest→authenticated merge preserves each line's `selectedForCheckout` state per item

- **Why held:** Live axis was **not walked this run** (explicitly out of budget per the run brief). Per
  the applicable-axes bar, a promotion needs the live axis fresh and agreeing — source alone (even if
  solid) is not sufficient. Held rather than promoted on source-reading alone.
- **Proposed severity:** P1-data
- **Proposed rule (draft, unverified live):** On `mergeCart`, each line's `selectedForCheckout` flag
  merges **per item** — a line that was explicitly toggled on either side of the merge keeps its explicit
  state; only a line that was never explicitly toggled on either side falls back to the store's "Default
  selected for checkout" setting. The merge must not blanket-reset every line to the default, and must not
  silently drop an explicit unselect.
- **Evidence gathered this run:**
  - **Source (partial):** `MergeCartCommandHandler.Handle` (`src/VirtoCommerce.XCart.Data/Commands/`) calls
    `cartAggr.MergeWithCartAsync(secondCart)` then unconditionally `CartRepository.SaveAsync(cartAggr)` —
    and `CartAggregateRepository.SaveAsync` always runs `RecalculateAsync()` before persisting, so a merge
    is a normal save, not a special-cased path. This is suggestive but **not a direct trace** of
    `MergeWithCartAsync`'s line-matching/selectedForCheckout logic — that method's body was not read this
    run (budget).
  - **Live:** none gathered.
  - **Docs:** not checked this run (would likely be N/A per §1a regardless — implementation mechanics).
- **Re-audit trigger:** next pass, read `CartAggregate.MergeWithCartAsync` in full for its
  `selectedForCheckout` handling, then live-walk the CART-106–113 pairwise select/unselect × ON/OFF matrix
  (needs two accounts/sessions — guest cart + an existing authenticated cart, each with distinct explicit
  toggle states, per `feedback_concurrent_runners_distinct_org_users_taskstop`). Promote only if source +
  live agree.
