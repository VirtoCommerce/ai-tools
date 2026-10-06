# VCST-6125 — Fix verification (Phase B, GREEN) — xAPI

**Verdict: FIXED — PASS (10/10)** · env `vcptcore-qa` (`TEST_ENV=vcptcore`) · 2026-10-05 · layer: GraphQL xAPI (no browser)
**Build:** XCart 3.1038.0-pr-141-b404 · Cart 3.1011.0-pr-194-8331 · SalesRep 3.1012.0-pr-21-8964 · Platform 3.1076.0
**RED baseline:** `reports/tickets/Sprint26-19/VCST-5707/screenshots/5c-coowner-*.json` (XCart 3.1037.0-pr-141-fb27, 2026-09-30). The same queries and mutations were sent again.

## Actors
- Owner: `@td(SR_REP_PRIMARY)`, token org-scoped to `@td(ORG_ACME.platform_id)`, store `{{STORE_ID}}`
- Co-owner: `@td(ACME_BUYER)` (AcmeCorp member, access Write, isOwner false)
- Outsider: `@td(SR_REP_EXCLUSIVE_TECHFLOW)` with a token scoped to `@td(ORG_TECHFLOW.platform_id)`. Anonymous: no token.
- Admin: platform `admin` with a context-free token. Products: live-discovered buyable, in-stock `is:product` items.

## Run tally
3 runs, each on a fresh list `AGENT-TEST-6125-r{1,2,3}`, plus a separate admin list `AGENT-TEST-6125-admin`. 127 assertions in total.
- 121 met the brief's expectation.
- 6 recorded 200 instead of an error. These are the no-scope variants c5 and c6 (3 runs each); see Observation O1. They wrote nothing and the owner did not change, so none of the 6 is a security failure.
- No 5xx responses and no unexpected GraphQL errors.

**Refusal (same in all 3 runs, for every scope/sharing write and for removeWishlist):**
`errors[0].message = "Access denied."`, `extensions.code = "Forbidden"`, `data.changeWishlist = null` / `data.removeWishlist = null`, HTTP 200.

## Checklist

| # | Item | Verdict | Evidence (`evidence/`) |
|---|------|---------|------------------------|
| 1 | STR reproduced 3/3 runs with the same refusal | PASS — c1 AnyoneAnonymous, c2 Private, c3 Organization, c4 Customer+addSharedWithIds, c7 Customer+add+message: `Access denied.` / `Forbidden`, 15/15 | `run{1,2,3}-step3-c{1,2,3,4,7}-*.json` |
| 2 | Owner unchanged after every co-owner scope write | PASS — after each of the 7 variants, owner `wishlist(listId)` shows customerId = owner, customerName "Priya Rao", isOwner true, scope Organization. The list is still in owner `wishlists()` (42/42 checks) | same files (owner reads after each write) |
| 3 | Root cause fixed: same-scope Organization and sharing-field variants also refused | PASS — same-scope Organization refused (pre-fix it changed the owner, RED `3f`). Customer+addSharedWithIds and Customer+message refused. Sharing deltas without scope are no-ops (O1) | `run*-step3-c3-same-organization.json`, `-c4-`, `-c5-`, `-c6-`, `-c7-` |
| 4 | Co-owner removeWishlist refused; list persists | PASS 3/3 — `Access denied.` / `Forbidden`, removeWishlist null. Owner can still read the list (pre-fix: `true`, list deleted, RED `3d`) | `run*-step6-coowner-remove-list.json` |
| 5 | Co-owner can still rename (listName/description) | PASS 3/3 — the change persisted and the owner did not change | `run*-reg5-coowner-rename.json` |
| 6 | Co-owner can still add / update qty / remove an item | PASS 3/3 — addWishlistItem, updateWishListItems (qty 5) and removeWishlistItem all succeed; owner unchanged | `run*-reg6-coowner-items.json` |
| 7 | Owner can still change scope and remove own list | PASS 3/3 — Private → Organization → AnyoneAnonymous → Organization all succeed with isOwner true; removeWishlist `true`, then wishlist(listId) null | `run*-reg7-owner-scope-and-remove.json` |
| 8 | Admin can remove an org list | PASS — **xAPI** `removeWishlist` with the admin token returned `true` and the owner then reads null. REST fallback not needed | `item8-admin-remove-org-list.json` |
| 9 | Anonymous and other-org outsider get no access | PASS 3/3 — anonymous: `Anonymous access denied or access token has expired or is invalid.` [Unauthorized]. TechFlow rep: `Access denied.` [Forbidden]. Both apply to `sharedWishlist(sharingKey)` and `wishlist(listId)`. Positive control: anonymous CAN read the list after the OWNER sets AnyoneAnonymous, which shows the probe works | `run*-step5-anonymous-outsider.json`, `run*-reg7-*.json` |
| 10 | BL: sharing and ownership belong to the owner only (FE PR #2476) | PASS — every scope or sharing write by a non-owner is refused or ignored. Only the owner's scope writes took effect, and ownership never moved | all of the above |

## Observations
- **O1 — no-scope sharing deltas are silently ignored, not refused (not a defect here).** The co-owner sent `{listId, addSharedWithIds:[TechFlow]}` (c5) and `{listId, message}` (c6). Both returned HTTP 200 with no `errors[]`, and **nothing was written**: targets `[]`, message null, scope Organization, owner unchanged, 3/3. The dev comment says such a call is "refused". What actually happens matches the known behaviour on this build line (kb `KB-B4377884`: deltas without `scope` are ignored, for owners too). Ownership is safe, so this does not block verification. If the AC requires an explicit error, raise that as a contract question.
- The response to the ignored c5/c6 call shows `sharingSetting.isOwner=false` from the caller's view. It is a no-op echo, not a write: the owner's next read shows isOwner true.

## Cleanup
- Run lists r1, r2, r3 were removed by the owner as part of item 7.
- The admin list was removed by the admin as item 8.
- Final sweep: owner and co-owner `wishlists()` contain **0** `AGENT-TEST-6125-*` lists (`cleanup.json`). No config changes were made. Tokens were in memory only.

## KB
- Disputed `KB-B59A1F9D`: it describes the pre-fix ownership-takeover behaviour, which no longer happens on 3.1038.0-pr-141.
- Confirmed `KB-B4377884`.
- Captured `KB-6E56FB4B`: post-fix owner-only sharing and removal.
