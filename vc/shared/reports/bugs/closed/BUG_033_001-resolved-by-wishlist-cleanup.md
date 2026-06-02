# BUG_033_001 — `Saved for later` /403 — RESOLVED by removing Elena's orphaned wishlist data

**Status:** **CLOSED — not reproducible after data cleanup (2026-04-21)**
**Resolution:** Product owner removed Elena Mutykova's orphaned SavedForLater wishlist data. The `/account/saved-for-later` page now loads normally for Elena. No other user was affected (Carlos/Emily never hit it — they had empty lists).
**Severity (at time of filing):** High — has been de-escalated because no user is currently affected; the latent xAPI resolver inconsistency remains as an engineering follow-up (see "Residual engineering concern" below).
**Original verdict:** CONFIRMED (reclassified from "user-specific" to platform authorization inconsistency)
**Test case:** `Frontend/auth/033` AUTH-032 "Account Menu - Menu Item Navigation"
**Business rule:** BL-AUTH-001 (menu items route to correct page)
**Retest date:** 2026-04-21
**Original regression run:** REG-2026-04-20-1000

## Residual engineering concern (not filed, tracked here for awareness)

The underlying xAPI still has the inconsistency that our investigation surfaced: `getSavedForLater(userId)` returns a CartType entity whose id can be passed to `wishlist(listId)` → GraphQL `Forbidden`. The SPA chains these calls and treats Forbidden as a 403 redirect. If another user accrues an orphaned / cart-type listId in their SavedForLater row in the future, the same symptom returns. Recommended engineering follow-up (not blocking, not filed as a separate bug):
- xAPI: either reject CartType IDs at the `getSavedForLater` boundary, or make `wishlist(listId)` authorize the owner correctly for CartType IDs.
- SPA: handle `Forbidden` from `wishlist` as "list empty or inaccessible" rather than a route-level 403 redirect, so the user lands on a recoverable empty state instead of a dead-end page.

## Supersedes / related reports
- `reports/bugs/open/BUG-SavedForLater-AccountPage-403-WishlistQuery-Mismatch.md`
- `reports/bugs/open/BUG-Saved-For-Later-403-Account-Specific-Not-Universal.md`
- `reports/bugs/open/BUG-Saved-For-Later-Account-Page-403-Access-Denied.md`

Those should also be closed with the same resolution — data cleanup removed the trigger — but the residual engineering concern above applies to all of them.

---

## Environment

| Field | Value |
|-------|-------|
| Storefront | `https://vcst-qa-storefront.govirto.com` |
| Admin API | `https://vcst-qa.govirto.com` |
| Build | Ver. 2.47.0-alpha.2306 |
| Store | B2B-store |
| Browser | Chromium 147.0.7727.15 (playwright-chrome) |
| Viewport | 1920x1080 |
| Theme | auto (Coffee base) |

---

## Users tested

| User | Email | Org | Saved-for-later items | Result |
|------|-------|-----|----------------------|--------|
| Elena Mutykova (original reporter) | `mutykovaelena@gmail.com` | Tech & Solutions Inc. | **15** (pre-existing) | **FAIL** → `/403 Access denied` |
| Carlos Rodriguez | `test-carlos.rodriguez-20260310@test-agent.com` | AGENT-TEST-Org-BuildRight-20260310 | 0 | PASS → empty state "You haven't saved any products for later" |
| Emily Johnson | `test-emily.johnson-20260310@test-agent.com` | AGENT-TEST-Org-TechFlow-20260310 | 0 | PASS → empty state "You haven't saved any products for later" |

All three users are Organization maintainers with IDENTICAL JWT permissions:

```
["storefront:user:view", "storefront:user:create", "storefront:user:delete",
 "storefront:organization:edit", "storefront:user:edit", "storefront:user:invite",
 "storefront:user:organization:view", "xapi:my_organization:edit"]
role: __customer
```

---

## Steps to reproduce

**Precondition:** sign-in as any customer who has ≥1 Saved-for-later item (Elena has 15).

1. Navigate to `https://vcst-qa-storefront.govirto.com/sign-in`.
2. Sign in as `mutykovaelena@gmail.com / Password1!`.
3. Navigate to `/account/dashboard`.
4. Click "Saved for later" link in the Purchasing sidebar group.

**Actual:** Browser URL redirects to `https://vcst-qa-storefront.govirto.com/403`, page title "QA & 403 Access denied", body "403 — Access denied — You do not have permissions to access the requested page".

**Expected:** `/account/saved-for-later` loads and renders the 15 items the user has saved. For an empty list, the page renders the "You haven't saved any products for later" empty state (as observed for Carlos and Emily).

---

## Root cause (GraphQL authorization inconsistency)

Network capture on the failing click shows two consecutive GraphQL operations against `/graphql`:

### Call 1 — `GetSavedForLater` (succeeds)

Request:
```json
{ "operationName": "GetSavedForLater",
  "variables": { "storeId":"B2B-store", "userId":"42765f34-51cf-4994-806b-e82e65fd5c14",
                 "cultureName":"en-US", "currencyCode":"USD" } }
```
Response (HTTP 200):
```json
{ "data": { "getSavedForLater":
  { "id":"92a589a0-2408-4981-896b-02bdd4ab087c",
    "name":"Saved for later", "type":"SavedForLater",
    "itemsQuantity": 15 } } }
```

The list exists, is owned by Elena, and has 15 items.

### Call 2 — `GetWishlist(listId: 92a589a0-...)` (FAILS)

The storefront SPA then issues a second call to fetch the items themselves via the generic `wishlist(listId: ...)` resolver:

Response (HTTP 200 with GraphQL errors):
```json
{ "errors": [{ "message":"Access denied.", "path":["wishlist"],
               "extensions":{ "code":"Forbidden", "codes":["Forbidden"] } }],
  "data": { "wishlist": null } }
```

The SPA router treats this `Forbidden` GraphQL error as an authorization failure and redirects to `/403`.

### The inconsistency

The same authenticated user (Elena, memberId `eaa3cc59-fbef-499a-b9e8-24180debeac5`, org `4612295c-1766-4601-9cd0-9cdef303f759`) is:
- **Allowed** to read her SavedForLater cart via `getSavedForLater` (returns list id + 15 items count)
- **Forbidden** from reading the same list via `wishlist(listId: 92a589a0-...)`

The two resolvers enforce different authorization rules for the same underlying record.

Confirming observations:
- `wishlists(userId: Elena)` returns 10 lists — **none** of them is id `92a589a0-...`. The SavedForLater list is filtered out of the user-visible wishlists collection (expected — it is a system list of `type: SavedForLater`), but the `wishlist(listId)` resolver does not know about that distinction and applies the generic "belongs to current user/org" ACL.
- Carlos and Emily never trigger the `wishlist(listId)` call because their SavedForLater is empty and the SPA short-circuits to the empty state.

---

## Evidence

All files relative to `C:\Users\mutyk\My Projects\vc-mcp-testing-module\`.

| Artifact | Path |
|----------|------|
| Elena → 403 | `reports/regression/REG-2026-04-20-1000/invest-evidence/BUG_033_001-elena-403-access-denied.png` |
| Carlos → success | `reports/regression/REG-2026-04-20-1000/invest-evidence/BUG_033_001-carlos-saved-for-later-works.png` |
| Emily → success | `reports/regression/REG-2026-04-20-1000/invest-evidence/BUG_033_001-emily-saved-for-later-works.png` |
| Original regression screenshot | `reports/regression/REG-2026-04-20-1000/033-auth040-actions-menu.png` |

Network trace shows the HTTP 200 / GraphQL Forbidden pattern (not an HTTP 403 at the transport layer). No JS console errors accompany the failure — the SPA intentionally navigates to `/403` when it sees the Forbidden extension code.

---

## Impact

- Any customer who has saved items to "Saved for later" is permanently locked out of that page. The 15 items (products Elena saved for later purchase) are invisible and un-recoverable through the UI.
- Because the symptom looks like a permission issue tied to the account, QA initially treated it as user-specific. It is actually a **server-side GraphQL authorization bug** in the `wishlist(listId)` resolver applied to `SavedForLater`-type lists.
- Regression risk: any user who has ever added an item to Saved-for-later (even long ago) will hit this page.

---

## Suggested fix direction (for the owning backend team — NOT verified)

Either:
1. Relax the `wishlist(listId)` ACL to allow the owning user to read their own `SavedForLater` list; **or**
2. Have the storefront SPA use `getSavedForLater` end-to-end (fetch items through the same resolver that enumerates the list) and stop issuing the secondary `wishlist(listId)` call for SavedForLater-type lists.

Option 2 is safer because it eliminates the ACL surface area entirely.

---

## Regression checks after fix

1. Carlos / Emily (empty lists) still see the empty state.
2. Elena (15 items) sees all 15 items rendered.
3. Add a new item to a fresh agent-pool user, sign out/in, click "Saved for later" — items render.
4. Remove the last item and confirm empty state renders without 403.
5. Org switch does not leak another org's SavedForLater items.

---

## JIRA-ready summary

- **Title:** `[Storefront] "Saved for later" page returns /403 for users with saved items (GraphQL wishlist resolver forbids SavedForLater list access)`
- **Components:** Storefront, xAPI (GraphQL authorization)
- **Fix version:** next sprint (P1 — blocks a shipped feature)
- **Linked test:** 033 AUTH-032
