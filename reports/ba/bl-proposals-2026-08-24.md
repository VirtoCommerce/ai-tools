# BL Proposals — 2026-08-24

Unconfirmed items from `/qa-review-oracles bl`. Two passes ran today: **Pass 1** over the Sprint 26-16 domains (`BL-SR`, `BL-PRICE`, `BL-CART`, `BL-CAT`, `BL-WL`), **Pass 2** over the `BLC-002` dangling-citation clusters. Everything below failed the evidence bar for auto-apply and needs a human decision or a follow-up pass. The oracle was **not** edited for anything in this file.

Audit trail: `reports/knowledge/BL-AUDIT-2026-08-24.md`.

---

# Pass 1 — Sprint 26-16 domains

## 1. `BL-PRICE-003` — UNGROUNDED (entry left unchanged)

The entry claims money rounding is "round half-up".

- **Docs:** *"To customize the rounding behavior… Implement `IMoneyRoundingPolicy`"* (PlatformDeveloperGuide). Proves the policy is **overridable**; says nothing about the shipped **default** mode.
- **Source:** could not locate the default implementation — the path guess 404'd and GitHub `search_code` was rate-limited all session.
- **Live:** prices render 2 decimals — confirms the *display* clause only, not the midpoint mode.

**Decision needed:** determine whether the default is half-up / away-from-zero or to-even, then re-stamp. The claim is **unsourced, not disproven** — do not delete it on this evidence.

> This entry is *not* about `discountPercent`. That is now `BL-PRICE-009` (applied), and the `PRICE-06x` cases were remapped off `BL-PRICE-003` accordingly.

## 2. `BL-CART-016` (new) — MISSING, 2 of 3 axes

**Proposed rule:** wishlist membership resolution is scoped to the requesting store.

- **Source:** CONFIRMED — `SqlServerCartRawDatabaseCommand.BuildFindWishlistsCommand` appends `AND c.StoreId = @storeId`; the LINQ sibling always filtered. The two paths now agree (VCST-5705).
- **Live:** **not reproduced** — needs a customer holding wishlists in two distinct stores; the audit lane ran anonymous.

**Blocked on a fixture, not on judgment.** The two-store wishlist fixture is being provisioned for `CAT-079`/`CAT-080`/`WISH-30`. Once it exists, re-run the live axis and this can auto-apply.

## 3. `BL-CAT-011` — possible stale clause, human review required

**Clause under suspicion:** *"A linked (non-owned) product referenced by the moved subtree is never rewritten, relocated, duplicated, or deleted."*

`CategoryMover.CascadeProductsAsync` rewrites `CatalogId` on **every** product matching a `CategoryIds`-keyed search — no visible ownership-vs-link distinction. Clauses 1–2 confirmed exactly; clause 3 may not hold. Live not reproduced (constructing a cross-catalog link plus a move is semi-destructive on a shared environment).

**Decision needed:** construct a cross-catalog-linked product under a moved category and check whether its `CatalogId` survives. Then narrow the rule **or file a bug**. Not auto-applied, because "the code looks like it might" is not positive evidence.

## 4. `BL-CAT-013` (proposed) — Source + Docs(N/A), no live

Product deletion always completes and publishes `ProductChangedEvent` regardless of related inventory rows. `ItemService.DeleteAsync` shows no 409/inventory guard, consistent with VCST-5656 being fixed. Behaviourally covered by the new `INV-046`; promote once it runs green.

## 5. `BL-WL-007` (proposed) — Source + Docs(N/A), no live

WhiteLabeling settings resolution is robust to malformed asset URLs. `GenerateFaviconName` uses `Path.GetExtension` (returns `""`, not `-1`) and `AddFaviconsAsync` guards `extension.Length > 1`; no manual `LastIndexOf('.')` remains (VCST-5575). **Highest blast radius of the three** — a per-org data defect blanked the entire storefront. Worth promoting once the live axis runs.

---

# Pass 2 — dangling-citation clusters

