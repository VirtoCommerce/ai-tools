# BUG: Page Builder designer intermittently renders a published page as empty ([no name], no blocks)

## Status: FIXED

## Resolution
Fixed by **vc-module-pagebuilder PR #153** (`ContentStreamRepository.SaveBinaryAsync` made atomic). **QA VERIFIED 2026-07-09** on vcst-qa against the deployed build `PageBuilderModule 3.1015.0-pr-153-f835`: root-cause hammer 30/30 clean (0 empty reads), designer double-fetch 10/10 full, CRUD + rename regression PASS, storefront render correct, orphan test data swept. JIRA **VCST-5429 → TESTED** (not Done — PR #153 still open/unmerged; move to Done after merge + release). Method + evidence: `tests/Sprint-current/VCST-5429/`. NOTE: the frontend double-fetch half was scoped OUT of PR #153 as a non-blocking follow-up.

## JIRA: VCST-5429 (filed 2026-07-08) · /qa-fix routed to vc-module-pagebuilder (module → fullstack-backend)
## Fix PR (backend, DO NOT MERGE — human review): https://github.com/VirtoCommerce/vc-module-pagebuilder/pull/153 (branch `claude/qa-autofix/VCST-5429`). Root cause: non-transactional empty-then-append in `ContentStreamRepository.SaveBinaryAsync` → autocommit-visible `''` under READ COMMITTED. Frontend double-fetch half + `GetPageContent` just-created-draft gap = scoped-out follow-ups.

## Severity: Low (cosmetic — NO data loss; content is safe on the server, but the empty render looks exactly like content loss and can trigger destructive user "fixes")

## Env
vcptcore-qa @ Platform `3.1042.0-pr-3068` · PageBuilderModule `3.1014.0-pr-144-ca7d`

## Summary
The Page Builder **designer** occasionally opens a published/edited page showing **`[no name]` with an empty body** (no content blocks), even though the content is safely persisted (a re-fetch of `GET /grouped/{id}/content` returns the blocks). Two things combine: (1) the **first** `/content` GET right after a fresh open can **transiently return an empty body** (HTTP 200 with a BOM-only 3-byte payload) — a read-after-open race at the REST/content-stream layer that **self-heals** on re-fetch; and (2) the designer fires a **double-fetch** and can **bind the view to that empty/aborted first response**. Net effect: a scary empty render, but **no data loss**. Discovered as an incidental during VCST-5417 verification.

## Steps to Reproduce (intermittent)
No deterministic STR — the race is rare. Best-known conditions:
1. Open the Page Builder shell → open a published page in the designer (`Open designer`), especially after rename→Save→Publish cycles, and especially when a stale designer tab was navigated immediately before the open.
2. Observe the designer body: occasionally renders `[no name]` + zero blocks.
3. Fire `GET {BACK_URL}/api/page-builder-pages/grouped/{groupId}/content` at the same moment → returns the blocks (200, non-empty).

Repro rate: **2/2 empty** in the original VCST-5417 session (a `browser_navigate` on a pre-existing stale designer tab preceded the empty opens); **0/7** in a dedicated repro session (5× fresh opens + 2× hard reload) — confirming it is intermittent/rare, not deterministic.

## Expected vs Actual
- **Expected:** opening a page whose content exists on the server renders that content in the designer.
- **Actual:** the designer intermittently renders empty (`[no name]`, no blocks) while the server content is intact.

## Evidence
- Empty render (server still had both blocks at this moment): `../screenshots/VCST-5417/VCST-5417-02-designer-empty-after-cycle2.png`
- **Transient empty REST read (raw, out-of-band):** the FIRST `GET /grouped/{id}/content` right after a fresh "Open designer" returned **HTTP 200 with a 3-byte BOM-only (empty) body**, and the designer rendered `[no name]`; two immediate re-fetches returned the full 326-byte content (2 blocks). So the empty is observable **at the endpoint**, not only in the client, and it self-heals.
- Network pattern (every designer load): **two** GETs to the identical `/api/page-builder-pages/grouped/{groupId}/content` (no version-id / query param); the **first is frequently `net::ERR_ABORTED`** or returns the empty body, the second returns 200 with the blocks; sometimes both 200.
- Console at the empty render: clean except an unrelated App Insights `dc.services.visualstudio.com/v2/track 400`; the designer even logs the template as "loaded".

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | Not a storefront path |
| 2. Backend Admin (SPA / designer) | **FAIL (intermittent)** | Designer renders `[no name]`/empty; double-fetch binds the empty/aborted first response |
| 3. GraphQL xAPI | N/A | — |
| 4. Platform REST | **FAIL (intermittent)** | First `GET /grouped/{id}/content` after open can return 200 + BOM-only empty body; re-fetch returns full content (self-heals) |

