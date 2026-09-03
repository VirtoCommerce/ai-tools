# Existing Functionality Map

> **GENERATED — never hand-edit.** `npm run map:refresh` rewrites this file;
> `npm run map:check` is the drift gate. Editing it by hand is reverted by the next refresh,
> silently. To change what it says, change the source it is derived from.
>
> **Rev:** 2026-09-03
> **Sources:** `config/test-suites.json` (135 suites, 13 domains) ·
> the suite CSVs' own `BL-*`/`ECL-*` citations · `.claude/knowledge/oracles/business-logic.md` ·
> `reports/ba/` (47 docs) · `reports/ba/test-models/` (5) ·
> `.claude/knowledge/domain/` (6) · `reports/tickets/` (26 runs)

---

## 1. What this answers, and what it does not

**It answers:** *for the surface I am about to analyse, what already exists in this product,
and where is what we already know about it written down?* Read your domain's section BEFORE
analysing a ticket — the point is to start from what is known rather than re-deriving it, and to
AMEND the prior artifact instead of forking a second one.

**A dated document is a HYPOTHESIS about current behaviour, never the baseline.** Every prior-art
entry above carries its own date for exactly one reason: the product moved after it was written, and
nothing in the tree tells you whether it moved *here*. So a claim taken from a prior report is
triangulated before it is relied on — the discipline `/qa-review-oracles` and `/qa-review-tests`
Dim 11 already apply to oracles and assertions, applied to prior analysis:

| Axis | Answers | Limits |
|---|---|---|
| the **prior document** + its date | what we believed, and when | may be stale in ways nothing flags |
| **release documentation** — `release-ledger.md` for what shipped since that date, VirtoOZ for how the feature is meant to work | *did this component move after the doc was written?* | the ledger records **released upstream, never deployed here**, is **non-exhaustive** (a miss is not evidence of absence) and **carries no behaviour** — so it raises a staleness SUSPICION and can never settle one |
| **live** — the running environment | what it does now | the only axis that settles a disagreement |

Carry a verdict per claim, in the repo vocabulary: **CONFIRMED** (prior doc still true) ·
**DRIFT** (it changed — say to what, and amend the document) · **MISSING** (documented behaviour is
gone) · **UNVERIFIED** (not checked — which is honest, and is *not* a pass). A `DRIFT` found this way
is a finding about the DOCUMENT, not a product bug: it enters the run like any other observation and
is filed only if the live behaviour is itself wrong.

**Two questions, and the second is the one that lets you design a test.** §3 answers *where is
the prior art* — a bibliography. Each domain then carries a **Test object** block answering *what
IS this thing*: its purpose (the value chain), the operations you can perform on it, the data whose
properties its assertions read, the variants that change its behaviour without changing its code,
and the constraints that must always hold. **You cannot design an experiment on an object whose
properties you do not know** — you can only walk its screens, which is the measured Loyalty
Missions failure (127 cases, 71 of them placing zero orders, the mechanism end-to-end at 11%).

**`UNDECLARED` is a finding, not a rendering gap.** Purpose and reverse edges exist in exactly one
place — a Test Model Part 0 — so where no model covers a domain the cell says `UNDECLARED` rather
than a synthesised guess. Inventing a purpose from suite titles would put a fabricated claim about
the product into the artifact every later run reads as context. It also makes the incentive right:
`1e` writing a model FILLS the cell for the next ticket, so the map improves as a by-product of
work already mandated — the same reason the `Audited:` stamp is the rotation state rather than a
second ledger to desync.

**It does not** carry behaviour. It is an index of surfaces and pointers, so it can tell you that
a prior analysis or a fault model for this surface exists, and it can never ground an assertion —
the same limit `release-ledger.md` carries. `{DOC}`/`{BL}` grounding still comes from the oracle,
the docs and the live system.

**Two facts about attribution, so a gap is readable as a gap:** a document is attributed by
matching its path and title against each domain's own vocabulary using only tokens that
**discriminate** (47 tokens were owned by more than one domain this run and
therefore attribute nothing) — so §5 is a list of documents this tool could not place, **not** a
list of documents that do not matter. And a domain with no prior BA analysis is a real gap, not a
rendering artifact: the row says `none`.

## 2. Domain index

| Domain | Suites | Cases | Layers | BL cited | ECL cited | BA docs | Models | Knowledge |
|---|---|---|---|---|---|---|---|---|
| `auth-security` | 7 | 251 | backend + frontend | 41 | 14 | 0 | 0 | 0 |
| `background-jobs` | 1 | 52 | backend | 10 | 0 | 0 | 0 | 0 |
| `branding` | 4 | 128 | backend + frontend | 7 | 2 | 0 | 0 | 0 |
| `catalog-search` | 19 | 779 | backend + frontend | 82 | 28 | 8 | 1 | 1 |
| `communication` | 4 | 121 | backend | 13 | 16 | 0 | 0 | 0 |
| `content-cms` | 6 | 271 | backend | 16 | 12 | 0 | 0 | 0 |
| `cross-cutting` | 13 | 322 | backend + frontend | 77 | 41 | 0 | 0 | 0 |
| `customer-b2b` | 20 | 663 | backend + frontend | 71 | 31 | 18 | 0 | 0 |
| `marketing` | 7 | 209 | backend + frontend | 15 | 15 | 0 | 1 | 0 |
| `observability` | 1 | 23 | backend | 1 | 0 | 0 | 0 | 0 |
| `platform-config` | 12 | 338 | backend | 20 | 10 | 1 | 0 | 0 |
| `purchase-flow` | 32 | 925 | backend + frontend | 86 | 35 | 1 | 0 | 0 |
| `sales-rep` | 9 | 399 | backend + frontend | 36 | 11 | 11 | 1 | 0 |

**Domain knowledge — the whole set, always available.** Each of these is broader than one
domain, so they are listed in full rather than attributed away: a doc that reaches no domain
below is cross-cutting, not irrelevant. **These are the paths to cite** — every reference to
them inside an agent definition used to be a bare `knowledge/domain/…`, which resolves to
nothing from a sub-agent CWD because there is no top-level `knowledge/` directory.

| Document | Covers | Attributed to |
|---|---|---|
| [`.claude/knowledge/domain/catalog.md`](../../../.claude/knowledge/domain/catalog.md) | Catalog — Agent Reference | `catalog-search` |
| [`.claude/knowledge/domain/products.md`](../../../.claude/knowledge/domain/products.md) | VC Product Reference | cross-cutting |
| [`.claude/knowledge/domain/release-ledger.md`](../../../.claude/knowledge/domain/release-ledger.md) | VC Release Ledger — what shipped, when | cross-cutting |
| [`.claude/knowledge/domain/sitemap.md`](../../../.claude/knowledge/domain/sitemap.md) | Sitemap: FRONT_URL | cross-cutting |
| [`.claude/knowledge/domain/store-settings.md`](../../../.claude/knowledge/domain/store-settings.md) | Store Settings — Agent Reference | cross-cutting |
| [`.claude/knowledge/domain/white-labeling.md`](../../../.claude/knowledge/domain/white-labeling.md) | White Labeling — Agent Reference | cross-cutting |

