# SBTM — Page Builder rename / publish / versioning / content [EXP]

- **Date:** 2026-07-08
- **Env:** vcptcore-qa · Admin `https://vcptcore-qa.govirto.com` · Storefront `https://vcptcore-qa-storefront.govirto.com` · Store **B2B-store**
- **Build:** Platform `3.1042.0-pr-3068-a8f9` · PageBuilderModule `3.1014.0-pr-144` (per charter) · Storefront theme `2.53.0-pr-2316`
- **Browser:** playwright-firefox (primary); playwright-edge (cleanup + cross-browser confirm)
- **Session type:** [EXP] — ≥1 genuine net-new scenario discovered
- **Technique:** Surprise-seeking (first pass) + Boundary-of-features hunting at the rename × publish × version × content-vs-metadata seams
- **Charter:** Discover NET-NEW scenarios in the VCST-5417 neighborhood (rename/publish/versioning/content), not re-validate suites 059/060 or CMS-130.

## ⚠️ No critical data-loss bug found
Content **survived** rename+permalink-change+republish (no loss). The most material finding is an availability gap (page-builder pages not served on this storefront) — reported as a Risk, not data loss.

---

## Net-New Scenarios Discovered (mandatory)

| # | Scenario (net-new) | What it probes | Verdict |
|---|--------------------|----------------|---------|
| NS1 | **Publish a page-builder grouped page and confirm the storefront actually serves it** | design-time publish → runtime `.page` seam | **FAIL (env-wide)** — every published page-builder page 404s on vcptcore-qa storefront (mine + long-published `new-page-test`, `/new-page`), while `/demo-landing` renders. Runtime layer unavailable. |
| NS2 | **Rename NAME *and* PERMALINK of a published page, republish; verify content survives + group-metadata vs content-embedded-settings consistency** | rename × versioning × content-settings divergence | **PARTIAL** — content survives (good); but the content-embedded `settings.name` stays the OLD name after rename (designer shows old "EXP-5417-multilang" post-rename). Storefront half blocked by NS1. |
| NS3 | **Verify the "Has unsaved changes" banner accuracy immediately after a clean Publish/republish** | UI state vs server `hasChanges` | **FAIL** — banner shown right after publish while API `publish-status = {published:true, hasChanges:false}`. Reproduced 3×. |
| NS4 | **Model check: are multi-language pages per-culture inner pages of one group?** | S1 premise | **DISPROVED for this build** — a *group* is single-culture (`group.cultureName`) with a `pages[]` array of **versions**; cultures are separate groups. S1's "one culture's edit clobbers another in the same group" risk does not apply here. |

---

## Bugs / Anomalies Found

| # | Sev | Title | Net-new? | Evidence |
|---|-----|-------|----------|----------|
| 1 | High (needs triage: env-config vs defect) | **Published Page Builder grouped pages return 404 on vcptcore-qa storefront** — affects all such pages, not just new ones; `/demo-landing` (other CMS mechanism) works | Yes | `/exp-5417-multilang`, `/new-page-test`, `/new-page` → 404; API `publish-status={published:true,hasChanges:false}`; `/demo-landing` renders |
| 2 | Low | **"Has unsaved changes" banner shown immediately after a successful Publish/republish** while server reports no pending changes | Yes | shell banner vs `publish-status={published:true,hasChanges:false}` (3 occurrences) |
| 3 | Low/Needs-confirm | **After rename+republish, content-embedded `settings.name` retains the OLD name** (designer breadcrumb/panel show "EXP-5417-multilang" though group renamed to "EXP-5417-renamed") — group metadata (PUT /grouped) updates, content settings do not | Yes | designer reload shows old name; group PUT shows new name/permalink |

**Not filed as bugs (attribution/uncertain):**
- An extra "Products" block (heading "test") appeared in the page content — most likely my own stray click during a messy designer save (URL briefly showed `/pages/productsYIbG`); not attributable to a product defect.

---

## Risk Areas
- **Storefront runtime rendering of page-builder pages** on vcptcore-qa is the biggest blind spot — it is currently non-functional, so the entire publish→storefront and permalink-routing half of the VCST-5417 neighborhood cannot be validated on this env. Suites 059/060 that assert "edit-published-content→storefront" would fail or be untestable here.
- **content-vs-metadata divergence on rename** (NS2/bug 3): if the storefront routes/renders from content-embedded `settings` rather than group metadata, a renamed page could serve stale name/permalink. Worth confirming once storefront serving is restored.

## Observations (model & mechanics, for future test design)
- **Data model:** `POST/PUT /api/page-builder-pages/grouped` — the *group* object carries `cultureName`, `name`, `permalink`, `visibility`, `userGroups`, `startDate/endDate`, `status`, `hasChanges`, plus `pages[]` = version objects (each with own `status` Draft/Published). Content is separate: `GET/POST /grouped/{groupId}/content` = `{settings{name,permalink,cultureName}, content[<blocks>]}`.
- **Editing a Published page creates a NEW Draft version** in `pages[]` (group `hasChanges:true`); a **Publish** button then appears to promote it. Renaming updates group `name`/`permalink` in place immediately (via PUT) even before republish.
- **No hard-delete in the Page Builder UI** — the "Archive" toolbar action (data-test-id `delete`) soft-deletes to the Archived tab; Archived pages offer no further delete. (The Archived list is full of prior test pages, consistent with this being the norm.)
- **Firefox automation instability:** the vc-blade details panel + vc-select/vc-switch/vc-table rows frequently never satisfy Playwright's "stable" actionability check under playwright-firefox (esp. while the "Has unsaved changes" banner churns) — clicks on toggles/options/rows/delete time out. The **same actions worked first-try in playwright-edge**. No JS console errors accompany it → automation/rendering quirk, not an app render-loop. Recommend Edge/Chrome for Page Builder admin automation.

## Questions / Follow-ups
- Is storefront page-builder-page serving expected to work on vcptcore-qa, or is this env intentionally not wired for it? (Determines whether bug 1 is a config gap or a defect.)
- Does the storefront resolve a page by group metadata permalink or by content-embedded `settings.permalink`? (Determines severity of bug 3.)
- Is the "Has unsaved changes" banner bound to actual server `hasChanges`, or to a client-only dirty flag that isn't reset after publish? (bug 2)

## Charter-from-Gap (next-session candidates)
- Once storefront serving is restored: full NS2 runtime test — rename permalink of a published page, confirm OLD permalink 404s and NEW serves CURRENT content (VCST-5274 breadcrumb adjacency).
- Personalization/scheduling **survival across version creation** (S3) — could NOT set user-group/visibility/schedule this session (Firefox multiselect/switch instability); retry in Edge/Chrome.
- Multi-language: since cultures are separate groups, probe two same-permalink different-culture groups for cross-culture publish/permalink collisions.

## Cleanup
- Created exactly one throwaway group: `EXP-5417-multilang` → renamed `EXP-5417-renamed` (groupId `14b0e59a-ee65-47aa-be28-926e3c71e08b`).
- **Status: Archived** (removed from Draft/Active; not served). No hard-delete exists in the Page Builder UI, so Archived is the terminal removal state. No other EXP-5417-* pages exist. AGENT-TEST-* pages left untouched.
