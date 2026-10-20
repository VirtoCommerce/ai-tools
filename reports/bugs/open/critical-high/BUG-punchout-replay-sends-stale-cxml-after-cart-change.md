# BUG: Punchout — Create requisition after a return sends the OLD cXML although the cart changed

**Severity:** High · **Provenance:** IN-SCOPE (VCST-5887, introduced by the idempotent replay, vc-module-punchout commit `33d791f`) · **Found by:** agent, in testing (VCST-5887 round 2)
**Environment:** vcptcore-qa1 · Punchout `3.1000.0-pr-2-6c75` (PR #2 head 6c75c57) · theme `2.61.0-pr-2564-69d4` (vc-frontend PR #2564 head 69d4418)
**Parent:** VCST-5887 (Sub-task)

## Steps
1. Start a punchout session (cXML setup on configuration 0), open the start page.
2. Add 3 products to the cart, go to the cart, click **Create requisition** — the procurement system receives the cart (Total 56.50).
3. Press browser **Back** to the cart. Change the cart: raise one quantity, add one more product (screen subtotal $168.49).
4. Click **Create requisition** again.

## Expected
The procurement system receives the cart on screen (QA guide, Step 3: "the items match the storefront cart") — or, if the session can return only once, the buyer gets a refusal saying so.

## Actual
The storefront shows success and posts the FIRST document again, byte-identical (same payloadID and timestamp): 3 lines, Total 56.50, while the screen shows 4 lines, $168.49. No error, no warning. `errorCode` is null. Reproduced in the checklist (R2-B5) and by regression case PNCR-029.

![Changed cart on screen](../../../tickets/Sprint26-20/VCST-5887/screenshots/r2-B5-changed-cart.png)
![Stale document received](../../../tickets/Sprint26-20/VCST-5887/screenshots/r2-B5-return-page-stale.png)

## Evidence
`reports/tickets/Sprint26-20/VCST-5887/evidence/r2-B3-cxml.xml` (first send) vs `r2-B5-cxml.xml` (after the change) — `cmp` identical; `r2-B5-carts-before.json` (cart state before the click); `r2-B5-gql-response.json`. Regression run REG-2026-10-20-1248, PNCR-029.

## Notes
`PunchoutOrderMessageProcessor.ValidateAsync` returns the stored order message for a `Returned` session without comparing it with the current cart. Replaying the same document is fine for a retry of an unchanged cart; the problem is a cart that changed after the return.