## 3. Per domain — the existing surface and its prior art

### auth-security

- **Suites** (7, 251 cases): 031, 032, 033, 044, 049, 050d, 082
- **Tags**: account-menu · api · auth · company · csrf · daily · graphql · impersonation · login · login-on-behalf · pci · permissions · platform · rbac · register · registration · rest · security · session · sprint · xapi · xprofile · xss
- **Oracles cited by those suites**: 41 `BL-*` (**11 not declared in the oracle** — `npm run bl:lint` owns that) · 14 `ECL-*`
- **Domain knowledge**: none
- **Prior BA analysis** (0): **none — a real gap**
- **Prior test models** (0): none — the first FULL run on this domain writes one
- **Already tested here** (0): no run has verified a BL in this domain
- **Checklist**: `/qa-checklist auth-security`

  **Test object** — you cannot design an experiment on an object whose properties you do
  not know. `UNDECLARED` below is a finding, not a rendering gap.

  - **Purpose (value chain)**: **`UNDECLARED`** — no Test Model Part 0 covers this domain, so
    nothing in the repo states what this surface is FOR. Deriving it is `1e`'s first job, and
    writing that model is what fills this cell for the next ticket.
  - **Operations exercised** (lower bound, measured — `name(` in this domain's suites): 10 of 108 schema ops — §Queries > Profile (5) · §Queries > Other (2) · §Queries > CMS (1) · §Queries > Cart (1) · §Queries > Catalog (1). Full surface: [`.claude/knowledge/api/graphql-schema.md`](../../../.claude/knowledge/api/graphql-schema.md)
  - **Tested against** (the data whose properties the assertions read): 22 `@td()` alias(es) — ACME_BUYER, ADDR_LINE1_XSS, AGENT_TEST_IMP_CUSTOMER, AGENT_TEST_IMP_ROLE, BUILDRIGHT_ADMIN, COUPON_10PCT, IMPERSONATE_TARGET, IMPERSONATE_TARGET_BLOCKED, IMPERSONATE_TARGET_INVITED, IMPERSONATE_TARGET_MANY_ORGS … · 37 `{{VAR}}` token(s)
  - **Variants** (what changes its behaviour without changing its code): 1 config flag(s) — `desktop_menu_mode` (`"horizontal"`). Store-level defaults (currency, language, catalog, payment methods) always apply: [`.claude/knowledge/domain/store-settings.md`](store-settings.md)
  - **Constraints** (what must always hold — what a violation COSTS): 41 `BL-*` — **9 P0** · 19 P1 · 2 P2 · 11 undeclared · 14 `ECL-*`. Severity is the oracle's own tag, read and never inferred
  - **Reverse edges** (does every forward effect on money / points / stock / entitlement undo?): **`UNDECLARED`** — no model resolved them. An unresolved reverse edge is itself a finding

### background-jobs

- **Suites** (1, 52 cases): 095
- **Tags**: api · background-jobs · hangfire · migration · platform · security
- **Oracles cited by those suites**: 10 `BL-*` · 0 `ECL-*`
- **Domain knowledge**: none
- **Prior BA analysis** (0): **none — a real gap**
- **Prior test models** (0): none — the first FULL run on this domain writes one
- **Already tested here** (0): no run has verified a BL in this domain
- **Checklist**: `/qa-checklist background-jobs`

  **Test object** — you cannot design an experiment on an object whose properties you do
  not know. `UNDECLARED` below is a finding, not a rendering gap.

  - **Purpose (value chain)**: **`UNDECLARED`** — no Test Model Part 0 covers this domain, so
    nothing in the repo states what this surface is FOR. Deriving it is `1e`'s first job, and
    writing that model is what fills this cell for the next ticket.
  - **Operations exercised** (lower bound, measured — `name(` in this domain's suites): 2 of 108 schema ops — §Queries > Catalog (2). Full surface: [`.claude/knowledge/api/graphql-schema.md`](../../../.claude/knowledge/api/graphql-schema.md)
  - **Tested against** (the data whose properties the assertions read): 8 `@td()` alias(es) — FC_EAST, FC_WEST, PRICELIST_USD, PRICELIST_VIP, PROCESSING_ORDER, PROD_DEFAULT, PROD_LOW_STOCK, STORE_PRIMARY · 7 `{{VAR}}` token(s)
  - **Variants** (what changes its behaviour without changing its code): 1 config flag(s) — `homepage_background_image` (`"main-banner.webp"`). Store-level defaults (currency, language, catalog, payment methods) always apply: [`.claude/knowledge/domain/store-settings.md`](store-settings.md)
  - **Constraints** (what must always hold — what a violation COSTS): 10 `BL-*` — **1 P0** · 9 P1 · 0 P2 · 0 undeclared · 0 `ECL-*`. Severity is the oracle's own tag, read and never inferred
  - **Reverse edges** (does every forward effect on money / points / stock / entitlement undo?): **`UNDECLARED`** — no model resolved them. An unresolved reverse edge is itself a finding

### branding

- **Suites** (4, 128 cases): 066, 067, 070, 071
- **Tags**: admin · branding · favicon · logo · meta · redirects · responsive · seo · slug · sprint · storefront · theme · whitelabeling
- **Oracles cited by those suites**: 7 `BL-*` · 2 `ECL-*`
- **Domain knowledge**: none
- **Prior BA analysis** (0): **none — a real gap**
- **Prior test models** (0): none — the first FULL run on this domain writes one
- **Already tested here** (0): no run has verified a BL in this domain
- **Checklist**: `/qa-checklist branding`

  **Test object** — you cannot design an experiment on an object whose properties you do
  not know. `UNDECLARED` below is a finding, not a rendering gap.

  - **Purpose (value chain)**: **`UNDECLARED`** — no Test Model Part 0 covers this domain, so
    nothing in the repo states what this surface is FOR. Deriving it is `1e`'s first job, and
    writing that model is what fills this cell for the next ticket.
  - **Operations exercised** (lower bound, measured — `name(` in this domain's suites): 3 of 108 schema ops — §Queries > Profile (1) · §Queries > WhiteLabeling (1) · §Queries > CMS (1). Full surface: [`.claude/knowledge/api/graphql-schema.md`](../../../.claude/knowledge/api/graphql-schema.md)
  - **Tested against** (the data whose properties the assertions read): 10 `@td()` alias(es) — STORE_PRIMARY, WL_DEFAULT, WL_ELECTRONICS, WL_FASHION, WL_FOOTER_ONLY, WL_MENU_ONLY, WL_USER_ELECTRONICS, WL_USER_FASHION, WL_USER_FOOTER_ONLY, WL_USER_MULTI · 6 `{{VAR}}` token(s)
  - **Variants** (what changes its behaviour without changing its code): 3 config flag(s) — `logo_image` (`"logo.svg"`) · `logo_inverted_image` (`"logo-white.svg"`) · `favicon_image` (`"/static/icons/favicon-32x32.png"`). Store-level defaults (currency, language, catalog, payment methods) always apply: [`.claude/knowledge/domain/store-settings.md`](store-settings.md)
  - **Constraints** (what must always hold — what a violation COSTS): 7 `BL-*` — **1 P0** · 3 P1 · 3 P2 · 0 undeclared · 2 `ECL-*`. Severity is the oracle's own tag, read and never inferred
  - **Reverse edges** (does every forward effect on money / points / stock / entitlement undo?): **`UNDECLARED`** — no model resolved them. An unresolved reverse edge is itself a finding

### catalog-search

- **Suites** (19, 779 cases): 001, 002, 003, 004, 005, 050a, 050i, 051 … (+11)
- **Tags**: admin · admin-to-storefront · advanced · autocomplete · catalog · categories · compare · configurable-products · configuration · configurations · cross-browser · crud · customer-reviews · customer-reviews-suite · e2e · elastic · facets · file-upload · filters · functional · graphql · indexing · navigation · pdp
- **Oracles cited by those suites**: 82 `BL-*` (**18 not declared in the oracle** — `npm run bl:lint` owns that) · 28 `ECL-*`
- **Domain knowledge**: [`.claude/knowledge/domain/catalog.md`](../../../.claude/knowledge/domain/catalog.md)
- **Prior BA analysis** (8): [`catalog-binary-sidecars.md`](../../../reports/ba/Backup-Restore/catalog-binary-sidecars.md) *(2026-09-03)* · [`BA-REPORT-configurable-products-sorting.md`](../../../reports/ba/Configurable products/BA-REPORT-configurable-products-sorting.md) *(2026-07-28)* · [`ba-report-VCST-4713-conditional-sections.md`](../../../reports/ba/Configurable products/ba-report-VCST-4713-conditional-sections.md) *(2026-07-28)* · [`ba-report-VCST-4806-maxlength-validation.md`](../../../reports/ba/Configurable products/ba-report-VCST-4806-maxlength-validation.md) *(2026-07-28)* · [`ba-report-VCST-4928-character-counter-docs.md`](../../../reports/ba/Configurable products/ba-report-VCST-4928-character-counter-docs.md) *(2026-07-28)* · [`conditional-sections-admin-guide.md`](../../../reports/ba/Configurable products/conditional-sections-admin-guide.md) *(2026-07-28)* · [`conditional-sections-storefront-behavior.md`](../../../reports/ba/Configurable products/conditional-sections-storefront-behavior.md) *(2026-07-28)* · [`order-history-filter-persistence-stories.md`](../../../reports/ba/order-history-filter-persistence-stories.md) *(2026-06-08)*
- **Prior test models** (1): [`VCST-5735`](../../../reports/ba/test-models/VCST-5735-2026-09-03.md) *(2026-09-03, declared)*
- **Already tested here** (2): VCST-5729 → PASS_WITH_NOTES · VCST-5733 → PASS_WITH_NOTES
- **Checklist**: `/qa-checklist catalog-search`

  **Test object** — you cannot design an experiment on an object whose properties you do
  not know. `UNDECLARED` below is a finding, not a rendering gap.

  - **Purpose (value chain)** — from VCST-5735's Part 0, verbatim:
    - L1 the customer clicks "Add to Compare" on a card or PDP → the product is remembered, tagged with the category it sits in, and refused if that category is already full
    - L2 → an `ICompareProductEntry {productId, categoryKey, localId?}` is appended to the list
    - L3 → it persists to `localStorage["compareProducts"]`, surviving reload, new tabs and sign-in
    - L4 → on `/compare` entries are clamped per category, fetched by id, grouped into tabs, and rendered one column per entry × one row per characteristic
    - L5 → the customer narrows to Differences, pins, removes or clears — the table answers "which one"
    - L6 → the winner goes to the cart from the table, and the cart really holds that line
  - **Operations exercised** (lower bound, measured — `name(` in this domain's suites): 14 of 108 schema ops — §Queries > Catalog (7) · §Queries > Other (4) · §Queries > Orders (2) · §Queries > Cart (1). Full surface: [`.claude/knowledge/api/graphql-schema.md`](../../../.claude/knowledge/api/graphql-schema.md)
  - **Tested against** (the data whose properties the assertions read): 70 `@td()` alias(es) — ACME_ADMIN, BUYABLE_NO_MIN_QTY, BUYABLE_PRICED_PRODUCT, CATALOG_MIXED, CFG_017_SECTIONS, CFG_022_SECTIONS, CFG_023_SECTIONS, CFG_BIKE, CFG_CONDITIONAL, CFG_CONDITIONAL_BIKE … · 99 `{{VAR}}` token(s)
  - **Variants** (what changes its behaviour without changing its code): 11 config flag(s) — `product_compare_enabled` (`true`) · `product_compare_limit` (`5`) · `product_filters_sorting` (`false`) · `product_filters_sorting_direction` (`"asc"`) · `range_filter_type` (`"slider"`) · `categories_limit` (`499`) · `zero_price_product_enabled` (`false`) · `search_max_chars` (`400`) · `search_static_content_suggestions_enabled` (`true`) · `search_product_phrase_suggestions_enabled` (`false`) · `catalog_pagination_mode` (`"infinite_scroll"`). Store-level defaults (currency, language, catalog, payment methods) always apply: [`.claude/knowledge/domain/store-settings.md`](store-settings.md)
  - **Constraints** (what must always hold — what a violation COSTS): 82 `BL-*` — **21 P0** · 28 P1 · 15 P2 · 18 undeclared · 28 `ECL-*`. Severity is the oracle's own tag, read and never inferred
  - **Reverse edges** (does every forward effect on money / points / stock / entitlement undo?): resolved in VCST-5735's model

### communication

- **Suites** (4, 121 cases): 050l, 057, 058, 068
- **Tags**: drafts · email · events · graphql · notifications · push-messages · sprint · templates · triggers · xapi
- **Oracles cited by those suites**: 13 `BL-*` · 16 `ECL-*`
- **Domain knowledge**: none
- **Prior BA analysis** (0): **none — a real gap**
- **Prior test models** (0): none — the first FULL run on this domain writes one
- **Already tested here** (0): no run has verified a BL in this domain
- **Checklist**: `/qa-checklist communication`

  **Test object** — you cannot design an experiment on an object whose properties you do
  not know. `UNDECLARED` below is a finding, not a rendering gap.

  - **Purpose (value chain)**: **`UNDECLARED`** — no Test Model Part 0 covers this domain, so
    nothing in the repo states what this surface is FOR. Deriving it is `1e`'s first job, and
    writing that model is what fills this cell for the next ticket.
  - **Operations exercised** (lower bound, measured — `name(` in this domain's suites): 2 of 108 schema ops — §Queries > Other (1) · §Queries > Profile (1). Full surface: [`.claude/knowledge/api/graphql-schema.md`](../../../.claude/knowledge/api/graphql-schema.md)
  - **Tested against** (the data whose properties the assertions read): 3 `@td()` alias(es) — ORG_ACME, ORG_XSS, TECHFLOW_ADMIN · 29 `{{VAR}}` token(s)
  - **Variants** (what changes its behaviour without changing its code): 1 config flag(s) — `push_messages_enabled` (`true`). Store-level defaults (currency, language, catalog, payment methods) always apply: [`.claude/knowledge/domain/store-settings.md`](store-settings.md)
  - **Constraints** (what must always hold — what a violation COSTS): 13 `BL-*` — **1 P0** · 9 P1 · 3 P2 · 0 undeclared · 16 `ECL-*`. Severity is the oracle's own tag, read and never inferred
  - **Reverse edges** (does every forward effect on money / points / stock / entitlement undo?): **`UNDECLARED`** — no model resolved them. An unresolved reverse edge is itself a finding

### content-cms

- **Suites** (6, 271 cases): 050f, 059, 060, 062, 069, 084
- **Tags**: admin · assets · blob-storage · builder · cms · content · design · download · graphql · image-tools · management · news · pages · processing · resize · sprint · thumbnails · upload · vc-news · xapi · xcms
- **Oracles cited by those suites**: 16 `BL-*` (**11 not declared in the oracle** — `npm run bl:lint` owns that) · 12 `ECL-*`
- **Domain knowledge**: none
- **Prior BA analysis** (0): **none — a real gap**
- **Prior test models** (0): none — the first FULL run on this domain writes one
- **Already tested here** (0): no run has verified a BL in this domain
- **Checklist**: `/qa-checklist content-cms`

  **Test object** — you cannot design an experiment on an object whose properties you do
  not know. `UNDECLARED` below is a finding, not a rendering gap.

  - **Purpose (value chain)**: **`UNDECLARED`** — no Test Model Part 0 covers this domain, so
    nothing in the repo states what this surface is FOR. Deriving it is `1e`'s first job, and
    writing that model is what fills this cell for the next ticket.
  - **Operations exercised** (lower bound, measured — `name(` in this domain's suites): 9 of 108 schema ops — §Queries > CMS (8) · §Queries > Other (1). Full surface: [`.claude/knowledge/api/graphql-schema.md`](../../../.claude/knowledge/api/graphql-schema.md)
  - **Tested against** (the data whose properties the assertions read): 1 `@td()` alias(es) — STORE_PRIMARY · 14 `{{VAR}}` token(s)
  - **Variants** (what changes its behaviour without changing its code): 8 config flag(s) — `image_thumbnails_enabled` (`true`) · `image_thumbnails_original_fallback_enabled` (`true`) · `image_carousel_in_product_card_enabled` (`true`) · `search_static_content_suggestions_enabled` (`true`) · `logo_image` (`"logo.svg"`) · `logo_inverted_image` (`"logo-white.svg"`) · `favicon_image` (`"/static/icons/favicon-32x32.png"`) · `homepage_background_image` (`"main-banner.webp"`). Store-level defaults (currency, language, catalog, payment methods) always apply: [`.claude/knowledge/domain/store-settings.md`](store-settings.md)
  - **Constraints** (what must always hold — what a violation COSTS): 16 `BL-*` — **2 P0** · 2 P1 · 1 P2 · 11 undeclared · 12 `ECL-*`. Severity is the oracle's own tag, read and never inferred
  - **Reverse edges** (does every forward effect on money / points / stock / entitlement undo?): **`UNDECLARED`** — no model resolved them. An unresolved reverse edge is itself a finding

### cross-cutting

- **Suites** (13, 322 cases): 042, 043, 045, 046, 047, 048, 048c, 048d … (+5)
- **Tags**: a11y · accessibility · admin · alignment · analytics · api · auth · b2b · brand-profile · cart · catalog · checkout · cls · compatibility · core-web-vitals · critical-ui-scope · cross-browser · cross-cutting · daily · ga4 · graphql · homepage · i18n · inventory
- **Oracles cited by those suites**: 77 `BL-*` (**8 not declared in the oracle** — `npm run bl:lint` owns that) · 41 `ECL-*`
- **Domain knowledge**: none
- **Prior BA analysis** (0): **none — a real gap**
- **Prior test models** (0): none — the first FULL run on this domain writes one
- **Already tested here** (2): VCST-5729 → PASS_WITH_NOTES · VCST-5733 → PASS_WITH_NOTES
- **Checklist**: `/qa-checklist cross-cutting`

  **Test object** — you cannot design an experiment on an object whose properties you do
  not know. `UNDECLARED` below is a finding, not a rendering gap.

  - **Purpose (value chain)**: **`UNDECLARED`** — no Test Model Part 0 covers this domain, so
    nothing in the repo states what this surface is FOR. Deriving it is `1e`'s first job, and
    writing that model is what fills this cell for the next ticket.
  - **Operations exercised** (lower bound, measured — `name(` in this domain's suites): 7 of 108 schema ops — §Queries > Catalog (3) · §Queries > Profile (1) · §Queries > Orders (1) · §Queries > Cart (1) · §Queries > Other (1). Full surface: [`.claude/knowledge/api/graphql-schema.md`](../../../.claude/knowledge/api/graphql-schema.md)
  - **Tested against** (the data whose properties the assertions read): 9 `@td()` alias(es) — ADDR_NY, AUTHORIZENET_VISA, BUYABLE_NO_MIN_QTY, CFG_LAPTOP, CFG_RING, COUPONS, CYBERSOURCE_VISA, SEARCH_KITCHEN, SKYFLOW_MC · 20 `{{VAR}}` token(s)
  - **Variants** (what changes its behaviour without changing its code): 1 config flag(s) — `homepage_background_image` (`"main-banner.webp"`). Store-level defaults (currency, language, catalog, payment methods) always apply: [`.claude/knowledge/domain/store-settings.md`](store-settings.md)
  - **Constraints** (what must always hold — what a violation COSTS): 77 `BL-*` — **26 P0** · 35 P1 · 8 P2 · 8 undeclared · 41 `ECL-*`. Severity is the oracle's own tag, read and never inferred
  - **Reverse edges** (does every forward effect on money / points / stock / entitlement undo?): **`UNDECLARED`** — no model resolved them. An unresolved reverse edge is itself a finding

### customer-b2b

- **Suites** (20, 663 cases): 006, 007, 008, 009, 010, 011b, 026, 027 … (+12)
- **Tags**: VCST-5239 · a11y · account · admin · admin-spa · api · b2b · bulk-order · catalog · checkout · company · conditions · configurations · contacts · contracts · crud · currency-override · customer · dashboard · e2e · earning · graphql · invites · loyalty
- **Oracles cited by those suites**: 71 `BL-*` (**6 not declared in the oracle** — `npm run bl:lint` owns that) · 31 `ECL-*`
- **Domain knowledge**: none
- **Prior BA analysis** (18): [`view-customer-profile.md`](../../../reports/ba/Sales-rep/sales-rep-view-customer-profile/view-customer-profile.md) *(2026-09-03)* · [`vcst-5346-loyalty-missions-customer-guide.md`](../../../reports/ba/vcst-5346-loyalty-missions-customer-guide.md) *(2026-09-03)* · [`missions-admin-guide-2026-09-02.md`](../../../reports/ba/Loyalty&Mixed cart/missions-admin-guide-2026-09-02.md) *(2026-09-02)* · [`bl-proposals-2026-08-28.md`](../../../reports/ba/bl-proposals-2026-08-28.md) *(2026-08-28)* · [`missions-design-gaps-2026-08-28.md`](../../../reports/ba/Loyalty&Mixed cart/missions-design-gaps-2026-08-28.md) *(2026-08-28)* · [`test-model-VCST-5320-2026-08-27.md`](../../../reports/ba/Loyalty&Mixed cart/test-model-VCST-5320-2026-08-27.md) *(2026-08-27)* · [`ba-admin-doc-VCST-5281-org-membership-status-2026-08-07.md`](../../../reports/ba/Organization roles/ba-admin-doc-VCST-5281-org-membership-status-2026-08-07.md) *(2026-08-07)* · [`ba-customer-doc-VCST-5281-member-status-invites-2026-08-07.md`](../../../reports/ba/Organization roles/ba-customer-doc-VCST-5281-member-status-invites-2026-08-07.md) *(2026-08-07)* · [`ba-VCST-4907-customer-sales-reps-developer-2026-07-21.md`](../../../reports/ba/Sales-rep/ba-VCST-4907-customer-sales-reps-developer-2026-07-21.md) *(2026-07-21)* · [`salesrep-my-customers-customer-guide-2026-07-21.md`](../../../reports/ba/Sales-rep/salesrep-my-customers-customer-guide-2026-07-21.md) *(2026-07-21)* · [`salesrep-my-customers-sales-2026-07-21.md`](../../../reports/ba/Sales-rep/salesrep-my-customers-sales-2026-07-21.md) *(2026-07-21)* · [`ba-customer-doc-VCST-5239-member-roles-2026-07-09.md`](../../../reports/ba/Organization roles/ba-customer-doc-VCST-5239-member-roles-2026-07-09.md) *(2026-07-09)* · [`ba-vcst-5104-admin-multi-currency-order-totals-2026-06-24.md`](../../../reports/ba/Loyalty&Mixed cart/ba-vcst-5104-admin-multi-currency-order-totals-2026-06-24.md) *(2026-06-24)* · [`ba-vcst-5104-customer-mixed-cart-loyalty-order-2026-06-24.md`](../../../reports/ba/Loyalty&Mixed cart/ba-vcst-5104-customer-mixed-cart-loyalty-order-2026-06-24.md) *(2026-06-24)* · [`ba-vcst-5104-developer-ordertotals-graphql-2026-06-24.md`](../../../reports/ba/Loyalty&Mixed cart/ba-vcst-5104-developer-ordertotals-graphql-2026-06-24.md) *(2026-06-24)* · [`VCST-5028-customer-doc-2026-06-19.md`](../../../reports/ba/Organization roles/VCST-5028-customer-doc-2026-06-19.md) *(2026-06-19)* · [`ba-loyalty-mixed-cart-developer-2026-06-10.md`](../../../reports/ba/Loyalty&Mixed cart/ba-loyalty-mixed-cart-developer-2026-06-10.md) *(2026-06-10)* · [`ba-loyalty-mixed-cart-shopping-customer-2026-06-10.md`](../../../reports/ba/Loyalty&Mixed cart/ba-loyalty-mixed-cart-shopping-customer-2026-06-10.md) *(2026-06-10)*
- **Prior test models** (0): none — the first FULL run on this domain writes one
- **Release notes**: [`vcst-5319-module-release-note.md`](../../../reports/ba/release-notes/vcst-5319-module-release-note.md)
- **Already tested here** (1): VCST-5733 → PASS_WITH_NOTES
- **Checklist**: `/qa-checklist customer-b2b`

  **Test object** — you cannot design an experiment on an object whose properties you do
  not know. `UNDECLARED` below is a finding, not a rendering gap.

  - **Purpose (value chain)**: **`UNDECLARED`** — no Test Model Part 0 covers this domain, so
    nothing in the repo states what this surface is FOR. Deriving it is `1e`'s first job, and
    writing that model is what fills this cell for the next ticket.
  - **Operations exercised** (lower bound, measured — `name(` in this domain's suites): 17 of 108 schema ops — §Queries > Profile (5) · §Queries > Other (4) · §Queries > Wishlists (3) · §Queries > Catalog (2) · §Queries > CMS (1) · §Queries > Orders (1) · §Queries > Cart (1). Full surface: [`.claude/knowledge/api/graphql-schema.md`](../../../.claude/knowledge/api/graphql-schema.md)
  - **Tested against** (the data whose properties the assertions read): 70 `@td()` alias(es) — ACME_ADMIN, ADDR_LA, BUILDRIGHT_ADMIN, BUYABLE_NO_MIN_QTY, CFG_LAPTOP, CFG_RING, COUPON_10PCT, COUPON_20PCT, LOYALTY_SETTINGS, LOYALTY_VIP_USER … · 179 `{{VAR}}` token(s)
  - **Variants** (what changes its behaviour without changing its code): 2 config flag(s) — `checkout_purchase_order_enabled` (`true`) · `wishlists_limit` (`10`). Store-level defaults (currency, language, catalog, payment methods) always apply: [`.claude/knowledge/domain/store-settings.md`](store-settings.md)
  - **Constraints** (what must always hold — what a violation COSTS): 71 `BL-*` — **29 P0** · 31 P1 · 5 P2 · 6 undeclared · 31 `ECL-*`. Severity is the oracle's own tag, read and never inferred
  - **Reverse edges** (does every forward effect on money / points / stock / entitlement undo?): **`UNDECLARED`** — no model resolved them. An unresolved reverse edge is itself a finding

### marketing

- **Suites** (7, 209 cases): 023, 024, 025, 050j, 077, 077b, 079
- **Tags**: VCST-4896 · admin · api · cart-sidebar · content · coupons · dynamic-content · graphql · marketing · promotion-coupons · promotions · rbac · sprint · storefront · xapi · xmarketing
- **Oracles cited by those suites**: 15 `BL-*` · 15 `ECL-*`
- **Domain knowledge**: none
- **Prior BA analysis** (0): **none — a real gap**
- **Prior test models** (1): [`VCST-5319`](../../../reports/ba/test-models/VCST-5319-2026-08-28.md) *(2026-08-28, inferred)*
- **Already tested here** (0): no run has verified a BL in this domain
- **Checklist**: `/qa-checklist marketing`

  **Test object** — you cannot design an experiment on an object whose properties you do
  not know. `UNDECLARED` below is a finding, not a rendering gap.

  - **Purpose (value chain)**: **`UNDECLARED`** — no Test Model Part 0 covers this domain, so
    nothing in the repo states what this surface is FOR. Deriving it is `1e`'s first job, and
    writing that model is what fills this cell for the next ticket.
  - **Operations exercised** (lower bound, measured — `name(` in this domain's suites): 5 of 108 schema ops — §Queries > Catalog (2) · §Queries > Cart (1) · §Queries > Orders (1) · §Queries > CMS (1). Full surface: [`.claude/knowledge/api/graphql-schema.md`](../../../.claude/knowledge/api/graphql-schema.md)
  - **Tested against** (the data whose properties the assertions read): 20 `@td()` alias(es) — BUYABLE_NO_MIN_QTY, COUPONS, COUPON_10PCT, COUPON_20PCT, COUPON_E2E, COUPON_EXCLUSIVE, COUPON_FIXED5, COUPON_FREESHIP, COUPON_LC_CASEFIDELITY, COUPON_PRIVATE … · 46 `{{VAR}}` token(s)
  - **Variants** (what changes its behaviour without changing its code): no config flag attributed. Store-level defaults (currency, language, catalog, payment methods) always apply: [`.claude/knowledge/domain/store-settings.md`](store-settings.md)
  - **Constraints** (what must always hold — what a violation COSTS): 15 `BL-*` — **6 P0** · 7 P1 · 1 P2 · 1 undeclared · 15 `ECL-*`. Severity is the oracle's own tag, read and never inferred
  - **Reverse edges** (does every forward effect on money / points / stock / entitlement undo?): **`UNDECLARED`** — no model resolved them. An unresolved reverse edge is itself a finding

### observability

- **Suites** (1, 23 cases): 094
- **Tags**: appinsights · mcp · observability · opentelemetry · telemetry · ucp
- **Oracles cited by those suites**: 1 `BL-*` · 0 `ECL-*`
- **Domain knowledge**: none
- **Prior BA analysis** (0): **none — a real gap**
- **Prior test models** (0): none — the first FULL run on this domain writes one
- **Already tested here** (0): no run has verified a BL in this domain
- **Checklist**: `/qa-checklist observability`

  **Test object** — you cannot design an experiment on an object whose properties you do
  not know. `UNDECLARED` below is a finding, not a rendering gap.

  - **Purpose (value chain)**: **`UNDECLARED`** — no Test Model Part 0 covers this domain, so
    nothing in the repo states what this surface is FOR. Deriving it is `1e`'s first job, and
    writing that model is what fills this cell for the next ticket.
  - **Operations exercised** (lower bound, measured — `name(` in this domain's suites): 2 of 108 schema ops — §Queries > Cart (1) · §Queries > Catalog (1). Full surface: [`.claude/knowledge/api/graphql-schema.md`](../../../.claude/knowledge/api/graphql-schema.md)
  - **Tested against** (the data whose properties the assertions read): 2 `@td()` alias(es) — PROD_DEFAULT, STORE_PRIMARY · 1 `{{VAR}}` token(s)
  - **Variants** (what changes its behaviour without changing its code): no config flag attributed. Store-level defaults (currency, language, catalog, payment methods) always apply: [`.claude/knowledge/domain/store-settings.md`](store-settings.md)
  - **Constraints** (what must always hold — what a violation COSTS): 1 `BL-*` — **0 P0** · 1 P1 · 0 P2 · 0 undeclared · 0 `ECL-*`. Severity is the oracle's own tag, read and never inferred
  - **Reverse edges** (does every forward effect on money / points / stock / entitlement undo?): **`UNDECLARED`** — no model resolved them. An unresolved reverse edge is itself a finding

### platform-config

- **Suites** (12, 338 cases): 020, 021, 034, 035, 050e, 050n, 063, 064 … (+4)
- **Tags**: admin · api · asset-url · assignments · catalog · catalog-publishing · channels · configuration · core · crud · csv · data-quality · dynamic-properties · email · export · filename · graphql · import · languages · management · page-context · permissions · platform · rest
- **Oracles cited by those suites**: 20 `BL-*` · 10 `ECL-*`
- **Domain knowledge**: none
- **Prior BA analysis** (1): [`catalog-binary-sidecars.md`](../../../reports/ba/Backup-Restore/catalog-binary-sidecars.md) *(2026-09-03)*
- **Prior test models** (0): none — the first FULL run on this domain writes one
- **Already tested here** (0): no run has verified a BL in this domain
- **Checklist**: `/qa-checklist platform-config`

  **Test object** — you cannot design an experiment on an object whose properties you do
  not know. `UNDECLARED` below is a finding, not a rendering gap.

  - **Purpose (value chain)**: **`UNDECLARED`** — no Test Model Part 0 covers this domain, so
    nothing in the repo states what this surface is FOR. Deriving it is `1e`'s first job, and
    writing that model is what fills this cell for the next ticket.
  - **Operations exercised** (lower bound, measured — `name(` in this domain's suites): 6 of 108 schema ops — §Queries > Catalog (4) · §Queries > CMS (1) · §Queries > Other (1). Full surface: [`.claude/knowledge/api/graphql-schema.md`](../../../.claude/knowledge/api/graphql-schema.md)
  - **Tested against** (the data whose properties the assertions read): 8 `@td()` alias(es) — CATALOG_LINK_RESTRICTED, CATALOG_READ_ONLY, EXTERNAL_HOST_IMAGE_PRODUCT, STORE_ASSET_TEST_URL, STORE_B2C, STORE_PRIMARY, TECHFLOW_BUYER, VIRTUAL_CATALOG_B2B · 26 `{{VAR}}` token(s)
  - **Variants** (what changes its behaviour without changing its code): 2 config flag(s) — `cart_page_browser_target` (`"_blank"`) · `product_page_browser_target` (`"_self"`). Store-level defaults (currency, language, catalog, payment methods) always apply: [`.claude/knowledge/domain/store-settings.md`](store-settings.md)
  - **Constraints** (what must always hold — what a violation COSTS): 20 `BL-*` — **3 P0** · 12 P1 · 2 P2 · 3 undeclared · 10 `ECL-*`. Severity is the oracle's own tag, read and never inferred
  - **Reverse edges** (does every forward effect on money / points / stock / entitlement undo?): **`UNDECLARED`** — no model resolved them. An unresolved reverse edge is itself a finding

### purchase-flow

- **Suites** (32, 925 cases): 011, 012, 013, 014, 015, 017, 018, 019 … (+24)
- **Tags**: PR-129 · VCST-4710 · add-to-cart · address · admin · anonymous · authorize-net · b2b · bopis · cart · cart-quantity · checkout · coupons · coupons-sidebar · cross-cutting · cross-domain · crud · cybersource · daily · datatrans · detail · facets · flow · frontend
- **Oracles cited by those suites**: 86 `BL-*` (**14 not declared in the oracle** — `npm run bl:lint` owns that) · 35 `ECL-*`
- **Domain knowledge**: none
- **Prior BA analysis** (1): [`order-history-filter-persistence-stories.md`](../../../reports/ba/order-history-filter-persistence-stories.md) *(2026-06-08)*
- **Prior test models** (0): none — the first FULL run on this domain writes one
- **Already tested here** (0): no run has verified a BL in this domain
- **Checklist**: `/qa-checklist purchase-flow`

  **Test object** — you cannot design an experiment on an object whose properties you do
  not know. `UNDECLARED` below is a finding, not a rendering gap.

  - **Purpose (value chain)**: **`UNDECLARED`** — no Test Model Part 0 covers this domain, so
    nothing in the repo states what this surface is FOR. Deriving it is `1e`'s first job, and
    writing that model is what fills this cell for the next ticket.
  - **Operations exercised** (lower bound, measured — `name(` in this domain's suites): 13 of 108 schema ops — §Queries > Cart (6) · §Queries > Catalog (3) · §Queries > Orders (2) · §Queries > Profile (1) · §Queries > Other (1). Full surface: [`.claude/knowledge/api/graphql-schema.md`](../../../.claude/knowledge/api/graphql-schema.md)
  - **Tested against** (the data whose properties the assertions read): 67 `@td()` alias(es) — ACME_BUYER, ADDRESS_SEARCH, ADDR_NO_MATCH_TERM, ADDR_NY, ADDR_SINGLE_CHAR_TERM, AUTHORIZENET_VISA, BOPIS, BOPIS_BVA_100, BOPIS_BVA_101, BOPIS_BVA_151 … · 117 `{{VAR}}` token(s)
  - **Variants** (what changes its behaviour without changing its code): 2 config flag(s) — `checkout_purchase_order_enabled` (`true`) · `product_quantity_control` (`"stepper"`). Store-level defaults (currency, language, catalog, payment methods) always apply: [`.claude/knowledge/domain/store-settings.md`](store-settings.md)
  - **Constraints** (what must always hold — what a violation COSTS): 86 `BL-*` — **33 P0** · 36 P1 · 3 P2 · 14 undeclared · 35 `ECL-*`. Severity is the oracle's own tag, read and never inferred
  - **Reverse edges** (does every forward effect on money / points / stock / entitlement undo?): **`UNDECLARED`** — no model resolved them. An unresolved reverse edge is itself a finding

### sales-rep

- **Suites** (9, 399 cases): 050m, 050m2, 089, 090, 091, 092, 092b, 093 … (+1)
- **Tags**: admin · b2b · backend · crud · customer-orders · customer-profile · embedded-app · feature-gated · graphql · hub-dashboard · my-customers · my-sales-reps · orders · permissions · sales-rep · saved-layout · scoped-schema · storefront · vc-shell · xapi
- **Oracles cited by those suites**: 36 `BL-*` · 11 `ECL-*`
- **Domain knowledge**: none
- **Prior BA analysis** (11): [`customize-your-layout.md`](../../../reports/ba/Sales-rep/sales-rep-customize-dashboard-layout/customize-your-layout.md) *(2026-09-03)* · [`read-your-dashboard.md`](../../../reports/ba/Sales-rep/sales-rep-hub-dashboard/read-your-dashboard.md) *(2026-09-03)* · [`view-customer-profile.md`](../../../reports/ba/Sales-rep/sales-rep-view-customer-profile/view-customer-profile.md) *(2026-09-03)* · [`ba-VCST-4907-customer-sales-reps-developer-2026-07-21.md`](../../../reports/ba/Sales-rep/ba-VCST-4907-customer-sales-reps-developer-2026-07-21.md) *(2026-07-21)* · [`ba-VCST-4907-sales-rep-visibility-admin-2026-07-21.md`](../../../reports/ba/Sales-rep/ba-VCST-4907-sales-rep-visibility-admin-2026-07-21.md) *(2026-07-21)* · [`ba-vcst-5304-developer-salesrepcustomers-graphql-2026-07-21.md`](../../../reports/ba/Sales-rep/ba-vcst-5304-developer-salesrepcustomers-graphql-2026-07-21.md) *(2026-07-21)* · [`salesrep-my-customers-admin-guide-2026-07-21.md`](../../../reports/ba/Sales-rep/salesrep-my-customers-admin-guide-2026-07-21.md) *(2026-07-21)* · [`salesrep-my-customers-customer-guide-2026-07-21.md`](../../../reports/ba/Sales-rep/salesrep-my-customers-customer-guide-2026-07-21.md) *(2026-07-21)* · [`salesrep-my-customers-sales-2026-07-21.md`](../../../reports/ba/Sales-rep/salesrep-my-customers-sales-2026-07-21.md) *(2026-07-21)* · [`salesrep-my-sales-reps-maintainer-guide-2026-07-21.md`](../../../reports/ba/Sales-rep/salesrep-my-sales-reps-maintainer-guide-2026-07-21.md) *(2026-07-21)* · [`ba-VCST-5293-sales-rep-admin-guide-2026-07-20.md`](../../../reports/ba/Sales-rep/ba-VCST-5293-sales-rep-admin-guide-2026-07-20.md) *(2026-07-20)*
- **Prior test models** (1): [`VCST-5733`](../../../reports/ba/test-models/VCST-5733-2026-09-02.md) *(2026-09-02, declared)*
- **Already tested here** (2): VCST-5729 → PASS_WITH_NOTES · VCST-5733 → PASS_WITH_NOTES
- **Checklist**: `/qa-checklist sales-rep`

  **Test object** — you cannot design an experiment on an object whose properties you do
  not know. `UNDECLARED` below is a finding, not a rendering gap.

  - **Purpose (value chain)** — from VCST-5733's Part 0, verbatim:
    - L1  I open a customer I serve and click "All orders →"                    → I land on that customer's order list
    - L2  the list is read from the order search index, scoped to the orgs I serve → I see EVERY order of that customer, not just the ones I placed
    - L3  I narrow it — status, created-date, keyword, sort, page               → the list and its option counts follow what I chose
    - L4  the breadcrumb keeps the customer, and I can go back                  → I stay in that customer's context
    - L5  I open one order                                                      → my own order opens actionable on the buyer page; anyone else's opens read-only in the hub
    - Unlocks: analysing a customer's purchasing history without leaving the hub.
  - **Operations exercised** (lower bound, measured — `name(` in this domain's suites): 17 of 108 schema ops — §Queries > Other (9) · §Queries > Orders (6) · §Queries > Cart (2). Full surface: [`.claude/knowledge/api/graphql-schema.md`](../../../.claude/knowledge/api/graphql-schema.md)
  - **Tested against** (the data whose properties the assertions read): 21 `@td()` alias(es) — ORDER_BUYER_PLACED, ORDER_NOT_SERVED, ORDER_REP_PLACED, ORG_ACME, ORG_ACMEWEST, ORG_BUILDRIGHT, ORG_REP_ONLY, ORG_SUSPENDED, ORG_TECHFLOW, SR_ADMIN_CUSTOMER_ONLY … · 37 `{{VAR}}` token(s)
  - **Variants** (what changes its behaviour without changing its code): no config flag attributed. Store-level defaults (currency, language, catalog, payment methods) always apply: [`.claude/knowledge/domain/store-settings.md`](store-settings.md)
  - **Constraints** (what must always hold — what a violation COSTS): 36 `BL-*` — **3 P0** · 19 P1 · 13 P2 · 1 undeclared · 11 `ECL-*`. Severity is the oracle's own tag, read and never inferred
  - **Reverse edges** (does every forward effect on money / points / stock / entitlement undo?): resolved in VCST-5733's model

## 4. Which domains a change is likely to touch

This map is keyed on the manifest's `domain`, which is also what `npm run tc:scope` and
`npm run regression:select` score against — so the domain you resolve at `1a` is the same key
here, in the scope triage, and in suite selection. **Do not derive a domain from a diff path**:
`regression:select --path client-app/pages/company/customer-orders.vue` misses `sales-rep`
entirely and reports itself fully mapped (`.claude/skills/qa-test/coverage-triage.md` §1).

## 5. Unattributed documents — named, never dropped

These exist and are worth reading; this tool could not place them from path + title alone.
**A document here is unplaced, not unimportant.**

- [`reports/ba/bl-proposals-2026-08-24.md`](../../../reports/ba/bl-proposals-2026-08-24.md)
- [`reports/ba/bl-proposals-2026-09-03.md`](../../../reports/ba/bl-proposals-2026-09-03.md)
- [`reports/ba/Configurable products/user-stories/EPIC-CP-SORT-stories.md`](../../../reports/ba/Configurable products/user-stories/EPIC-CP-SORT-stories.md)
- [`reports/ba/Configurable products/user-stories/README.md`](../../../reports/ba/Configurable products/user-stories/README.md)
- [`reports/ba/ecl-proposals-2026-08-27.md`](../../../reports/ba/ecl-proposals-2026-08-27.md)
- [`reports/ba/ecl-proposals-2026-09-03.md`](../../../reports/ba/ecl-proposals-2026-09-03.md)
- [`reports/ba/Organization roles/ba-admin-doc-VCST-5239-organization-roles-2026-07-09.md`](../../../reports/ba/Organization roles/ba-admin-doc-VCST-5239-organization-roles-2026-07-09.md)
- [`reports/ba/Organization roles/test-model-VCST-5281-2026-08-03.md`](../../../reports/ba/Organization roles/test-model-VCST-5281-2026-08-03.md)
- [`reports/ba/Organization roles/VCST-5028-admin-doc-2026-06-19.md`](../../../reports/ba/Organization roles/VCST-5028-admin-doc-2026-06-19.md)
- [`reports/ba/Organization roles/VCST-5028-developer-doc-2026-06-19.md`](../../../reports/ba/Organization roles/VCST-5028-developer-doc-2026-06-19.md)
- [`reports/ba/Organization roles/VCST-5028-per-org-roles-stories.md`](../../../reports/ba/Organization roles/VCST-5028-per-org-roles-stories.md)
- [`reports/ba/Page Builder (CMS)/ba-pagebuilder-ui-analysis-2026-03-25.md`](../../../reports/ba/Page Builder (CMS)/ba-pagebuilder-ui-analysis-2026-03-25.md)
- [`reports/ba/Page Builder (CMS)/ba-report-VCST-4872-pagebuilder-save-load-clone.md`](../../../reports/ba/Page Builder (CMS)/ba-report-VCST-4872-pagebuilder-save-load-clone.md)
- [`reports/ba/test-model-effectiveness-2026-08-27.md`](../../../reports/ba/test-model-effectiveness-2026-08-27.md)
- [`reports/ba/test-models/VCST-5346-2026-08-28.md`](../../../reports/ba/test-models/VCST-5346-2026-08-28.md) — test model, no `Domains:` line and nothing inferable
- [`reports/ba/test-models/VCST-5346-2026-09-02.md`](../../../reports/ba/test-models/VCST-5346-2026-09-02.md) — test model, no `Domains:` line and nothing inferable

**Config flags no domain claimed** — they still change behaviour somewhere, so read them
in [`.claude/knowledge/automation/storefront-config-flags.md`](../../../.claude/knowledge/automation/storefront-config-flags.md) when your surface looks config-dependent:

`checkout_multistep_enabled` · `checkout_comment_enabled` · `checkout_coupon_enabled` · `checkout_gifts_enabled` · `vendor_enabled` · `vendor_rating_enabled` · `files_enabled` · `default_return_url` · `line_items_group_by_vendor_enabled` · `graphql_operation_marking_enabled` · `details_browser_target`

## 6. Self-report

| | |
|---|---|
| Domains | 13 |
| Suites read | 135 of 135 |
| BA docs placed | 33 of 47 |
| Test models placed | 3 of 5 (2 by their own `Domains:` line) |
| Knowledge docs placed | 1 of 6 |
| Ambiguous tokens (attribute nothing) | 47 |
| Runs recording a verified BL invariant | 2 of 26 — the rest reach no domain because the field is empty, not because nothing was tested |
| **Purpose DECLARED** | **2 of 13 domains** — the other 11 have no Test Model Part 0, so nothing in the repo states what those surfaces are for. This is the map's most actionable number |
| Schema operations harvested | 108 from `.claude/knowledge/api/graphql-schema.md` |
| Config flags parsed | 36 from `.claude/knowledge/automation/storefront-config-flags.md` · 25 attributed |
| BL invariants carrying a severity tag | 216 of 226 declared |

A count here that drops is drift to explain, not a number to update by hand.