## 6. `BL-CR-*` — 9 of 18 staged (Source strong, live not exercised)

`BL-CR-001/008/009/010/012/013/016/017/018` were **applied**. These nine were not:

| ID | Inferred rule | Missing axis |
|---|---|---|
| `BL-CR-002` | A review requires a completed-order proof of purchase (`PRODUCT_MUST_BE_PURCHASED`) | live — ineligible-buyer rejection not exercised |
| `BL-CR-003` | Reviews are Product-entity-only (`INVALID_ENTITY_TYPE`) | live — needs a crafted non-Product call |
| `BL-CR-004` | One review per (user, product, store); second is `DUPLICATE_REVIEW` | live |
| `BL-CR-005` | Review text non-blank (`REVIEW_IS_EMPTY`); no server-side max length | live |
| `BL-CR-006` | Rating must fall within the 1–5 scale (`INVALID_RATING`) | live — 0/6 rejection not exercised |
| `BL-CR-007` | Review images capped at a store-configurable maximum (`IMAGES_LIMIT`) | live — over-limit rejection not exercised |
| `BL-CR-011` | Querying a review-less entity returns an empty connection, not an error | **source too** — the search/data-layer path was not inspected; the inference rests only on the absence of an error branch, which is not a solid anchor |
| `BL-CR-014` | A rejected review stays in Admin but is excluded from the storefront | live — no Rejected-status row existed to observe |
| `BL-CR-015` | Deleting a review is permanent (hard delete, not soft) | live — the destructive action was deliberately not executed against shared data |

All nine have Source (and often Docs) agreement. Each needs one targeted live check — most are a single mutation call.

## 7. `BL-STORE-003` / `BL-STORE-004` — docs-only (1 of 3)

- **`BL-STORE-003`** — payment/shipping method availability and default fulfillment center are configured per store. Docs explicit (Stores → store → Payment/Shipping methods widget). Source not located within budget; live not attempted.
- **`BL-STORE-004`** — a store's Aggregation Properties drive its storefront facet UI, per store. Docs explicit. The facet model lives in `vc-module-search` (not `vc-module-catalog`, which was checked and ruled out); not reached within budget.

Both need a source anchor plus one live round-trip.

## 8. `BL-API-002` — CONTRADICTORY, **and it exposes a live defect**

Proposed rule: list-endpoint pagination handles out-of-range and invalid values without server errors.

Docs establish the platform's "invalid payload → 400" convention. Live shows the opposite on `POST /api/catalog/search/products`:

| Input | Result |
|---|---|
| `skip:0, take:0` | 200, empty — correct |
| `skip:-1` | **500**, leaks `illegal_argument_exception` **and the live Elasticsearch index name** |
| `take:-5` | **500**, same class of leak |
| `skip:999999` | **500** `search_phase_execution_exception "all shards failed"` — not the 200 + empty array `API-028` expects |
| `take:10000` | **502** gateway timeout |

Root cause in source: `ElasticSearchRequestBuilder.BuildRequest()` maps `Skip`/`Take` straight onto Elasticsearch `from`/`size` with no clamping or validation.

**This is not an oracle item — it is a bug.** Any authenticated caller can induce a 500 that discloses backend infrastructure detail. Suite `049`'s own `API-027`–`API-030` (currently `Draft`) would fail exactly this way. **Recommend filing via `/qa-bug`**, and holding the invariant until the behaviour is fixed — an invariant that live-contradicts reality would be a false oracle.

## 9. `BL-ORDER-001` on `ORDA-075` — ADD candidate, needs its own triangulation

Inferred rule: once a customer order's payment status is Paid, its line items become immutable in Admin (edit controls disabled, Save unavailable). No existing `BL-ORD-*` entry states this — the nearest cover refund and payment-state transitions, not order editability. Plausible, but **no source or live check was performed**; medium confidence only. The `BL-ORDER-001` citation on this row was deliberately left in place.

## 10. GA4 and L10N clusters — recommendations, no writes made

