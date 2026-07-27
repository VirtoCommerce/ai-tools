# VCST-5417 Fix Verification — [Page Builder] Published page loses ALL content after rename → Save → Publish

**Verdict: PASS** · STR result **3/3** · Checklist **10 PASS / 0 FAIL / 0 BLOCKED**

**Env:** vcst-qa @ Store `B2B-store` · PageBuilderModule `3.1018.0-pr-151-880b` (base 3.1018.0 ≥ 3.1015, fix present) · Browser: playwright-edge
**Owning layer:** Layer 4 — Platform REST (PageBuilder module grouped-page versioning + publishing)
**Oracle:** authoritative check = `GET /api/page-builder-pages/grouped/{groupId}/content` (block count) + grouped `pages[]` version array. Designer UI treated as non-authoritative (known double-fetch/stale-state race).

## Summary
Created a throwaway Published page with 2 content blocks (groupId `439e7961…`), then ran the full rename → Save → Publish cycle 3 consecutive times (Name-only, Name+Permalink, Permalink-only). After every cycle the published content endpoint returned the intact block set and the group held exactly **one Published version with no empty-version accumulation**. The reported data-loss does NOT reproduce — the fix (PR #116 `CopyPageContentAsync` + PR #133 draft-seed-from-Published + `NormalizePublishedPages`) is confirmed working.

## STR result — 3 consecutive cycles (REST oracle)

| Cycle | Rename applied | published blockCount | types | groupName | permalink | publishedVersions | totalVersions | Result |
|-------|----------------|----------------------|-------|-----------|-----------|-------------------|---------------|--------|
| Baseline | — | 2 | title,text | AGENT-TEST-5417-base | agent-test-5417-base | 1 | 1 | — |
| 1 | Name only | **2** | title,text | AGENT-TEST-5417-r1 | (unchanged) | 1 | 1 | ✅ |
| 2 | Name + Permalink | **2** | title,text | AGENT-TEST-5417-r2 | agent-test-5417-r2 | 1 | 1 | ✅ |
| 3 | Permalink only | **2** | title,text | (name unchanged) | agent-test-5417-r3-permalink-only | 1 | 1 | ✅ |

Content block count held at 2 across all 3 cycles; content endpoint never returned empty. Each cycle created a NEW inner page version (published id churned `6587a17c → 1ce2405d → 5eac0ccb → 2ffaa36c`) seeded from the prior Published content, and the superseded version was removed — `totalVersions` stayed **1** (no Archived-empty accumulation, consistent with `NormalizePublishedPages`).

## Root-cause behavior confirmed (fix)
- New inner version is **seeded from the currently-Published content** before promotion → content carried across (blockCount preserved every cycle).
- **Single Published per group** enforced; extras removed → `publishedVersions=1`, `totalVersions=1` throughout. The reported "pages[] accumulates empty Archived versions" did not occur.

## Regression / additional checks

| # | Checklist item | Result | Evidence |
|---|----------------|--------|----------|
| 1 | Precondition: Published page WITH content; baseline confirmed via REST | PASS | Baseline row above (2 blocks) |
| 2 | Rename→Save→Publish: content survives on published version (REST) | PASS | Cycles 1–3, blockCount=2 |
| 3 | Root cause addressed: new version seeded; single Published, no empty accumulation | PASS | publishedVersions=1 / totalVersions=1 every cycle |
| 4 | Regression: add/edit a block then Save→Publish still persists content | PASS | Added 3rd block (draft), published via `PublishGroup` → published blockCount=**3** (title,text,text), 1 version |
| 5 | Permalink-only rename behaves same as Name-only | PASS | Cycle 1 (name-only) and Cycle 3 (permalink-only) both survive |
| 6 | No new console errors; no unexpected 4xx/5xx on save/publish/content | PASS | Console 0 errors (only benign preload warnings); all REST calls 200/204; UI state transitions succeeded each cycle; no error toasts |
| 7 | Admin SPA designer reflects content after a fresh reload (not stale in-memory) | PASS | Genuine fresh document load renders header + Title + both text blocks (screenshot 01). Hash-only nav showed stale name/empty body — the known incidental double-fetch/stale-state race (no data loss; REST held content), NOT this bug (screenshot 02) |
| 8 | GET …/grouped/{id}/content returns same blocks after each cycle | PASS | 2 blocks after every cycle (table above) |
| 9 | Rename→Save→Publish repeated 3 consecutive times — content non-empty every time | PASS | 3/3 |
| 10 | Data-integrity: no silent content loss across metadata-only edits (business-logic.md:684) | PASS | Content intact across all metadata-only edits |

## Layer validation
- **L1 Storefront:** N/A (permalink 404 at baseline in this env, per ticket — not a failure).
- **L2 Admin SPA:** PASS on true reload; incidental stale/empty render only on hash-only nav (double-fetch race, no data loss).
- **L4 Platform REST (owning):** PASS — content endpoint intact + single-Published normalization confirmed.

## Notes
- Content-block **baseline provisioning** used the REST content endpoint (`POST …/grouped/{id}/content?draft=true`) because the designer's Add-block does not reliably dirty a fresh page's document (Save stayed disabled) — this is precondition setup, not the behavior under test. The rename → Save → Publish flow under test was driven through the real Admin UI details blade; REST is the oracle.
- The details blade does not surface a REST-seeded draft as publishable (its `hasChanges` flag is set by the designer save path), so regression item 4's publish was executed via the exact `PublishGroup` REST operation (`POST …/grouped/publishing/{id}?publish=true`) the UI triggers.

## Evidence
- `screenshots/VCST-5417-01-designer-content-present-after-cycles.png` — designer renders all content on fresh reload (step that previously failed).
- `screenshots/VCST-5417-02-designer-stale-empty-hashnav-incidental.png` — incidental stale/empty designer render on hash-only nav (REST held content; documented, not this bug).
- Test group `439e7961-7969-457f-905c-fef4ab6fdfd5` — cleaned up (unpublished → Archived; Archived is the module's terminal soft-delete; `AGENT-TEST-` prefix allows teardown sweep). Nothing else touched.
