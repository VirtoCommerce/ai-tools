# BUG: Saved-for-Later 403 Forbidden - Orphaned OrganizationId References Deleted Organization

**Summary:** The primary test user (mutykovaelena@gmail.com) receives HTTP 403 Forbidden when accessing `/account/saved-for-later` because the SavedForLater cart record in the database references an organizationId (`645e0753-36d7-4c96-a907-e212d8e4f787`) that no longer exists in the system. The xAPI authorization layer checks whether the user is a member of this organization before granting access, and since the organization was deleted, the authorization check fails.

## Details

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Priority** | P1 |
| **Type** | Bug |
| **Component** | xCart Module / Cart Authorization / Organization Membership |
| **Environment** | QA (https://vcst-qa.govirto.com / https://vcst-qa-storefront.govirto.com) |
| **Store** | B2B-store |
| **Found During** | VCST-4650 investigation |
| **Date** | 2026-02-26 |
| **Labels** | saved-for-later, 403, authorization, organization, xapi, cart, data-integrity |

## Root Cause Analysis

### The Problem
The SavedForLater cart (id: `92a589a0-2408-4981-896b-02bdd4ab087c`) was created on 2025-09-23 when the user was operating under organization **"My_Company_1"** (id: `645e0753-36d7-4c96-a907-e212d8e4f787`). At some point after December 16, 2025 (the date of the last order under this org), this organization was **deleted from the system**, but the cart record was NOT cleaned up -- it still references the deleted organization. There are also **37 historical orders** still referencing this deleted org.

When the xAPI `getSavedForLater` or `wishlist` query runs, it performs an authorization check:
1. Load the cart/list
2. Check `scope` -- if "Organization", verify user belongs to `organizationId`
3. The org `645e0753-36d7-4c96-a907-e212d8e4f787` does not exist
4. User membership check fails -> **403 Forbidden**

### Key Evidence

**Primary User (Elena Mutykova / mutykovaelena@gmail.com):**
- Contact ID: `eaa3cc59-fbef-499a-b9e8-24180debeac5`
- Security Account (userId): `42765f34-51cf-4994-806b-e82e65fd5c14`
- Organization count: **47 active organizations**
- The deleted org `645e0753-36d7-4c96-a907-e212d8e4f787` is **NOT** in her current organization list

**SavedForLater Cart (BROKEN):**
```json
{
  "id": "92a589a0-2408-4981-896b-02bdd4ab087c",
  "name": "Saved for later",
  "type": "SavedForLater",
  "organizationId": "645e0753-36d7-4c96-a907-e212d8e4f787",  // <-- DELETED ORG
  "customerId": "42765f34-51cf-4994-806b-e82e65fd5c14",
  "customerName": "Elena Mutykova",
  "storeId": "B2B-store",
  "scope": "Organization",
  "itemsCount": 1,
  "createdDate": "2025-09-23T09:32:52.914Z",
  "modifiedDate": "2026-02-26T18:24:59.285Z"
}
```

**Organization lookup result:**
- `GET /api/members/645e0753-36d7-4c96-a907-e212d8e4f787` returns HTTP 200 with **empty body**
- `POST /api/members/search` with `objectIds: ["645e0753-..."]` returns **totalCount: 0**
- Organization does NOT exist in the system
- Historical orders reveal the org was named **"My_Company_1"** with 37 orders under it

**USER2 (Alice May / maseweinnouwe-5837@yopmail.com) - WORKS FINE:**
```json
{
  "id": "16e8b0f0-2380-4131-aa7f-e7e92657eac6",
  "name": "Saved for later",
  "type": "SavedForLater",
  "organizationId": null,  // <-- NO ORG, WORKS FINE
  "customerId": "cab4dd70-f4d0-493c-91cb-dbbb9f94232d",
  "customerName": "Alice May",
  "storeId": "B2B-store",
  "itemsCount": 2,
  "createdDate": "2026-02-26T18:43:52.424Z"
}
```

### Comparison Table

| Field | Primary User (403) | USER2 (Works) |
|-------|-------------------|---------------|
| Cart ID | `92a589a0-...` | `16e8b0f0-...` |
| organizationId | `645e0753-...` (DELETED) | `null` |
| Organization exists? | NO | N/A |
| scope | Organization | (inferred Private) |
| User org count | 47 | 3 |
| Created | 2025-09-23 | 2026-02-26 |

### Additional Affected Carts

The deleted organization `645e0753-36d7-4c96-a907-e212d8e4f787` is referenced by **7 additional carts** belonging to the same user:

| Cart ID | Type | Name | Items |
|---------|------|------|-------|
| `8d58d485-...` | default (shopping cart) | default | 0 |
| `ee33f24c-...` | CreatedFromWishlist | (hash name) | 0 |
| `7ec15839-...` | Wishlist | "Molly" | 8 |
| `02eb6c3b-...` | default (shopping cart) | default | 3 |
| `808d4f61-...` | CreatedFromWishlist | (hash name) | 0 |
| `7a640aaa-...` | default (shopping cart) | default | 4 |
| `92a589a0-...` | SavedForLater | "Saved for later" | 1 |

The user also has 2 other SavedForLater carts with `organizationId: null` that would work:
- `c54896fe-...` "Saved for later (2)" - 3 items
- `d511ee06-...` "Saved for later (1)" - 0 items

## Steps to Reproduce

### Verify via REST API (as admin):
1. Authenticate: `POST /connect/token` with admin credentials
2. Get the cart: `GET /api/carts/92a589a0-2408-4981-896b-02bdd4ab087c`
3. Note `organizationId: "645e0753-36d7-4c96-a907-e212d8e4f787"`
4. Try to look up the org: `GET /api/members/645e0753-36d7-4c96-a907-e212d8e4f787`
5. Result: HTTP 200 with **empty body** (organization does not exist)
6. Check user's orgs: `GET /api/members/eaa3cc59-fbef-499a-b9e8-24180debeac5`
7. The deleted org ID is NOT in the user's `organizations[]` array

### Verify via Storefront:
1. Log in as mutykovaelena@gmail.com
2. Navigate to `/account/saved-for-later`
3. Observe: 403 Forbidden page

## Expected Behavior

One or more of the following should be true:
1. When an organization is deleted, all cart/wishlist records referencing it should have their `organizationId` set to null (cascade cleanup)
2. The xAPI authorization layer should gracefully handle a deleted/non-existent organizationId by falling back to customer-level access rather than returning 403
3. The `getSavedForLater` query should not scope authorization by organization -- it should be accessible by the cart owner regardless of org context

## Actual Behavior

The saved-for-later cart references a deleted organization. The xAPI authorization check fails because the user is not a member of a non-existent organization, returning 403 Forbidden.

## Proposed Fix Options

### Option 1 (Data Fix - Immediate):
Update the orphaned cart's organizationId to null via direct DB update or API call:
```
PUT /api/carts/92a589a0-2408-4981-896b-02bdd4ab087c
Body: { "organizationId": null }
```

### Option 2 (Code Fix - Long Term):
In the xCart authorization handler, when checking organization membership:
- If `organizationId` is set but the organization does not exist, treat the cart as if `organizationId` is null
- Fall back to customer-level ownership check (customerId matches)

### Option 3 (Prevention):
When an organization is deleted:
- Run a cleanup job that nullifies `organizationId` on all associated carts, wishlists, and saved-for-later lists
- Or prevent deletion of organizations that still have associated data

## Impact

- **User impact:** Primary test user cannot access their Saved-for-Later page at all
- **Scope:** Any user who had carts/wishlists created under an organization that was later deleted would experience this same 403
- **Data integrity:** 7+ cart/wishlist records reference a non-existent organization
- **Regression risk:** This is a systemic issue -- any organization deletion could orphan cart data

## Environment Details

- Platform: Virto Commerce 3.1005.0
- Environment: QA
- Store: B2B-store
- xAPI modules: xCart, XCart (Edge versions deployed on QA)

## Screenshots

- `screenshots/saved-for-later-403-access-denied.png` - 403 page on storefront
- `screenshots/saved-for-later-investigation/admin-db-queries/01-contacts-search-elena-mutykova.png` - Admin contacts search
- `screenshots/saved-for-later-investigation/admin-db-queries/02-elena-contact-detail-orgs.png` - Elena contact record with 47 orgs
- `screenshots/saved-for-later-investigation/admin-db-queries/03-elena-security-account.png` - Security account details
