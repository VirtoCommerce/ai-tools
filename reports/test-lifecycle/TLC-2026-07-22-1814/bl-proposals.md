# Business Logic Proposals — TLC-2026-07-22-1814 (suite 053)

> **STATUS: APPLIED 2026-07-22** (user-approved). All four adopted with final IDs
> **BL-CAT-009 / 010 / 011 / 012** added to `.claude/knowledge/oracles/business-logic.md`
> (body + summary table `BL-CAT-001–012`, 12/2/6/4), and the suite CSV `Business_Rule`
> column re-mapped per the table below. `PROPOSED-` prefixes dropped. This file is kept
> as the provenance record of the change.

**Why:** suite 053 currently tags **20/25 cases with `BL-CAT-002`** ("Virtual catalog inherits
physical catalog changes" — a *view-propagation* invariant) as a generic Catalog bucket, and
**CAT-012/013 with `BL-CAT-003`** ("Search index lag window") — neither invariant describes what
those cases actually test. Correctly mapped today: **CAT-038 → BL-CAT-004** (visibility) and
**CAT-040/041 → BL-CAT-008** (UoM/Measures CRUD). The real gaps are category CRUD, catalog-move
cascade, and the **link-permission RBAC** VCST-5318 introduced.

---

## New Invariants Proposed

### PROPOSED-BL-CAT-009: Category CRUD & cascade-delete integrity `[P1-data]`
- **Rule:** Creating/editing/deleting a category persists atomically. Required fields (Name, Code) are enforced on create. Deleting a category **cascades** to its subcategories and its descriptions, and unassigns (does not orphan) products per cascade rules. A cancelled delete makes no change.
- **Verify:** Create category → appears in tree + `GET /api/catalog/categories`. Edit name → persists. Delete-confirm removes it + subcategories (`GET …/{subId}` → 404) + descriptions; Delete-cancel leaves it intact.
- **Violation signal:** Required-field validation bypassed; category not in tree after save; subcategories/descriptions orphaned after delete; category deleted despite Cancel.
- **Agents:** qa-backend-expert (Catalog API, Admin SPA)
- **Source:** {OBSERVED} live (TLC-2026-07-22-1814 Phase 5, CAT-008/009/010/011/018 VERIFIED) + Catalog module category delete semantics
- **Triggered by:** CAT-008, CAT-009, CAT-010, CAT-011, CAT-018

### PROPOSED-BL-CAT-010: Catalog link-permission enforcement (RBAC) `[P1-data]`
- **Rule:** Linking a whole **category** into another category/catalog requires `catalog:categories:link`; linking a **product/variation** requires `catalog:products:link`. Enforcement is **server-side** on `POST /api/catalog/listentrylinks` (403 without the permission) **and** reflected in the mapping picker (category rows non-selectable without the permission; product/item rows follow `products:link`). With full permissions both remain selectable (backward-compatible default).
- **Verify:** Full-perm user → picker shows category + item checkboxes (AC-4). Role minus `categories:link` → category rows non-selectable (AC-1), product rows still selectable (AC-2); `POST listentrylinks` with a category entry → 403, with a product entry → 2xx (AC-3). Permissions registered with readable descriptions (`GET /api/platform/security/permissions`).
- **Violation signal:** Categories selectable / category link created despite missing `categories:link` (server enforcement absent); product link blocked when `products:link` retained (over-restriction); permission shows a raw i18n key.
- **Agents:** qa-backend-expert (CatalogModuleListEntryController, Admin SPA mapping picker, security permissions)
- **Source:** {SPEC} VCST-5318 AC-1..AC-4, PR #898 (VirtoCommerce/vc-module-catalog); backported 3.1002.9 (v14) / 3.1029.3 (v15). {OBSERVED} CAT-058/059 VERIFIED on Catalog 3.1037.0 (Phase 5).
- **Triggered by:** CAT-058, CAT-059, CAT-060, CAT-061 — **the primary gap this suite exposed.**

### PROPOSED-BL-CAT-011: Cross-catalog move cascades CatalogId to owned entities, not linked `[P1-data]`
- **Rule:** Moving a category **across** physical catalogs cascades the destination `CatalogId` to every **owned** descendant category and **owned** product in the moved subtree. An **intra-catalog** move leaves `CatalogId` unchanged (no spurious cascade). A **linked (non-owned)** product referenced by the moved subtree is never rewritten, relocated, duplicated, or deleted.
- **Verify:** Cross-catalog move → parent + child + owned products report destination `CatalogId` (`GET …/categories|products/{id}`). Intra-catalog move → `CatalogId` unchanged. Linked foreign-catalog product → `CatalogId` stays its owner catalog.
- **Violation signal:** Descendant/product retains source `CatalogId` after move (PR #882 regression) → mis-indexed/orphaned; intra-catalog move changes `CatalogId` (over-eager cascade); linked non-owned product rewritten to destination.
- **Agents:** qa-backend-expert (`POST /api/catalog/listentries/move`, catalog API)
- **Source:** {SPEC} VCST-5082, PR #882 (VirtoCommerce/vc-module-catalog), Catalog 3.1029.0
- **Triggered by:** CAT-054, CAT-055, CAT-056, CAT-057

### PROPOSED-BL-CAT-012: Category dictionary-value & metadata management `[P2-ux]`
- **Rule:** Adding/removing a category **tax-type dictionary value**, **SEO** record (store-scoped), **image**, or **localized description** persists to the category and is **scoped to the value acted on** — deleting one dictionary value must not remove other shared values. SEO/description changes render on the storefront (respecting locale).
- **Verify:** Add tax-type value → in dropdown + `GET …/{id}`. Delete a self-created value → only that value gone, shared values intact. Add SEO/image/description → persists + renders on storefront for the right locale.
- **Violation signal:** Save fails silently; a shared/pre-existing dictionary value deleted instead of the target; SEO/description not rendered on storefront; localized description shown under wrong locale.
- **Agents:** qa-backend-expert (Catalog API, Admin SPA), qa-frontend-expert (storefront SEO/description render)
- **Source:** {OBSERVED} live (Phase 5 CAT-012/014/015/016/017/036/037 VERIFIED) — replaces the incorrect BL-CAT-003 citation
- **Triggered by:** CAT-012, CAT-013, CAT-014, CAT-015, CAT-016, CAT-017, CAT-036, CAT-037

---

## Stale / Mis-applied Mappings Flagged

### BL-CAT-002 (Virtual catalog inherits physical catalog changes) — over-applied
- **Currently on:** CAT-008, 009, 010, 011, 014, 015, 016, 017, 018, 036, 037, 044, 054, 055, 056, 057, 058, 059, 060, 061 (20 cases)
- **Issue:** None of these test virtual-catalog view propagation. Used as a generic Catalog-domain tag.
- **Suggested action:** Re-map per the table below. **CAT-044** ("Automatic Links" reflecting current virtual-catalog associations, stale links not shown) is the one case where BL-CAT-002 is *arguably* legitimate (view consistency) — keep, or map to PROPOSED-BL-CAT-011 if you prefer a link-integrity home.

### BL-CAT-003 (Search index lag window) — wrong invariant
- **Currently on:** CAT-012, CAT-013 (tax-type dictionary CRUD)
- **Issue:** Tax-type dictionary CRUD has nothing to do with the search-index lag window.
- **Suggested action:** Re-map to PROPOSED-BL-CAT-012.

---

## Proposed Re-mapping (apply to CSV `Business_Rule` only after IDs are approved)

| Cases | Current | → Proposed |
|-------|---------|-----------|
| CAT-008, 009, 010, 011, 018 | BL-CAT-002 | PROPOSED-BL-CAT-009 |
| CAT-012, 013 | BL-CAT-003 | PROPOSED-BL-CAT-012 |
| CAT-014, 015, 016, 017, 036, 037 | BL-CAT-002 | PROPOSED-BL-CAT-012 |
| CAT-044 | BL-CAT-002 | keep BL-CAT-002 *(view consistency)* or PROPOSED-BL-CAT-011 |
| CAT-054, 055, 056, 057 | BL-CAT-002 | PROPOSED-BL-CAT-011 |
| CAT-058, 059, 060, 061 | BL-CAT-002 | PROPOSED-BL-CAT-010 |
| CAT-038 | BL-CAT-004 | keep (correct) |
| CAT-040, 041 | BL-CAT-008 | keep (correct) |

**Next step (needs your approval):** confirm which of PROPOSED-BL-CAT-009/010/011/012 to adopt (and final IDs). On approval I will (1) add the approved entries to `business-logic.md` body + its summary table (per policy, body and table edited separately), and (2) update the 053 CSV `Business_Rule` column per the table above. Nothing is changed until you approve.
