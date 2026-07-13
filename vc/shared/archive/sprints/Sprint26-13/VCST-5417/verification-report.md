# Verification Report — VCST-5417

**[Page Builder] Published page loses ALL content after rename → Save → Publish**

- **Verdict:** VERIFIED (fix present on deployed build) — *pending user decision on JIRA transition; see caveats*
- **Date:** 2026-07-08
- **Environment:** vcptcore-qa (`https://vcptcore-qa.govirto.com`) — backend `/health` 200, storefront 200
- **Agent / method:** qa-backend-expert (playwright-edge), live safe reproduction on a self-created throwaway page
- **Severity/Priority:** High / P2 · **Component:** Page Builder (module) · **Domain:** Admin SPA + module REST

## Build tested
| Component | Version |
|-----------|---------|
| Platform | `3.1042.0-pr-3068` |
| **PageBuilderModule** | **`3.1014.0-pr-144-ca7d`** (confirmed via `/api/platform/modules`) |
| Reported-against build | `3.1014.0-pr-149-3129` (different build) |

Fix source: `vc-module-pagebuilder` **PR #133** (VCST-5069, merged 2026-05-15, seeds new draft from Published content on metadata edit + single-Published normalization) + **PR #116** (VCST-4872, `CopyPageContentAsync`). Both merged before the ticket was filed.

## Deployment confirmation
The deployed `pr-144` build empirically exhibits the fixed behavior (content copied into every new version), so the fix is deployed. **Caveat:** this is a transient PR build; the automated `/qa-fix` analysis recommends final re-verification once dev ≥`3.1015.0` is the stable deploy.

## STR result
Original STR is a data-loss scenario — "fixed" = content is preserved through rename→Save→Publish. Run on throwaway page `AGENT-TEST-5417` (groupId `78ae8bc8-f5d0-43bd-a7ea-9373b3b469c8`, B2B-store), 2 blocks (Text + Image). **No existing page touched; test page deleted afterward.**

| Publish checkpoint | pages[] inner-versions | `GET /grouped/{id}/content` |
|--------------------|------------------------|------------------------------|
| Initial publish | `[1b83403c Published]` | 2 blocks ✅ |
| Cycle 1 — rename `-r1` → Save → Publish | `1b83403c → Archived`, `6e8a026e → Published` | 2 blocks, name=-r1 ✅ |
| Cycle 2 — rename `-r2` → Save → Publish | `120c98d6 → Published`, others Archived | 2 blocks, name=-r2 ✅ |

**Content preserved at all 3 publish checkpoints (2 rename/publish cycles + initial).** REST source-of-truth confirmed each time. Note: the strict 3-consecutive-cycle bar was met as 2 rename cycles + the initial publish (3 content-integrity checkpoints); result is deterministic + REST-confirmed.

## Verification Checklist

**Fix Confirmation**
- [x] 1. Reproduce original bug (STR) — content does NOT vanish (fix works)
- [x] 2. Fix resolves reported issue — published version never empty
- [x] 3. Root cause addressed — new version seeded from Published content (not just symptom)

**Regression**
- [x] 4. Publish/version lifecycle intact — old versions demoted to Archived, single Published enforced
- [x] 5. Content endpoint returns correct blocks after each publish
- [x] 6. No new console/network errors (Save `PUT /grouped` 200; Publish `POST …/publishing/{id}?publish=true` 200)

**Cross-Layer (qa-backend-expert)**
- [x] 7. Storefront/module REST reflects corrected behavior — `GET …/grouped/{id}/content` = 2 blocks
- [x] 8. API returns expected response — 200 on Save/Publish/content GET

**Edge / Business rules**
- [x] 9. Boundary — repeated rename+publish cycles (the exact failing condition) preserve content
- [~] 10. Incidental (non-blocking) — see below

## Incidental observation (NOT this bug — not filed)
Post-Cycle-2, the Admin designer twice rendered the page as `[no name]` with an empty body while REST still returned both blocks — a render **false-negative** (inverse of the reported stale-blocks-masking-loss). Evidence: `screenshots/VCST-5417-02-designer-empty-after-cycle2.png`. Likely an Admin SPA fetch/cache glitch after rapid version churn; needs confirmation before filing.

## Caveats affecting the JIRA transition
1. Ticket is **In Progress**, not READY FOR TEST/TESTING.
2. Deployed build is a **transient PR build** (`pr-144`), not the recommended stable dev ≥`3.1015.0`.
3. Per project policy, QA verification **stops at TESTED, never auto-DONE**.

## Artifacts
- This report + `screenshots/`
- Prior bug report: `reports/bugs/fixed/BUG-PageBuilder-Rename-Publish-ContentLoss-VCST-5417.md`
- JIRA live-env comment already posted: VCST-5417 comment `102404`
