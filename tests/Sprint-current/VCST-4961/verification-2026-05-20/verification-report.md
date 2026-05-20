# VCST-4961 — Fix Verification Report

**Ticket:** VCST-4961 — Cart configurable item: `selectedForCheckout` not preserved across `changeCartConfiguredItem` (Edit Configuration → Update Cart)
**Date:** 2026-05-20
**Environment:** vcst-qa (`https://vcst-qa-storefront.govirto.com`, BACK_URL via `.env`)
**Method:** Canonical GraphQL runner (`scripts/graphql-runner.ts`) — runner-native CSV cases. No browser fallback needed.
**Verdict:** **VERIFIED**

---

## Build under test

| Component | Version |
|---|---|
| Platform | 3.1028.0 |
| **VirtoCommerce.XCart** | **3.1015.0-pr-119-6a09** (PR #119 head SHA `6a09301`) |
| VirtoCommerce.Cart | 3.1003.0 |
| Theme | 2.49.0 |

PR #119 (`vc-module-x-cart`) adds `PreserveSelectedForCheckoutFromOldConfiguration` inside `ChangeCartConfiguredLineItemCommandHandler` to carry the previous `selectedForCheckout` flag over when a configured line item is rebuilt, and threads `selectedForCheckout` through `CreateConfiguredLineItemHandler` → `AddProductSectionLineItem` so the input flag is honored on first add (Issue-A path).

---

## Test cases authored (canonical runner)

Three new runner-native rows appended to `regression/suites/Backend/graphql/050i-graphql-configurations.csv`:

| Case ID | Path under test | Pre-fix expectation | Post-fix expectation |
|---|---|---|---|
| `CFG-GQL-VCST4961-A` | `changeCartConfiguredItem` Edit-and-Update, sections previously `true` | flag silently kept `true` (no-op) | flag still `true`, listPrice reflects new RAM option (Storage unchanged) |
| `CFG-GQL-VCST4961-B` | **PRIMARY**: `changeCartConfigurationItemSelected(false)` → `changeCartConfiguredItem` with NEW RAM option | flag silently re-enabled (`false` → `true`), listPrice climbs back up | flag stays `false`, listPrice stays at deselected total ($999) |
| `CFG-GQL-VCST4961-C` | `addItem` with `option.selectedForCheckout: false` on a fresh cart (Issue-A) | input flag ignored, defaults to `true` | input flag honored, configurationItem has `selectedForCheckout: false` |

Both A and B include a third `changeCartConfiguredItem` step with identical sections to verify the BL-CART-013 no-change short-circuit (listPrice unchanged from prior reedit). C is a single-shot Issue-A probe.

CSV lint: `npm run graphql:lint-labels -- regression/suites/Backend/graphql/050i-graphql-configurations.csv` → `49 rows, 49 runner-native — No findings`.

---

## Live data (captured at runtime via productConfiguration discovery, NOT hardcoded)

| Variable | Value | Source |
|---|---|---|
| `@td(CFG_LAPTOP.id)` | `dd56d770-3c3b-4e09-b126-0c2bb8bd0f72` | `test-data/aliases.json` v1.5.3 |
| SECTION_RAM_ID | `5190d8cc-56f5-4675-9a34-d94c28f306f7` | productConfiguration[0].id |
| SECTION_STORAGE_ID | `e5fbc712-8697-4c48-b4f4-a8943f8d3d21` | productConfiguration[1].id |
| OPT_RAM_BASE_ID | `b147e934-6255-4a39-902c-17a816591932` | RAM section options[0] (base, +$100) |
| OPT_RAM_UPGRADE_ID | `fb7997e5-c00d-448e-88cd-02bea0e786fe` | RAM section options[1] (upgrade, +$250) |
| OPT_STORAGE_BASE_ID | `efda4b3d-5843-4dc1-961b-965b8f423d14` | Storage section options[0] (base) |
| BASE_LIST_PRICE | $1099 | addItem(BASE,BASE) listPrice (incl. RAM contribution) |
| LISTPRICE_AFTER_DESELECT (CASE B) | $999 | After flipping RAM `selectedForCheckout=false` (BL-CART-010 reprice down: −$100 RAM) |
| LISTPRICE_AFTER_REEDIT (CASE A) | $1249 | After swapping RAM BASE→UPGRADE while both selected (+$150 delta) |
| LISTPRICE_AFTER_REEDIT (CASE B) | $999 | After swapping RAM BASE→UPGRADE WHILE deselected — proves no contribution + flag preserved |

---

## Per-run results (3 consecutive end-to-end runs)

### CASE A — `selectedForCheckout=true` preserved across re-edit

| Run | Verdict | Assertions | Evidence |
|---|---|---|---|
| Run 1 | **PASS** | 13/13 | `evidence/run1/caseA.json` |
| Run 2 | **PASS** | 13/13 | `evidence/run2/caseA.json` |
| Run 3 | **PASS** | 13/13 | `evidence/run3/caseA.json` |

Each run observed the same listPrice trajectory: BASE $1099 → reedit (RAM→UPGRADE) $1249 → nochange_short $1249 (identical to reedit — BL-CART-013 short-circuit confirmed). Both configurationItems retained `selectedForCheckout: true` after reedit and after nochange.

### CASE B — `selectedForCheckout=false` preserved across re-edit (PRIMARY fix path)

| Run | Verdict | Assertions | Evidence |
|---|---|---|---|
| Run 1 | **PASS** | 16/16 | `evidence/run1/caseB.json` |
| Run 2 | **PASS** | 16/16 | `evidence/run2/caseB.json` |
| Run 3 | **PASS** | 16/16 | `evidence/run3/caseB.json` |

Each run produced the identical fingerprint of the fix:
- addItem → RAM `selectedForCheckout=true`, listPrice **$1099**
- `changeCartConfigurationItemSelected({sectionId: RAM, ...}, false)` → RAM `selectedForCheckout=false`, listPrice **$999** (BL-CART-010 reprice down by RAM contribution)
- `changeCartConfiguredItem` with RAM swapped to UPGRADE option → **RAM `selectedForCheckout` STILL `false`** (preserved), Storage still `true`, RAM productId now points to UPGRADE GUID, **listPrice STILL $999** (UPGRADE does not contribute because RAM is deselected)
- Repeated `changeCartConfiguredItem` with identical sections → RAM still `false`, Storage still `true`, listPrice still $999 (BL-CART-013 no-change short-circuit)

This is the exact post-fix behavior described in JIRA comment #2. Pre-fix, the third step would have flipped RAM back to `true` and listPrice would have climbed (e.g., to $1249), which we **did not observe**.

### CASE C — Issue-A new-section path (`addItem` honors `option.selectedForCheckout: false`)

| Run | Verdict | Assertions | Evidence |
|---|---|---|---|
| Run 1 | **PASS** | 4/4 | `evidence/run1/caseC.json` |
| Run 2 | **PASS** | 4/4 | `evidence/run2/caseC.json` |
| Run 3 | **PASS** | 4/4 | `evidence/run3/caseC.json` |

`addItem(CFG_LAPTOP, RAM: {option.selectedForCheckout=false, BASE}, Storage: default)` returned `itemsCount=1`, RAM configurationItem `selectedForCheckout=false`, Storage `selectedForCheckout=true`. Confirms `CreateConfiguredLineItemHandler` / `AddProductSectionLineItem(selectedForCheckout: …)` threading is working.

---

## `selectedForCheckout` flag-state matrix (CASE B, all 3 runs identical)

| Step | RAM `selectedForCheckout` | Storage `selectedForCheckout` | RAM productId | listPrice |
|---|---|---|---|---|
| 1. `addItem` (BASE+BASE) | `true` | `true` | BASE | $1099 |
| 2. `changeCartConfigurationItemSelected(RAM, false)` | **`false`** ← user explicit deselect | `true` | BASE | $999 |
| 3. `changeCartConfiguredItem(RAM→UPGRADE, Storage=BASE)` | **`false`** ← PRESERVED (the fix) | `true` | **UPGRADE** | $999 |
| 4. `changeCartConfiguredItem(RAM=UPGRADE, Storage=BASE)` (no-change) | **`false`** | `true` | UPGRADE | $999 |

Pre-fix step 3 would have shown `true` and ~$1249 instead.

---

## Regression / cross-layer checks

| Check | Result | Evidence |
|---|---|---|
| BL-CART-010 reprice-down on deselect | PASS | `flip_off_ram` listPrice = 999 (vs base 1099) |
| BL-CART-013 no-change short-circuit on identical sections | PASS | `nochange_short` listPrice equals `reedit_swap_ram` listPrice exactly, no `validationErrors`, no `errors[]` |
| GraphQL `errors[]` empty across all 9 mutations in CASE B run | PASS | Every step `200 OK — 0 errors` in runner log |
| HTTP 200 across all 19 cleanup_pre/EXEC/cleanup_post calls per run | PASS | Runner network logs in `evidence/runN/caseB.json` |
| Adjacent cart mutations sane (`clearCart`, `changeCartConfigurationItemSelected`, `changeCartConfiguredItem`) | PASS | All return 200 with `errors[] empty` |
| Schema introspection — `ConfigurableProductOptionInput.selectedForCheckout: Boolean` | PASS | Runner accepted the input field without DV-008 (cached schema, build 3.1015.0-pr-119) |
| Schema introspection — `CartConfigurationItemType.selectedForCheckout: Boolean!` | PASS | Selection set returns boolean in every response captured |
| Issue-A new-section path (`addItem` first-time honor of `option.selectedForCheckout`) | PASS | CASE C 3/3 PASS |
| Idempotency (3 consecutive end-to-end runs, clearCart between) | PASS | Identical capture values across runs 1/2/3 (RAM section ID, option IDs, BASE_LIST_PRICE=1099, LISTPRICE_AFTER_DESELECT=999, LISTPRICE_AFTER_REEDIT=999 every run) |

No console errors observed (runner is browserless, no JS). No HAR needed.

---

## GraphQL errors observed

**None.** Across 9 runs (3 cases × 3 iterations) of typically 8-10 GraphQL operations each (~84 operations total), every `responses[label].errors` array was empty. No 4xx, no 5xx, no `validationErrors`. Verbatim sample from CASE B Run 1:

```
• [GQL-EXEC add_item] POST /graphql                          200 OK — 468ms — 0 errors
• [GQL-EXEC flip_off_ram] POST /graphql                      200 OK — 816ms — 0 errors
• [GQL-EXEC reedit_swap_ram] POST /graphql                   200 OK — 742ms — 0 errors
• [GQL-EXEC nochange_short] POST /graphql                    200 OK — 1720ms — 0 errors
• [GQL-EXEC cleanup_post] POST /graphql                      200 OK — 5366ms — 0 errors
```

---

## Decision matrix

| STR (1+2) | Regression (4-7) | Cross-Layer (8-9) | Edge (10) | Verdict |
|---|---|---|---|---|
| **3/3 PASS** | **All PASS** | **All PASS** | **PASS** | **VERIFIED** |

---

## Evidence layout

```
tests/Sprint-current/VCST-4961/verification-2026-05-20/
├── verification-checklist.md           (pre-existing)
├── verification-report.md              (this file)
└── evidence/
    ├── run1/
    │   ├── caseA.json caseA.log
    │   ├── caseB.json caseB.log
    │   └── caseC.json caseC.log
    ├── run2/
    │   ├── all.log
    │   ├── caseA.json caseB.json caseC.json
    └── run3/
        ├── all.log
        ├── caseA.json caseB.json caseC.json
```

Each `caseX.json` is the canonical runner evidence object (responses per step, captured variables, per-assertion pass/fail, elapsed timings). Authoritative copies also under `reports/regression/graphql-evidence/`.

---

## CSV diff summary

`regression/suites/Backend/graphql/050i-graphql-configurations.csv` grew from 46 to 49 runner-native cases. New rows:

- `CFG-GQL-VCST4961-A` (Critical) — preserve `true` across re-edit
- `CFG-GQL-VCST4961-B` (Critical) — preserve `false` across re-edit (PRIMARY)
- `CFG-GQL-VCST4961-C` (High) — Issue-A new-section path

All three use `@td(CFG_LAPTOP.id)` and live-discover section + option IDs via `productConfiguration` — no hardcoded GUIDs in test logic. Inputs comply with `.claude/rules/test-data.md` and `feedback_no_hardcoded_guids_in_scripts`.

Lint clean. Schema valid against build 3.1015.0-pr-119 cached schema.

---

## Verdict

**VERIFIED** — VCST-4961 fix in `vc-module-x-cart` 3.1015.0-pr-119-6a09 (PR #119, head SHA 6a09301) is **WORKING AS DESIGNED** across all three documented code paths:

1. `selectedForCheckout=true` preserved when `changeCartConfiguredItem` rebuilds the line item (CASE A — 3/3 PASS, 13 assertions each)
2. `selectedForCheckout=false` preserved when `changeCartConfiguredItem` rebuilds the line item (CASE B — 3/3 PASS, 16 assertions each — **PRIMARY fix path**)
3. `option.selectedForCheckout` honored at first `addItem` for a section the cart didn't previously have (CASE C — 3/3 PASS, 4 assertions each — Issue-A path)

The fix path `PreserveSelectedForCheckoutFromOldConfiguration` does the right thing in both flag directions; the `AddProductSectionLineItem(selectedForCheckout: …)` threading honors input on first add. The BL-CART-013 no-change short-circuit is also intact (listPrice unchanged on identical-sections reedit). BL-CART-010 reprice-down on deselect remains intact.

Recommended JIRA actions:
- Transition VCST-4961 → **VERIFIED / Done**
- Add this report as a JIRA comment with link to evidence
- Promote `CFG-GQL-VCST4961-A/B/C` to the standard 050i suite (already done — committed as part of this verification)
