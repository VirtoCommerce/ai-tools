---
domain_slug: cat
applicability: universal
rationale: |
  What "configurable products" (product-configuration sections attached to a catalog product —
  Product / Text / File sections, each optionally required) IS — actors, the value chain from
  Admin section authoring through a priced, configured cart/order line, the surface inventory per
  layer (Admin SPA / storefront / API), where the layers DISAGREE, and the shape of existing QA
  coverage. Built as a rebuild after an earlier version of this file was lost when the working tree
  was cleaned (no prior rev existed to carry forward — this is `rev: 1`, not a refresh).
generated: 2026-09-16
rev: 1
stale_after_days: 60
expires_after_days: 120
sources:
  - reports/ba/Configurable products/BA-REPORT-configurable-products-sorting.md (1 doc, 236 lines —
    2026-03-16, on vcst-qa, platform 2.44.0-pr-2100 / Admin SPA 3.1007.0 — a DIFFERENT env/build than
    this map; verdicts in §6)
  - reports/ba/test-models/VCST-5735-2026-09-03.md (test model for the Compare-products feature;
    touches configurable-product identity/pricing at its fringe — scenarios 12,13,16,17,19,20,21)
  - live enumeration on vcptcore-qa1 (storefront + Admin SPA), 2026-09-16, via playwright-edge
  - established facts handed in for this build by the dispatching session (GraphQL contract, file
    mechanism, product/section inventory, existing suite tags) — treated as CONFIRMED for this pass,
    provenance "session pre-flight" where not independently re-observed here
  - .claude/knowledge/api/graphql-schema.md (live introspection 2026-09-11)
  - config/test-suites.json + regression/suites/**
  - VirtoOZ MCP — **NOT QUERIED THIS PASS**: the connector required OAuth authorization this session
    did not have (§5 G8). No `PlatformUserGuide`/`StorefrontUserGuide` quote in this file — every
    doc-vs-build comparison an author would expect in §3 is therefore absent, not "checked and clean"
excludes: >
  Sort-order/pricing bugs from the 2026-03-16 BA report (CP-SORT-01..04) are historical, on a
  different env/build, and out of scope for a surface map — carried into §6 as prior-art verdicts
  only, not re-verified. Deep field-by-field Admin SPA configuration-widget enumeration (section/option
  edit forms) was NOT completed live this pass (browser time ran out mid-Admin-navigation) — see G7.
---

# Configurable Products — domain map

> Refresh with `/qa-domain-map configurable-products` (nearest `bl:extract` token: `cat`, shared with
> the broader Catalog domain — this map's `domain_slug: cat` is a field match, not a filename match, and
> does not collide with `.claude/knowledge/domain/catalog.md`, which carries no `domain_slug` field).
> This file answers **what the feature is and where its surfaces are**. It does **not** carry
> behavioural rules — those are `BL-*` in `oracles/business-logic.md` — and it can **never ground an
> assertion as `{DOC}`**. Pointer index plus surface inventory: it says *where to look* and *what
> exists*, never *what correct looks like*.

**Every claim carries a verdict.** `CONFIRMED` = observed live or read at source this pass ·
`DRIFT` = prior art says otherwise and prior art is wrong · `MISSING` = documented, does not exist ·
`UNVERIFIED` = not established, and **not** to be treated as true.

---

## §1 — Purpose and value chain

**Purpose: `UNDECLARED`.** No purpose statement exists in the one prior-art doc (which documents a
sorting bug and an Admin option-order gap, not what the feature is *for*), and neither published guide
could be checked this pass — VirtoOZ MCP required an OAuth grant this session did not have (G8). The
chain below is **reconstructed** from the live GraphQL contract, live storefront observation, and the
established facts handed in for this build. Cite it as the first written statement, to be contradicted
rather than trusted.

| # | Link, in the customer's words | Mechanism |
|---|---|---|
| 1 | A merchandiser defines what can be customized on a product | Admin `Configuration` widget on a catalog product → `configurationSections[]`, each `{id, name, description, isRequired, type, allowCustomText, allowTextOptions, maxLength, dependsOnSectionId, options}` — types observed this session: **Product** (pick a related SKU), **Text** (typed/predefined), **File** (upload) |
| 2 | The buyer opens the product and sees the sections to fill | Storefront PDP → xAPI `productConfiguration(configurableProductId, storeId, userId, cultureName, currencyCode)`, rendered as an accordion, one control block per section — `CONFIRMED` live (2026-09-16) |
| 3 | The buyer picks/types/uploads per section; sections can depend on siblings | `dependsOnSectionId` — a conditional section appears once the sibling it depends on has **any** value (coarse gate, per established facts); files upload out-of-band to `POST /api/files/product-configuration` and the returned relative `url` is what the section carries |
| 4 | Required sections gate purchase | `Add to cart` stays disabled until every `isRequired` section is complete — `BL-CAT-006`. Live-reconfirmed 2026-09-16: on `AGENT-TEST-Req-File-Child-20260519`, `Add to cart` was `[disabled]` with the required `ID Proof` File section still unfilled |
| 5 | The configuration is priced and becomes a cart line | `addItem(command: InputAddItemType)` carries `configurationSections: [ConfigurationSectionInput]{sectionId, type, option, customText, fileUrls}`; each selected Product-type option contributes its own price into the line total (live: base `$150.00`→`$120.00` sale, options add/subtract per selection) |
| 6 | The line's identity strips file sections | `withoutFileSections` (established fact, cross-referenced by VCST-5735 scenario 16) — two configurations differing ONLY by an attached file are the SAME cart-line identity; the second `addItem` is a silent no-op. **Not independently re-observed this pass** (would require touching a cart — out of scope under this run's hard constraint) |
| 7 | The configured line carries through Order; Quote drops part of it | `CartConfigurationItemType` → `OrderConfigurationItemType` (same shape minus selection state) preserves `sectionId`/`sectionName`; `QuoteConfigurationItemType` does **not** — it carries only `{id, name, type, customText, files}`, the VCST-5431 gap (established fact; project-memory `project_vcst5431_quote_section_gap` corroborates) |
| 8 | An uploaded file is reachable only while it stays where it was put | Unattached: anonymously readable. Attached to a cart: owner-only (403 to anon/other buyers). **Reversal is unmapped** — no observed "detach/delete an attached configuration file" path on either layer this pass (G3) |

### Actors

| Actor | Can do | Verdict |
|---|---|---|
| **Merchandiser (Admin)** | Defines sections, types, required flags, option catalog references, text constraints. The only actor who can create/edit/reorder sections | `UNVERIFIED` field-level this pass — established fact only (G7: live Admin drill-down into a product's Configuration widget was not completed) |
| **Buyer — anonymous or signed-in (storefront)** | Views sections, selects/types/uploads, sees running price, is gated by required sections at Add to cart | `CONFIRMED` live 2026-09-16 (anonymous session, `AGENT-TEST-Req-File-Child-20260519` and `AGENT-TEST-Wedding-Cake-Cond-20260519`) |
| **File-upload caller** | Can `POST /api/files/product-configuration` **without authenticating** (established fact) — the upload endpoint and the PDP session are on different trust boundaries | `UNVERIFIED` this pass (not re-exercised — would create an orphaned file with no cleanup path proven; established fact only) |

---

## §2 — Admin SPA (Catalog module)

**Live-confirmed this pass:** logged in as `admin` on `vcptcore-qa1.govirto.com` (Platform **3.1065.0**,
live-read from the nav footer — a newer patch than any version cited in the established facts, which
named module versions only; record as the deployed platform build for this map's `generated:` date).
Catalog root lists **22 catalogs**, including four configuration-fixture catalogs: `SEED-20260518-Configurables`,
`SEED-20260519-Configurables-Cascades`, `SEED-20260519-Standards`, and **`SEED-20260527-Configurables-Default`**
— the last of these is **not** named anywhere in this run's established facts (which describe "16 configurable
products, all `AGENT-TEST-CFG-*`, dated 20260519") and was found live. It is either a later, uncounted
fixture batch or an artifact of a prior seeding run — **CONFIRMED to exist, UNVERIFIED what it contains**
(G4).

| Aspect | State | Verdict |
|---|---|---|
| Where sections are authored | Product edit blade → **Configuration** widget (established fact; not re-opened live this pass) | `UNVERIFIED` this pass (G7) |
| Section types offered in Admin | Historical (2026-03-16, vcst-qa): **Product, Variation, Text, File** — Variation "currently buggy, renders empty" | `DRIFT`-candidate — **not comparable across env/build**, see §6; this session's established facts for vcptcore-qa1 name only Product/Text/File as *observed live*, which may mean Variation sections are absent from THIS env's fixtures rather than removed from the platform |
| Option ordering | Historical: no sort-order mechanism, insertion order only, drag handle present but non-functional | `UNVERIFIED` this pass — not re-opened; carried as prior-art pointer only, not asserted current |
| Section edit form fields | Historical: Name, Description, Type (read-only), Required toggle | `UNVERIFIED` this pass |

### 2a. NOT manageable from Admin (established + this pass)

A configuration file's per-file preview/download from within the widget (no suite asserts this — see §4);
whatever generates the storefront's "9.5MB / 5 files / \<formats\>" copy (§3 D1) — no Settings entry or
dictionary found by name in this session's Admin exploration, so its source is **still open** (G6, carried
from the brief).

---

## §3 — Storefront (customer-facing PDP)

**Live-confirmed this pass**, anonymous session, theme `2.58.0-pr-2485-ee6efd90` (vc-frontend, footer-read):

| Aspect | Live |
|---|---|
| Route | `/<slug>` — confirmed: `agent-test-req-file-child-20260519` and `agent-test-wedding-cake-cond-20260519` both rendered directly; `/product/<slug>` is not used for the configurable parent (established fact, re-confirmed by omission — every parent link observed was slug-based) |
| Sibling/option links | Product-type option rows link to **`/product/<guid>`** (the underlying variant/option product), a **different route shape** than the parent — see D2 |
| Section rendering | Accordion, one collapsible block per section; required sections marked `*` and block "Add to cart" until filled; optional sections say "(optional)" or a fill-prompt |
| File section dropzone copy | **`AGENT-TEST-Req-File-Child-20260519` → "ID Proof" (required):** *"Drag and drop file here or Browse your files. The files available for upload are in DOC, RTF, DOCX, TXT, PDF, XLS, XLSX, JPG, PNG, ODT formats. Each file should not exceed 9.5MB. Maximum 5 files allowed."* | `CONFIRMED` live 2026-09-16 — see D1, this **contradicts** the "any formats / 1MB" claim this map was briefed to expect |

### 3a. `AGENT-TEST-Wedding-Cake-Cond-20260519` — a named File-section fixture that did not show one

Brief-established facts list this SKU as carrying an **Image** (File-type, optional) section. Live, only
two sections rendered: **Base** (Product, required) and **Creme** (Product, optional — options include a
`None` radio, currently selected). No third/File section appeared, and an attempt to select a non-`None`
Creme option to test for a conditional reveal did not register (radio stayed on `None` after the click).
**Recorded as `UNVERIFIED`, not `DRIFT`** — a conditional File section gated behind a specific Creme
selection remains plausible and was not disproven, only not reached (G5).

### 3b. NOT manageable from storefront

Section reordering, section type, required/optional flag — all Admin-only (as expected). No observed way
to remove or replace a single already-selected configuration option without restarting the whole
configuration block (not exercised against a live cart this pass — out of scope under this run's
constraints; established-fact-adjacent, not directly confirmed).

---

## §4 — API / contract surface

Established facts (treated `CONFIRMED` — session pre-flight, cross-checked against
`.claude/knowledge/api/graphql-schema.md`, live-introspected 2026-09-11, 5 days before this map):

- **Query:** `productConfiguration(configurableProductId, storeId, userId, cultureName, currencyCode)` →
  `configurationSections{id,name,description,isRequired,type,allowCustomText,allowTextOptions,maxLength,dependsOnSectionId,options}`.
  Confirmed present at `graphql-schema.md:122`.
- **Line-item types:** `CartConfigurationItemType` (full, incl. `selectedForCheckout`) ·
  `OrderConfigurationItemType` (same minus selection) · `QuoteConfigurationItemType` (**drops
  `sectionId`/`sectionName`** — VCST-5431 gap, carried forward, not closed). Three parallel
  `{Cart,Order,Quote}ConfigurationItemFileType{url,name,size,contentType}`.
- **Write path:** `addItem(command: InputAddItemType)` — `configurationSections: [ConfigurationSectionInput]`
  = `{sectionId, type, option, customText, fileUrls}`, confirmed present at `graphql-schema.md:548`.
  `fileUrls` is **client-supplied** — the mutation does not itself validate that a URL was produced by the
  upload endpoint (established fact; not independently re-tested this pass — a spoofed/foreign URL was
  not attempted, see G2).
- **File mechanism (REST, not GraphQL):** `POST /api/files/product-configuration` (FileExperienceApi scope
  `product-configuration`) → `{succeeded, scope, name, size, contentType, id, url, publicUrl}`, `url`
  **relative** (`/api/files/<id>`). Server enforces an extension allowlist — `.doc .rtf .docx .txt .pdf
  .xls .xlsx .jpg .png .odt` — **checked by extension, not content** (established fact: same bytes renamed
  `.txt` pass). Always serves `content-disposition: attachment`. Access: unattached file readable
  anonymously; attached to a cart, anon/other-buyer gets 403, owner gets 200. The storefront domain is
  cookie-session based and rejects bearer tokens with 401.

### 4a. Reachable in only one layer

**REST-only:** the file upload/access-control mechanism itself; the extension allowlist enforcement.
**GraphQL-only:** the configured price computation and the `fileUrls`-as-plain-strings write path — no
GraphQL mutation validates a file was uploaded through the REST endpoint before accepting its URL into a
cart line (this is the shape of G2, not yet exercised as a probe).

---

## §5 — Where the layers DISAGREE

| # | Disagreement | Verdict |
|---|---|---|
| **D1** | **The PDP File dropzone copy this map was briefed to expect ("any formats… 1MB… max 5 files") does NOT reproduce on vcptcore-qa1, 2026-09-16.** The live copy instead states the **exact** extension allowlist (`DOC, RTF, DOCX, TXT, PDF, XLS, XLSX, JPG, PNG, ODT`) — which matches the server-enforced allowlist byte-for-byte — plus **9.5MB** (not 1MB) and **max 5 files** (this part matched). The 2026-03-16 BA report independently measured "~9.5MB" on a different env (vcst-qa), which is consistent with this pass's 9.5MB, not with the brief's 1MB. | `CONFIRMED` live 2026-09-16, **contradicts the brief's stated known-disagreement**. Read as: either the copy was already fixed to match the allowlist by the time of this build, or the "any formats/1MB" text belongs to a different product/section/env than the one checked here. Whoever supplied that established fact should re-source it — this map cannot confirm it as currently true anywhere it looked |
| **D2** | **Two different product-detail route shapes coexist on one PDP.** The configurable parent resolves at `/<slug>` (SEO-friendly); every Product-type option/sibling link observed resolves at `/product/<guid>` (raw GUID, no slug). A customer clicking an option's own product name leaves the configured-parent context for a differently-shaped URL | `CONFIRMED` live 2026-09-16, on two independent products (`AGENT-TEST-Req-File-Child`, `AGENT-TEST-Wedding-Cake-Cond`) |
| **D3** | **A fixture named as carrying a File section did not render one live**, and a follow-on section only reachable after a specific sibling selection was not confirmed to exist. Established facts (session pre-flight) name `AGENT-TEST-Wedding-Cake-Cond-20260519` as one of four File-bearing configurable products; live, its second section ("Creme") is Product-type, and no File/Image section appeared without a successful Creme selection (which this pass could not force through the UI — see G5) | `UNVERIFIED`, not asserted as drift — see §3a |
| **D4** | **The catalog inventory this map was briefed with is smaller than what Admin shows live.** Established facts describe "16 configurable products… dated 20260519" across implied catalogs; Admin's catalog root live-lists a fourth configuration-fixture catalog, `SEED-20260527-Configurables-Default`, dated eight days later and named nowhere in the brief | `CONFIRMED` to exist (catalog-list row observed); contents `UNVERIFIED` (G4) |

**No published-guide comparison could be attempted** — VirtoOZ MCP required authorization this session
lacked (§ frontmatter `sources`, G8). Any docs-vs-build disagreement a future pass finds should be added
here as new rows, not folded into the above.

---

## §6 — Coverage shape

**Basis:** `config/test-suites.json` `selections.configurable-products = {where:{tag:"configurable-products"}}`,
cross-checked by direct `grep` over `regression/suites/**` for "configurable" (2026-09-16).

| Suite | Rows | Tags include |
|---|---|---|
| `050i` GraphQL Configurable Products | 60 | `graphql, xapi, configurable-products, configurations` |
| `052` Configurable Products Admin | 31 | `configurable-products, admin, configuration` — `envRiskGate: staging`, `requiresModules: [catalog]` |
| `072` Configurable Products UI — Sections, Cart & Checkout | 57 | `configurable-products, storefront, pdp, widget` |
| `072b` Configurable Products E2E | 76 | `configurable-products, e2e, admin-to-storefront` |
| `072c` Configurable Products Cross-Cutting | 30 | `configurable-products, cross-browser, graphql, security` |
| `072d` Configurable Products File & Text Sections | 26 | `configurable-products, file-upload, text-input, validation` |
| `072e` Conditional Sections & Field Behaviour | 56 | `configurable-products, storefront, pdp, widget, conditional-sections` |

**Total: 7 suites, 336 rows** — matches this run's established fact exactly (60+31+57+76+30+26+56=336).

### 6a. Suites the tag list MISSES that carry real configurable-product content

Found by grepping for "onfigurable" across untagged suites (case-insensitive, count of matching lines,
2026-09-16):

| Suite | Matching lines | Note |
|---|---|---|
| `009` B2B Variations & Configs (`Frontend/b2b/`) | 25 | Untagged `configurable-products`; overlaps the domain by name and content |
| `098` Product Compare (`Frontend/catalog/`) | 12 | The VCST-5735 test model's scenarios 12,13,16,17,19,20,21 sit here — configurable-product identity/pricing on the COMPARE surface, not the PDP |
| `050b2` GraphQL xCart Items | 4 | Cart-line-level config assertions, untagged |
| `050a` GraphQL xCatalog | 4 | Catalog-level config field assertions, untagged |

### 6b. Zero / near-zero coverage (this pass's read, not a full case-by-case audit — `/qa-review-tests` owns that)

| Area | Count | Basis |
|---|---|---|
| **A configuration file's own url/preview/download asserted anywhere** | **0** | Established fact from the brief's `tc:scope` scan — carried forward, not re-run this pass |
| **Quote-path `sectionId`/`sectionName` preservation** (VCST-5431) | **0** | The gap is structural (`QuoteConfigurationItemType` lacks the fields) — no case can assert what the schema does not carry |
| **Cross-layer parity: Admin section-order vs stored `displayOrder` vs PDP render order** | `UNVERIFIED` this pass | Historical (2026-03-16) BA report found 100% consistency on ONE product on a different env; not re-checked here |
| **The `withoutFileSections` cart-identity collapse (established fact / VCST-5735 scenario 16)** | `UNVERIFIED` whether any of the 336 rows assert it directly | Not grepped for by assertion content this pass — G9 |
| **The file-upload endpoint's anonymous-caller / spoofed-URL boundary** (§4 G2) | `UNVERIFIED` | Not probed this pass |

---

## §7 — Open gaps

| # | Gap | State |
|---|---|---|
| **G1** | Field-level, live Admin SPA re-verification of the historical (2026-03-16, different env) section/option edit forms and the option-drag-handle bug | **OPEN.** Superseded by G7 below — same gap, this map's own attempt |
| **G2** | Does `addItem`'s `configurationSections.fileUrls` validate that the URL was produced by `POST /api/files/product-configuration` (vs. an arbitrary/foreign URL)? | **OPEN.** Not probed this pass; a write-path trust boundary worth a dedicated case |
| **G3** | Is there ANY reverse edge for an attached configuration file — detach, delete, replace without re-adding the whole line? | **OPEN.** No forward-only assumption should be filed as a defect without first confirming absence via source, not just UI absence |
| **G4** | Contents and purpose of catalog `SEED-20260527-Configurables-Default`, found live but unnamed in this run's brief | **OPEN.** Needs a live drill-down or the seeder script that created it |
| **G5** | Does `AGENT-TEST-Wedding-Cake-Cond-20260519` carry a conditional File/Image section reachable only after a specific Creme selection? | **OPEN.** UI click to select a non-`None` Creme option did not register in this session; needs a retry with a different interaction path (e.g. the visible label/link rather than the radio input) |
| **G6** | Where do the storefront's file-upload constraint numbers (9.5MB / 5 files, and the allowlist string) come from — theme `settings_data.json`, a module constant, or hardcoded copy? | **OPEN, carried from the brief.** No GitHub MCP access this session to search `vc-frontend`/module source; no local match in `.claude/knowledge/automation/storefront-config-flags.md` |
| **G7** | Live Admin SPA drill-down into a specific product's Configuration widget (sections list, option grid, edit forms) | **OPEN.** Session navigated to the Catalog root and one candidate catalog but did not reach a product edit blade before this pass's time budget closed |
| **G8** | Every published-guide cross-reference this map's methodology calls for (§3's highest-value shape) | **OPEN.** VirtoOZ MCP requires OAuth authorization not available this session; Context7 fallback also listed as requiring authorization. No doc-vs-build row exists in §3 as a result — this is a methodology gap, not a "guides agree" finding |
| **G9** | Whether any of the 336 tagged rows assert the `withoutFileSections` cart-identity collapse | **OPEN.** Needs a content grep for the specific assertion shape, not just the "configurable-products" tag |

---

## §6-prior — Prior-art verdicts

The one prior-art doc (`BA-REPORT-configurable-products-sorting.md`, 2026-03-16, **vcst-qa**, platform
2.44.0-pr-2100 / Admin SPA 3.1007.0) is **six months old and on a different environment** than this map
(vcptcore-qa1, platform 3.1065.0). Its findings are carried as historical pointers, **not** re-asserted as
current:

| Claim | Verdict |
|---|---|
| Four section types (Product, Variation, Text, File); Variation sections render empty ("known bug, March 13 regression") | **Not comparable across env/build** — this session's established facts for vcptcore-qa1 name only Product/Text/File as observed; whether Variation exists/works on this env is `UNVERIFIED`, not confirmed absent |
| No Admin option display-order mechanism; drag handle non-functional | `UNVERIFIED` this pass (G7) — not re-opened live |
| File section max size "~9.5MB" | **Consistent** with this pass's live-observed 9.5MB (D1) — the one point of continuity across env/build/six months |
| PDP price-sort bug (`minVariationPrice` not used as sort key) | Out of this map's scope (a search/listing defect, not a configuration-surface one) — not re-verified, no claim made either way |
| Admin insertion order = API order = storefront render order, 100% consistent (one product, `Configurable Hat`) | `UNVERIFIED` this pass — different env, single-product sample, not re-run |

The VCST-5735 test model (2026-09-03, `vc-frontend` PR #2452, Compare-products feature) is **not** a
configurable-products deliverable — it borders this domain at cart-identity (`withoutFileSections`,
scenario 16) and section-label collapse (`add-to-compare-catalog.vue` dropping `id`, scenario 17), both
carried into §1 link 6 and §7 G9. Its own note stands: **"NO `BL-*` invariant exists for compare
itself… every rule above is borrowed"** — for THIS domain, `BL-CAT-006` is the one load-bearing invariant
identified, and PROPOSED-BL-CAT-013..019 from that model were never minted into `business-logic.md`
(current highest is `BL-CAT-012`) — they remain proposals, not oracles, and this map does not promote them.
