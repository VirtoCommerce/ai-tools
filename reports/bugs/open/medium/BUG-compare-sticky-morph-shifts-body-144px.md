# Compare v2 — the sticky header's compact morph shifts the table body 144 px in one frame, and never fires below `md` — P2

## Status: FILED — VCST-5874
**Tracker:** [VCST-5874](https://virtocommerce.atlassian.net/browse/VCST-5874) — Sub-task of VCST-5735
**Found by:** VCST-5735 `/qa-test` FULL run · visual axis V1 (`BL-UI-003`) · IN-SCOPE
**Archetype:** `RENDER`

**Severity:** P2 · **Type:** Layout stability (BL-UI-003)

**Env:** vcst-qa @ theme `2.57.0-pr-2452-d1e4-d1e45b04` (vc-frontend PR #2452, open), Platform `3.1063.0`.

## Summary
Two defects in one mechanism.

**(a)** The compact header is `position: sticky` and therefore **stays in flow**, so collapsing it removes
144 px of document height and every row below jumps up by that amount **while the user is mid-scroll**.

**(b)** The morph **never fires below `md`**, so on a phone the pinned header keeps its full height —
211.8 px, about **35% of a 600 px viewport** — and the first data rows render underneath it. Mobile is
where reclaiming that space matters most and is the one place it does not happen.

**A fix for (a) already exists and was closed unmerged.** See Related below.

## Steps to Reproduce
**(a)** At 1280 px with 3+ products in one tab and a table taller than the viewport, scroll from
`scrollY 200` to `240` — a single 40 px step across the morph threshold.

| | scrollY 200 | scrollY 240 | Δ |
|---|---|---|---|
| header height | 251 | **107** | −144 |
| first row-label `top` | 419 | **235** | −184 (scroll accounts for only −40) |
| `document.scrollHeight` | 1593 | **1449** | −144 |

**(b)** Scroll the same board at 767 px and at 768 px:

| viewport | `--stuck` | header height |
|---|---|---|
| 767 px | `false` | **211.8** |
| 768 px | `true` | 107 |

At 375 px the header stays 211.8 px and `firstLabel.top 111.8` sits above `header.bottom 301.8`.

## Expected vs Actual
- **Expected (BL-UI-003):** a state change must not move adjacent content. Collapsing a sticky header
  should reclaim space without displacing the rows the user is reading.
- **Actual:** 144 px of content displacement in one frame on desktop; no morph at all on mobile.

**CLS cannot see (a).** The shift lands within 500 ms of a keypress, so `hadRecentInput` excludes it —
the page's CLS pass must **not** be read as "the morph is shift-free". Only the rect delta shows it.
(The separate first-load CLS finding is tracked under CMP-021 and is a different instrument entirely.)

Evidence: `reports/tickets/Sprint26-17/VCST-5735/screenshots/compare-1920-sticky-compact.png`,
`compare-768-sticky-compact.png`, `compare-375-sticky-NOT-compact.jpeg`

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | rect deltas across the morph threshold; `--stuck` probe at 767/768 |
| 2. Backend Admin | N/A | client-side layout only |
| 3. GraphQL xAPI | N/A | no request involved |
| 4. Platform REST API | N/A | as above |

**Owning layer:** Layer 1 — Storefront

## What is NOT wrong — the v1 bug is not reinstated
The ticket blames v1's broken sticky on `.compare-widget { overflow: hidden }` killing `position: sticky`.
That is **fixed**: the ancestor clip-chain of `.compare-table__header-row` is empty — no ancestor has a
non-`visible` overflow, `contain`, `transform`, `filter` or `perspective`. Pinning holds and
`overlapPx = 0` against the site header at 1920, 768 and 375. The sticky offset also tracks live
(`--vc-app-header-height`, 128 → 90 across the breakpoint) rather than being hardcoded.

## Related — a fix for (a) was written and closed unmerged
**vc-frontend PR #2454** — *"fix: drive compare header compact state from an out-of-flow sticky bar"*,
branch `feat/VCST-5735-compact-header` → `feat/VCST-5735-compare-products`. Opened 2026-08-26 10:50,
**closed 11:04 the same day, `merged_at: null`**, empty description. Its review task **VCST-5810 was
Cancelled**.

Driving the compact state from an **out-of-flow** bar is precisely the fix for an in-flow sticky header
removing document height. Whoever closed it should say whether it was rejected on its merits or dropped —
this bug is the consequence either way.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** `VirtoCommerce/vc-frontend`
- **repoKind:** frontend
- **Ownership hint:** platform (no `project-profile.json` — native deployment)
- **Component / module:** `client-app/shared/compare/components/compare-table.vue`
- **RCA anchor:** `compare-table__header-row` is `position: sticky` and in flow, so the full→compact height change alters `document.scrollHeight`; the `--stuck` morph is additionally gated above `md`
- **Routing confidence:** HIGH — PR #2454 already names the intended fix
