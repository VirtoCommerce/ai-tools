# VCST-5110 Verification Report

## Verdict
**FIX_INCOMPLETE**

Post-fix CLS still exceeds the 0.10 budget at every measured viewport, including the previously-passing 1280 px desktop viewport. Mobile 375 px CLS remains in the P0 FAIL range (≥ 0.25). The PR #2292 layout refactor (BEM + subgrid + skeleton-mirroring) is verifiably deployed and structurally present, but the layout shift it was intended to eliminate has not been resolved.

## Build
| Field | Value |
|---|---|
| Platform | (storefront-only verification) |
| Theme | `vc-theme-b2b-vue-2.49.0-pr-2292-f131-f131d346` (confirmed via footer "Ver. 2.49.0-pr-2292-f131-f131d346") |
| PR | #2292 (head SHA `f131d346`) |
| Env | https://vcst-qa-storefront.govirto.com |
| User | `mutykovaelena@gmail.com` (personal account, 9 existing wishlists; auth cookie re-used from prior session) |
| Browser | playwright-chrome (chromium), locale en-US |
| Date | 2026-05-18 |

## CLS Measurements (post-paint observer)

| Viewport | Run | CLS | shiftCount | Budget | Verdict | Pre-fix | Evidence |
|----------|-----|--------|------------|--------|---------|---------|----------|
| 375 px   | 1   | **0.2555** | 3 | ≤ 0.10 | **FAIL (P0)** | 0.483 | `evidence/VCST-5110-375px-run1.png` |
| 375 px   | 2   | **0.2555** | 3 | ≤ 0.10 | **FAIL (P0)** | 0.483 | `evidence/VCST-5110-375px-run2.png` |
| 375 px   | 3   | **0.2555** | 3 | ≤ 0.10 | **FAIL (P0)** | 0.483 | `evidence/VCST-5110-375px-run3.png` |
| 768 px   | 1   | **0.1336** | 3 | ≤ 0.10 | **FAIL** | 0.137 | `evidence/VCST-5110-768px.png` |
| 1280 px  | 1   | **0.1073** | 4 | ≤ 0.10 | **FAIL (NEW REGRESSION)** | 0.064 | `evidence/VCST-5110-1280px.png` |

Pre-fix baseline: 375 px = 0.483 / 768 px = 0.137 / 1280 px = 0.064 (from bug ticket).
Post-fix: 375 px = 0.256 / 768 px = 0.134 / 1280 px = 0.107.

**Interpretation:**
- 375 px improved from 5× budget (0.483) to 2.5× budget (0.256) — directionally better but still solidly in P0 FAIL.
- 768 px essentially unchanged (0.134 vs 0.137) — fix had no measurable effect.
- 1280 px regressed from PASS (0.064) to FAIL (0.107) — **NEW REGRESSION on previously-passing viewport.**

## Checklist (8 items)

| # | Check | Status | Evidence |
|---|---|---|---|
| 1 | STR 375 px Run 1 — CLS ≤ 0.10 | **FAIL** | CLS = 0.2555 (3 shifts) |
| 2 | STR 375 px Run 2 — CLS ≤ 0.10 | **FAIL** | CLS = 0.2555 (3 shifts) |
| 3 | STR 375 px Run 3 — CLS ≤ 0.10 | **FAIL** | CLS = 0.2555 (3 shifts) |
| 4 | 768 px — CLS ≤ 0.10 (was 0.137 FAIL) | **FAIL** | CLS = 0.1336 (3 shifts) |
| 5 | 1280 px — CLS ≤ 0.10 (was 0.064 PASS) | **FAIL — NEW REGRESSION** | CLS = 0.1073 (4 shifts) |
| 6 | Cards render correctly at 375 px (visible, readable, no overlap, dropdown at top-right) | **PASS** | `VCST-5110-375px-run3.png` — 9 cards stacked, dropdown icons visible top-right of each |
| 7 | Cards render correctly at 1280 px (subgrid: title • description • date • status • dropdown) | **PASS** | `VCST-5110-1280px.png` — horizontal subgrid layout confirmed (computed style verified `grid-template-columns: subgrid`) |
| 8 | No console errors at any viewport | **PASS** | 0 errors across 375/768/1280 (see `console-*.txt`) — only routine warnings |

