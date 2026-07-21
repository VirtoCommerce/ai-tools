# Test Case Lifecycle Report — TLC-2026-07-21-1526

## Summary
- **Input:** VCST-5515 (JIRA) → PR VirtoCommerce/vc-module-pagebuilder#156
- **Input Type:** change-source
- **Date:** 2026-07-21
- **Deployed build (vcst-qa, confirmed Phase 5):** Platform `3.1046.0-pr-3078-95d6` · PageBuilderModule `3.1017.0-pr-156-59d4` (= PR #156 — **the VCST-5515 fix is live**)
- **Verdict:** **APPROVED** (all 4 cases VERIFIED environment-compatible; 2 accuracy fixes applied post-verification)

## Change Inventory
| Module | Layer | Files changed | Breaking | Behavior |
|--------|-------|---------------|----------|----------|
| Page Builder (Admin SPA `@vc-shell` shell) | L2 Admin, module-embedded frontend | `PageDetails.vue` (+2 lines) | No | `setBaseline()` now runs after `publishGroup()` and `unpublishGroup()`, clearing the false "Has unsaved changes" state |

Root cause (per PR #156 + live capture): `useBladeForm`'s baseline was never reset after publish/unpublish, so the form kept deep-comparing the reloaded item against a stale pristine snapshot → permanent false "unsaved changes" banner + armed `beforeunload` guard while server `hasChanges:false`.

## Phase Results
| Phase | Status | Notes |
|-------|--------|-------|
| 1. Scope | Done | Resolved to suite **059** (the existing Page Builder page-management suite), not a new suite. No dedicated PB suite gap — 059 already owns publish/unpublish. |
| 2. Sync | Done (no-op) | 059 is already shell-accurate (live `page-builder-shell` URLs, cites VCST-5417/4951/PR #126). No stale/broken cases from this change. |
| 3. Generate | Done | +4 cases (CMS-135..138) — the dirty-state/banner/`beforeunload` behavior was previously unasserted anywhere. |
| 4. Review | Done | Self-review vs 7 dimensions; structural + `@td()` gates green. |
| 5. Verify | Done | `qa-testing-expert` on playwright-edge walked all 4 cases live on vcst-qa. All VERIFIED (see table); 2 accuracy fixes fed back into the CSV. |
| 6. Approve | **APPROVED** | Cases ready for `/qa-regression 059` (or `cms`). |

## Phase 5 — Live Verification (vcst-qa, playwright-edge)
Disposable page `AGENT-TEST-5515-dirtystate-e2` (archived after). Console: 0 errors throughout.

| Case | Verdict | Observation |
|------|---------|-------------|
| CMS-135 | VERIFIED | Add→Save→Publish walkable; post-publish **no banner**, status Published, Save disabled, navigate-away clean — matches deployed fix. |
| CMS-136 | VERIFIED | Unpublish clean page → status Draft, no banner, Save disabled. |
| CMS-137 | VERIFIED* | Genuine edit → banner appears, Save enabled, Publish disabled. *Guard step reworded: in-app nav silently discards + native `beforeunload` auto-dismissed by automation → banner-appears is the automatable signal, reload/tab-close guard is manual-only. |
| CMS-138 | VERIFIED | Edit → banner → revert to original value → banner clears, Save disabled. |

**Fixes applied to the CSV after verification:**
1. CMS-137 navigate-away guard reworded (manual/reload-only; banner-appears is the automatable assertion). CMS-135 navigate-away note aligned.
2. Cleanup on CMS-135/136/138 changed from "delete → 404" to **Archive (terminal soft-delete; the shell UI has no hard delete)**.
3. Grounding baked in: banner `role=alert` "Has unsaved changes"; toolbar `data-test-id`s Save=`save`, Publish=`publishPage`, Unpublish=`unpublishPage`, Archive=`delete`; Language required; run on Edge/Chrome (Firefox `vc-select` quirk).

## Rename (display-name only, zero ripple)
- 059 `name`: "CMS Page Management" → **"Page Builder"**
- 060 `name`: "CMS Design & Content" → **"Page Builder — Design & Content"**
- Folder + CSV files renamed: `Backend/cms/` → **`Backend/page-builder/`**, `059-cms-page-management.csv` → `059-page-builder.csv`, `060-cms-design-content.csv` → `060-page-builder-design-content.csv`. Manifest `file` paths, `test-data/cms/pagebuilder-pages.md`, and the `regression.md` dir table updated to match.
- The `cms` **tag**, `content-cms` **domain**, and the `cms` **selection group** are **left intact** — so `/qa-regression cms` still resolves 059/060 unchanged.

## New Cases (suite 059, section "Dirty State (Unsaved Changes)")
| ID | Title | Priority | Guards |
|----|-------|----------|--------|
| CMS-135 | Publish a page — no stale banner after a clean publish (VCST-5515) | High | The fix: banner absent + no `beforeunload` after publish; UI matches server `hasChanges:false` |
| CMS-136 | Unpublish a clean published page — no stale banner (symmetry) | Medium | The symmetric `setBaseline()` after unpublish |
| CMS-137 | Genuine unsaved edit still raises banner + navigate-away guard | High | **Over-suppression guard** — fix must not mask real unsaved changes (data-loss risk) |
| CMS-138 | Reverting an unsaved edit clears the banner | Medium | Dirty flag tracks real form state (inverse staleness) |

## Coverage Delta
| Metric | Before | After |
|--------|--------|-------|
| Suite 059 case count | 46 | 50 |
| Post-publish dirty-state coverage | none | CMS-135..138 |

## Quality Gates
| Gate | Status | Detail |
|------|--------|--------|
| G1 Structure | PASS | 15/15 cols, 0 malformed rows, IDs unique (CMS-135..138; renumbered from an initial 131..134 to avoid a collision with pre-existing 060 case IDs) |
| G2 Determinism | PASS | Tagged Steps ([NAV]/[ACT]/[ASSERT]/[HTTP]/[REST]/[NAV]), explicit assertions |
| G5 Data Validity | PASS | `@td(STORE_PRIMARY.id)` + `{{BACK_URL}}` only; `td:validate` green, no bare GUIDs |
| G8 Environment | PASS | All 4 cases VERIFIED live on vcst-qa (playwright-edge); 0 shell console errors; fix deployed |

## Housekeeping (flagged by Phase 5, not actioned)
Stray leftovers from prior runs seen in the shell — candidates for a teardown sweep: `AGENT-TEST-5515-verify edited` (archived), `AGENT-TEST-CMS-picker`, `AGENT-TEST-059-mrunbkqn` (Drafts).

## Files Modified
- `config/test-suites.json` — 059/060 display names; 059 testCount 46→50, est 35→42
- `regression/suites/Backend/page-builder/059-page-builder.csv` (renamed from `Backend/cms/059-cms-page-management.csv`) — +4 cases (CMS-135..138), refined after Phase 5

## Live Execution (2026-07-21, qa-backend-expert, playwright-edge)
Ran CMS-135..138 live on vcst-qa @ PageBuilderModule `3.1017.0-pr-156-59d4` — **all 4 PASS**. One CSV correction applied afterward: CMS-136's REST assertion expected `hasChanges:false` after unpublish, but the server correctly returns `hasChanges:true` (an unpublished Draft now exists) — the defect surface is the absent banner, not that flag; assertion + failure-signal reworded. Bug report moved `reports/bugs/open/` → `reports/bugs/fixed/`. Cases were authored as CMS-131..134 and renumbered to 135..138 post-review to avoid an ID collision with pre-existing suite-060 cases of the same numbers.

## Next Steps
- [x] Live-ran CMS-135..138 → all PASS (see above)
- [ ] Close VCST-5515 → Done after PR #156 human review + merge (verification already PASS)
