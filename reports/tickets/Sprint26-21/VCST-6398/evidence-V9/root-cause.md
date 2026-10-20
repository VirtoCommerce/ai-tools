## Root-Cause Worksheet — VCST-6398 V9

### 1. Symptom (one line, observable)
On /compare below md, axe `scrollable-region-focusable` (serious) flags `tbody.compare-table__scroll`. The scroller has no tabindex and no rendered focusable content. The claimed effect, "a keyboard user cannot scroll the product columns", did **not** happen in Firefox 151.

### 2. Lowest failing layer
Storefront only. No request is involved (`network/requests.txt`: no 4xx/5xx). The cause is markup/CSS in one SFC.
→ repoKind: frontend → repo: **VirtoCommerce/vc-frontend-next** (`client-app/shared/compare/components/compare-table.vue`). Also upstream in VirtoCommerce/vc-frontend (same file, from PR #2518).

### 3. Evidence → claim chain
| # | Claim | Evidence |
|---|---|---|
| 1 | The scroller is the tbody and it overflows | DOM read: `overflow-x:auto; display:block`, clientWidth 364 < scrollWidth 448 |
| 2 | The tbody has no tabindex and no rendered focusable content | DOM read: tabindex attr null, role null, 11 focusable descendants, 0 rendered (row pins and info triggers are hidden below md, KB-17146D60) |
| 3 | Firefox still gives the tbody a Tab stop, and the arrow keys scroll it | `v9-tab15.yml` rowgroup `[active]`, `activeElement===tbody`; `v9-arrowleft/right.yml` column x 41→63→73; `V9-02` shows the focus outline |
| 4 | Tabbing through the header controls also brings clipped columns into view | `v9-tab12.yml`: focus on col-3 Remove → header and body both shifted 84px (`useHorizontalScrollSync(bodyScrollRef, headerRowRef)`) |
| 5 | The PR changes this exact element | `source/pr11-compare-table.patch` L356–358: `-<table ref="bodyScrollRef" class="compare-table__scroll">` → `+<tbody ref="bodyScrollRef" class="compare-table__scroll">`; no tabindex/role added; `&__scroll { block overflow-x-auto }` unchanged |
| 6 | Next `dev` already had a non-focusable scroller | `vc-frontend-next@dev` compare-table.vue L197 `<table ref="bodyScrollRef" class="compare-table__scroll">`, same `block overflow-x-auto`, no tabindex (source only, not observed live on a dev build) |
| 7 | The tbody form comes from upstream | vc-frontend PR #2518 "fix(VCST-5880): make the compare header row and body one native table", merged 2026-10-13, has the same `-table/+tbody` hunk; vc-frontend `dev` (2.61.0) L191 has the tbody scroller |

### 4. The "why" in one sentence
The horizontal scroller (`<table>` on next dev, `<tbody>` after this merge) has no `tabindex="0"`. Below md its only focusable children are `display:none`. So axe sees a scroll region a keyboard cannot reach. Firefox 151 makes scroll containers focusable by itself, and the header scroll sync gives a second route, so the user-level barrier did not occur in Firefox.

### 5. Alternatives ruled out
| Alternative | How ruled out |
|---|---|
| By-design / config-gated | No setting involved. The source has no tabindex on the scroller, though it deliberately sets `tabindex="-1"` on thead for focus recovery. This is an omission, not a choice. |
| Env data drift | Live-discovered products; reproduces with any ≥3 products whose columns overflow 364px |
| Flaky / timing | Deterministic DOM attributes; keyboard walk is deterministic |
| Real keyboard barrier (the candidate's claim) | **Ruled out in Firefox 151**: Tab reaches the tbody and the arrow keys scroll it. Not tested: WebKit/Safari (it does not make scrollers focusable; not available on Windows) and Chromium (outside this brief, which is Firefox-only). In WebKit only the header-control scroll-sync route would remain. |

### 6. Regression archaeology
- Not a regression introduced by the merge. Next `dev` already has a non-focusable scroller on `<table>`. PR #11 moves it to `<tbody>`, taking vc-frontend #2518 (VCST-5880). axe on next dev was **not** run live, so whether axe flagged it there is source-inferred.
- KB-3CC64161's first sighting (theme `2.60.0-alpha.2579`, 2026-10-14) follows the vc-frontend version line (2.6x), not Next (3.1.x). It was a vc-frontend build made after #2518 merged. It is not a pre-merge baseline for Next.

### 7. Confidence
MEDIUM-HIGH for the static cause and the owning file. HIGH for "no barrier in Firefox". The impact in WebKit is untested.

### 8. Fix Routing handoff
frontend · `frontend` · VirtoCommerce/vc-frontend-next `client-app/shared/compare/components/compare-table.vue` (tbody `compare-table__scroll`, ~L196) · fix-forward: give the scroller `tabindex="0"` plus a named region (e.g. `role="region"` + `aria-label`) only while it overflows, or wrap it in such a region. Upstream occurrence: VirtoCommerce/vc-frontend, same file (~L191). Severity: P3/Low, a11y conformance (axe serious, WCAG 2.1.1 robustness). There is no observed keyboard barrier in Firefox. File it standalone and non-blocking.