| ID | Recommendation | Reasoning |
|---|---|---|
| `BL-GA4-001` | **ADD** | Event contract: exact event name, item fields sourced from displayed state, no premature/duplicate firing. Detectably violable. |
| `BL-GA4-002` | **ADD** | Cart events — e.g. `clear_cart` must report the pre-clear total, not 0; `update_cart_item` carries both old and new quantity. |
| `BL-GA4-003` | **ADD** | Strongest: a hard idempotency rule ("exactly one `purchase` event", tied to real regressions VCST-4800/5109) plus a computed-value rule for shipping-method value. |
| `BL-GA4-004` | **ADD** | Session/config contract (currency, language, user id) — fires once per page load, a distinct lifecycle from 001–003. Keep separate. |
| `BL-L10N-001` | **Split** | Overloaded. (a) "no raw i18n key ever renders" is a crisp, universally-violable rule → narrow ADD. (b) per-locale "renders correctly / no stray English / fits the button" is **coverage**, not a rule → clear. (c) `TRUNC-001`/`LAYOUT-001` duplicate the existing `BL-UI-001…006` layout invariants → remap there. (d) `ROUTE-003`/`004` (locale-prefix stacking) are URL-routing correctness, misfiled under L10N entirely — closer to the `BL-SEO-*` family. |
| `BL-L10N-002` | **ADD** | Date order and decimal/thousands separators must follow the active locale, consistently across the page. |
| `BL-L10N-003` | **ADD** (closer call) | Considered folding into the cleared `BL-COMPAT-*` as rendering-engine variance, but rejected: UTF-8 handling and CJK-capable webfont loading for a *declared supported locale* is under the product's control, not the browser's. |
| `BL-L10N-004` | **REMAP** | Substantially duplicates `BL-CROSS-004` (currency switch → atomic multi-system recalculation) and `BL-PRICE-005` (per-currency price lists). |

## 11. Bonus findings — not acted on, flagged deliberately

- **`L10N-CURR-002` contradicts `BL-PRICE-005`.** Its assertion text ("Exchange rate applied consistently") conflicts with the documented rule that currencies are **not** rate-converted but served from separate per-currency price lists. Either the case or the invariant is wrong. Remapping it as-is would produce a case citing an invariant it contradicts — which is why it was left alone.
- **`CAT-001` / `ROUTE-001` / `ROUTE-002` appear to mis-cite `BL-CAT-004`.** That invariant's actual rule is about hidden-category *visibility*, not locale-prefixed slugs. Pre-existing, unrelated to this audit.
- **`BL-PLAT-004`'s weaker citations.** A minority of its 49 citations (healthcheck, YAML override, login background, price validation) read as a "misc platform config" bucket rather than dynamic-properties claims. `/qa-review-tests --fix` candidate.
- **`BL-STORE-002` may be miscited entirely** — its sole citing case (`STORE-004`) asserts plain CRUD and no invariant sits behind it.
- **`API-046`'s assertion is factually wrong on live.** It expects "self returns 200, cross-account 403"; both users received 403, because `/api/members/{id}` is RBAC-permission-gated, not identity-scoped. A test defect, not an oracle gap.
- **`BL-AUTH-016` carries two `- **Source:**` lines** (pre-existing).
- **The Invariant Coverage Summary table at the end of the oracle is stale** — it reads 192 against an actual 211. It was deliberately **not** updated, because the skill forbids rewriting a meta table as a side effect of a body edit. It needs its own deliberate pass.

## 12. Still-dangling clusters not addressed this run

`BL-CMS` (11 ids), `BL-CFG` (5), `BL-SEC` (5), `BL-API` (3 remaining), `BL-PAY` (3), `BL-CART-018`, `BL-CROSS-013` — ~30 ids. Not triaged; each needs the same read-the-citing-cases → triangulate → ADD-or-decline treatment.

## Environment cleanup

`AGENT-TEST-BL-AUDIT-UoM` was created in Admin → Units of measure to live-verify `BL-CAT-008` and **left in the environment**. Benign and clearly named; delete in a follow-up teardown pass.