**Owning layer:** ambiguous — **both** contribute. Deeper cause is a **transient empty content read at the REST/content-stream layer** (Layer 4); the designer's double-fetch + binding on the empty response (Layer 2) turns that transient into a visible empty render. Fixing either layer prevents the symptom.

## Verification 2026-07-09 (VERIFIED_WITH_NOTES — held pending)
Verified on **vcst-qa** against the deployed fix build `PageBuilderModule 3.1015.0-pr-153-f835` (PR #153, OPEN/not-merged). **Root cause proven fixed:** 30/30 write→immediate-first-read cycles returned full content (633–640 bytes, 3 blocks), **0 transient-empty/BOM-only reads** — the non-atomic-write race PR #153 targets is gone. Storefront render of a published page is correct (not `[no name]`/empty). **Not yet closed:** CRUD + rename-cycle regression and orphan-group cleanup are BLOCKED on a self-inflicted env incident (an out-of-scope concurrent-write stress the verification agent ran saturated vcst-qa's write/auth path — `POST /connect/token` = HTTP 000; not a product symptom). QA elected to wait for env self-recovery and NOT transition JIRA (VCST-5429 stays **Ready for test**). Follow-up session to complete the clean sequential regression + sweep orphan groups `9bc0575a…`, `6df18660…`. Evidence: `tests/Sprint-current/VCST-5429/`.

## Root Cause Analysis
Two combined effects, same repo:
1. **REST read-after-open race (Layer 4):** the first `GET /grouped/{groupId}/content` immediately after opening (or after a fresh draft/publish) can return an **empty body** (200 + BOM only), then return the full content milliseconds later — a read/stream-timing or read-after-write consistency gap in `GetPageContent` / the content-stream repository (`LoadContentToStreamAsync`). It self-heals on re-fetch (no persisted loss).
2. **Designer double-fetch + empty-binding (Layer 2):** on every load the page-builder-designer fires **two** GETs to the same `/content` URL (no inner-version id — so it is **not** an id-selection/wrong-version bug); the first is frequently `net::ERR_ABORTED` or the empty read above, and the designer can **bind the view to that empty/aborted first response** instead of the good 200. Present on all loads (incl. first open of a new page), so not churn-specific. Content-load wiring dates to PR #116 (VCST-4872, `usePageContentApi.ts` / `usePageBuilderDetails`).

## Related minor anomalies (same repo/area — observed during investigation, LOW)
- **False "Has unsaved changes" banner** after a clean Publish — **CONFIRMED via raw REST**, filed separately: `BUG-PageBuilder-Stale-Unsaved-Changes-Banner.md`.
- **Ungraceful session-expiry / short-lived shell token:** expired token → API `302`/`400 "Draft page not found"` on Publish → shell surfaces a raw `Unexpected token '<' … not valid JSON` toast instead of a re-auth prompt.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 4 REST (transient empty content read) **+** Layer 2 Admin designer (double-fetch binds empty) — same repo either way
- **Suggested repo:** `VirtoCommerce/vc-module-pagebuilder` (both the backend `PageBuilderPageController.GetPageContent` / content-stream and the `page-builder-shell` / `page-builder-designer` frontend ship in this repo)
- **repoKind:** module
- **Ownership hint:** platform (native)
- **Component / module:** Backend `GetPageContent` / `GroupedPageService.LoadContentToStreamAsync` (transient empty read) + Page Builder designer content-load (`usePageContentApi` / `usePageBuilderDetails`, PR #116)
- **RCA anchor:** (backend) first `GET grouped/{id}/content` returns 200 + BOM-only empty then full on re-fetch → read/stream-timing race in `GetPageContent`/content-stream; (frontend) designer double-fires the GET and binds the empty/aborted first response. Fix either: make the read deterministic, and/or dedupe the request + never bind empty on abort/empty.
- **Routing confidence:** MEDIUM — repo confirmed via `search_code` (repo id 193568937); not in `ci/config/fix-repos.json` (add before `/qa-fix`); intermittent (no on-demand red); two candidate layers.
