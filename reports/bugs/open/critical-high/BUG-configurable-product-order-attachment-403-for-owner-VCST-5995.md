# Configurable-product attachment: buyer gets 403 on their own file once the cart becomes an order `[P1]`

## Status: CONFIRMED

**Tracker:** VCST-5995 (Bug, High, To do) — found during `/qa-test` on VCST-5924, blocks its requirement 3
**Env:** vcptcore-qa1 · storefront `2.58.0-pr-2485-ee6efd90` · XCart 3.1033.0 · XOrder 3.1011.0 · Orders 3.1014.0 · FileExperienceApi 3.1004.0
**Live re-verified:** 2026-09-22 on the ticket's original order, and **re-reproduced from scratch on 2026-09-23** on a
newer build with brand-new data (order `CO260923-00001`) — see *Reproduction on the current build* below.
Buyer `test-john.mitchell-20260310@test-agent.com`.

**Summary:** A file attached to a configurable product's File section is readable by its owner while the line
lives in the cart, and **403** for that same owner the moment the cart is converted to an order. The order's
GraphQL response still advertises `files { url name size contentType }`, so the API hands the client a URL the
client is forbidden to fetch. The file itself is intact and servable (admin reads it, correct bytes).

## STR
1. Sign in to the storefront as a B2B buyer.
2. Open a configurable product with a **required** File section (slug `agent-test-req-file-child-20260519`, section "ID Proof").
3. Attach a file; add to cart. In the cart, expand **Components list** and activate the filename — downloads, **200**.
4. Complete checkout and place the order.
5. Order History → that order → expand **Components list** → activate either filename.

## Expected vs Actual
- **Expected:** the owner opens their own attachment from Order Details exactly as they could from the cart.
- **Actual:** `GET /api/files/{id}` returns **403**; the storefront performs a **full-page navigation to `/403 Access denied`**, so the buyer also loses the order page they were on. Console: `Failed to load resource: the server responded with a status of 403`. Reproduces on both files, on a fresh page load, and by pasting the URL into the same signed-in session.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL (inherited + own defect) | full-page nav to `/403`; original run screenshot `05-order-details-file-activate-403.png` |
| 2. Backend Admin | N/A | the read gate is not exercised from the Admin SPA |
| 3. GraphQL xAPI | PASS (and is the contradiction) | `order(number:"CO260916-00001"){items{configurationItems{files{url name size contentType}}}}` returns both files with `/api/files/e76f09f8…` and `/api/files/9b768473…` |
| 4. Platform REST API | **FAIL** | buyer `GET /api/files/e76f09f8…` → **403**; `…/9b768473…` → **403** |

**Owning layer:** Layer 4 — Platform REST (`/api/files/{id}` authorization). Layer 1 inherits it, plus carries its own separable defect (below).

### Controls run 2026-09-22 (same file ids, same minute)
| Check | Result |
|---|---|
| Buyer (file owner), after the order | **403** |
| Admin token, same two files | **200**, 28 B and 70 B — file intact and servable |
| Buyer uploads a fresh **unattached** file to scope `product-configuration` and reads it back | **200** — the buyer's read path works in general |

So: not a missing file, not a buyer-wide permission problem. It is a **missing order-scoped read grant**.

### Reproduction on the current build, from scratch (2026-09-23)