**Score: 3 PASS / 5 FAIL**

## Functional Observations

- **Skeleton → content swap at 375 px:** visually still jumpy. 3 layout shifts captured per run, identical CLS values across 3 consecutive runs (0.2555041975308642), suggesting the shift is fully deterministic — same DOM nodes shift the same distance every time. Likely candidates: the 9-card list grows the document by a large delta when skeleton (which mirrors only the first card, not 9) is replaced by 9 rendered cards.
- **Card layout at 375 px:** stacked correctly, BEM `.wishlist-card` class present, no overlap, dropdown menu icon at top-right of each card. Functionally correct.
- **Card layout at 1280 px:** subgrid columns rendering as designed (title / description / date / status / dropdown). `getComputedStyle` confirms `grid-template-columns: subgrid` is in effect on the cards. PR's structural changes are deployed.
- **Container query (`@container`)**: `.lists__container` present (1 instance), subgrid active at 1280 px. PR's CSS contract is in effect.
- **Footer build string:** `Ver. 2.49.0-pr-2292-f131-f131d346` — confirms the PR-2292 theme is what is being measured.
- **Console:** zero error-level messages, zero warning-level messages on `/account/lists` at any viewport. No Vue hydration mismatches, no resource failures.
- **Create-list button label mobile vs desktop swap:** not verified (out of scope for CLS verification; can confirm separately if needed).

## Root-cause hypothesis (not authoritative — needs dev review)

The PR's skeleton-mirroring is necessary but appears insufficient because:

1. **Skeleton count mismatch.** The skeleton placeholder likely renders a **fixed number** of placeholder cards (typically 3) regardless of how many wishlists the user has. When 9 cards replace 3 skeletons, the document grows by ~6 card-heights — that growth IS a layout shift, and it scales linearly with `wishlistCount - skeletonCount`. A user with 0–3 wishlists may not see this; a user with 9 (the documented test account) will see the largest possible shift.
2. **Identical CLS across 3 runs at 375 px** (0.2555041975308642 to 16 significant figures) strongly indicates the shift is from a known, deterministic source — not from images / fonts / async data jitter. This points at the skeleton-vs-actual count delta rather than at the per-card height mismatch the PR specifically addressed.
3. **1280 px regression** is the most concerning finding. Pre-fix this viewport passed (0.064). The PR refactored the card layout entirely (now using `subgrid` and container queries instead of flex-row). The introduced shifts are likely a side-effect of the new layout transitioning from a stacked container layout (below the `@container (min-width: theme("containers.xl"))` breakpoint) to the subgrid layout, or from the subgrid columns themselves resolving in a second paint.

Recommended next investigation step for the dev team: render the skeleton with `n = actual_wishlist_count` placeholders (use the GraphQL `wishlistsTotalCount` if available before list resolution, or reserve vertical space via `min-height` proportional to the eventual count) — and re-measure with a 9-wishlist test account.

## BL-UI-001 Status on Lists page

**FAIL.** BL-UI-001 invariant requires post-paint CLS ≤ 0.10 PASS / ≥ 0.10 FAIL / ≥ 0.25 P0 FAIL. All three measured viewports breach the 0.10 budget; 375 px breaches the 0.25 P0 threshold.

## Side effects / regressions found

1. **NEW REGRESSION at 1280 px:** CLS regressed from 0.064 (pre-fix PASS) to 0.107 (post-fix FAIL). The PR introduced new shifts at the desktop viewport that did not exist before. This must not ship in its current form even if the mobile improvement is considered partial progress.
2. No functional regressions observed: cards render, links navigate, dropdown menus open, no console errors.

## Recommendation

Transition VCST-5110 back to **In Development** (or "Reopened" per workflow) with this report attached. The PR #2292 patch is structurally deployed and visually correct, but the CLS budget is still breached at all three viewports AND a NEW regression has been introduced at 1280 px. The fix needs another iteration — specifically, the skeleton needs to mirror the eventual card *count*, not just the per-card height.
