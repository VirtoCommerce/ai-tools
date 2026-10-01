# BUG: Widening a Customer share to "Anyone with link" warns that recipients will lose access, but their links become public

## Status: READY_TO_SUBMIT · **Tracker:** VCST-6104 (auto-fix labels withheld: fix sits on open PR #2476 and the copy needs a UX decision)
**Severity: Low** (P3), wrong access-control copy. It exposes nothing the rep did not choose. It tells the rep the opposite of what happens to existing recipients.
**Found by:** `/qa-test-fast VCST-5728`, exploratory session 2026-09-29 pm (EXP-08) · **Related:** VCST-5707 (FE sharing rework, Testing), VCST-5728
**Archetype:** `RENDER`/copy. The confirm copy is computed from "scope changed", not from the audience delta.

**Env:** vcst-qa · Theme `2.59.0-pr-2476-0604-0604e3f1` (vc-frontend#2476 head `0604e3f1`) · XCart `3.1037.0-pr-141-fb27` · SalesRep `3.1012.0-pr-21-f681` · Cart `3.1011.0-pr-194-8331` · Platform `3.1073.0-pr-3121-9965` · playwright-firefox

## Expected vs Actual
- **Expected:** switching a list shared with customers to **Anyone with link** either saves without a revocation warning, or warns about what actually happens: the list becomes public, and the existing recipients' links keep working.
- **Actual:** the dialog shows **"Change who can access? Everyone the list is shared with now will lose access."** After confirming, the recipients' old push link (same sharing key) **still opens the list**, now even for an anonymous guest.

## Steps to Reproduce
1. Sign in as a sales rep. Go to **/account/lists** and create a list.
2. **Actions → Share**, choose **Customer**, select one customer, **Share**. The customer gets a push with the list link.
3. Reopen **Share** and choose **Anyone with link**, then **Share**.
4. Observe the confirmation: *"Change who can access? Everyone the list is shared with now will lose access."* Confirm.
5. In a guest (signed-out) browser, open the link from step 2's push. The list renders.

## Evidence
![Widen confirm](../../screenshots/rep-share-widen-confirm-says-recipients-lose-access/pm-X-09-widen-to-anyone-shows-stop-sharing-confirm.png)
- `reports/bugs/screenshots/rep-share-widen-confirm-says-recipients-lose-access/pm-X-10-guest-opens-old-customer-push-link-after-widen.png` shows the guest opening the old Customer link after the widen.
- Session: `reports/exploratory/SBTM-VCST-5728-2026-09-29.md` (EXP-08) · HAR `test-results/firefox/har/session.har` · console: 0 errors.

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront Frontend | FAIL | Confirm copy contradicts the outcome (pm-X-09) |
| 2. Backend Admin | N/A | Not admin-visible |
| 3. GraphQL xAPI | PASS | `changeWishlist` keeps `sharingSetting.id` across scope changes (KB-7A9D4927, confirmed this run). `sharedWishlist(key)` is readable after the widen, as the Anyone scope documents |
| 4. Platform REST API | N/A | Not exercised |

**Owning layer:** Layer 1, storefront. Docs (VirtoOZ Lists → *Manage lists*): **Anyone** = "shared via public view-only link". Nothing says recipients lose access on a widen.

## Root Cause Analysis
- `client-app/shared/wishlists/components/share-wishlist-modal.vue:205-207`: `revokesCurrentAudience = listSharingScope !== PRIVATE && scopeChanged && hasCurrentAudience`. This is true for **any** scope change away from a shared scope, including a widening that revokes no one.
- `client-app/shared/wishlists/components/stop-sharing-confirmation-modal.vue:43-45` then shows `stop_sharing_modal.change_*`.
- `locales/en.json:1031`: `"change_message": "Everyone the list is shared with now will lose access."`
- Not verified: Customer → **Organization** hits the same branch, and there the Customer recipients do lose access, so the copy is correct for that path. The defect is the widen-to-public path.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1, Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend (PR #2476, not merged)
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** shared/wishlists `share-wishlist-modal` + `stop-sharing-confirmation-modal`
- **RCA anchor:** `share-wishlist-modal.vue:205` `revokesCurrentAudience`; `locales/en.json` `stop_sharing_modal.change_message`
- **Routing confidence:** MEDIUM. The fix is on an open PR, and the right copy per target scope needs a PO/UX decision.
