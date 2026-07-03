# Test Case Lifecycle Report — TLC-2026-07-02-2043

## Summary
- **Input:** `review, verify, fix 067`
- **Input Type:** direct-scope (sync/generate skipped)
- **Date:** 2026-07-02
- **Platform:** 3.1041.0 · **Theme:** 2.53.0-pr-2343
- **Module Versions:** WhiteLabeling 3.1002.0, Customer 3.1013.0, Marketing 3.1006.0, Xapi 3.1012.0, XFrontend 3.1003.0
- **Verdict:** **APPROVED WITH WARNINGS**

## Phase Results

| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 1 suite (067), 40 cases |
| 2. Sync | — | Skipped | direct scope (staleness still caught opportunistically) |
| 3. Generate | — | Skipped | no new coverage requested |
| 4. Review & Fix | test-management-specialist | Done | 8 dimensions; format migrated, 40 rows re-wired, 9 GraphQL concretized, 7 deprecated |
| 5. Verify | qa-testing-expert | Done | 9/9 targets VERIFIED, 0 CHANGED/BROKEN/BLOCKED |
| 6. Approve | orchestrator | **APPROVED WITH WARNINGS** | 8/9 gates PASS, 1 WARN |

## Review Findings (before fix)

| Dimension | Finding | Severity | Offenders |
|---|---|---|---|
| Structure | Legacy 11-col format (siblings 070/071 are enriched 15-col) | Blocker | all 40 |
| Determinism | Vague GraphQL steps, no query text | Critical | WL-010, 017–023, 040 |
| Testability | DB-query step, no DB access in framework | Critical | WL-016 |
| Data Validity | 100% hardcoded entities | High | all 40 |
| Staleness | "Products" menu parent renamed to "Brands" (#79) | High | WL-018 |
| BL/ECL Coverage | No Business_Rule column (legacy) | High | all 40 |
| Duplication | Storefront rendering dupes Frontend 070/071 | Medium | WL-029–035 |
| Traceability | Critical/High cases with TestRail-only refs | High | WL-001,002,003,005,008,011 |

## Fixes Applied
- **Format migration** → enriched 15-column agent-native format mirroring 070 (`[PRE:*]`, `[NAV]/[ACT]/[WAIT]` steps, `[DOM]/[STATE]/[FORM]/[NULL]/[PERF]` assertions, Cross_Layer_Checks, Failure_Signals, Cleanup).
- **All 40 rows re-wired** to `@td()`/`{{VAR}}` — `WL_ELECTRONICS/WL_FASHION/WL_DEFAULT/WL_MENU_ONLY/WL_FOOTER_ONLY` orgs, `WL_USER_*` personas, `STORE_PRIMARY`, link-list aliases. Zero literals.
- **WL-018 staleness** → parent now `Brands` (`/brands`) → Laptops/Phones/Tablets via `@td(WL_ELECTRONICS.main_menu)`; References annotated `Synced: Products→Brands rename #79 (2026-07-02)`.
- **9 GraphQL cases concretized** — real `whiteLabelingSettings` queries validated against `graphql-schema.md` + WL knowledge; deterministic assertions on hierarchy/priority/`errors[]`. WL-019 uses genuinely-NULL `WL_DEFAULT`; WL-020 corrupts+restores `WL_MENU_ONLY` list name (non-existent-list case) in Cleanup; WL-021 cross-checks WL_ELECTRONICS vs WL_FASHION isolation.
- **WL-016** rewritten as indirect observable test (Admin-UI save of realistic + empty value, cross-ref WL-017/019 GraphQL resolution) — no DB access needed.
- **7 deprecations** (IDs retained, `Automation_Status: deprecated`, stub points at canonical suite): WL-029→FWL-021, WL-030→FWL-022, WL-031→FWL-023/034, WL-032→FWL-038, WL-033→FWL-044/047, WL-034→FWL-029, WL-035→FWL-029/030 (all in 070/071).
- **BL-WL-* mapping** applied to all 33 active rows.

## Environment Verification (Phase 5, vcst-qa — all VERIFIED)

| Target | Result | Detail |
|--------|--------|--------|
| Store WL blade + fields | VERIFIED | Enabled/Logo/Favicon/Theme(select)/Footer + Main-menu present |
| Org WL blade | VERIFIED | Contacts → org → Manage → White labeling |
| **"Main menu link list" label/placeholder** | **VERIFIED (exact match)** | label "Main menu link list", placeholder "Enter link list name..." — WL-024/028 text safe as-is |
| Footer link list (org) | VERIFIED | placeholder "Enter footer link list name...", value footer-fashion |
| **`whiteLabelingSettings.mainMenuLinks{childItems}`** | **VERIFIED (VCST-4637 deployed)** | HTTP 200, no errors[]; Shop→Men/Women/Kids hierarchy, footerLinks(4), theme "Coffee" |
| Storefront header nav | VERIFIED | `<nav "Main navigation">` renders Support/Company/Brands/Home |

Ran on playwright-chrome (Firefox admin left-nav `li.__animated` stability quirk; Edge locked by another agent). No screenshots — all VERIFIED per evidence policy.

## Quality Gates

| Gate | Status | Details |
|------|--------|---------|
| G1 Structure | PASS | Migrated to 15-col; 41 rows, 15 cols, 40 unique IDs, no parse errors |
| G2 Determinism | PASS | GraphQL cases now carry concrete queries + assertions |
| G3 Completeness | PASS | Assertions/Failure_Signals/Cleanup/errors[] added |
| G4 Testability | PASS | WL-016 converted to observable indirect check |
| G5 Data Validity | PASS | `td:validate` 162/162 resolved, 0 hardcoded GUIDs |
| G6 Coverage | **WARN** | BL-WL 20/20 P0/P1 mapped, but `BL-WL-001..004` not yet formal in `business-logic.md` (quasi-formal convention shared with 070/071) |
| G7 Duplication | PASS | Cross-layer dupes deprecated in favor of 070/071 |
| G8 Environment | PASS | 9/9 VERIFIED, env healthy |
| G9 Sync | PASS (n/a) | direct scope; Products→Brands staleness fixed opportunistically |

## Remaining Items

### Must Fix (blocks regression)
_None._

### Should Fix / Human Decision
| # | Item | Owner |
|---|------|-------|
| 1 | Promote a formal `BL-WL-001..004` domain into `business-logic.md` (per `feedback_business_logic_promotion`, not auto-applied). 067/070/071 already share these IDs by convention. | qa-lead |
| 2 | REQ-001: WL-001/002/003/005/008/011 carry TestRail `C-xxxxx` only, no `VCST-XXXX` (predate VCST-4637). Supply ticket or accept as documented exception. | user |
| 3 | Confirm the 7 WL-029–035 deprecations stand (org-switch WL-034/035 are 1:1 with 071 FWL-028–032). | qa-lead |
| 4 | Incidental: store-level WL blade also exposes "Main menu link list" (not org-exclusive) — consistent with WL knowledge (mainMenuLinks is Store/Org level); no case asserts exclusivity, so no change. | — |

### Not promoted
All 40 rows remain `Automation_Status: Manual` (33 active) / `deprecated` (7). No Draft→Reviewed/Automated promotion — requires explicit approval.

---

## Addendum — Source Verification, BL Promotion & Master-Switch Reconciliation (post-review)

Grounded against VirtoOZ + `vc-module-white-labeling` source + `vc-frontend` source. Two suite defects the static review couldn't see, plus a formal invariant correction:

**Source-verified corrections to suite 067:**
- **Upload types (WL-003/004/005):** logo = **PNG/GIF/SVG**, favicon = **PNG/JPG/WEBP** (`en.WhiteLabeling.json` filters). Suite had claimed logo "PNG/SVG/JPG" — JPG is not a logo type. Fixed.
- **Master switch (WL-012/013/014) — two-layer model:**
  - **Layer 1 — store master switch:** the store-level public setting `WhiteLabeling.WhiteLabelingEnabled` (default true), enforced in the storefront (`useWhiteLabeling.ts` — `if (!moduleEnabled) return`). OFF ⇒ no WL fetched/applied ⇒ theme defaults **including for org users**. → WL-012.
  - **Layer 2 — per-record `IsEnabled`:** the xAPI merge (`GetWhiteLabelingSettingsQueryHandler`) resolves org+store records per-field, org-preferred; a disabled/absent store *record* removes only the store's contribution and does NOT suppress an enabled org. → WL-014.
  - Both proven by source; Layer 2 also live-verified (non-destructive) on vcst-qa. (Testcount stays 40 — the two layers are split across the existing WL-012/WL-014; no new case added.)

**BL promotions (business-logic.md — approved):** new **Domain 19: White Labeling (BL-WL-001..006)**; **BL-B2B-006** reconciled to the two-layer model and pointed at Domain 19. Coverage Summary table intentionally not auto-edited (per promotion rule). BL-CROSS-008 (not the non-existent BL-B2B-011) used for the org-switch stubs.

## Quality Gate delta
G6 Coverage **WARN → PASS** (BL-WL now formal; 41/41 active cases map to a formal BL-WL/BL-CROSS ID).

## Files Modified
- `regression/suites/Backend/whitelabeling/067-whitelabeling-admin.csv` — enriched migration, @td() wiring, GraphQL concretized, upload-ext fix, master-switch two-layer split across WL-012 (Layer 1) / WL-014 (Layer 2). testCount unchanged at **40** (`config/test-suites.json` not modified).
- `.claude/agents/knowledge/oracles/business-logic.md` — Domain 19 BL-WL-001..006; BL-B2B-006 corrected.
- `.claude/agents/knowledge/domain/white-labeling.md` — two-layer enable model + per-field merge.

## Remaining / Human Decisions
- **REQ-001:** WL-001/002/003/005/008/011 carry TestRail-only refs (no VCST) — supply or accept.
- **BL-WL-005 (Store XOR Org):** no coverage; WL-041 reserved. Needs `qa-backend-expert` to confirm the reachable UI/API path before authoring.
- **Store WL blade "Enabled" toggle:** confirm whether it writes the Layer-1 setting or the Layer-2 record (WL-012 anchors on the setting name to stay unambiguous either way).
- **Coverage Summary table** in business-logic.md: fold in BL-WL rows (human, per rule).
- **7 deprecations (WL-029..035):** qa-lead confirm.

## Next Steps
- [ ] user/qa-lead: resolve REQ-001 + BL-WL-005 path + confirm deprecations
- [ ] Run `/qa-regression whitelabeling` (067 + 070 + 071)
