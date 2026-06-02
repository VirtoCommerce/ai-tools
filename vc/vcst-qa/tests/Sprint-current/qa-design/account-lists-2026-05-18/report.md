# /qa-design — /account/lists

**Date:** 2026-05-18
**Target type:** Page
**Target:** /account/lists
**Matrix scope:** Page Coverage Matrix row /account/lists — invariants BL-UI-001 / 002 / 004 (BL-UI-006 marked n/a)
**Storefront URL:** https://vcst-qa-storefront.govirto.com/account/lists
**Viewports:** 375 / 768 / 1280

## Build under test

| Field | Value |
|-------|-------|
| Platform | 3.1026.0 |
| Theme | `vc-theme-b2b-vue-2.49.0-pr-2292-f131-f131d346` (PR #2292 deployed to vcst-qa) |
| Browser | Chrome DevTools MCP (per `.claude/rules/agents.md` ui-ux-expert) |
| Locale | en-US |
| Theme | Coffee |
| User | `USER_EMAIL` from `.env` (personal account, 9 existing wishlists) |

## Data context

- Wishlist count rendered: **9**
- Longest list `name`: 25 chars (modest — name stress is low)
- One wishlist has a `description` consisting of **3 newline-joined shared-list URLs (~270 chars, ~1614–1654 px rendered width)** — this is the realistic worst-case input for the overflow audit on this page.

## Invariant Results

| Invariant | 375 px | 768 px | 1280 px | Source |
|-----------|:------:|:------:|:-------:|--------|
| **BL-UI-001 CLS** | **FAIL P0** (0.2555) | **FAIL** (0.1336) | **FAIL** (0.1073) | Reused from `tests/Sprint-current/VCST-5110/verification-report.md` (same build, same day) |
| **BL-UI-002 spacing-grid** | PASS | PASS | PASS | Fresh measurement |
| **BL-UI-004 overflow** | **FAIL** | **FAIL** | **FAIL** | Fresh measurement |

Net: 7 FAIL / 2 PASS across 3 invariants × 3 viewports.

---

## Findings

### Finding 1: BL-UI-004 — `.wishlist-card__description` silently clips long URL content (all viewports)

| Field | Value |
|-------|-------|
| Invariant | BL-UI-004 — Content boundary / no silent overflow |
| Severity | Medium (data loss from view — users cannot read description content) |
| Viewports affected | 375 px, 768 px, 1280 px |
| Selector | `.wishlist-card__description` |
| Failing card | "tztzutuztuztuztuzt_678678" (description = 3 shared-list URLs joined by `\n`, ~270 chars) |
| Pre-existing? | Yes — independent of PR #2292; the description-overflow contract was already broken before the layout refactor. PR #2292 did not introduce this, but the BEM-renamed selector inherits the same broken CSS. |

**Computed style on `.wishlist-card__description`:**
- `white-space: nowrap`
- `overflow: hidden`
- `text-overflow: ellipsis`
- `word-break: normal`
- `overflow-wrap: normal`

**Overflow measurements:**

| Viewport | scrollWidth | clientWidth | ratio | documentScrolls |
|----------|------------:|------------:|------:|-----------------|
| 375 px | 1654 px | 295 px | 5.6× | false |
| 768 px | 1654 px | 453 px | 3.7× | false |
| 1280 px | 1614 px | 374 px | 4.3× | false |

**Root cause:** Under `white-space: nowrap`, the three `\n`-separated URLs collapse to a single inline line ~1614 px wide. Because URLs have no natural word-break points and `word-break: normal` is in effect, `text-overflow: ellipsis` cannot fire — the entire first URL token already exceeds the container before any break opportunity is reached. Two of the three URLs are silently hidden with no ellipsis indicator.

**Stress probe:** A 120-char synthetic name injected into a card's title produced an identical failure pattern (scrollWidth 1551 vs clientWidth 374, ratio 4.15×). The defect generalizes to any long non-breaking token — common in B2B wishlist names (SKU references, project codes, internal URLs).

**Suggested fix:** Add `word-break: break-all` OR `overflow-wrap: anywhere` to `.wishlist-card__description` so the ellipsis truncation contract can fire on long unbreakable tokens. Consider doing the same for `.wishlist-card__title` if long titles are realistic.

**Evidence:**
- `storefront/375/BL-UI-004-375px-FAIL.png`
- `storefront/768/BL-UI-004-768px-FAIL.png`
- `storefront/1280/BL-UI-004-1280px-FAIL.png`

### Finding 2: BL-UI-001 — CLS exceeds budget at all viewports (reused from VCST-5110)

| Field | Value |
|-------|-------|
| Invariant | BL-UI-001 — Layout stability (CLS ≤ 0.10) |
| Severity | High — P0 at 375 px (≥ 0.25), FAIL at 768/1280 |
| Viewports affected | 375 px, 768 px, 1280 px |
| JIRA | **VCST-5110** (already filed; FIX_INCOMPLETE earlier today) |
| Pre-existing? | The mobile CLS was the *origin* bug for VCST-5110; the 1280 px CLS is a **new regression** introduced by PR #2292 (was 0.064 pre-fix, now 0.107). |

This finding is **not a new bug** — it's the open VCST-5110, included here for completeness because the page-level matrix lists BL-UI-001 in scope. Full evidence: `tests/Sprint-current/VCST-5110/verification-report.md`.

---

## Raw audit data (BL-UI-002 + BL-UI-004)

### BL-UI-002 spacing-grid — fully PASS

3 selectors × 3 viewports = 9 measurements, zero off-grid violations:

- `.lists__container` (1 element each viewport) — 0 off-grid
- `.wishlist-card` (9 elements each viewport) — 0 off-grid
- `.lists__header` (1 element each viewport) — 0 off-grid

PR #2292's spacing changes (BEM + `@container` queries) are fully grid-compliant — all `padding`/`margin`/`gap` resolve to allowed values from `{0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 56, 64, 80, 96}` px.

### BL-UI-004 overflow — auxiliary observations

Beyond Finding 1:

- 4× `a.footer-link` at 768 px clip slightly (~141–173 px vs 111 px column). Cosmetic, no document-level horizontal scroll. Page-global footer issue, not /account/lists-specific. Low priority — not filed.
- `span.ship-to-selector__selected` clipping at 375/1280 px (351/251) is intentional chrome (ellipsis on the header ship-to control). Expected behavior.
- `div.vc-container__bg` clipping is structural (background container). Expected.
- `documentScrolls: false` at every viewport — no horizontal page scroll. The overflow is localized to `.wishlist-card__description`.

---

## Anomalies

1. **PR #2292 spacing contract is clean.** Despite the layout-refactor scope, BL-UI-002 passes universally — the BEM classes + `@container` rewrites stay on the 4 px grid.
2. **Finding 1 (description overflow) is pre-existing and decoupled from the CLS bug.** It would fail on the pre-PR build too. The card rewrite preserved the broken `white-space: nowrap` rule.
3. **Footer link minor overage at 768 px** — cosmetic; not /account/lists-specific (footer is global). Flagged but not filed.
4. **Chrome DevTools MCP min-viewport quirk** — `resize_page` has a ~500 px content-area floor on this display. 375 px measurements were taken via `emulate(viewport: "375x900x2,mobile,touch")` which correctly reports `window.innerWidth = 375`. No data integrity impact.

---

## Findings → Filings (decision)

| # | Finding | Severity | Existing ticket? | Recommend |
|---|---------|----------|------------------|-----------|
| 1 | BL-UI-004 description overflow | Medium | None | **File new bug** (`/qa-bug`) |
| 2 | BL-UI-001 CLS (3 viewports) | High / P0 | **VCST-5110 (open, FIX_INCOMPLETE)** | Do NOT file new — comment/track on VCST-5110 |

Footer-link clipping at 768 px: low-priority cosmetic; not filed unless requested.