The 2026-09-22 controls read files that had been **written by an older build**, so they could not by themselves rule
out data debris (the exact trap that made 18 sales-rep documents look like a shipped regression). Re-done end to end
on today's live versions — `XCart 3.1034.0` · `XOrder 3.1012.0` · `Orders 3.1016.0` · `FileExperienceApi 3.1004.0`
(read from `GET /api/platform/modules`; all newer than the ticket's) — with a brand-new 43-byte file, a new cart and
a new order, **one file id followed through the whole flow in a single session**:

| Step | Owner state | Buyer `GET /api/files/91fad3ec…` |
|---|---|---|
| Uploaded to scope `product-configuration` | owner empty | **200** |
| Added to cart `7d9ceae2…` (`addItem` with the File section) | `ShoppingCart` | **200** |
| `createOrderFromCart` → order **CO260923-00001** | `OrdersModule…ConfigurationItem` | **403** |
| Same moment, admin token | — | **200**, 43 B |

The only event between the 200 and the 403 is order creation, on the same file id, same session, same minute.
**The defect is in the current build — not legacy data.** (Test artifacts left on vcptcore-qa1: order
`CO260923-00001` and cart `vcst5995-rerepro`.)

## Root Cause Analysis (source-confirmed)

The grant is cart-shaped, and order creation moves the file out of that shape:

1. On cart save, `vc-module-x-cart` → `CartAggregateRepository.UpdateConfigurationFiles()` sets
   `file.SetOwner(cart)` → `OwnerEntityType = VirtoCommerce.CartModule.Core.Model.ShoppingCart`
   (`src/VirtoCommerce.XCart.Data/Services/CartAggregateRepository.cs:410`).
2. On order creation, `vc-module-x-order` → `CustomerOrderAggregateRepository.UpdateConfigurationFiles()`
   **re-owns** each file to the order's configuration item: `file.SetOwner(configurationItem)` →
   `OwnerEntityType = VirtoCommerce.OrdersModule.Core.Model.ConfigurationItem`
   (`src/VirtoCommerce.XOrder.Data/Services/CustomerOrderAggregateRepository.cs:130`).
3. The read gate never learned about that second owner type. Scope `product-configuration`
   (`ConfigurationSectionFilesScope`) has exactly **one** `IFileAuthorizationRequirementFactory` anywhere —
   xCart's `ConfigurationItemFileAuthorizationRequirementFactory`, which unconditionally returns
   `CanAccessCartAuthorizationRequirement`
   (`vc-module-x-cart/src/VirtoCommerce.XCart.Data/Authorization/ConfigurationItemFileAuthorizationRequirementFactory.cs:13`).
   `FileAuthorizationService` picks it by scope alone, ignoring the owner.
4. `CanAccessCartAuthorizationHandler` authorizes a `File` resource in only three ways: administrator role,
   `file.OwnerIsEmpty()`, or `file.OwnerTypeIs<ShoppingCart>()` → load the cart → `cart.CustomerId == userId`.
   An `OrdersModule…ConfigurationItem` owner matches **none** of them, so `resource` stays a `File`, no `switch`
   case fires, and the handler calls `context.Fail()` → `Forbid()` → 403
   (`vc-module-x-cart/src/VirtoCommerce.XCart.Data/Authorization/CanAccessCartAuthorizationRequirement.cs`, handler body).

This exactly predicts the three control results: admin passes on the role branch; the fresh unattached file passes
on `OwnerIsEmpty()`; the order-owned file has no branch at all. `vc-module-order` contains no file-ownership code,
so nothing else can grant it.

**Where the fix belongs:** `vc-module-x-order` — it is the module that introduces the order-scoped owner, and it
already depends on `VirtoCommerce.XCart`, `VirtoCommerce.Orders` and `VirtoCommerce.FileExperienceApi`, so it can
supply an owner-aware requirement factory for the scope (overriding xCart's) that routes a
`ConfigurationItem`-owned file to the order-access check (`CanAccessOrderAuthorizationHandler` already exists there).
The mirror fix in `vc-module-x-cart` is **not** viable as an additive second handler: `context.Fail()` in
`CanAccessCartAuthorizationHandler` is definitive in ASP.NET Core, and XCart does not depend on `VirtoCommerce.Orders`.

## Second, separable defect (frontend, Medium)
An authorization failure on a file fetch triggers a **full-page navigation** to the 403 page, destroying the user's
place in Order History. It should surface as an inline error on the order page. Anchor not pinned: the storefront
file-link rendering lives in `client-app/shared/common/components/configuration-items.vue`, but the local
`.fix-workspace/vc-frontend` checkout predates `pr-2485` (it still renders filenames as plain text, not links), so
the failing call site must be read off the pr-2485 branch.

## Sibling defects from the same run — do NOT merge them

All three came out of the `/qa-test` run on VCST-5924 and are **distinct**, with distinct fixes:

| Ticket | Defect | Surface / repo | Relationship to this bug |
|---|---|---|---|
| **VCST-5995** (this) | owner refused their own attachment, **403** | order read gate · `vc-module-x-order` | — |
| **VCST-5999** (High, Draft) | `createQuoteFromCart` keeps the cart's url **verbatim** and then `ClearAsync()` **deletes that file** → **404** for everyone incl. admin | quote conversion · `vc-module-quote` (`CreateQuoteFromCartCommandHandler`) | **Sibling, not a duplicate.** Same attachment, different failure: 5995 = file exists, grant missing; 5999 = file destroyed. Measured 2026-09-23 — the ticket's own "new ids / copies never created" wording is wrong; see [`BUG-quote-from-cart-deletes-configuration-file-attachments-VCST-5999.md`](BUG-quote-from-cart-deletes-configuration-file-attachments-VCST-5999.md). |
| **VCST-6000** (Medium, Draft) | a 0-byte file satisfies a **required** File section and enables Add-to-cart | upload validation · `vc-module-file-experience-api` + storefront | Independent — the upload path, not the read path. Locally already documented in [`../medium/BUG-configurable-file-upload-validation-gaps.md`](../medium/BUG-configurable-file-upload-validation-gaps.md). |

**One attachment, three different answers depending on where it is read:** cart **200** · order **403** (5995) · quote **404** (5999).
That pattern is the real signal — configuration-file *ownership and lifecycle* was designed for the cart only and each
downstream conversion re-invented it. `vc-module-quote` already shows the correct shape for the read half: it registers
its **own** `QuoteAuthorizationRequirementFactory` for its own scope (`QuoteModule.Web/Module.cs:93`). The
`product-configuration` scope has no such order-side counterpart — which is exactly this bug. Whoever picks up 5995 and
5999 should at least read them together, even if the PRs stay separate.

## Notes
- The live re-verification left one 23-byte probe file (`/api/files/b30a1410e3094baabd393fdbc5b38bd6`, scope `product-configuration`, owner empty) on vcptcore-qa1 — the cleanup mutation was permission-blocked in this session.
- Parent story: VCST-5924 (this bug blocks its requirement 3).

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 4 — REST (`/api/files/{id}` authorization)
- **Suggested repo:** `VirtoCommerce/vc-module-x-order`
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** XOrder — configuration-item file ownership + the `product-configuration` file authorization requirement factory
- **RCA anchor:** `src/VirtoCommerce.XOrder.Data/Services/CustomerOrderAggregateRepository.cs:130` (`file.SetOwner(configurationItem)`), gated by `vc-module-x-cart/src/VirtoCommerce.XCart.Data/Authorization/ConfigurationItemFileAuthorizationRequirementFactory.cs:13` → `CanAccessCartAuthorizationHandler`
- **Routing confidence:** MEDIUM — layer and RCA are source-confirmed and a *single-repo* fix is available in `vc-module-x-order` (the dependency direction allows it, the reverse does not); MEDIUM rather than HIGH because a maintainer may instead choose to make scope→requirement resolution owner-aware in `vc-module-file-experience-api`, which would move the fix to a third repo.
