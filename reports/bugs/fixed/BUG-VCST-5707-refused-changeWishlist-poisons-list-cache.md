# A refused `changeWishlist` leaves a modified cached list, and the next rename persists it — [High]

**Env:** vcptcore-qa · theme 2.59.0-pr-2476-0604 · XCart 3.1037.0-pr-141-fb27 · Cart 3.1011.0-pr-194-8331 · SalesRep 3.1012.0-pr-21-f681 · 2026-09-29
**Found by:** /qa-test VCST-5707 (step 4a backend; reproduced in C1 WISH-038, REG-2026-09-29-1506) · **Provenance:** IN-SCOPE (sharing validation path added by x-cart #141 / sales-rep #21) · **Archetype:** STALE / SILENT

## Summary
When `changeWishlist` is refused with `INVALID_OPERATION` (empty Customer set, same id in add+remove), storage is unchanged but the server-side cached list aggregate keeps the refused state. The owner's reads then alternate between the old and the refused state, and the next legitimate write (a rename) persists the refused state — e.g. a Customer-scoped list with **zero** targets, a state the server itself refuses to create.

## STR (API, owner = @td(SR_REP_PRIMARY))
1. Create a list; `changeWishlist(scope: "AnyoneAnonymous")`.
2. `changeWishlist(scope: "Customer")` with no `addSharedWithIds` → `errors[]` `INVALID_OPERATION`.
3. Read `wishlist(listId){ sharingSetting{ scope targets{id} } }` 8×.
4. `changeWishlist(listName: "<new name>")` (rename only, no sharing fields).
5. Anonymous `sharedWishlist(sharingKey)`.

## Expected vs Actual
| Step | Expected | Actual |
|---|---|---|
| 3 | AnyoneAnonymous on every read | Customer / AnyoneAnonymous alternate (4 of 8); an uncached read (different `cultureName`) shows AnyoneAnonymous |
| 4 | rename leaves sharing untouched (VCST-5925 2.1) | response scope **Customer**, persisted, `targets: []` |
| 5 | list returned | "Anonymous access denied" — the public link is dead |

Same-id add+remove on a list steady at {TechFlow}: targets alternate `[]` / `{TechFlow}` (6 of 12 reads). C1 WISH-038: readback `targets.length` 0 after a refused remove-last.
Refusals validated earlier (unserved org, legacy id on a 2-target list, 1025-char message) do **not** poison the cache.

## Evidence
`reports/tickets/Sprint26-19/VCST-5707/screenshots/4a-be-E3-empty-set.json`, `4a-be-E3-read-nondeterminism.json`, `4a-be-cache-key-discriminator.json`, `4a-be-cache-poison-then-rename.json`; C1 `reports/regression/REG-2026-09-29-1506/graphql-evidence/`.

## Fix Routing
Likely `vc-module-x-cart` (sharing service / scope policy mutates the cached `CartAggregate` before validation throws) — validate on a copy, or evict the aggregate from cache on failure. UI reach is limited (Save is disabled on an empty set), but any API client or a race reaches it.

## Resolution
- **Tracker:** VCST-6113 → Tested (2026-10-02)
- **Fixed in:** vc-module-x-cart#141 `cd984e3` (evict cached aggregate when a scope policy throws) + vc-module-sales-rep#21 `ff6da14` (validate before writing); deployed as XCart 3.1038.0-pr-141-3d86 / SalesRep 3.1012.0-pr-21-ff6d on vcptcore-qa
- **Method:** API STR 3/3 GREEN vs the 2026-09-29 RED baseline; add+remove variant 12/12 steady; valid sharing transitions unaffected — `reports/tickets/Sprint26-19/VCST-6113/evidence.html`
- PRs still open at verification time — re-check after merge.

## Status: FIXED
