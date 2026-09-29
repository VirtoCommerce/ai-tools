# Sales Rep hub — Document library widget offers NO action for DOC / XLS / ZIP documents

## Status: FIXED

**Tracker:** [VCST-6083](https://virtocommerce.atlassian.net/browse/VCST-6083) (Bug, Draft)

**Reported:** 2026-09-24 · **Environment:** vcst-qa (`https://vcst-qa-storefront.govirto.com`)
**Area:** Storefront > Sales Rep hub > Dashboard > Document library widget
**Severity:** Low · **Priority:** Medium

## Summary

On the Sales Rep hub Dashboard, the **Document library** widget renders an **Open** button only for
documents whose content type is inline-renderable (PDF, PNG, JPEG, GIF, WEBP, TXT). It has **no
Download fallback**, so a Word / Excel / ZIP row renders its title and its "Published … · N pages"
meta line and **no action control at all**. The rep can see the document on the dashboard and cannot
act on it there.

The sibling surface `/company/documents` renders **Download unconditionally** on the same document,
from the same query, in the same session — so this is purely a widget render decision, not a data or
permission problem.

## Steps to reproduce

1. Sign in to the storefront as a rep holding the **Advanced Sales Representative** role
   (`sales-rep:access` + `sales-rep-documents:read`).
2. Open the Sales Rep hub Dashboard (`/company/dashboard`).
3. Ensure the Document library widget's top rows include a document whose content type is NOT
   inline-renderable — e.g. a `.docx` (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`)
   or an `.xlsx` (`…spreadsheetml.sheet`). The widget shows 5 rows by default, sorted
   `isPinned:desc;createdDate:desc`; raise **Edit layout → maxRows** if the non-renderable document
   sits below the fold.
4. Compare that row with any PDF row beside it.
5. Click **Browse all** → `/company/documents`, find the same document.

**Actual:** the non-renderable row in the widget has **no button** — no Open, no Download. Adjacent
PDF rows each carry an Open button. On `/company/documents` the same document offers **Download**
(grid-card overlay and featured panel).

**Expected:** the widget offers an action for every document it lists — Download for a
non-renderable type, mirroring `/company/documents`.

## Evidence & provenance

| Source | What it establishes | Provenance |
|---|---|---|
| Reporter screenshot, vcst-qa `/company/dashboard`, 2026-09-24 — `reports/bugs/screenshots/BUG-preview-button-salesrep.png` | "Returns and Warranty Policy" (DOC icon) renders with no action; the four PDF rows beside it each render **Open** | `{OBSERVED}` — attached to VCST-6083 as attachment `84900` and embedded inline (verified from `renderedFields`: 1 `<img>`, 0 surviving `!png!`, 0 error spans) |
| Prior live run, 2026-09-24 — domain map finding **D20** | Same defect, live + source | `{OBSERVED}` — `.claude/knowledge/domain/sales-rep.md` §6 D20 |
| `vc-frontend` source, read this run, byte-identical to `origin/dev` | The `v-if` gate and the absent Download fallback | `{SPEC}` |
| VirtoOZ — Storefront User Guide, *Sales Rep Hub › Document library* | "The rep can browse and search the list, then **open or download any accessible document**. Supported file types are JPEG, PNG, ZIP, PDF, WEBP, **XLS**, TXT, and **DOC**." | `{DOC}` |

**Not re-verified live this run — stated plainly:** an attempt on 2026-09-24 was **BLOCKED**. The
`agent-test-sr-*` fixtures had been torn down for a demo seed (`connect/token` → `400 invalid_grant`),
and the demo rep `alla.volkova@virtoway.com` is a **real employee account** listed in
`SR_DEMO_PROTECTED_EMAILS`, so no sign-in was attempted against it. The defect is deterministic and
fully explained by a single `v-if`, and it was live-confirmed earlier the same day (D20).

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | Reporter screenshot + D20; `sales-rep-documents.vue:39-49` |
| 2. Backend Admin | N/A — not implicated | The document record and its `contentType` are correct; the Admin blade owns no storefront action control |
| 3. GraphQL xAPI | N/A — not implicated | `salesRepDocuments` returns `contentType` and `url` for every row; `/company/documents` renders Download from that same response |
| 4. Platform REST API | N/A — not implicated | Bytes are served by the file endpoint, which the page's Download already exercises |

**Owning layer:** Layer 1 — Storefront Frontend.
The two surfaces consume one response in one session and disagree, which isolates the defect to the
render decision without needing the lower layers.

## Root Cause Analysis

`vc-frontend`, `client-app/modules/sales-rep/`:

- **`components/sales-rep-documents.vue:39-49`** — the widget's only action is
  `<VcButton v-if="isInlineRenderable(document.contentType)">`. When the guard is false, the row's
  action slot is empty. There is no `v-else`.
- **`files.ts:10-17`** — `INLINE_RENDERABLE_TYPES` = `application/pdf`, `image/png`, `image/jpeg`,
  `image/gif`, `image/webp`, `text/plain`. The comment gives the (sound) reason: other types
  "could run script on the storefront origin". The restriction on *inline rendering* is correct;
  extending it to suppress the button is what breaks.
- **`files.ts:26-29`** — `openAuthorizedFile()` **already** falls back to `downloadFile()` for a
  non-renderable type. The `v-if` on the button makes that existing fallback unreachable.
- **`pages/documents.vue:89-95` and `:219-226`** — the page renders Download **unconditionally**
  alongside a type-gated Open, on both the featured panel and every grid card. That is the correct
  shape; the widget never got it.

**Fix shape (single file, single repo).** Give the widget the page's pattern: keep Open gated on
`isInlineRenderable`, and add an unconditional Download. Note a small gap — the widget's i18n
namespace has `sales_rep.documents.open` but **no `sales_rep.documents.download`**; the page uses
`sales_rep.documents.details.download`. A fix must add the key or reuse the `details` one.

## Module Versions

- Platform `3.1072.0-pr-3121-54cc-vcst-4464-onx-mcp-auth-54cc542a`
- Theme `vc-theme-b2b-vue-2.59.0-alpha.2523` (storefront footer reports `Ver. 2.59.0-alpha.2523`)
- `VirtoCommerce.SalesRep` `3.1009.0` · `VirtoCommerce.FileExperienceApi` `3.1004.0`

## Notes

- **Not a duplicate.** No report in `reports/bugs/**` covers it; recorded as domain-map finding
  **D20** and explicitly marked *"Not filed"*.
- **No regression test covers it.** Suite `093-sales-rep-hub-dashboard-storefront.csv` exercises the
  dashboard's layout and persistence, not per-content-type action rendering.
- **Severity rationale — Low, not higher.** A working path exists one click away via **Browse all**,
  and nothing is lost or corrupted. It is not lower than Low because the affected types (price
  sheets, credit applications, contract packs) are core sales material, the user guide lists DOC and
  XLS as supported, and a row that silently lacks a control reads as broken rather than intentional.
- **Demo-data interaction.** `scripts/seed-data/sales-rep/sales-rep-demo-specs.mjs` deliberately
  flipped `DDOC-RETURNS` from `.docx` to `.pdf` (commit `42ffbb2a`) *to steer the demo around this
  bug*, with a source comment saying so. After a re-seed from HEAD the widget's default top 5 are all
  PDFs and the defect stops being visible there; `Credit Application Form` (.docx) and
  `Q4 2026 Price List` (.xlsx) still carry it at positions 6-8.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** `VirtoCommerce/vc-frontend`
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** `client-app/modules/sales-rep` — Document library dashboard widget
- **RCA anchor:** `client-app/modules/sales-rep/components/sales-rep-documents.vue:39-49`
  (`v-if="isInlineRenderable(document.contentType)"` on the row's only action button);
  supporting `client-app/modules/sales-rep/files.ts:10-29`,
  reference implementation `client-app/modules/sales-rep/pages/documents.vue:219-226`
- **Routing confidence:** HIGH — single file, single repo, verified byte-identical to `origin/dev`

## Blocked 2026-09-24

`/qa-verify-fix` stopped at the deployment gate: vcst-qa runs theme `2.59.0-alpha.2523`, and the fix
(VirtoCommerce/vc-frontend#2509, open, head `ce8324b7`) is not deployed. The fix passed on a local
frontend-only build (`2.59.0-pr-2509-83dd-83ddc7eb`, API proxied to vcst-qa): DOCX/XLSX/ZIP rows show
Download and save the right file; PDF/PNG keep Open. Re-run live verification once the PR build or its
merge reaches vcst-qa. Summary: `reports/tickets/Sprint26-19/VCST-6083/verification-summary.json`.

## Resolution

- **Fixed in:** VirtoCommerce/vc-frontend#2509 (head `ce8324b7`, still open at verification) — theme `2.59.0-pr-2509-ce83-ce8324b7`
- **Tracker:** VCST-6083 → **Tested** (2026-09-24)
- **Verified:** 2026-09-24, reproduction 3/3 on a local frontend-only build with the API proxied to vcst-qa (accepted by the operator in place of a vcst-qa deploy). DOCX/XLSX/ZIP rows now offer Download and save the right file; PDF/PNG keep Open; `/company/documents` unchanged.
- **Note:** the PR's equal-width follow-up narrows every title column, so more titles truncate (2 → 5 of 10). Cosmetic, recorded on the ticket and the PR.
- **Summary:** `reports/tickets/Sprint26-19/VCST-6083/verification-summary.json`
