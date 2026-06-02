# PROPOSED-BL Drafts — 2026-05-21

**Status:** Advisory only. Per `feedback_business_logic_promotion`, no entry below may be promoted to [business-logic.md](../../.claude/agents/knowledge/business-logic.md) without explicit per-entry user approval.

**Source review:** VirtoOZ docs (PlatformUserGuide, StorefrontUserGuide, B2BExperts) cross-referenced against current BL file (114 entries, post-2026-05-21 metadata sweep).

**Author:** review pass on 2026-05-21.

---

## How to approve

Reply with the IDs you accept (e.g., "Promote PROPOSED-BL-CART-015 and PROPOSED-BL-LIST-001; reject the rest"). I will then insert the approved entries into the appropriate Domain section in `business-logic.md` body only — leaving the Invariant Coverage Summary table for you to update manually per the established convention.

---

## PROPOSED-BL-CART-015: Save for Later items survive sign-out and are NOT part of cart-merge `[P1-data]`

- **Rule:** "Save for Later" (SFL) is a separate persisted collection from the active cart. When a registered user signs out and signs in again, both the cart (per BL-CART-008) and the SFL list MUST be restored independently. When a guest cart merges into a registered user's cart on sign-in, SFL items MUST NOT be touched — the registered user's existing SFL list remains as-is. Moving an item from cart to SFL removes it from the cart's `items[]` (subtotal recalculates) and adds it to the SFL list with the same productId/quantity. Moving from SFL to cart performs the inverse.
- **Verify:** Add 2 items to cart → move 1 to SFL → cart subtotal recalculates without the moved item → sign out → sign in → cart shows 1 item, SFL shows 1 item. Separately: as guest, add 2 cart items → sign in to an account that already has an SFL list with 3 items → after merge, cart contains the guest's 2 items merged into existing cart per BL-CART-008, SFL still shows the original 3 (untouched).
- **Violation signal:** SFL items appear in cart subtotal calculation; SFL items lost on sign-out; guest cart merge clobbers the registered user's SFL list; moving cart→SFL does not recalculate cart subtotal.
- **Source:** [storefront docs Save for Later](https://docs.virtocommerce.org/storefront/user-guide/account/saved-for-later); xCart module 3.931.0 (SavedForLater mutations/queries added), 3.939.0 (SaveForLater cart type introduced), 3.943.0 (Saved for later list removed from wishlists query).
- **Agents:** qa-frontend-expert (cart + SFL widget), qa-backend-expert (xCart `savedForLater` query, `addToSaveForLater`/`moveFromSaveForLaterToCart` mutations)
- **Suggested suite:** new `029-save-for-later.csv` under `Frontend/cart/` and `050b1`/`050j` for GraphQL.

---

## PROPOSED-BL-CART-016: Wishlist→Cart conversion creates a new cart, never merges into the active cart `[P1-data]`

- **Rule:** The `createCartFromWishlist` mutation creates a NEW cart populated from the wishlist's items. It MUST NOT modify, replace, or merge into the customer's currently active cart. The new cart inherits the wishlist's items and quantities but starts with empty shipping/payment/coupon context. After conversion, the wishlist itself is unchanged — the conversion is a copy, not a move.
- **Verify:** Have an active cart with 1 item; have a wishlist with 3 items. Call `createCartFromWishlist(wishlistId)`. Assert: a new cart is returned with 3 items; the original active cart still has 1 item; the wishlist still has 3 items. Switch active cart to the new one via storefront UI — original cart remains addressable.
- **Violation signal:** Wishlist items appended to the existing active cart instead of creating a new cart; wishlist emptied after conversion; original active cart's items lost.
- **Source:** xCart module 3.934.0 (createCartFromWishlist mutation added).
- **Agents:** qa-backend-expert (xCart mutation), qa-frontend-expert (storefront wishlist→cart UI flow)

---

## PROPOSED-BL-CART-017: `UpdateCartQuantity` is idempotent and triggers full recalculation `[P1-data]`

- **Rule:** The `UpdateCartQuantity` mutation (xCart 3.945.0) sets a line item's quantity to an absolute value (NOT delta-based). Repeated calls with the same `(lineItemId, quantity)` MUST be idempotent — second call leaves cart in identical state to first call, no double-decrement, no error. Setting quantity to 0 removes the line item. Each mutation MUST trigger full cart recalculation: subtotal, tax, shipping, discounts re-evaluate before the response returns.
- **Verify:** Add product to cart with qty=3 → call `UpdateCartQuantity(lineItem, 5)` → cart.items[0].quantity = 5, subtotal recalculates. Call same mutation again with qty=5 → state unchanged, no errors, response returns updated cart shape. Call with qty=0 → line item removed from `items[]`.
- **Violation signal:** Repeated call doubles the quantity (mutation interpreted as delta); cart not recalculated; qty=0 doesn't remove the line item; error on idempotent second call.
- **Source:** xCart module 3.945.0 (UpdateCartQuantity mutation added).
- **Agents:** qa-backend-expert (xCart mutation contract)

---

## PROPOSED-BL-LIST-001 (new domain): Shopping list sharing respects view vs. edit permission tiers `[P1-data]`

- **Rule:** When a shopping list owner shares a list via generated URL, the share grant carries an explicit permission tier — `view` (read-only) or `edit` (can add/remove/rename items). The recipient's effective capabilities on the shared list MUST match the granted tier, regardless of their organization role. Anonymous recipients of a share URL get at most `view` access. Revoking a share immediately invalidates the share URL for all recipients. List owner always retains full edit.
- **Verify:** Owner creates list, shares with `view` permission → recipient opens URL → can read items but Add/Remove buttons are absent or disabled → attempt mutation via GraphQL returns `Forbidden`. Owner re-shares with `edit` → recipient can mutate items. Owner revokes share → recipient's open tab returns 403/404 on next interaction. Anonymous recipient never sees Add/Remove controls.
- **Violation signal:** View-only recipient can modify the list; edit-permission recipient cannot modify; anonymous recipient gets edit access; revoked share URL still resolves; list owner loses edit rights after sharing.
- **Source:** xCart module 3.941.0 (Shopping list sharing implemented); [B2BExperts — Sharing and Collaboration](https://b2bexperts.org/Elevating-customer-experience-in-b2b-ecommerce).
- **Agents:** qa-frontend-expert (lists UI + share dialog), qa-backend-expert (xCart wishlist share mutations + authz)
- **Suggested domain placement:** new Domain 17 "Lists & Sharing (BL-LIST)" — or extend BL-B2B if scope stays small.

---

## PROPOSED-BL-B2B-007: Multistep cart approval chains preserve cart state across approver hand-offs `[P0-revenue]`

- **Rule:** When a cart total exceeds a configured approval threshold, the order enters an approval workflow with one or more configured approver steps. Each approver receives the request, can approve or reject. While in `PendingApproval`, the cart is locked — buyer cannot modify items, quantities, or addresses without triggering re-approval. On rejection, the workflow terminates; the buyer can edit the cart and resubmit (starts a new chain). On final approval (last approver in the chain), the order is placed using the prices/inventory at the moment of submission (NOT at approval time), unless prices/stock have materially diverged — in which case the order MUST be re-validated and the buyer notified.
- **Verify:** Set 2-step approval (Manager → Director) on threshold $500. Buyer submits $600 cart → enters `PendingApproval` → cart immutable in storefront UI. Manager approves → still pending (waiting on Director). Director approves → order placed with original submission-time prices. Re-test with Manager rejecting → buyer sees rejection reason, cart unlocked, resubmission starts a new chain. Re-test with price change mid-approval → order placement re-validates and surfaces a warning if line totals differ.
- **Violation signal:** Buyer can modify a cart while it's in `PendingApproval`; intermediate approval places the order before final approval; rejection silently auto-resubmits; price drift during approval not surfaced; final approval places at approval-time prices instead of submission-time prices (unless re-validation occurs).
- **Source:** [B2BExperts — Cart approval](https://b2bexperts.org/Elevating-customer-experience-in-b2b-ecommerce); extends BL-B2B-004 (single-step delegated limits).
- **Agents:** qa-frontend-expert (approval workflow UI), qa-backend-expert (approval workflow API, cart state transitions)
- **Suggested suite:** new `010c-multistep-approval.csv` under `Frontend/b2c/` or `B2B`.

---

## PROPOSED-BL-PRICE-009: Contract pricing resolves via `-Base` + `-Priority` assignment pair `[P0-revenue]`

- **Rule:** The Contracts module (`vc-module-contract`) implements contract pricing by creating TWO price-list assignments per contract: a `-Base` assignment that mirrors the default price list, and a `-Priority` assignment that holds contract-modified prices and overlays the base. Active contract period (start/end dates) automatically defines the active period of BOTH assignments. Outside the contract window, neither assignment applies and the customer falls back to the store default price list. The `-Priority` assignment overrides individual line items where contract prices were modified; products not modified in the contract still resolve via `-Base`.
- **Verify:** Create contract for Org A with date window 2026-06-01 to 2026-12-31, default price list `MFDUSD`, modify Product X price → verify `Pricing` module shows `Contract-{name}-MFDUSD` price list and two assignments (`-Base`, `-Priority`). As Org A member on 2026-06-02 → Product X shows modified contract price, other products show base `MFDUSD` prices. Set system date to 2027-01-01 (or expire the contract) → all products fall back to store-default price list. Restore prices in contract → verify default prices return.
- **Violation signal:** Only one assignment created (no `-Base`/`-Priority` split); contract pricing visible outside contract date window; modifying a product price in contract corrupts the underlying default price list; assignments not auto-deactivated when contract expires.
- **Source:** [Contracts module overview](https://docs.virtocommerce.org/platform/user-guide/contracts/overview), [Manage Contract Prices](https://docs.virtocommerce.org/platform/user-guide/contracts/managing-contract-prices); refines but does NOT replace BL-PRICE-007 (generic org-pricing rule).
- **Agents:** qa-backend-expert (Pricing module API, Contracts module API), qa-frontend-expert (Org member price display)

---

## PROPOSED-BL-NOTIF-004: Back-in-stock notifications dispatch exactly once per reentry event `[P1-data]`

- **Rule:** When a customer subscribes to back-in-stock alerts for a product (out-of-stock at subscription time), the platform MUST send exactly one notification when the product transitions from `qty = 0` → `qty > 0` aggregated across the store's FFCs. Subsequent oscillations (qty > 0 → qty = 0 → qty > 0) trigger another notification cycle ONLY if the subscriber remains subscribed and has not yet been notified for the new in-stock event. Once notified, the subscription is consumed — re-subscribing is an explicit action. Unsubscribing before dispatch suppresses the notification.
- **Verify:** Product qty=0. User subscribes via `/account/back-in-stock`. Admin sets qty=5 → wait ≤120s → user receives exactly 1 notification (verify in `/account/notifications` and inbox). Set qty=0 again, then qty=3 → no new notification (subscription already consumed). Re-subscribe → set qty=0 then qty=5 → user receives 1 fresh notification. Subscribe → admin sets qty=5 but user unsubscribes within 5s → no notification sent.
- **Violation signal:** Zero notifications when stock returns; duplicate notifications for same stock-return event; notification sent after unsubscribe; subscription not consumed (sends repeatedly on subsequent restock).
- **Source:** [Back-in-Stock List](https://docs.virtocommerce.org/storefront/user-guide/account/back-in-stock-list); [back-in-stock notifications](https://docs.virtocommerce.org/storefront/user-guide/shopping/back-in-stock-notifications).
- **Agents:** qa-backend-expert (subscription API, notification dispatch), qa-frontend-expert (subscribe/unsubscribe UI)

---

## PROPOSED-BL-B2B-008: Per-organization page personalization resolves on sign-in and clears on sign-out `[P1-data]`

- **Rule:** When a CMS page (Page Builder Office or Builder.io) is configured with organization-specific variants, the storefront MUST serve the variant matching the signed-in user's active organization. Resolution order: (1) variant explicitly targeted to the user's active org, (2) variant targeted to a parent org if the user's org inherits, (3) the default/published page. On sign-out, the storefront immediately reverts to the default page — the personalized variant MUST NOT remain cached on the next anonymous request. Switching organizations within a B2B session re-resolves variants for every subsequent navigation.
- **Verify:** Configure homepage with Org-A variant "A-Home" and Org-B variant "B-Home" + default "Default-Home". Sign in as Org A member → home shows "A-Home". Switch to Org B → home shows "B-Home". Sign out → home shows "Default-Home" on next load. Open private/incognito → home is "Default-Home". Configure Org-A variant only → sign in as Org B member → home falls back to "Default-Home".
- **Violation signal:** Anonymous user sees a personalized variant; signed-in user sees default despite matching variant existing; org switch does not refresh content; cached variant survives sign-out; variant served on a 404/error fallback.
- **Source:** [Page Builder Office — Customize pages for specific users](https://docs.virtocommerce.org/platform/user-guide/page-builder/manage-pages-via-office); [Builder.io — Customize pages for specific users](https://docs.virtocommerce.org/platform/user-guide/integrations/builder-io/use-builder-io). Complements BL-B2B-006 (white-labeling) for content personalization.
- **Agents:** qa-frontend-expert (page resolution on sign-in/out), qa-backend-expert (CMS resolver + org context propagation)

---

## PROPOSED-BL-PR-001 (new domain — virtostart only): Purchase Request OCR conversion creates a quote-status request `[P2-ux]`

- **Rule:** When a user uploads a printed/handwritten purchasing document via `/account/purchase-requests`, the `vc-module-ai-document-processing` module OCR-extracts line items, matches them to catalog products, and produces a draft purchase request. Clicking **Proceed to quote** converts the draft into a quote in `Submitted`/`InProcess` status, visible in `/account/quote-requests`. Drafts not yet submitted remain in the `Purchase requests` section as editable rows. Once converted to a quote, the original purchase request transitions to `Submitted` and becomes read-only.
- **Verify:** Upload a sample PDF → wait for OCR → verify line items populated in the draft → click **Proceed to quote** → quote appears in `Quote requests` with matching items → original purchase request transitions to read-only "Submitted" state. Verify draft remains editable until converted. Verify unmatched OCR items surface as a list with a manual-resolve UI.
- **Violation signal:** OCR completes but no draft appears; **Proceed to quote** creates a duplicate purchase request instead of converting; draft remains editable after conversion; quote created without all extracted line items.
- **Scope:** Only applies to environments where `vc-module-ai-document-processing` is installed (currently virtostart, NOT vcst-qa — see `project_purchase_request_module` memory).
- **Source:** [Purchase Requests](https://docs.virtocommerce.org/storefront/user-guide/account/purchase-requests).
- **Agents:** qa-frontend-expert (purchase-request UI flow), qa-backend-expert (OCR pipeline + quote creation API)
- **Suggested domain placement:** Domain 18 "Purchase Requests (BL-PR)" — gated behind a "module installed" precondition.

---

## D. Content drift candidates (verification needed, no PROPOSED-BL yet)

These don't require a new entry — they may require an update to an existing one once the live state is re-verified. Surfacing here so the next QA pass picks them up:

1. **[BL-ORD-001](.claude/agents/knowledge/business-logic.md#L224) / [BL-ORD-006](.claude/agents/knowledge/business-logic.md#L256) / [BL-ORD-007](.claude/agents/knowledge/business-logic.md#L268) / [BL-ORD-009](.claude/agents/knowledge/business-logic.md#L281):** Order/Payment/Shipment status vocabularies were verified 2026-04-22. Re-spot-check the live Order Statuses dictionary on vcst-qa to confirm the "exactly 7 settable values" claim and the 5 shipment statuses haven't drifted with platform updates (current vcst-qa platform 3.1026.0). Touch point: `Admin → Settings → Order Statuses` and a Shipment Status dropdown on any order.

2. **[BL-AUTH-002](.claude/agents/knowledge/business-logic.md#L314):** Email verification flow now goes via `Admin Security → User → Resend` then extract link from Notifications (per `reference_email_verification_workflow` memory). Current rule text suggests an in-mailbox verification link the customer clicks. Consider tightening the Verify section to reflect the QA-environment workflow OR clarify that the rule describes production-customer flow, with the QA workaround noted separately.

3. **[BL-CART-008](.claude/agents/knowledge/business-logic.md#L120):** Should reference PROPOSED-BL-CART-015 (above) once promoted: SFL items survive sign-out independently of cart merge. Currently the rule talks about cart-only persistence; the SFL side-channel is invisible.

4. **[BL-ORD numbering](.claude/agents/knowledge/business-logic.md#L281):** [BL-ORD-009](.claude/agents/knowledge/business-logic.md#L281) is inserted between BL-ORD-007 and BL-ORD-008 — they appear in order 007, 009, 008 in the file. Cosmetic; user may want to re-order.

---

## Summary

- 9 PROPOSED-BL entries spanning new VC capabilities (Save for Later, Wishlist→Cart, UpdateCartQuantity, List Sharing, Multistep Approval, Contracts, Back-in-Stock, Page Personalization, Purchase Requests).
- 4 drift-verification candidates for existing entries.
- 2 new candidate domains: `BL-LIST` (lists & sharing) and `BL-PR` (purchase requests, virtostart-only).

**Next step:** await per-entry approval. Reply with explicit IDs to promote — I will edit ONLY the corresponding Domain body section per `feedback_bl_promotion_table_separately`; the Invariant Coverage Summary table stays user-managed.
