# Wishlist share targets come back in one order from a write and the opposite order from a read, so a legacy client re-sending its own `sharedWithId` is refused — [Medium]

**Env:** vcptcore-qa · XCart 3.1037.0-pr-141-fb27 · Cart 3.1011.0-pr-194-8331 · SalesRep 3.1012.0-pr-21-f681 · 2026-10-01, re-confirmed 2026-10-02 (same build)
**Found by:** /qa-test VCST-5925 (4a P-6, P-8, P-4) · **Provenance:** IN-SCOPE (AC10, contract 2.3) · **Archetype:** SILENT/STALE · kb: KB-42230B0A

## Summary
The deprecated `sharingSetting.sharedWithId` is defined as "the first target". A write response lists `targets` in insertion order. Every later read lists them newest first (target `createdDate` descending). The read order is deterministic and stable. But it is the reverse of what the write returned, so `sharedWithId` names a different org depending on which response the client holds. `GetLegacyTargetDeltas` treats only `currentIds.FirstOrDefault()` as a no-op. So a released single-value client that re-sends the `sharedWithId` it was given can get `INVALID_OPERATION` on an ordinary save.

## STR (rep @td(SR_REP_PRIMARY), `/graphql`)
1. `createWishlist { scope: "Customer", addSharedWithIds: [A, B, C] }` → response `targets` A, B, C; `sharedWithId` = A.
2. `wishlist(listId)` → `targets` B, C, A; `sharedWithId` = B. Stable over 6 reads and 4 renames (newest first; storage confirms C, B, A created in that order within ms).
3. `changeWishlist { listId, scope: "Customer", sharedWithId: A }` (the value from step 1).

## Expected vs Actual
- Expected (AC10 / contract 2.3, Ivan Kalachikov 2026-09-09): a legacy `sharedWithId` is handled ONE way for every input — "treat as a one-element set, or reject outright". Rejecting is allowed. Making the outcome depend on which target happens to come first is not. `targets` order and `sharedWithId` are the same in the write response and in later reads.
- Actual: the outcome depends on position. The first target is a no-op, and any other present target is refused. Because the write response and the read disagree on position, the same request succeeds or fails depending on which response the client cached last. A storefront that updates its cache from the mutation response (step 1) and re-sends that value (step 3) fails on an ordinary save. Observed: step 3 → HTTP 200, `errors[INVALID_OPERATION]` ("Error trying to resolve field 'changeWishlist'."). The same flip shows after a listName/description save (its response vs the next read), and after the target org was deleted (`sharedWithId` then pointed at the deleted org). 2026-10-02 retest (2 targets, two lists): legacy = first-as-read → no-op; legacy = the `sharedWithId` the write response returned → INVALID_OPERATION; legacy = a new served org → INVALID_OPERATION (allowed by 2.3).

A = @td(ORG_ACME.platform_id), B = @td(ORG_TECHFLOW.platform_id), C = BuildRight (served by the rep).

## Fix Routing
vc-module-x-cart (#141): return `targets` in ONE order in the write response and in every read (today: insertion vs createdDate descending), and make the legacy rule position-independent. Both shapes 2.3 allows are fine: treat ANY present target as a no-op, or refuse a legacy `sharedWithId` on every multi-target list. The order is the root cause; the legacy rule makes it visible.
